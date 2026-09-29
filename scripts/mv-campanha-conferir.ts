/**
 * CONFERE A CAMPANHA DO DROP 10.10 ANTES DE ELA FALAR COM ALGUÉM.
 *
 *   npx tsx scripts/mv-campanha-conferir.ts
 *
 * Roda o observador como o tique roda, e mostra o que ele mediu: quantas
 * pessoas cada onda atinge, o que bloqueia, e — o número que decide se a
 * campanha é viável — quantos DIAS o motor levaria para entregar cada onda
 * com o teto diário atual.
 *
 * Campanha com data marcada que precisa de 2 dias para sair não é campanha:
 * é o "é hoje!" chegando amanhã. Se `diasParaEntregar` vier maior que 1, o
 * teto tem que subir na tela de ajustes ANTES da data, não no dia.
 *
 * Não envia nada e não arma nada: com `MV_CAMPANHA_1010` desligado o
 * observador mede e devolve, sem inscrever ninguém.
 */

import { observarCampanhas } from '../src/lib/maquina-vendas/campanha-datada'
import { obterAjustes } from '../src/lib/maquina-vendas/config'
import { statusDosTemplates } from '../src/lib/maquina-vendas/canal'

async function main() {
  const ajustes = await obterAjustes()
  const status = await statusDosTemplates(true)

  console.log('── MOTOR ──────────────────────────────────────────────')
  console.log(`  envio pausado:    ${ajustes.envioPausado ? 'SIM (nada sai)' : 'não'}`)
  console.log(`  teto diário:      ${ajustes.tetoDiario}`)
  console.log(`  intervalo:        ${ajustes.intervaloMinMinutos}–${ajustes.intervaloMaxMinutos} min`)
  console.log(`  janela:           ${ajustes.janelaInicio}–${ajustes.janelaFim} (São Paulo)`)
  console.log(`  campanha armada:  ${process.env.MV_CAMPANHA_1010 === '1' ? 'SIM' : 'não (MV_CAMPANHA_1010)'}`)

  console.log('\n── TEMPLATES NA META ──────────────────────────────────')
  if (!status) console.log('  não foi possível consultar a WABA')
  else {
    for (const nome of ['dl_drop_1010_save_the_date_v1', 'dl_drop_1010_vespera_v1', 'dl_drop_1010_chegou_v1']) {
      console.log(`  ${(status.get(nome) ?? 'AUSENTE').padEnd(10)} ${nome}`)
    }
  }

  const r = await observarCampanhas()
  console.log('\n── ONDAS ──────────────────────────────────────────────')
  for (const o of r.ondas) {
    console.log(`\n  ${o.onda}`)
    console.log(`    abre em:     ${o.quando}`)
    console.log(`    alcança:     ${o.alvo} pessoa(s)`)
    console.log(`    inscritas:   ${o.inscritos}`)
    if (o.motivo) console.log(`    parado por:  ${o.motivo}`)
    if (o.diasParaEntregar > 1) {
      console.log(`    ⚠ ENTREGA EM ${o.diasParaEntregar} DIAS com teto ${ajustes.tetoDiario} — a data não se cumpre`)
    } else if (o.alvo > 0) {
      console.log(`    entrega:     no mesmo dia`)
    }
    for (const p of o.pulados) console.log(`    · ${p.quantos} ${p.motivo}`)
  }
  console.log('')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nfalhou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
