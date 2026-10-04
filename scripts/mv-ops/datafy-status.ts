/**
 * O que a META diz do nosso número — não o que o painel da Datafy mostra.
 *
 *   npx tsx scripts/mv-ops/datafy-status.ts
 *
 * Credencial: a mesma do despachante (`obterCredenciaisCanal`: banco cifrado →
 * DATAFY_TOKEN/DATAFY_PHONE_NUMBER_ID). Porte de `scripts/datafy-status.ts`.
 *
 * Os DOIS campos que podem discordar — `status` e `health_status` — saem lado a
 * lado, de propósito: escolher um e esconder o outro é decidir com meia verdade.
 */

import { cabecalho, rodar } from './_base'
import { obterCredenciaisCanal } from '../../src/lib/maquina-vendas/canal'
import { statusDoNumero, canalSaudavel } from '../../src/lib/maquina-vendas/datafy'
import { lerPulsoDoCanal } from '../../src/lib/maquina-vendas/pulso'

const ROTULO: Record<string, string> = {
  CONNECTED: 'conectado',
  BANNED: 'BANIDO',
  RESTRICTED: 'restrito',
  FLAGGED: 'sinalizado',
  RATE_LIMITED: 'limitado por volume',
  PENDING: 'pendente',
  AVAILABLE: 'pode enviar',
  LIMITED: 'pode enviar, com limite',
  BLOCKED: 'NÃO pode enviar',
  APPROVED: 'aprovado',
  DECLINED: 'RECUSADO',
  PENDING_REVIEW: 'em análise',
  UNKNOWN: 'sem avaliação',
  GREEN: 'boa',
  YELLOW: 'média',
  RED: 'ruim',
}
const diga = (v: string) => `${v}${ROTULO[v] ? `  (${ROTULO[v]})` : ''}`

rodar(async () => {
  cabecalho('STATUS DO NÚMERO NA META (somente leitura)', false)
  const creds = await obterCredenciaisCanal() // lança CanalSemCredencial: fail-closed
  const s = await statusDoNumero(creds)
  if (!s) throw new Error('a Meta não respondeu sobre este número. Confira o token.')

  console.log(`número ${creds.phoneNumberId}\n`)
  console.log(`  nome            ${s.nomeVerificado}`)
  console.log(`  status          ${diga(s.status)}`)
  console.log(`  display name    ${diga(s.nomeStatus)}`)
  console.log(`  qualidade       ${diga(s.qualidade)}`)
  console.log(`  consegue enviar ${diga(s.podeEnviar)}`)
  if (s.avisos.length) {
    console.log('\n  a Meta avisa:')
    for (const a of s.avisos) console.log(`    · ${a}`)
  }
  if (s.status !== 'CONNECTED' && (s.podeEnviar === 'AVAILABLE' || s.podeEnviar === 'LIMITED')) {
    console.log(`\n  ⚠️  os dois campos discordam: status="${s.status}" mas health_status="${s.podeEnviar}".`)
  }

  // Acréscimo da Doce Lilium: o pulso — a Datafy está chamando o NOSSO webhook?
  const p = await lerPulsoDoCanal(new Date())
  console.log(`\n  pulso do webhook: ${p.nivel.toUpperCase()} — ${p.titulo}`)
  if (p.detalhe) console.log(`    ${p.detalhe}`)

  console.log(`\n  ${canalSaudavel(s) ? '✅ canal em condição de disparar' : '⛔ canal NÃO está em condição de disparar'}\n`)
  if (!canalSaudavel(s)) process.exitCode = 1
})
