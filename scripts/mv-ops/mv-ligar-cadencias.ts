/**
 * LIGA E DESLIGA CADÊNCIA — com a conta antes.
 *
 *   npx tsx scripts/mv-ops/mv-ligar-cadencias.ts                          # só mostra
 *   npx tsx scripts/mv-ops/mv-ligar-cadencias.ts --ligar <gatilho|id> --apply
 *   npx tsx scripts/mv-ops/mv-ligar-cadencias.ts --desligar <gatilho|id> --apply
 *
 * Porte de `scripts/mv-ligar-cadencias.ts` da CarBoss. Ligar é o comando de
 * maior consequência do módulo: o número de quem entra aparece ANTES.
 *
 * Diferenças da origem:
 *  · a campanha datada não liga nem desliga por aqui (decisão do Owner);
 *  · régua presa a coluna do funil: estoque = cards OPEN na coluna sem
 *    inscrição naquela cadência (a mesma conta do `varrerEstoque`). Régua da
 *    loja (carrinho, pedido, coleção, reativação): quem entra é decidido pelo
 *    observador da loja a cada tique — não há estoque para contar aqui;
 *  · `--limpar-erros` NÃO se porta: na origem a linha ERRO trancava o card
 *    pelo índice único (cadência, deal). Aqui o índice único só vale para
 *    `ATIVA` e a linha de erro tem referência própria — não há porta trancada
 *    para destrancar, e apagar seria só perder prova. As ERRO são listadas.
 */

import { APLICAR, cabecalho, opcao, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { situacaoDaCadencia } from '../../src/lib/maquina-vendas/situacao'
import { ehGatilhoDeCampanha } from '../../src/lib/maquina-vendas/cadencias-seed'

rodar(async () => {
  const ligar = opcao('--ligar')
  const desligar = opcao('--desligar')
  cabecalho('LIGAR / DESLIGAR CADÊNCIAS', Boolean(ligar || desligar))
  const ajustes = await obterAjustes()
  const cadencias = await prisma.mvCadencia.findMany({
    include: { etapas: { select: { ordem: true, templateNome: true } }, _count: { select: { inscricoes: true } } },
    orderBy: { nome: 'asc' },
  })
  const stages = await prisma.stage.findMany({ where: { id: { in: cadencias.map((c) => c.stageId).filter((s): s is string => !!s) } }, select: { id: true, nome: true } })
  const porStage = new Map(stages.map((s) => [s.id, s]))

  console.log('CADÊNCIAS\n')
  const linhas: Array<{ id: string; gatilho: string; nome: string; ativo: boolean; novos: number | null; etapas: number }> = []
  for (const c of cadencias) {
    const st = c.stageId ? porStage.get(c.stageId) : null
    const s = situacaoDaCadencia({
      nome: c.nome,
      gatilho: c.gatilho,
      ativo: c.ativo,
      colunaArquivada: Boolean(c.stageId && !st),
      inscricoes: c._count.inscricoes,
      etapasComTemplate: c.etapas.filter((e) => e.templateNome).length,
    })
    let novos: number | null = null
    if (c.stageId) {
      const naColuna = await prisma.deal.findMany({ where: { stageId: c.stageId, status: 'OPEN' }, select: { id: true }, orderBy: { id: 'asc' } })
      const ja = await prisma.mvInscricao.findMany({ where: { cadenciaId: c.id, dealId: { in: naColuna.map((d) => d.id) } }, select: { dealId: true }, orderBy: { id: 'asc' } })
      const inscritos = new Set(ja.map((i) => i.dealId))
      novos = naColuna.filter((d) => !inscritos.has(d.id)).length
    }
    linhas.push({ id: c.id, gatilho: c.gatilho, nome: c.nome, ativo: c.ativo, novos, etapas: c.etapas.length })
    const campanha = ehGatilhoDeCampanha(c.gatilho) ? '  [campanha — intocável]' : ''
    console.log(`  ${(c.ativo ? 'LIGADA' : 'desligada').padEnd(10)} ${s.estado.padEnd(22)} ${c.nome}${campanha}`)
    console.log(
      novos === null
        ? `             régua da loja (${c.gatilho}) · entra quem o observador encontrar a cada tique`
        : `             coluna "${porStage.get(c.stageId!)?.nome ?? '?'}" · ${novos} cliente(s) entrariam · ${novos * c.etapas.length} mensagem(ns)`,
    )
    if (s.oQueFazer) console.log(`             → ${s.oQueFazer}`)
  }

  const erros = await prisma.mvInscricao.findMany({
    where: { status: 'ERRO', mensagens: { none: { status: 'ENVIADA' } } },
    select: { nomeSnapshot: true, motivoParada: true, cadencia: { select: { nome: true } } },
    orderBy: { createdAt: 'desc' },
    take: 30,
  })
  if (erros.length) {
    console.log(`\nINSCRIÇÕES ERRO SEM ENVIO — ${erros.length}${erros.length === 30 ? '+' : ''} (ficam como prova; não trancam ninguém aqui)`)
    for (const e of erros.slice(0, 10)) console.log(`    ${e.nomeSnapshot.padEnd(18).slice(0, 18)} ${e.cadencia.nome} — ${(e.motivoParada ?? '').slice(0, 100)}`)
  }

  const casa = (alvo: string) => linhas.filter((l) => l.id === alvo || l.gatilho === alvo || l.nome === alvo)
  const aLigar = ligar ? casa(ligar).filter((l) => !l.ativo) : []
  const aDesligar = desligar ? casa(desligar).filter((l) => l.ativo) : []
  for (const l of [...aLigar, ...aDesligar]) {
    if (ehGatilhoDeCampanha(l.gatilho)) throw new Error(`"${l.nome}" é da campanha datada — não liga/desliga por script (decisão do Owner).`)
  }
  if (ligar && !aLigar.length) console.log(`\n⚠️ nada a ligar para "${ligar}" (não existe ou já está ligada).`)
  if (desligar && !aDesligar.length) console.log(`\n⚠️ nada a desligar para "${desligar}" (não existe ou já está desligada).`)
  if (aLigar.length) {
    const clientes = aLigar.reduce((s, a) => s + (a.novos ?? 0), 0)
    console.log(`\nA LIGAR: ${aLigar.map((a) => a.nome).join(', ')} · ${clientes} cliente(s) de coluna entram de imediato`)
    console.log(`  teto diário ${ajustes.tetoDiario} · janela ${ajustes.janelaInicio}–${ajustes.janelaFim} · freio ${ajustes.envioPausado ? 'PUXADO (nada sai)' : 'SOLTO'}`)
  }
  if (aDesligar.length) console.log(`\nA DESLIGAR: ${aDesligar.map((a) => a.nome).join(', ')} — quem já está inscrita continua até o fim (pause pela tela para parar)`)
  if (!aLigar.length && !aDesligar.length) return
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada mudou. Para valer: --apply')
    return
  }
  for (const a of aLigar) await prisma.mvCadencia.update({ where: { id: a.id }, data: { ativo: true } })
  for (const a of aDesligar) await prisma.mvCadencia.update({ where: { id: a.id }, data: { ativo: false } })
  await registrarAjuste('Cadências ligadas/desligadas por script', { ligadas: aLigar.map((a) => a.nome), desligadas: aDesligar.map((a) => a.nome) })
  for (const a of aLigar) console.log(`✅ LIGADA: ${a.nome}`)
  for (const a of aDesligar) console.log(`✅ desligada: ${a.nome}`)
})
