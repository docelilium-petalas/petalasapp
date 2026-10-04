/**
 * "A Máquina de Vendas está funcionando?" — responde com dado, não com achismo.
 * Porte de `scripts/status-maquina-vendas.ts` da CarBoss. SOMENTE LEITURA.
 *
 *   npx tsx scripts/mv-ops/status-maquina-vendas.ts
 *
 * A resposta honesta tem quatro partes que costumam divergir: as cadências
 * estão configuradas, o observador está inscrevendo, o envio está habilitado,
 * e as mensagens estão de fato SAINDO e VOLTANDO confirmadas. Dá para ter as
 * três primeiras e a quarta quebrada.
 */

import { prisma, cabecalho, brt, mascarar, rodar } from './_base'
import { CURSOR_ULTIMO_ENVIO, CURSOR_VARREDURA_CARRINHO } from '../../src/lib/maquina-vendas/config'
import { lerPulsoDoCanal } from '../../src/lib/maquina-vendas/pulso'

rodar(async () => {
  cabecalho('STATUS DA MÁQUINA DE VENDAS', false)
  const agora = new Date()
  console.log(`agora: ${brt(agora)} (SP)\n`)

  console.log('1 · CADÊNCIAS')
  const cadencias = await prisma.mvCadencia.findMany({
    orderBy: { nome: 'asc' },
    include: { etapas: true, _count: { select: { inscricoes: true } } },
  })
  for (const c of cadencias) {
    console.log(`   ${c.ativo ? '🟢' : '⚪'} ${c.nome} [${c.gatilho}] — ${c.etapas.length} etapa(s), ${c._count.inscricoes} inscrição(ões)`)
  }
  if (!cadencias.some((c) => c.ativo)) console.log('   ⚠️ nenhuma ligada — nada será inscrito')

  console.log('\n2 · OBSERVADOR')
  const cursor = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_VARREDURA_CARRINHO } })
  if (!cursor) console.log('   ⚠️ sem cursor — a varredura de carrinho nunca rodou neste banco')
  else {
    const idade = Math.round((agora.getTime() - cursor.updatedAt.getTime()) / 60_000)
    console.log(`   última varredura: ${brt(cursor.updatedAt)} (${idade} min atrás)`)
    if (idade > 15) console.log('   ⚠️ mais de 15 min: o cron de 5 min pode estar parado')
  }

  console.log('\n3 · ENVIO')
  const ajustes = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  if (!ajustes) console.log('   ⚠️ sem linha de ajustes — o despachante usa o padrão (pausado)')
  else {
    console.log(`   ${ajustes.envioPausado ? '⏸️  PAUSADO' : '▶️  LIGADO'} · teto ${ajustes.tetoDiario}/dia · ${ajustes.intervaloMinMinutos}–${ajustes.intervaloMaxMinutos} min · janela ${ajustes.janelaInicio}–${ajustes.janelaFim}`)
    console.log(`   última mudança: ${brt(ajustes.atualizadoEm)} por ${ajustes.atualizadoPor ?? '—'}`)
  }
  const ultimoEnvio = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_ULTIMO_ENVIO } })
  console.log(`   último envio registrado: ${ultimoEnvio ? brt(new Date(ultimoEnvio.valor)) : '—'}`)

  console.log('\n4 · FILA')
  const porStatusInsc = await prisma.mvInscricao.groupBy({ by: ['status'], _count: { _all: true } })
  const porStatusMsg = await prisma.mvMensagem.groupBy({ by: ['status'], _count: { _all: true } })
  console.log('   inscrições: ' + (porStatusInsc.map((g) => `${g.status} ${g._count._all}`).join(' · ') || 'nenhuma'))
  console.log('   mensagens:  ' + (porStatusMsg.map((g) => `${g.status} ${g._count._all}`).join(' · ') || 'nenhuma'))
  const vencidas = await prisma.mvMensagem.count({ where: { status: 'AGENDADA', agendadaPara: { lte: agora } } })
  const proxima = await prisma.mvMensagem.findFirst({
    where: { status: 'AGENDADA', agendadaPara: { gt: agora } },
    orderBy: { agendadaPara: 'asc' },
    include: { inscricao: { select: { nomeSnapshot: true, cadencia: { select: { nome: true } } } } },
  })
  console.log(`   vencidas agora: ${vencidas}`)
  console.log(`   próxima: ${proxima ? `${brt(proxima.agendadaPara)} — ${proxima.inscricao.nomeSnapshot} (${proxima.inscricao.cadencia.nome})` : 'nenhuma'}`)

  console.log('\n5 · QUEM VAI RECEBER (telefone repetido na mesma cadência = régua dobrada)')
  const ativas = await prisma.mvInscricao.findMany({
    where: { status: 'ATIVA' },
    select: { cadenciaId: true, telefoneKey: true, telefoneE164: true, nomeSnapshot: true },
  })
  const grupos = new Map<string, string[]>()
  for (const i of ativas) {
    const k = `${i.cadenciaId}:${i.telefoneKey}`
    grupos.set(k, [...(grupos.get(k) ?? []), `${i.nomeSnapshot} ${mascarar(i.telefoneE164)}`])
  }
  const dups = [...grupos.values()].filter((v) => v.length > 1)
  if (!dups.length) console.log(`   ✓ ${ativas.length} inscrição(ões) ativa(s), nenhum telefone repetido`)
  for (const d of dups) console.log(`   🔴 repetido: ${d.join(', ')}`)

  console.log('\n6 · SAÍDA (últimas 24h)')
  const desde = new Date(agora.getTime() - 24 * 3_600_000)
  const enviadas = await prisma.mvMensagem.findMany({
    where: { status: 'ENVIADA', enviadaEm: { gte: desde } },
    select: { idExterno: true, entregueEm: true, lidaEm: true },
  })
  const comProva = enviadas.filter((m) => m.idExterno).length
  console.log(`   marcadas ENVIADA: ${enviadas.length} · com wamid: ${comProva}`)
  console.log(`   entregues pela Meta: ${enviadas.filter((m) => m.entregueEm).length} · lidas: ${enviadas.filter((m) => m.lidaEm).length}`)
  if (enviadas.length > comProva) console.log(`   🔴 ${enviadas.length - comProva} sem wamid — marcadas como enviadas sem prova de que saíram`)
  const falhas = await prisma.mvMensagem.count({ where: { status: 'ERRO', updatedAt: { gte: desde } } })
  const vetadas = await prisma.mvMensagem.count({ where: { status: 'VETADA', updatedAt: { gte: desde } } })
  console.log(`   ERRO: ${falhas} · VETADA: ${vetadas}`)

  console.log('\n7 · VOLTA (o webhook está chegando?)')
  const pulso = await lerPulsoDoCanal(agora)
  const icone = pulso.nivel === 'ok' ? '🟢' : pulso.nivel === 'atencao' ? '🟡' : '🔴'
  console.log(`   ${icone} ${pulso.titulo}`)
  console.log(`      ${pulso.detalhe}`)
  console.log(`      última chamada: ${pulso.ultimaChamada ? brt(pulso.ultimaChamada) : '—'} · última confirmação: ${pulso.ultimaConfirmacao ? brt(pulso.ultimaConfirmacao) : '—'}`)
  const recusas = await prisma.logEvento.count({ where: { tipo: 'webhook_recusado', createdAt: { gte: desde } } })
  if (recusas) console.log(`   🔴 ${recusas} chamada(s) recusada(s) por assinatura nas últimas 24h — confira DATAFY_WEBHOOK_SECRET`)
  console.log()
})
