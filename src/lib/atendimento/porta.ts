/**
 * A PORTA DO AGENTE — quem pode chamar `/api/agente/*`.
 *
 * O n8n chama com a credencial `CRM Cron Doce Lilium` (Header Auth), que leva o
 * `CRON_SECRET`. Aceita com ou sem `Bearer `: o valor entrou na credencial sem
 * o prefixo (o campo de senha do n8n não aceitou digitação), e recusar por
 * causa de um prefixo deixaria a IA muda sem erro visível.
 *
 * Falha FECHADA: sem segredo configurado, ninguém entra.
 */

import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

export function portaAberta(request: Request): true | NextResponse {
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) return NextResponse.json({ erro: 'CRON_SECRET não configurado.' }, { status: 503 })
  const cabecalho = (request.headers.get('authorization') ?? '').trim()
  const informado = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7).trim() : cabecalho
  const a = Buffer.from(informado)
  const b = Buffer.from(segredo)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  return true
}

/** O telefone que o n8n manda: só dígitos, com DDI. */
export function telefoneDaRequisicao(valor: unknown): string | null {
  const d = String(valor ?? '').replace(/\D/g, '')
  if (d.length < 10) return null
  return d.startsWith('55') ? d : `55${d}`
}
