/**
 * O CAMINHO DE VOLTA, PROVADO — entrega, leitura, resposta e recusa.
 *
 *   DATABASE_URL=<banco de PROVA> npx tsx scripts/mv-retorno-conferir.ts
 *
 * ⚠️ ESCREVE NO BANCO. Recusa rodar fora de um banco terminado em `_prova`.
 *
 * Chama o handler da rota diretamente, com um `Request` montado à mão — é a
 * mesma função que o servidor chama, então o que passa aqui passa lá. O que
 * este script NÃO cobre é a entrega HTTP em si (middleware, TLS), e essa parte
 * foi medida por fora: `POST /api/webhook/whatsapp` sem segredo devolve 503, e
 * não 307, o que prova que o middleware deixa a rota passar.
 */

import prisma from '../src/lib/prisma'
import { inscrever } from '../src/lib/maquina-vendas/observador'
import { obterAjustes } from '../src/lib/maquina-vendas/config'

const url = process.env.DATABASE_URL ?? ''
if (!/_prova(\?|$)/.test(url)) {
  console.error('\nRecusado: DATABASE_URL precisa apontar para um banco terminado em `_prova`.\n')
  process.exit(1)
}

const SEGREDO = 'prova-local-nao-e-segredo-real'
process.env.WHATSAPP_WEBHOOK_SECRET = SEGREDO
process.env.WHATSAPP_VERIFY_TOKEN = 'prova-verify'

const REF = 'PROVA-retorno'
const TEL = '5562999630199'
const CHAVE = '99630199'

const titulo = (t: string) => console.log(`\n${'━'.repeat(70)}\n${t}\n${'━'.repeat(70)}`)

function pedido(corpo: unknown, comSegredo = true): Request {
  return new Request('http://local/api/webhook/whatsapp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(comSegredo ? { authorization: `Bearer ${SEGREDO}` } : {}),
    },
    body: JSON.stringify(corpo),
  })
}

const comStatus = (id: string, status: string, erros?: unknown[]) => ({
  entry: [{ changes: [{ value: { statuses: [{ id, status, timestamp: String(Math.floor(Date.now() / 1000)), ...(erros ? { errors: erros } : {}) }] } }] }],
})

const comMensagem = (id: string, texto: string) => ({
  entry: [{ changes: [{ value: { messages: [{ id, from: TEL, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: texto } }] } }] }],
})

