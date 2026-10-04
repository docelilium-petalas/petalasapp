/**
 * Empurra a fila para começar num dia e hora escolhidos (parede de São Paulo).
 *
 *   npx tsx scripts/mv-ops/adiar-fila-mv.ts 2026-10-06 10:00            # dry-run
 *   npx tsx scripts/mv-ops/adiar-fila-mv.ts 2026-10-06 10:00 --apply
 *   npx tsx scripts/mv-ops/adiar-fila-mv.ts 2026-10-06 10:00 --cadencia <id> --apply
 *
 * Porte de `scripts/adiar-fila-mv.ts` da CarBoss. DESLOCAMENTO ÚNICO: todas as
 * AGENDADAS andam o MESMO tanto — a ordem, o intervalo e "uma por cliente por
 * dia" chegam do outro lado intactos. Reencaixar pela grade recalcularia tudo.
 *
 * Diferenças da origem:
 *  · a campanha datada fica SEMPRE de fora (FORA_DA_CAMPANHA): o drop tem
 *    calendário próprio e a decisão sobre ele é do Owner;
 *  · a conta é feita com Prisma, que lê `timestamp sem fuso` como UTC — a
 *    armadilha das 3h era do node-pg cru da origem, e aqui a prova é a
 *    conferência por releitura no fim.
 *
 * Invariantes que reprovam o deslocamento (nada é gravado):
 *  1. nenhuma mensagem cai fora da janela de envio;
 *  2. nenhuma cliente recebe duas no mesmo dia.
 *
 * ⛔ NÃO SOLTA O FREIO. Programar quando sai é uma decisão; deixar sair é outra.
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, opcao, posicionais, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { dentroDaJanela, deParedeSP, paraParedeSP, parseJanela } from '../../src/lib/maquina-vendas/janela'

function alvoSP(dia: string | undefined, hora: string | undefined): Date {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dia ?? '')
  const h = /^(\d{2}):(\d{2})$/.exec(hora ?? '')
  if (!d || !h) throw new Error('uso: adiar-fila-mv.ts AAAA-MM-DD HH:MM [--cadencia <id>] [--apply]')
  return deParedeSP(Number(d[1]), Number(d[2]), Number(d[3]), Number(h[1]), Number(h[2]))
}

const diaSP = (d: Date) => {
  const p = paraParedeSP(d)
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

rodar(async () => {
  cabecalho('ADIAR FILA (deslocamento único, sem a campanha datada)')
  const [dia, hora] = posicionais(['--cadencia'])
  const alvo = alvoSP(dia, hora)
  const cadenciaId = opcao('--cadencia')
  const ajustes = await obterAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)

  const fila = await prisma.mvMensagem.findMany({
    where: { status: 'AGENDADA', inscricao: { ...FORA_DA_CAMPANHA, ...(cadenciaId ? { cadenciaId } : {}) } },
    orderBy: { agendadaPara: 'asc' },
    select: { id: true, inscricaoId: true, agendadaPara: true },
  })
  if (!fila.length) {
    console.log('fila vazia (fora da campanha) — nada a fazer.')
    return
  }

  const delta = alvo.getTime() - fila[0].agendadaPara.getTime()
  const novas = fila.map((m) => ({ ...m, nova: new Date(m.agendadaPara.getTime() + delta) }))
  console.log(`${fila.length} mensagem(ns) AGENDADA(s)`)
  console.log(`  primeira hoje: ${brt(fila[0].agendadaPara)}`)
  console.log(`  alvo:          ${brt(alvo)}`)
  console.log(`  deslocamento:  ${(delta / 3600_000).toFixed(2)} h ${delta < 0 ? '(para TRÁS)' : '(para frente)'}`)

  const porDia = new Map<string, number>()
  for (const m of novas) porDia.set(diaSP(m.nova), (porDia.get(diaSP(m.nova)) ?? 0) + 1)
  console.log('\ncomo a fila fica:')
  for (const [d, n] of [...porDia].sort()) console.log(`  ${d}  ${String(n).padStart(3)} msg`)

  const fora = novas.filter((m) => !dentroDaJanela(m.nova, janela)).length
  const vistos = new Set<string>()
  let colisao = 0
  for (const m of novas) {
    const k = `${m.inscricaoId}|${diaSP(m.nova)}`
    if (vistos.has(k)) colisao++
    vistos.add(k)
  }
  console.log('\nconferência:')
  console.log(fora === 0 ? `  ✓  nenhuma cai fora da janela ${ajustes.janelaInicio}–${ajustes.janelaFim}` : `  ✗  ${fora} cairiam FORA da janela`)
  console.log(colisao === 0 ? '  ✓  nenhuma cliente recebe duas no mesmo dia' : `  ✗  ${colisao} colisão(ões) no mesmo dia`)
  if (fora || colisao) throw new Error('o deslocamento quebraria uma invariante da fila — nada gravado.')

  if (!APLICAR) {
    console.log('\nDRY-RUN — nada gravado. Para valer: --apply')
    return
  }
  await prisma.$transaction(novas.map((m) => prisma.mvMensagem.update({ where: { id: m.id }, data: { agendadaPara: m.nova } })))

  const primeira = await prisma.mvMensagem.findFirst({
    where: { id: { in: novas.map((m) => m.id) }, status: 'AGENDADA' },
    orderBy: { agendadaPara: 'asc' },
    select: { agendadaPara: true },
  })
  if (primeira?.agendadaPara.getTime() !== alvo.getTime()) {
    throw new Error(`conferência falhou: primeira ficou ${brt(primeira?.agendadaPara)}, esperado ${brt(alvo)}`)
  }
  await registrarAjuste(`Fila adiada para ${brt(alvo)}`, { mensagens: novas.length, deltaHoras: delta / 3600_000, cadenciaId: cadenciaId ?? 'todas (fora da campanha)' })
  console.log(`\n✓ ${novas.length} mensagem(ns) deslocada(s). Primeira: ${brt(primeira.agendadaPara)}, conferido no banco.`)
  console.log(ajustes.envioPausado ? '⚠️  envio PAUSADO — programada, mas nada sai até soltar o freio.' : '⚠️  freio SOLTO — no horário marcado as mensagens SAEM.')
})
