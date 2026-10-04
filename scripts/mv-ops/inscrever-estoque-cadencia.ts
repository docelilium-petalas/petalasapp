/**
 * Inscreve o ESTOQUE de uma régua de coluna na hora que você mandar.
 *
 *   npx tsx scripts/mv-ops/inscrever-estoque-cadencia.ts <gatilho|id>                 # dry-run
 *   npx tsx scripts/mv-ops/inscrever-estoque-cadencia.ts <gatilho|id> --apply
 *   npx tsx scripts/mv-ops/inscrever-estoque-cadencia.ts <gatilho|id> --em "2026-10-06 10:00" --apply
 *   npx tsx scripts/mv-ops/inscrever-estoque-cadencia.ts <gatilho|id> --limite 20 --apply
 *
 * Porte de `scripts/inscrever-estoque-cadencia.ts` da CarBoss. O observador de
 * colunas já varre o estoque a cada tique, mas com `agora` = o instante do
 * tique. Aqui o instante é seu: o `agora` sintético faz a etapa 1 cair em
 * `--em` (menos o delay dela) e a inscrição passa pela MESMA `inscreverDeal`
 * do observador — opt-out, conversa viva, copy, grade, tudo igual.
 *
 * Só vale para cadência presa a coluna do funil (`stageId`). Régua da loja
 * (carrinho, pedido, coleção, reativação) não tem estoque de coluna; campanha
 * datada nunca passa por aqui.
 *
 * ⛔ NÃO LIGA A CADÊNCIA. O despachante só olha `inscricao.status = ATIVA`:
 *    a leva anda mesmo com a régua desligada, sem abrir a porta para todo card
 *    que entrar na coluna depois.
 * ⛔ Lê Deal/Contact; nunca escreve neles.
 */

import { APLICAR, brt, cabecalho, mascarar, opcao, posicionais, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { inscreverDeal } from '../../src/lib/maquina-vendas/observador-colunas'
import { ehGatilhoDeCampanha } from '../../src/lib/maquina-vendas/cadencias-seed'
import { deParedeSP } from '../../src/lib/maquina-vendas/janela'
import { paraE164 } from '../../src/lib/maquina-vendas/telefone'

rodar(async () => {
  cabecalho('INSCREVER ESTOQUE DE UMA RÉGUA DE COLUNA')
  const [alvo] = posicionais(['--em', '--limite'])
  if (!alvo) throw new Error('Falta a cadência (gatilho ou id).')
  const limite = Number(opcao('--limite') ?? 50)
  if (!Number.isInteger(limite) || limite < 1 || limite > 500) throw new Error('--limite entre 1 e 500')

  const cad = await prisma.mvCadencia.findFirst({
    where: { OR: [{ id: alvo }, { gatilho: alvo }], stageId: { not: null } },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
    orderBy: { id: 'asc' },
  })
  if (!cad) throw new Error(`Nenhuma régua de COLUNA com gatilho/id "${alvo}". Régua da loja não tem estoque de coluna.`)
  if (ehGatilhoDeCampanha(cad.gatilho)) throw new Error('A campanha datada não se inscreve por aqui.')
  if (!cad.etapas.length) throw new Error('Cadência sem etapas.')

  let agora = new Date()
  const em = opcao('--em')
  if (em !== undefined) {
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(em)
    if (!m) throw new Error('--em espera "AAAA-MM-DD HH:MM" (parede de São Paulo)')
    const etapa1 = deParedeSP(+m[1], +m[2], +m[3], +m[4], +m[5])
    if (etapa1.getTime() < Date.now()) throw new Error('--em está no passado.')
    agora = new Date(etapa1.getTime() - cad.etapas[0].delayMinutos * 60_000)
    console.log(`etapa 1 em ${brt(etapa1)} → agora sintético ${brt(agora)}`)
  }

  const jaTiveram = await prisma.mvInscricao.findMany({ where: { cadenciaId: cad.id, dealId: { not: null } }, select: { dealId: true }, distinct: ['dealId'], orderBy: { dealId: 'asc' } })
  const excluir = jaTiveram.map((i) => i.dealId!).filter(Boolean)
  const deals = await prisma.deal.findMany({
    where: { stageId: cad.stageId!, ...(cad.pipelineId ? { pipelineId: cad.pipelineId } : {}), status: 'OPEN', ...(excluir.length ? { id: { notIn: excluir } } : {}) },
    select: { id: true, stageId: true, telefone: true, titulo: true, contactId: true, contact: { select: { nome: true, telefone: true } } },
    orderBy: { createdAt: 'asc' },
    take: limite,
  })
  console.log(`cadência: ${cad.nome} (${cad.ativo ? 'ligada' : 'DESLIGADA — a leva anda mesmo assim'})`)
  console.log(`${deals.length} card(s) no estoque sem inscrição nesta régua (limite ${limite})\n`)
  for (const d of deals) console.log(`  ${(d.contact?.nome ?? d.titulo).padEnd(22).slice(0, 22)} ${mascarar(paraE164(d.contact?.telefone || d.telefone || '') ?? '')}`)
  if (!deals.length) return
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada gravado. Para valer: --apply')
    return
  }

  const ajustes = await obterAjustes()
  const placar = { ok: 0, pulado: 0, erro: 0 }
  for (const d of deals) {
    const r = await inscreverDeal(
      { id: cad.id, nome: cad.nome, stageId: cad.stageId!, pipelineId: cad.pipelineId, etapas: cad.etapas },
      d as Parameters<typeof inscreverDeal>[1],
      agora,
      ajustes,
      { ref: `deal:${d.id}:estoque` },
    )
    placar[r.r]++
    if (r.r !== 'ok') console.log(`  ${r.r === 'erro' ? '✗' : '·'} ${d.contact?.nome ?? d.titulo}: ${r.motivo}`)
  }
  await registrarAjuste(`Estoque inscrito em "${cad.nome}"`, { ...placar, agora: agora.toISOString() })
  console.log(`\n✓ ${placar.ok} inscrita(s) · ${placar.pulado} cederam a vez · ${placar.erro} com erro (visível na tela). A cadência NÃO foi ligada.`)
})
