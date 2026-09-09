import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { assinaturaValida } from '@/lib/nuvemshop/cliente'
import { obterCredenciais } from '@/lib/nuvemshop/config'
import { chaveTelefone, paraE164 } from '@/lib/maquina-vendas/telefone'

export const dynamic = 'force-dynamic'

/**
 * WEBHOOKS DE LGPD DA NUVEMSHOP.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A plataforma exige três URLs, e são três perguntas diferentes:
 *
 *   store-redact           a loja desinstalou o app. Apague o que era dela.
 *   customers-redact       uma pessoa pediu para ser apagada.
 *   customers-data-request uma pessoa pediu para VER o que temos dela.
 *
 * Uma rota só, com o tipo no caminho: o contrato dos três é idêntico
 * (mesma assinatura, mesmo formato, mesma idempotência) e triplicar o
 * arquivo triplicaria os lugares onde esquecer de verificar o HMAC.
 *
 * ── A TENSÃO REAL DESTE ARQUIVO ───────────────────────────────────────────
 * "Apagar tudo" e "não mandar mensagem para quem pediu para sair" se
 * contradizem: se o opt-out for apagado junto, a pessoa volta a ser
 * elegível e recebe mensagem de novo — o oposto do que ela pediu.
 *
 * A saída é apagar o que IDENTIFICA e manter o que SUPRIME: o registro de
 * opt-out fica, sem telefone completo e sem o trecho que a pessoa escreveu,
 * guardando só a chave de 8 dígitos que já não identifica sozinha. É o
 * mínimo necessário para honrar a recusa, e nada além disso.
 * ══════════════════════════════════════════════════════════════════════════
 */

const TIPOS = ['store-redact', 'customers-redact', 'customers-data-request'] as const
type Tipo = (typeof TIPOS)[number]

export async function POST(request: Request, ctx: { params: Promise<{ tipo: string }> }) {
  const { tipo } = await ctx.params
  if (!TIPOS.includes(tipo as Tipo)) {
    return NextResponse.json({ erro: 'Tipo desconhecido.' }, { status: 404 })
  }

  const cru = await request.text()

  let appSecret: string | undefined
  try {
    appSecret = (await obterCredenciais()).appSecret
  } catch {
    // Sem integração configurada ainda. Responder 200 e registrar: recusar
    // faria a Nuvemshop reentregar 16 vezes por uma pendência nossa.
    await registrar(tipo, 'sem credencial configurada', cru)
    return NextResponse.json({ ok: true })
  }

  if (!appSecret) {
    await registrar(tipo, 'app secret ausente', cru)
    return NextResponse.json({ ok: true })
  }

  const assinatura = request.headers.get('x-linkedstore-hmac-sha256')
  if (!(await assinaturaValida(cru, assinatura, appSecret))) {
    return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 })
  }

  let corpo: { store_id?: number; customer?: { identification?: string; email?: string; phone?: string } }
  try {
    corpo = JSON.parse(cru)
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 })
  }

  try {
    if (tipo === 'store-redact') await apagarDaLoja()
    else if (tipo === 'customers-redact') await apagarPessoa(corpo.customer?.phone)
    else await registrar(tipo, 'pedido de acesso aos dados — responder ao titular', cru)
  } catch (e) {
    await registrar(tipo, `falhou: ${e instanceof Error ? e.message : String(e)}`, cru)
  }

  // Sempre 200: a Nuvemshop reentrega até 16 vezes em quem não devolve 2XX, e
  // um erro nosso não deve virar tempestade de reentrega.
  return NextResponse.json({ ok: true })
}

/** A loja desinstalou o app. Sai a credencial e sai a operação. */
async function apagarDaLoja(): Promise<void> {
  await prisma.integration.deleteMany({ where: { tipo: 'nuvemshop' } })
  // As inscrições de origem `carrinho`/`pedido` só existem por causa da loja.
  const alvo = await prisma.mvInscricao.findMany({
    where: { origem: { in: ['carrinho', 'pedido'] } },
    select: { id: true },
  })
  if (alvo.length) {
    const ids = alvo.map((i) => i.id)
    await prisma.$transaction([
      prisma.mvMensagem.deleteMany({ where: { inscricaoId: { in: ids } } }),
      prisma.mvInscricao.deleteMany({ where: { id: { in: ids } } }),
    ])
  }
  await registrar('store-redact', `loja desinstalou: ${alvo.length} inscrições apagadas`, '')
}

/**
 * Uma pessoa pediu para ser apagada.
 *
 * Apaga o que identifica; preserva o que suprime — ver o cabeçalho.
 */
async function apagarPessoa(telefone?: string): Promise<void> {
  const e164 = paraE164(telefone)
  const chave = e164 ? chaveTelefone(e164) : ''
  if (!chave) {
    await registrar('customers-redact', 'pedido sem telefone utilizável', '')
    return
  }

  const inscricoes = await prisma.mvInscricao.findMany({ where: { telefoneKey: chave }, select: { id: true } })
  const ids = inscricoes.map((i) => i.id)

  await prisma.$transaction([
    ...(ids.length
      ? [
          prisma.mvMensagem.deleteMany({ where: { inscricaoId: { in: ids } } }),
          prisma.mvInscricao.deleteMany({ where: { id: { in: ids } } }),
        ]
      : []),
    prisma.mvResposta.deleteMany({ where: { telefoneKey: chave } }),
    // O opt-out FICA, sem o que identifica: apagá-lo devolveria a pessoa à
    // fila, que é o contrário do que ela pediu.
    prisma.mvOptOut.updateMany({
      where: { telefoneKey: chave },
      data: { telefoneE164: null, trecho: null, origem: 'lgpd' },
    }),
  ])

  await registrar('customers-redact', `titular apagado: ${ids.length} inscrições`, '')
}

async function registrar(tipo: string, titulo: string, dados: string) {
  try {
    await prisma.logEvento.create({
      data: {
        origem: 'nuvemshop',
        nivel: 'INFO',
        tipo: `lgpd_${tipo.replace(/-/g, '_')}`,
        titulo,
        dados: dados.slice(0, 4000) || null,
      },
    })
  } catch {
    // tabela ainda não migrada
  }
}
