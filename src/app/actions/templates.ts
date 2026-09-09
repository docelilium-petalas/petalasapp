'use server'

/**
 * A REVISÃO DOS TEMPLATES — o que a dona da marca decide sobre cada mensagem.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A armadilha deste arquivo: dar a ela um campo de texto livre e confiar.
 *
 * O texto que ela escreve não é uma frase qualquer — é um template da Meta,
 * e ele tem regras duras. Se ela apagar um `{{2}}`, o sistema continua tentando
 * preencher a posição 2 e a submissão é recusada. Se ela começar a mensagem
 * com o nome, a Meta reprova sem explicar direito. Se ela trocar a ordem das
 * variáveis, o nome da cliente aparece no lugar da peça.
 *
 * Nada disso é culpa dela: são regras invisíveis de um sistema que ela não vê.
 * Por isso o guard mora AQUI, e devolve o problema em português, dizendo o que
 * fazer — não um código de erro da Meta.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { CATALOGO } from '@/lib/maquina-vendas/catalogo-templates'

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

function tabelaAusente(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('42P01') || msg.includes('does not exist')
}

export type Revisao = {
  nome: string
  status: 'PENDENTE' | 'APROVADO' | 'AJUSTAR'
  corpoRevisado: string | null
  comentario: string | null
  revisadoPor: string | null
  revisadoEm: string | null
}

export async function getRevisoes(): Promise<{ migrado: boolean; revisoes: Revisao[] }> {
  await exigirAuth()
  try {
    const linhas = await prisma.mvTemplateRevisao.findMany()
    return {
      migrado: true,
      revisoes: linhas.map((l) => ({
        nome: l.nome,
        status: l.status as Revisao['status'],
        corpoRevisado: l.corpoRevisado,
        comentario: l.comentario,
        revisadoPor: l.revisadoPor,
        revisadoEm: l.revisadoEm?.toISOString() ?? null,
      })),
    }
  } catch (e) {
    if (tabelaAusente(e)) return { migrado: false, revisoes: [] }
    throw e
  }
}

/**
 * Confere o texto reescrito contra as regras da Meta E contra o original.
 *
 * A comparação com o ORIGINAL é o que ninguém espera e é a mais importante:
 * as variáveis são posicionais, e o sistema preenche cada posição com uma
 * coisa específica. `{{1}}` é sempre o primeiro nome. Se o texto novo tiver
 * variáveis a mais, a menos, ou numeradas diferente, a mensagem sai trocada
 * — ou nem sai.
 */
export async function validarEdicao(nome: string, corpo: string): Promise<string[]> {
  const original = CATALOGO.find((t) => t.nome === nome)
  if (!original) return ['Template desconhecido.']

  const erros: string[] = []
  const texto = corpo.trim()

  if (!texto) return ['A mensagem não pode ficar vazia.']
  if (texto.length > 1024) erros.push(`A mensagem tem ${texto.length} caracteres. O limite do WhatsApp é 1024.`)

  if (/^\{\{\d+\}\}/.test(texto)) {
    erros.push('A mensagem não pode COMEÇAR com um campo variável. A Meta reprova. Comece com uma palavra — "Oi,", por exemplo.')
  }
  if (/\{\{\d+\}\}$/.test(texto)) {
    erros.push('A mensagem não pode TERMINAR com um campo variável. Acrescente uma palavra ou pontuação no fim.')
  }
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(texto)) {
    erros.push('Dois campos variáveis não podem ficar colados. Escreva alguma palavra entre eles.')
  }

  const nums = (t: string) => [...t.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])).sort((a, b) => a - b)
  const antes = nums(original.corpo)
  const depois = nums(texto)

  const faltando = antes.filter((n) => !depois.includes(n))
  const sobrando = depois.filter((n) => !antes.includes(n))

  const rotulo = (n: number) => original.exemplos[n - 1] ?? `campo ${n}`
  if (faltando.length) {
    erros.push(
      `Sumiu ${faltando.length === 1 ? 'o campo' : 'os campos'} ${faltando.map((n) => `{{${n}}} (${rotulo(n)})`).join(', ')}. ` +
        'Todo campo do texto original precisa continuar na mensagem — é ele que o sistema preenche.',
    )
  }
  if (sobrando.length) {
    erros.push(
      `Apareceu ${sobrando.map((n) => `{{${n}}}`).join(', ')}, que o sistema não sabe preencher. ` +
        `Os campos disponíveis nesta mensagem são: ${antes.map((n) => `{{${n}}} = ${rotulo(n)}`).join(', ')}.`,
    )
  }

  return erros
}

export async function salvarRevisao(args: {
  nome: string
  status: Revisao['status']
  corpoRevisado?: string | null
  comentario?: string | null
}): Promise<{ ok: boolean; erros?: string[] }> {
  const auth = await exigirAuth()

  const original = CATALOGO.find((t) => t.nome === args.nome)
  if (!original) return { ok: false, erros: ['Template desconhecido.'] }

  // Texto igual ao original volta a ser NULL: guardar uma cópia idêntica
  // faria a tela mostrar "editado" para quem só abriu e fechou o editor.
  let corpo = args.corpoRevisado?.trim() || null
  if (corpo && corpo === original.corpo.trim()) corpo = null

  if (corpo) {
    const erros = await validarEdicao(args.nome, corpo)
    if (erros.length) return { ok: false, erros }
  }

  try {
    await prisma.mvTemplateRevisao.upsert({
      where: { nome: args.nome },
      create: {
        nome: args.nome,
        status: args.status,
        corpoRevisado: corpo,
        comentario: args.comentario?.trim() || null,
        revisadoPor: auth.email,
        revisadoEm: new Date(),
      },
      update: {
        status: args.status,
        corpoRevisado: corpo,
        comentario: args.comentario?.trim() || null,
        revisadoPor: auth.email,
        revisadoEm: new Date(),
      },
    })
    revalidatePath('/maquina-vendas/templates')
    return { ok: true }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false, erros: ['O módulo ainda não foi migrado no banco.'] }
    throw e
  }
}

/** Desfaz a edição e volta ao texto do catálogo. O status é preservado. */
export async function restaurarOriginal(nome: string): Promise<{ ok: boolean }> {
  const auth = await exigirAuth()
  try {
    await prisma.mvTemplateRevisao.update({
      where: { nome },
      data: { corpoRevisado: null, revisadoPor: auth.email, revisadoEm: new Date() },
    })
    revalidatePath('/maquina-vendas/templates')
    return { ok: true }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false }
    // linha inexistente: não havia edição para desfazer
    return { ok: true }
  }
}
