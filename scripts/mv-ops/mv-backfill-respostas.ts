/**
 * Recupera os sinais (resposta, equipe atendeu) de quem já recebeu mensagem.
 *
 *   npx tsx scripts/mv-ops/mv-backfill-respostas.ts                 # só conta
 *   npx tsx scripts/mv-ops/mv-backfill-respostas.ts --dias 90 --apply
 *
 * Porte de `scripts/mv-backfill-respostas.ts` da CarBoss. É a MESMA função que
 * o tique roda a cada 5 min — de propósito: um backfill com critério próprio é
 * como o número da tela para de bater com o do relatório.
 *
 * Diferenças da origem:
 *  · `sdrFalouEm` aqui é `humanoFalouEm`; reunião/venda viram pedido pago, que
 *    é creditado pelo `gatilho-pedido` na hora do pagamento — não há desfecho
 *    a reprocessar por aqui (`registrarDesfechos` não existe na Doce Lilium);
 *  · `--dias` alarga a janela de atribuição SÓ nesta execução (1 a 90).
 *
 * Escreve só `respondeuEm`, `respostas` e `humanoFalouEm`. Não muda status,
 * não cancela mensagem, não manda nada. A campanha datada fica de fora (é
 * `ORIGENS_FORA` dentro da própria função).
 */

import { APLICAR, cabecalho, opcao, prisma, registrarAjuste, rodar } from './_base'

rodar(async () => {
  cabecalho('BACKFILL de respostas (a mesma função do tique)')
  const dias = opcao('--dias')
  if (dias !== undefined) {
    const n = Number(dias)
    if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error('--dias espera um inteiro entre 1 e 90')
    process.env.MV_JANELA_ATRIBUICAO_DIAS = String(n)
  }
  const { registrarRespostas, janelaAtribuicaoDias, LOTE } = await import('../../src/lib/maquina-vendas/respostas')

  const contar = async () => ({
    alcancadas: await prisma.mvInscricao.count({ where: { tentativas: { gt: 0 } } }),
    respondeu: await prisma.mvInscricao.count({ where: { respondeuEm: { not: null } } }),
    equipe: await prisma.mvInscricao.count({ where: { humanoFalouEm: { not: null } } }),
    statusRespondeu: await prisma.mvInscricao.count({ where: { status: 'RESPONDEU' } }),
  })
  const antes = await contar()
  console.log(`janela de atribuição: ${janelaAtribuicaoDias()} dia(s)`)
  console.log('ANTES:')
  console.log(`  alcançadas (tentativas > 0) : ${antes.alcancadas}`)
  console.log(`  respondeuEm preenchido      : ${antes.respondeu}`)
  console.log(`  humanoFalouEm preenchido    : ${antes.equipe}`)
  console.log(`  status 'RESPONDEU'          : ${antes.statusRespondeu}`)

  if (!APLICAR) {
    console.log('\nDRY-RUN — nada foi gravado. Para valer: --apply')
    return
  }
  const r = await registrarRespostas()
  const depois = await contar()
  console.log('\nDEPOIS:')
  console.log(`  avaliadas          : ${r.avaliadas}${r.avaliadas >= LOTE ? '  ⚠️ lote cheio — rode de novo' : ''}`)
  console.log(`  novas respostas    : ${r.respondeu}  (total ${depois.respondeu})`)
  console.log(`  equipe atendeu     : ${r.equipe}  (total ${depois.equipe})`)
  console.log(`  sem conversa       : ${r.semConversa}`)

  const semResposta = await prisma.mvInscricao.count({ where: { tentativas: { gt: 0 }, respondeuEm: null } })
  console.log(`\ncontrole negativo — alcançadas SEM resposta: ${semResposta}`)
  if (semResposta === 0 && depois.alcancadas > 0) console.log('  ⚠️ TODO MUNDO ficou marcado como tendo respondido. Improvável — confira o critério.')
  await registrarAjuste('Backfill de respostas', { ...r, janelaDias: janelaAtribuicaoDias() })
})
