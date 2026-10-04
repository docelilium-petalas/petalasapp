/**
 * Carimba `respondeuEm` nas inscrições que pararam por resposta e ficaram sem
 * o carimbo.
 *
 *   npx tsx scripts/mv-ops/mv-backfill-respondeu-em.ts            # dry-run
 *   npx tsx scripts/mv-ops/mv-backfill-respondeu-em.ts --apply
 *
 * Porte de `scripts/mv-backfill-respondeu-em.ts` da CarBoss. Quem responde
 * ANTES do primeiro envio não passa por `registrarRespostas` (que exige
 * `tentativas > 0`): a inscrição termina `RESPONDEU`/`OPT_OUT` com
 * `respondeuEm` nulo, e o Resultados (que conta por `respondeuEm`) não a vê.
 *
 * Diferença da origem: a prova não vem do `n8n_chat_histories` (não existe
 * aqui), e sim dos turnos da cliente em `MvResposta` — onde o webhook já
 * separou a cliente do eco da loja. Mesma folga de relógio do módulo.
 *
 * ⛔ SÓ CARIMBA QUEM TEM PROVA. Sem fala da cliente depois da inscrição, a
 *    linha fica como está e aparece em "sem prova".
 * ⛔ NÃO TOCA QUEM JÁ TEM CARIMBO.
 * ⛔ A campanha datada fica de fora (decisão do Owner).
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, mascarar, prisma, registrarAjuste, rodar } from './_base'
import { FOLGA_MS, lerTurnosCrus } from '../../src/lib/maquina-vendas/respostas'

rodar(async () => {
  cabecalho('BACKFILL respondeuEm (parou por resposta, sem carimbo)')
  const alvos = await prisma.mvInscricao.findMany({
    where: { status: { in: ['RESPONDEU', 'OPT_OUT'] }, respondeuEm: null, ...FORA_DA_CAMPANHA },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nomeSnapshot: true, telefoneE164: true, telefoneKey: true, status: true, tentativas: true, createdAt: true },
  })
  console.log(`${alvos.length} inscrição(ões) parada(s) por resposta e sem carimbo.\n`)
  if (!alvos.length) return

  const conversas = await prisma.mvResposta.findMany({
    where: { telefoneKey: { in: [...new Set(alvos.map((a) => a.telefoneKey))] } },
    orderBy: { telefoneKey: 'asc' },
    select: { telefoneKey: true, ultimasMsgs: true, respondidoEm: true },
  })
  const porChave = new Map(conversas.map((c) => [c.telefoneKey, c]))

  const comProva: Array<{ id: string; em: Date }> = []
  const semProva: typeof alvos = []
  for (const a of alvos) {
    const c = porChave.get(a.telefoneKey)
    const ref = a.createdAt.getTime() - FOLGA_MS
    const falas = lerTurnosCrus(c?.ultimasMsgs).filter((t) => t.de === 'cliente' && t.em.getTime() >= ref)
    const primeira = falas.length ? falas.reduce((x, y) => (x.em <= y.em ? x : y)).em : null
    const em = primeira ?? (c?.respondidoEm && c.respondidoEm.getTime() >= ref ? c.respondidoEm : null)
    if (!em) {
      semProva.push(a)
      continue
    }
    comProva.push({ id: a.id, em })
    console.log(`  ${a.status.padEnd(9)} ${a.tentativas} envio(s)  falou ${brt(em)}  ${a.nomeSnapshot} ${mascarar(a.telefoneE164)}`)
  }
  if (semProva.length) {
    console.log(`\n  ⚠️  ${semProva.length} sem fala registrada — ficam como estão:`)
    for (const s of semProva) console.log(`     ${s.nomeSnapshot} ${mascarar(s.telefoneE164)} (${s.status})`)
  }
  if (!comProva.length) {
    console.log('\nNada a carimbar.')
    return
  }
  if (!APLICAR) {
    console.log(`\nDRY-RUN — nada gravado. ${comProva.length} a carimbar. Para valer: --apply`)
    return
  }

  await prisma.$transaction(
    comProva.map((c) => prisma.mvInscricao.updateMany({ where: { id: c.id, respondeuEm: null }, data: { respondeuEm: c.em } })),
  )
  const sobra = await prisma.mvInscricao.count({ where: { id: { in: comProva.map((c) => c.id) }, respondeuEm: null } })
  if (sobra) throw new Error(`conferência falhou: ${sobra} ainda sem carimbo.`)
  await registrarAjuste('Backfill de respondeuEm', { carimbadas: comProva.length, semProva: semProva.length })
  console.log(`\n✓ ${comProva.length} carimbada(s), conferido no banco.`)
})
