/**
 * GRAVA A FALA DA CLIENTE — porte de `recebidas.ts` da CarBoss.
 *
 * Na origem a fala ia para `n8n_chat_histories`. Aqui a fonte única de "o que
 * ela disse" é `MvResposta.ultimasMsgs` (`atendimento/conversa.ts`), que já é
 * o que `paradas.ts`, a IA e a tela leem — inventar outra tabela faria a
 * Máquina e a IA discordarem.
 *
 * O webhook já grava cada fala por `registrarTurno`. Esta porta existe para os
 * OUTROS caminhos de ingestão (reprocessar um lote, teste de nível 2, um
 * webhook futuro) com a mesma garantia da origem:
 *
 * ⛔ IDEMPOTENTE PELO `wamid`. A Meta re-entrega o webhook quando não recebe
 *    200 a tempo; a mesma fala duas vezes contaria resposta em dobro. Aqui a
 *    dedupe olha o `id` do turno já gravado — não depende do `eventIngestLog`,
 *    cuja falha o webhook tolera.
 */

import { registrarTurno, turnosDe } from '@/lib/atendimento/conversa'
import type { MensagemRecebida } from './entrega-meta'

export interface ResultadoRecebidas {
  gravadas: number
  repetidas: number
  detalhes: string[]
}

export async function gravarRecebidas(mensagens: MensagemRecebida[]): Promise<ResultadoRecebidas> {
  const r: ResultadoRecebidas = { gravadas: 0, repetidas: 0, detalhes: [] }

  for (const m of mensagens) {
    const e164 = String(m.telefone ?? '').replace(/\D/g, '')
    if (!e164 || !m.texto?.trim()) continue

    if (m.idExterno) {
      const ja = (await turnosDe(e164)).some((t) => t.id === m.idExterno)
      if (ja) {
        r.repetidas++
        continue
      }
    }

    await registrarTurno(e164, {
      em: m.quando.toISOString(),
      de: 'cliente',
      texto: m.texto,
      ...(m.idExterno ? { id: m.idExterno } : {}),
    })
    r.gravadas++
    // Só o final do número no detalhe — log não é lugar de telefone inteiro.
    r.detalhes.push(`…${e164.slice(-4)}: "${m.texto.slice(0, 60)}"`)
  }

  return r
}
