/**
 * A JANELA DE 24 h DE UM NÚMERO — sabida ANTES de mandar, não depois.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Texto livre só chega se o número nos escreveu nas últimas 24 h. O erro de
 * janela fechada (131047) NÃO volta na resposta do envio: a Datafy aceita o
 * POST (200, com wamid) e a Meta recusa minutos depois, pelo webhook.
 *
 * Medido em 08/10/2026: o primeiro briefing para o número de alerta saiu às
 * 13:30, o envio "deu certo", o carimbo do dia foi gravado — e às 13:30 o
 * webhook trouxe 131047. O relatório nunca chegou, e a porta (template) não
 * foi batida porque o código esperava o erro no `catch` do envio.
 *
 * Agora quem manda para a EQUIPE pergunta aqui primeiro. Toda mensagem que
 * chega pelo webhook grava `whatsapp:entrada:<chave>`; para quem falou antes
 * deste cursor existir, vale o último turno da cliente na memória da conversa.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { chaveTelefone } from './telefone'
import { turnosDe } from '@/lib/atendimento/conversa'

/** 24 h menos uma folga: mandar no último minuto é perder para o relógio da Meta. */
export const JANELA_UTIL_MS = 24 * 3_600_000 - 15 * 60_000

const chaveEntrada = (k: string) => `whatsapp:entrada:${k}`

/** Pura: a janela está aberta, dada a última mensagem que o número nos mandou? */
export function janelaPelaUltimaEntrada(ultima: Date | null, agora: Date): boolean {
  if (!ultima || Number.isNaN(ultima.getTime())) return false
  const idade = agora.getTime() - ultima.getTime()
  return idade >= -5 * 60_000 && idade < JANELA_UTIL_MS
}

/** Chamado pelo webhook a cada mensagem recebida (inclusive toque em botão). */
export async function registrarEntrada(e164: string, quando: Date): Promise<void> {
  const k = chaveTelefone(e164)
  if (!k) return
  const chave = chaveEntrada(k)
  const atual = await prisma.mvCursor.findUnique({ where: { chave }, select: { valor: true } })
  // Re-entrega antiga da Meta não pode recuar o relógio.
  if (atual?.valor && new Date(atual.valor).getTime() >= quando.getTime()) return
  await prisma.mvCursor.upsert({
    where: { chave },
    create: { chave, valor: quando.toISOString() },
    update: { valor: quando.toISOString() },
  })
}

export async function ultimaEntrada(e164: string): Promise<Date | null> {
  const k = chaveTelefone(e164)
  if (!k) return null
  const c = await prisma.mvCursor.findUnique({ where: { chave: chaveEntrada(k) }, select: { valor: true } })
  const doCursor = c?.valor ? new Date(c.valor) : null
  const turnos = await turnosDe(e164).catch(() => [])
  const daConversa = turnos
    .filter((t) => t.de === 'cliente')
    .map((t) => new Date(t.em))
    .filter((d) => !Number.isNaN(d.getTime()))
    .sort((a, b) => b.getTime() - a.getTime())[0]
  const datas = [doCursor, daConversa ?? null].filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
  return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null
}

export async function janelaAberta(e164: string, agora: Date = new Date()): Promise<boolean> {
  return janelaPelaUltimaEntrada(await ultimaEntrada(e164), agora)
}
