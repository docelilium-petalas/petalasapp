/**
 * Encerra o acompanhamento em andamento para recomeçar — SEM APAGAR HISTÓRIA.
 *
 *   npx tsx scripts/mv-ops/cancelar-fila-mv.ts                       (dry-run)
 *   npx tsx scripts/mv-ops/cancelar-fila-mv.ts --cadencia <id> --apply
 *   npx tsx scripts/mv-ops/cancelar-fila-mv.ts --apply
 *
 * Porte DIVERGENTE de `scripts/reset-maquina-vendas.ts` da CarBoss. A origem
 * fazia `deleteMany` em mensagens e inscrições. Aqui isso não se porta:
 *   · mensagem ENVIADA é prova do que a cliente recebeu (wamid, entregue, lido)
 *     e é a base da atribuição de venda em Resultados;
 *   · inscrição carrega `respondeuEm`/`humanoFalouEm`/opt-out que as paradas
 *     consultam — apagar faria a Máquina falar de novo com quem pediu silêncio.
 *
 * O que faz: AGENDADA → CANCELADA e inscrição ATIVA/PAUSADA → CANCELADA, com
 * motivo. ENVIADA, ERRO, respostas e opt-outs ficam. A campanha datada fica
 * SEMPRE de fora (decisão do Owner). O observador reinscreve quem ainda estiver
 * elegível no tique seguinte — o índice único parcial só olha ATIVA.
 */

import { APLICAR, FORA_DA_CAMPANHA, cabecalho, opcao, prisma, registrarAjuste, rodar } from './_base'

rodar(async () => {
  cabecalho('CANCELAR FILA (sem apagar histórico)')
  const cadenciaId = opcao('--cadencia')
  const filtroInsc = {
    status: { in: ['ATIVA', 'PAUSADA'] },
    ...FORA_DA_CAMPANHA,
    ...(cadenciaId ? { cadenciaId } : {}),
  }

  const inscricoes = await prisma.mvInscricao.findMany({
    where: filtroInsc,
    select: { id: true, cadencia: { select: { nome: true } }, _count: { select: { mensagens: { where: { status: 'AGENDADA' } } } } },
  })
  const porCadencia = new Map<string, { insc: number; msgs: number }>()
  for (const i of inscricoes) {
    const c = porCadencia.get(i.cadencia.nome) ?? { insc: 0, msgs: 0 }
    c.insc++
    c.msgs += i._count.mensagens
    porCadencia.set(i.cadencia.nome, c)
  }
  for (const [nome, c] of porCadencia) console.log(`  ${nome}: ${c.insc} inscrição(ões) · ${c.msgs} agendada(s)`)
  if (!inscricoes.length) {
    console.log('nada em andamento fora da campanha datada.')
    return
  }
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada foi cancelado. Para valer: --apply')
    return
  }

  const ids = inscricoes.map((i) => i.id)
  const motivo = 'fila cancelada por script (cancelar-fila-mv)'
  const [msgs, insc] = await prisma.$transaction([
    prisma.mvMensagem.updateMany({ where: { inscricaoId: { in: ids }, status: 'AGENDADA' }, data: { status: 'CANCELADA', erro: motivo } }),
    prisma.mvInscricao.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELADA', motivoParada: motivo } }),
  ])
  await registrarAjuste('Fila cancelada', { cadenciaId: cadenciaId ?? 'todas (fora da campanha)', inscricoes: insc.count, mensagens: msgs.count })
  console.log(`\n✓ ${insc.count} inscrição(ões) e ${msgs.count} mensagem(ns) canceladas. Histórico preservado.`)
})
