/**
 * Realinha a copy das mensagens JÁ AGENDADAS com as cadências que estão no ar.
 *
 *   npx tsx scripts/mv-ops/resincronizar-copy-mv.ts                     (dry-run)
 *   npx tsx scripts/mv-ops/resincronizar-copy-mv.ts --cadencia <id> --apply
 *
 * Porte de `scripts/resincronizar-copy-mv.ts` da CarBoss. A lógica mora em
 * `lib/maquina-vendas/resincronizar.ts` (a mesma que o botão da tela usa) — o
 * script só imprime e decide gravar. Horário, etapa, contador e inscrição
 * ficam de pé; só texto, template e variáveis mudam.
 *
 * TUDO OU NADA: um problema em qualquer mensagem e nada é gravado.
 * A campanha datada é pulada pela própria lib (GATILHOS_INTOCAVEIS).
 */

import { APLICAR, cabecalho, opcao, registrarAjuste, rodar } from './_base'
import { resincronizarCopy } from '../../src/lib/maquina-vendas/resincronizar'

rodar(async () => {
  cabecalho('RESINCRONIZAR COPY DA FILA')
  const cadenciaId = opcao('--cadencia')
  const r = await resincronizarCopy({ cadenciaId, aplicar: APLICAR })

  console.log(`analisadas: ${r.analisadas}`)
  console.log(`já alinhadas: ${r.jaAlinhadas}`)
  console.log(`protegidas (campanha datada): ${r.protegidas}`)
  console.log(`a realinhar: ${r.realinhadas}`)
  if (r.problemas.length) {
    console.log('\n🔴 PROBLEMAS — nada foi gravado:')
    for (const p of r.problemas) console.log(`   ${p}`)
    process.exitCode = 1
    return
  }
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada foi gravado. Para valer: --apply')
    return
  }
  if (r.realinhadas > 0) await registrarAjuste('Copy da fila resincronizada', { cadenciaId: cadenciaId ?? 'todas', realinhadas: r.realinhadas })
  console.log(`\n✓ ${r.realinhadas} mensagem(ns) realinhada(s). Horários e contadores intactos.`)
})
