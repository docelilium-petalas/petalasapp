/**
 * Põe as inscrições de UMA cadência na frente da fila.
 *
 *   npx tsx scripts/mv-ops/priorizar-cadencia-mv.ts reativacao_60d            # dry-run
 *   npx tsx scripts/mv-ops/priorizar-cadencia-mv.ts reativacao_60d --apply
 *   npx tsx scripts/mv-ops/priorizar-cadencia-mv.ts reativacao_60d --para 2 --apply   # devolve ao fim
 *
 * Porte DIVERGENTE de `scripts/priorizar-cadencia-mv.ts` da CarBoss. Lá o
 * despachante ordenava por `tentativas desc, agendadaPara asc`, e priorizar era
 * RECUAR o horário das vencidas. Aqui o despachante ordena por
 * `inscricao.prioridade asc, agendadaPara asc`, com três faixas:
 *
 *   0 — transacional (pagamento, envio): a cliente está esperando
 *   1 — régua normal (carrinho, coleção)
 *   2 — em massa (reativação, base, campanha)
 *
 * Então priorizar é mudar a FAIXA, sem tocar em horário. Nunca para 0: passar
 * marketing na frente de "seu pedido foi enviado" é o custo que não se aceita.
 * A campanha datada não se prioriza por aqui (decisão do Owner).
 *
 * O script mede o custo antes: quantas vencidas de faixa igual/maior ficam
 * atrás da leva promovida.
 */

import { APLICAR, cabecalho, opcao, posicionais, prisma, registrarAjuste, rodar } from './_base'

rodar(async () => {
  cabecalho('PRIORIZAR CADÊNCIA')
  const [gatilho] = posicionais(['--para'])
  if (!gatilho) throw new Error('Falta o gatilho. Ex.: priorizar-cadencia-mv.ts reativacao_60d')
  if (gatilho.startsWith('campanha_')) throw new Error('A campanha datada não se prioriza por script — decisão do Owner.')
  const para = Number(opcao('--para') ?? 1)
  if (![1, 2].includes(para)) throw new Error('--para aceita 1 (normal) ou 2 (em massa). 0 é só transacional.')

  const cads = await prisma.mvCadencia.findMany({ where: { gatilho }, select: { id: true, nome: true } })
  if (!cads.length) throw new Error(`Nenhuma cadência com gatilho "${gatilho}".`)
  const ids = cads.map((c) => c.id)

  const alvo = await prisma.mvInscricao.findMany({
    where: { cadenciaId: { in: ids }, status: 'ATIVA', prioridade: { not: para } },
    select: { id: true, prioridade: true },
  })
  const agora = new Date()
  const vencidasDela = await prisma.mvMensagem.count({ where: { status: 'AGENDADA', agendadaPara: { lte: agora }, inscricaoId: { in: alvo.map((a) => a.id) } } })
  const custo = await prisma.mvMensagem.count({
    where: { status: 'AGENDADA', agendadaPara: { lte: agora }, inscricao: { status: 'ATIVA', cadenciaId: { notIn: ids }, prioridade: { gte: para } } },
  })

  console.log(`cadência(s): ${cads.map((c) => c.nome).join(', ')}`)
  console.log(`${alvo.length} inscrição(ões) ATIVA(s) mudam para a faixa ${para} (${vencidasDela} mensagem(ns) vencida(s) delas)`)
  console.log(`custo: até ${custo} vencida(s) de outras cadências na mesma faixa ou abaixo passam a sair depois`)
  if (!alvo.length) return

  if (!APLICAR) {
    console.log('\nDRY-RUN — nada gravado. Para valer: --apply')
    return
  }
  const r = await prisma.mvInscricao.updateMany({ where: { id: { in: alvo.map((a) => a.id) } }, data: { prioridade: para } })
  await registrarAjuste(`Prioridade de "${gatilho}" → faixa ${para}`, { inscricoes: r.count })
  console.log(`\n✓ ${r.count} inscrição(ões) na faixa ${para}. Horários e teto intactos.`)
})
