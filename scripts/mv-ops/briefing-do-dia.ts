/**
 * O BRIEFING DO DIA, na tela — o mesmo texto, sem gastar mensagem.
 *
 *   npx tsx scripts/mv-ops/briefing-do-dia.ts
 *   npx tsx scripts/mv-ops/briefing-do-dia.ts --dia 2026-10-10
 *   npx tsx scripts/mv-ops/briefing-do-dia.ts --enviar          # manda de verdade
 *
 * Porte de `scripts/briefing-do-dia.ts` da CarBoss. Sem `--enviar` ele NÃO fala
 * com a Datafy: monta, formata e imprime, com o tamanho de cada parte ao lado —
 * o limite duro do WhatsApp é 4096 caracteres por mensagem.
 *
 * Com `--enviar` passa pelo `enviarBriefing` de produção (canal com lista de
 * teste). Janela de 24h fechada → bate na porta com `dl_relatorio_pronto_v1`.
 */

import { cabecalho, opcao, rodar, tem } from './_base'
import { montarBriefing, formatarBriefing, enviarBriefing } from '../../src/lib/maquina-vendas/briefing'
import { inicioDoDia } from '../../src/lib/maquina-vendas/programacao'

/** Meio-dia do dia pedido: a temperatura mede "há quanto tempo" contra este instante. */
function instanteDoDia(dia: string | undefined): Date {
  if (!dia) return new Date()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw new Error(`--dia inválido: "${dia}" (esperado AAAA-MM-DD)`)
  return new Date(inicioDoDia(dia).getTime() + 12 * 3600_000)
}

rodar(async () => {
  const enviar = tem('--enviar')
  cabecalho(enviar ? 'BRIEFING DO DIA — ENVIO REAL' : 'BRIEFING DO DIA — prévia (nada sai)', false)
  const agora = instanteDoDia(opcao('--dia'))

  if (enviar) {
    const r = await enviarBriefing(agora)
    console.log('envio:', JSON.stringify(r, null, 2))
    if ('enviou' in r && r.enviou === false) process.exitCode = 1
    return
  }

  const b = await montarBriefing(agora)
  const partes = formatarBriefing(b)
  console.log(`── ${b.dia} · ${b.linhas.length} mensagem(ns) · ${b.fila.length} para contato ──`)
  if (b.pausado) console.log('⛔ envio PAUSADO')
  for (const a of b.avisos) console.log(`⚠️ ${a}`)
  console.log(`partes: ${partes.length}\n`)
  partes.forEach((p, i) => {
    console.log(`┌── parte ${i + 1}/${partes.length} · ${p.length} caracteres ──`)
    console.log(p)
    console.log('└────────────────────────────────────────\n')
  })
  const maior = Math.max(0, ...partes.map((p) => p.length))
  if (maior > 4096) {
    console.error(`❌ uma parte tem ${maior} caracteres — o WhatsApp corta em 4096.`)
    process.exitCode = 1
  }
})