async function main() {
  const { POST } = await import('../src/app/api/webhook/whatsapp/route')

  const cadencia = await prisma.mvCadencia.findFirst({
    where: { gatilho: 'carrinho_abandonado', ativo: true },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (!cadencia) {
    console.error('\nSem cadência. Rode antes: npx tsx scripts/mv-cadencia-carrinho.ts\n')
    process.exit(1)
  }

  // Estado limpo, e uma inscrição viva com a 1ª mensagem já "enviada".
  await prisma.mvInscricao.deleteMany({ where: { refExterna: REF } })
  await prisma.mvOptOut.deleteMany({ where: { telefoneKey: CHAVE } })
  await prisma.mvResposta.deleteMany({ where: { telefoneKey: CHAVE } })
  await prisma.eventIngestLog.deleteMany({ where: { source: { startsWith: 'whatsapp:msg:PROVA' } } })

  await inscrever({
    ajustes: await obterAjustes(),
    cadenciaId: cadencia.id,
    etapas: cadencia.etapas,
    origem: 'carrinho',
    refExterna: REF,
    nome: 'Clara',
    e164: `+${TEL}`,
    chave: CHAVE,
    ancora: new Date(Date.now() - 27 * 3_600_000),
    contexto: { primeiro_nome: 'Clara', peca: 'a blusa Íris', link: 'https://exemplo/x' },
    retrato: {},
  })
  const msgs = await prisma.mvMensagem.findMany({
    where: { inscricao: { refExterna: REF } },
    orderBy: { etapaOrdem: 'asc' },
  })
  await prisma.mvMensagem.update({
    where: { id: msgs[0].id },
    data: { status: 'ENVIADA', enviadaEm: new Date(), idExterno: 'wamid.PROVA1' },
  })
  console.log(`\ninscrição criada com ${msgs.length} mensagens; a 1ª marcada como enviada`)

  titulo('1 · SEM SEGREDO — a rota tem que recusar')
  const r0 = await POST(pedido(comStatus('wamid.PROVA1', 'delivered'), false))
  console.log(`   HTTP ${r0.status}  ${r0.status === 401 ? '✓ recusou' : '✗ ACEITOU SEM SEGREDO'}`)

  titulo('2 · ENTREGUE, e depois LIDA')
  await POST(pedido(comStatus('wamid.PROVA1', 'delivered')))
  let m = await prisma.mvMensagem.findUnique({ where: { id: msgs[0].id } })
  console.log(`   entregue: ${m?.entregueEm ? 'sim' : 'NÃO'} · lida: ${m?.lidaEm ? 'sim' : 'não'}`)
  await POST(pedido(comStatus('wamid.PROVA1', 'read')))
  m = await prisma.mvMensagem.findUnique({ where: { id: msgs[0].id } })
  console.log(`   entregue: ${m?.entregueEm ? 'sim' : 'NÃO'} · lida: ${m?.lidaEm ? 'sim' : 'NÃO'}`)
  console.log(`   ${m?.entregueEm && m?.lidaEm ? '✓ os dois fatos gravados' : '✗'}`)

  titulo('3 · CHEGA UM "sent" ATRASADO — nao pode apagar o que ja se sabe')
  const lidaAntes = m?.lidaEm
  await POST(pedido(comStatus('wamid.PROVA1', 'sent')))
  m = await prisma.mvMensagem.findUnique({ where: { id: msgs[0].id } })
  console.log(`   lida continua: ${m?.lidaEm?.getTime() === lidaAntes?.getTime() ? '✓ sim' : '✗ foi apagada'}`)

  titulo('4 · A PESSOA RESPONDE (conversa normal)')
  await POST(pedido(comMensagem('PROVA-m1', 'Oi! Tem no tamanho P para entrega até sexta?')))
  let insc = await prisma.mvInscricao.findFirst({ where: { refExterna: REF } })
  const resp = await prisma.mvResposta.findUnique({ where: { telefoneKey: CHAVE } })
  const optout1 = await prisma.mvOptOut.findUnique({ where: { telefoneKey: CHAVE } })
  console.log(`   respondeuEm: ${insc?.respondeuEm ? 'gravado' : 'NÃO'} · respostas: ${insc?.respostas}`)
  console.log(`   linha de resposta: ${resp ? 'sim' : 'NÃO'} · virou opt-out? ${optout1 ? '✗ SIM (errado)' : 'não'}`)
  console.log(`   ${insc?.respondeuEm && resp && !optout1 ? '✓ resposta contada, sem falso opt-out' : '✗'}`)

  titulo('5 · A MESMA MENSAGEM CHEGA DE NOVO — nao pode contar duas vezes')
  await POST(pedido(comMensagem('PROVA-m1', 'Oi! Tem no tamanho P para entrega até sexta?')))
  insc = await prisma.mvInscricao.findFirst({ where: { refExterna: REF } })
  console.log(`   respostas: ${insc?.respostas}  ${insc?.respostas === 1 ? '✓ continua 1' : '✗ contou de novo'}`)

  titulo('6 · A PESSOA PEDE PARA SAIR')
  await POST(pedido(comMensagem('PROVA-m2', 'para, por favor')))
  insc = await prisma.mvInscricao.findFirst({ where: { refExterna: REF } })
  const optout = await prisma.mvOptOut.findUnique({ where: { telefoneKey: CHAVE } })
  const agendadas = await prisma.mvMensagem.count({ where: { inscricao: { refExterna: REF }, status: 'AGENDADA' } })
  console.log(`   inscrição: ${insc?.status} (${insc?.motivoParada})`)
  console.log(`   opt-out: ${optout ? `sim, origem "${optout.origem}", trecho "${optout.trecho}"` : 'NÃO'}`)
  console.log(`   ainda agendadas: ${agendadas}`)
  console.log(`   ${insc?.status === 'OPT_OUT' && optout && agendadas === 0 ? '✓ saiu, e a fila dela foi cancelada na hora' : '✗'}`)

  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nfalhou:', e)
    process.exit(1)
  })
