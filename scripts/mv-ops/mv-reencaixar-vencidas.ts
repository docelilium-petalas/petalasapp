/**
 * Traz as mensagens VENCIDAS para daqui a pouco — e só elas.
 *
 *   npx tsx scripts/mv-ops/mv-reencaixar-vencidas.ts                 # dry-run
 *   npx tsx scripts/mv-ops/mv-reencaixar-vencidas.ts --em 15 --apply # a partir de daqui a 15 min
 *
 * Porte de `scripts/mv-reencaixar-vencidas.ts` da CarBoss. O resto da fila não
 * se move. Diferenças da origem:
 *  · a campanha datada fica de fora (decisão do Owner);
 *  · em vez de jogar todas no MESMO instante, cada cliente é redistribuída com
 *    `distribuirNaJanela` (a mesma regra do "retomar" da tela): dentro da
 *    janela e uma por dia por cliente. Duas vencidas da mesma cliente no mesmo
 *    instante sairiam em dois tiques seguidos — o colapso da régua.
 *
 * ⛔ NÃO SOLTA O FREIO.
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, mascarar, opcao, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { distribuirNaJanela, parseJanela } from '../../src/lib/maquina-vendas/janela'

rodar(async () => {
  cabecalho('REENCAIXAR VENCIDAS (fora da campanha datada)')
  const minutos = Number(opcao('--em') ?? 8)
  if (!Number.isInteger(minutos) || minutos < 1 || minutos > 720) throw new Error('--em espera minutos inteiros entre 1 e 720')
  const agora = new Date()
  const ajustes = await obterAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)

  const vencidas = await prisma.mvMensagem.findMany({
    where: { status: 'AGENDADA', agendadaPara: { lt: agora }, inscricao: { ...FORA_DA_CAMPANHA, status: 'ATIVA' } },
    orderBy: [{ inscricaoId: 'asc' }, { etapaOrdem: 'asc' }],
    select: { id: true, inscricaoId: true, etapaOrdem: true, agendadaPara: true, inscricao: { select: { nomeSnapshot: true, telefoneE164: true, cadencia: { select: { nome: true } } } } },
  })
  if (!vencidas.length) {
    console.log('nada vencido fora da campanha — fila em dia.')
    return
  }

  const inicio = new Date(agora.getTime() + minutos * 60_000)
  const porInscricao = new Map<string, typeof vencidas>()
  for (const m of vencidas) porInscricao.set(m.inscricaoId, [...(porInscricao.get(m.inscricaoId) ?? []), m])

  const trocas: Array<{ id: string; nova: Date }> = []
  for (const msgs of porInscricao.values()) {
    const horarios = distribuirNaJanela(inicio, msgs.length, janela)
    msgs.forEach((m, k) => {
      trocas.push({ id: m.id, nova: horarios[k] })
      console.log(`  ${brt(m.agendadaPara)} → ${brt(horarios[k])}  toque ${m.etapaOrdem} · ${m.inscricao.nomeSnapshot} ${mascarar(m.inscricao.telefoneE164)} [${m.inscricao.cadencia.nome}]`)
    })
  }

  if (!APLICAR) {
    console.log(`\n(dry-run — ${trocas.length} mensagem(ns) seriam reencaixadas. Repita com --apply)`)
    return
  }
  await prisma.$transaction(trocas.map((t) => prisma.mvMensagem.update({ where: { id: t.id }, data: { agendadaPara: t.nova } })))
  await registrarAjuste('Vencidas reencaixadas', { mensagens: trocas.length, aPartirDe: inicio.toISOString() })
  console.log(`\n✅ ${trocas.length} mensagem(ns) reencaixada(s). O freio continua como estava.`)
})
