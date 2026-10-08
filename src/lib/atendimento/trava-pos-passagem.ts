/**
 * TRAVA DEPOIS DA PASSAGEM — o modelo não fala por cima da Marília.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Medido no E2E de 08/10/2026 (execução 7298): a busca passou a conversa
 * para a Marília (saia Clarisse sem estoque), mas o histórico tinha um
 * "Pode sim! Manda o link" sem resposta, e o modelo juntou as duas coisas:
 * disse que a peça estava sem estoque E mandou o link do vestido Luna.
 *
 * O prompt pede para parar; o back-end GARANTE. Quando a conversa está com
 * gente, o que sai para a cliente é decidido aqui, não pelo texto do modelo:
 *
 *   passagem por estoque nesta rodada → só a frase fixa, sem link, sem foto
 *   passagem por outro motivo         → só o balão do modelo que fala da Marília,
 *                                       sem link nem preço (ou a frase genérica)
 *   humano já atendia de antes        → nada sai: quem fala é a Marília
 *
 * "Nesta rodada" = passagem registrada há menos de `JANELA_PASSAGEM_MS`.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { HUMANO_HORAS } from './conversa'
import { chaveTelefone } from '@/lib/maquina-vendas/telefone'

export const FRASE_ESTOQUE = 'Essa peça está sem estoque 💛 Já chamei a Marília, ela vai te atender pessoalmente por aqui.'
export const FRASE_TAMANHO = 'Esse tamanho está sem estoque 💛 Já chamei a Marília, ela vai te atender pessoalmente por aqui.'
export const FRASE_PASSAGEM = 'Já chamei a Marília 💛 Ela vai te atender pessoalmente por aqui.'

/** Uma rodada do agente leva segundos; 10 min cobre fila do n8n e retentativa. */
export const JANELA_PASSAGEM_MS = 10 * 60_000

export type Passagem = { motivo: string; em: Date }
/**
 * `desde` = quando a conversa foi para gente (cursor `atendimento:humano`).
 * `motivo` vem do LogEvento da passagem; se o log falhou, fica vazio e a
 * passagem recente ainda trava — só não sabe que foi por estoque.
 */
export type EstadoDaConversa = { humano: boolean; desde: Date | null; motivo: string | null }

const LINK = /(https?:\/\/|www\.|docelilium\.com|R\$\s?\d)/i

/** Pura: os balões que podem sair, dado o estado da conversa. */
export function baloesPermitidos(
  baloes: string[],
  estado: EstadoDaConversa,
  agora: Date = new Date(),
): { baloes: string[]; trava: 'livre' | 'estoque' | 'passagem' | 'humano' } {
  if (!estado.humano) return { baloes, trava: 'livre' }
  const recente = !!estado.desde && agora.getTime() - estado.desde.getTime() < JANELA_PASSAGEM_MS
  if (!recente) return { baloes: [], trava: 'humano' }
  if (/tamanho/i.test(estado.motivo ?? '') && /estoque/i.test(estado.motivo ?? '')) return { baloes: [FRASE_TAMANHO], trava: 'estoque' }
  if (/estoque/i.test(estado.motivo ?? '')) return { baloes: [FRASE_ESTOQUE], trava: 'estoque' }
  // Só o balão que fala da passagem: o resto ("vou mandar o link", oferta,
  // preço) é promessa que agora é da Marília cumprir ou não.
  const daPassagem = baloes.filter((b) => !LINK.test(b) && /mar[ií]lia/i.test(b))
  return { baloes: daPassagem.length ? daPassagem.slice(0, 1) : [FRASE_PASSAGEM], trava: 'passagem' }
}

/** A passagem mais recente deste telefone, se for desta rodada. */
export async function passagemRecente(telefone: string, agora: Date = new Date()): Promise<Passagem | null> {
  const k = chaveTelefone(telefone)
  if (!k) return null
  const log = await prisma.logEvento.findFirst({
    where: { tipo: 'atendimento_humano', createdAt: { gte: new Date(agora.getTime() - JANELA_PASSAGEM_MS) }, dados: { contains: k } },
    orderBy: { createdAt: 'desc' },
    select: { dados: true, createdAt: true },
  })
  if (!log) return null
  let motivo = ''
  try {
    motivo = String((JSON.parse(log.dados ?? '{}') as { motivo?: unknown }).motivo ?? '')
  } catch {
    motivo = ''
  }
  return { motivo, em: log.createdAt }
}

export async function estadoDaConversa(telefone: string, agora: Date = new Date()): Promise<EstadoDaConversa> {
  const k = chaveTelefone(telefone)
  if (!k) return { humano: false, desde: null, motivo: null }
  const c = await prisma.mvCursor.findUnique({ where: { chave: `atendimento:humano:${k}` }, select: { valor: true } })
  const desde = c ? new Date(c.valor) : null
  if (!desde || Number.isNaN(desde.getTime()) || agora.getTime() - desde.getTime() >= HUMANO_HORAS * 3_600_000) {
    return { humano: false, desde: null, motivo: null }
  }
  const p = await passagemRecente(telefone, agora).catch(() => null)
  return { humano: true, desde, motivo: p?.motivo ?? null }
}
