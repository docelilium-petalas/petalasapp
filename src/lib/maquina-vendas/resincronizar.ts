/**
 * SINCRONIA TELA → DISPARO — porte de `resincronizar.ts` da CarBoss.
 *
 * A copy é gravada em `mensagem_final` NA SEMEADURA. Sem isto, editar o texto
 * de uma cadência na tela mudava só as PRÓXIMAS inscrições — quem já estava na
 * fila seguia com o texto antigo, e a tela mostrava uma coisa enquanto o
 * WhatsApp mandava outra (CarBoss, 07/08/2026).
 *
 * Regra do Owner (origem): "quando mudar lá tem que mudar no disparo".
 *
 * Diferenças da origem:
 *  · Aqui não há laudo de lead (`perfilDoLead`). O contexto é REMONTADO dos
 *    valores congelados em `variaveis` (nomeados por `VARIAVEIS[template]`) de
 *    todas as mensagens da inscrição — é o mesmo contexto da semeadura, e a
 *    semente `refExterna:ordem` é a mesma de `observador.inscrever`, então o
 *    texto sai byte a byte igual ao de uma inscrição nova.
 *  · Na Doce Lilium quem fala é o TEMPLATE aprovado; `mensagem_final` é a
 *    prévia. Por isso a troca de `templateNome` na etapa também propaga, e
 *    re-congela `variaveis` na ordem do template novo. Faltou valor para o
 *    template novo = problema (nada é gravado), nunca parâmetro vazio.
 *  · ⛔ Cadências de `GATILHOS_INTOCAVEIS` (campanha 10.10) NUNCA são tocadas.
 *
 * Só toca AGENDADA de inscrição ATIVA. Não mexe em horário, contador nem
 * status. TUDO OU NADA: fila meio velha e meio nova põe dois discursos na
 * mesma base no mesmo dia.
 */

import prisma from '@/lib/prisma'
import { montarCopy, validarCopy, CopyIncompleta, type Contexto } from './copy'
import { VARIAVEIS } from './catalogo-templates'
import { GATILHOS_INTOCAVEIS } from './cadencias-seed'

export type ResultadoResync = {
  analisadas: number
  realinhadas: number
  jaAlinhadas: number
  /** Cadências protegidas que foram puladas de propósito. */
  protegidas: number
  /** Mensagens que NÃO puderam ser regeradas. Com qualquer uma, nada é gravado. */
  problemas: string[]
}

/** Remonta o contexto da semeadura a partir das variáveis congeladas. */
export function contextoDasVariaveis(
  mensagens: Array<{ templateNome: string | null; variaveis: unknown }>,
): Contexto {
  const ctx: Record<string, string> = {}
  for (const m of mensagens) {
    if (!m.templateNome || !Array.isArray(m.variaveis)) continue
    const nomes = VARIAVEIS[m.templateNome] ?? []
    nomes.forEach((nome, i) => {
      const v = (m.variaveis as unknown[])[i]
      if (typeof v === 'string' && v.trim() && !ctx[nome]) ctx[nome] = v
    })
  }
  return ctx as Contexto
}

/**
 * @param cadenciaId  limita a uma cadência (o caso da tela). Sem ele, a fila toda.
 * @param aplicar     false = simulação; devolve o que faria sem gravar.
 */
export async function resincronizarCopy({
  cadenciaId,
  aplicar,
}: {
  cadenciaId?: string
  aplicar: boolean
}): Promise<ResultadoResync> {
  const mensagens = await prisma.mvMensagem.findMany({
    where: {
      status: 'AGENDADA',
      inscricao: { status: 'ATIVA', ...(cadenciaId ? { cadenciaId } : {}) },
    },
    orderBy: [{ inscricaoId: 'asc' }, { etapaOrdem: 'asc' }],
    include: {
      inscricao: {
        select: {
          id: true,
          refExterna: true,
          nomeSnapshot: true,
          cadencia: { select: { gatilho: true, etapas: { orderBy: { ordem: 'asc' } } } },
          mensagens: { select: { templateNome: true, variaveis: true } },
        },
      },
    },
  })

  const problemas: string[] = []
  const trocas: Array<{ id: string; texto: string; templateNome: string | null; variaveis: string[] }> = []
  let jaAlinhadas = 0
  let protegidas = 0
  const contextos = new Map<string, Contexto>()

  for (const m of mensagens) {
    const insc = m.inscricao
    if (GATILHOS_INTOCAVEIS.has(insc.cadencia.gatilho)) {
      protegidas++
      continue
    }
    const etapa = insc.cadencia.etapas.find((e) => e.ordem === m.etapaOrdem)
    if (!etapa) {
      problemas.push(`${insc.nomeSnapshot}: a etapa ${m.etapaOrdem} não existe mais na cadência`)
      continue
    }

    if (!contextos.has(insc.id)) contextos.set(insc.id, contextoDasVariaveis(insc.mensagens))
    const ctx = contextos.get(insc.id)!

    let texto: string
    try {
      texto = montarCopy(etapa.templateBase, ctx, `${insc.refExterna}:${etapa.ordem}`)
    } catch (e) {
      const motivo = e instanceof CopyIncompleta ? `faltam ${e.faltando.join('/')}` : e instanceof Error ? e.message : String(e)
      problemas.push(`${insc.nomeSnapshot} etapa ${m.etapaOrdem}: ${motivo}`)
      continue
    }

    // "Anunciar a última" pressupõe uma régua: em cadência de toque único
    // (pagamento, rastreio, coleção) não há anterior para a última encerrar, e
    // a regra reprovaria o corpo aprovado pela Meta.
    const v = validarCopy(texto, { ehUltima: etapa.ehUltima && insc.cadencia.etapas.length > 1 })
    if (!v.ok) {
      problemas.push(`${insc.nomeSnapshot} etapa ${m.etapaOrdem}: ${v.erros.join('; ')}`)
      continue
    }

    const templateNome = etapa.templateNome ?? null
    const nomes = templateNome ? (VARIAVEIS[templateNome] ?? []) : []
    const faltam = nomes.filter((n) => !String((ctx as Record<string, unknown>)[n] ?? '').trim())
    if (faltam.length) {
      problemas.push(`${insc.nomeSnapshot} etapa ${m.etapaOrdem}: o template ${templateNome} exige ${faltam.join('/')}`)
      continue
    }
    const variaveis = nomes.map((n) => String((ctx as Record<string, unknown>)[n]))

    const mesmasVars = JSON.stringify(variaveis) === JSON.stringify(Array.isArray(m.variaveis) ? m.variaveis : [])
    if (texto === m.mensagemFinal && templateNome === m.templateNome && mesmasVars) jaAlinhadas++
    else trocas.push({ id: m.id, texto, templateNome, variaveis })
  }

  if (problemas.length === 0 && aplicar && trocas.length > 0) {
    await prisma.$transaction(
      trocas.map((t) =>
        prisma.mvMensagem.update({
          where: { id: t.id },
          data: { mensagemFinal: t.texto, templateNome: t.templateNome, variaveis: t.variaveis },
        }),
      ),
    )
  }

  return { analisadas: mensagens.length, realinhadas: trocas.length, jaAlinhadas, protegidas, problemas }
}
