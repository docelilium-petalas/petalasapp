/**
 * A CONVERSA — o que a IA precisa lembrar, guardado no CRM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Na CarBoss a memória mora numa tabela do n8n (`n8n_chat_histories`). Aqui
 * ela mora no CRM, na linha de `MvResposta` da própria cliente, por dois
 * motivos medidos em 13/09/2026:
 *
 *   · as credenciais de Redis e Postgres que vieram do n8n antigo não foram
 *     provadas no host novo — o agente não pode depender delas para lembrar;
 *   · a Máquina já usa essa linha para saber que a cliente respondeu. Uma
 *     fonte só para "o que ela disse" evita a IA e a Máquina discordarem.
 *
 * Guarda os últimos 30 turnos. É memória de CONVERSA, não arquivo: o que
 * importa para vender está no pedido e no carrinho, que vêm da loja.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { chaveTelefone } from '@/lib/maquina-vendas/telefone'

export type Turno = { em: string; de: 'cliente' | 'loja'; texto: string; id?: string }

const MAX_TURNOS = 30

function lerTurnos(json: unknown): Turno[] {
  if (!Array.isArray(json)) return []
  return json
    .map((t) => t as Partial<Turno>)
    .filter((t) => typeof t?.texto === 'string' && t.texto.trim())
    // linhas antigas, gravadas antes da IA, só tinham o que a cliente escreveu
    .map((t) => ({ em: t.em ?? new Date(0).toISOString(), de: t.de === 'loja' ? 'loja' : 'cliente', texto: t.texto!, id: t.id }))
}

/**
 * Acrescenta um turno. Turno da cliente cria a linha e move `respondidoEm`;
 * turno da loja só acrescenta — ele nunca pode fazer a Máquina achar que a
 * cliente respondeu.
 */
export async function registrarTurno(e164: string, turno: Turno): Promise<void> {
  const chave = chaveTelefone(e164)
  if (!chave) return
  const linha = await prisma.mvResposta.findUnique({ where: { telefoneKey: chave } })
  const turnos = [...lerTurnos(linha?.ultimasMsgs), { ...turno, texto: turno.texto.slice(0, 1500) }].slice(-MAX_TURNOS)

  if (turno.de === 'cliente') {
    await prisma.mvResposta.upsert({
      where: { telefoneKey: chave },
      create: { telefoneKey: chave, telefoneE164: e164, respondidoEm: new Date(turno.em), ultimasMsgs: turnos, origem: 'meta' },
      update: { telefoneE164: e164, respondidoEm: new Date(turno.em), ultimasMsgs: turnos, origem: 'meta' },
    })
  } else if (linha) {
    await prisma.mvResposta.update({ where: { telefoneKey: chave }, data: { ultimasMsgs: turnos } })
  }
}

export async function turnosDe(e164: string): Promise<Turno[]> {
  const chave = chaveTelefone(e164)
  if (!chave) return []
  const linha = await prisma.mvResposta.findUnique({ where: { telefoneKey: chave } })
  return lerTurnos(linha?.ultimasMsgs)
}

/**
 * Separa o que a IA ainda não respondeu (as mensagens da cliente depois da
 * última fala da loja) do histórico anterior. É isso que junta "oi" + "tem
 * vestido?" + "tamanho M" num pedido só, em vez de três respostas.
 */
export function pendentesEHistorico(turnos: Turno[], maxHistorico = 14): { pendentes: Turno[]; historico: Turno[] } {
  let corte = turnos.length
  while (corte > 0 && turnos[corte - 1].de === 'cliente') corte--
  return { pendentes: turnos.slice(corte), historico: turnos.slice(0, corte).slice(-maxHistorico) }
}

export function historicoEmTexto(turnos: Turno[]): string {
  if (!turnos.length) return '(primeira conversa)'
  return turnos.map((t) => `${t.de === 'cliente' ? 'Cliente' : 'Doce Lilium'}: ${t.texto.replace(/\s+/g, ' ').slice(0, 400)}`).join('\n')
}

// ── Chaves de controle, em MvCursor ───────────────────────────────────────

const CHAVE_IA = 'atendimento:ia'
const chaveHumano = (k: string) => `atendimento:humano:${k}`
const chaveUltimo = (k: string) => `atendimento:ultimo:${k}`

/** Quanto tempo a IA fica calada depois que alguém pede uma pessoa. */
export const HUMANO_HORAS = 12

async function cursor(chave: string) {
  return prisma.mvCursor.findUnique({ where: { chave } })
}

async function gravarCursor(chave: string, valor: string) {
  await prisma.mvCursor.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })
}

/** Interruptor geral sem deploy: `valor = off` em `atendimento:ia`. */
export async function iaLigada(): Promise<boolean> {
  return (await cursor(CHAVE_IA))?.valor !== 'off'
}

export async function marcarHumano(e164: string): Promise<void> {
  const k = chaveTelefone(e164)
  if (k) await gravarCursor(chaveHumano(k), new Date().toISOString())
}

export async function humanoAtendendo(e164: string): Promise<boolean> {
  const k = chaveTelefone(e164)
  if (!k) return false
  const c = await cursor(chaveHumano(k))
  if (!c) return false
  return Date.now() - new Date(c.valor).getTime() < HUMANO_HORAS * 3_600_000
}

export async function marcarUltimaMensagem(e164: string, msgId: string): Promise<void> {
  const k = chaveTelefone(e164)
  if (k) await gravarCursor(chaveUltimo(k), msgId)
}

export async function ultimaMensagem(e164: string): Promise<string | null> {
  const k = chaveTelefone(e164)
  return k ? ((await cursor(chaveUltimo(k)))?.valor ?? null) : null
}
