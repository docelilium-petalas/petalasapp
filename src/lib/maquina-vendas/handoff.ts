/**
 * O ATENDIMENTO HUMANO COM PRAZO — o silêncio da IA nasce com data para acabar.
 *
 * Porta de `handoff.ts` da CarBoss, com UMA diferença de regra e uma de desenho:
 *
 *  · REGRA: o prazo é 12h, não 6h. É o mesmo relógio que o atendimento da Doce
 *    Lilium já usa (`HUMANO_HORAS` em `@/lib/atendimento/conversa`) — dois
 *    relógios para o mesmo silêncio é como a IA volta a falar por cima da
 *    Marília num caminho e fica muda no outro.
 *
 *  · DESENHO: lá a fonte da verdade era a etiqueta do Chatwoot e o relógio era
 *    deduzido. Aqui a fonte é o cursor `atendimento:humano:<chave>` que o
 *    atendimento grava (eco do celular, resposta pelo painel, pedido da
 *    cliente). A etiqueta `atendimento-humano` é ESPELHO, para a equipe ver no
 *    Chatwoot — e é posta/tirada por aqui quando o Chatwoot está configurado.
 *
 * Ao expirar: o cursor sai, fica um LogEvento `handoff_expirou` e, com o
 * Chatwoot ligado, uma nota privada na conversa — sem ela, a IA volta a falar
 * do nada e quem abre a conversa não sabe por quê.
 */

import prisma from '@/lib/prisma'
import { HUMANO_HORAS } from '@/lib/atendimento/conversa'
import { configChatwoot, conversaDoTelefone, notaPrivada, porEtiqueta, tirarEtiqueta } from './chatwoot-api'

export const ETIQUETA_HANDOFF = 'atendimento-humano'
export const HORAS_DE_VALIDADE = HUMANO_HORAS
const PREFIXO = 'atendimento:humano:'

export type HandoffAtivo = {
  telefoneKey: string
  desde: Date
  expiraEm: Date
  /** Horas que faltam, arredondado para baixo a 0,1. */
  restamHoras: number
}

/** Puro: quem ainda está com humano, e quem já venceu, a partir dos cursores. */
export function separarHandoffs(
  cursores: Array<{ chave: string; valor: string }>,
  agora: Date,
): { ativos: HandoffAtivo[]; vencidos: Array<{ chave: string; telefoneKey: string; desde: Date | null }> } {
  const ativos: HandoffAtivo[] = []
  const vencidos: Array<{ chave: string; telefoneKey: string; desde: Date | null }> = []
  const prazo = HORAS_DE_VALIDADE * 3_600_000
  for (const c of cursores) {
    if (!c.chave.startsWith(PREFIXO)) continue
    const telefoneKey = c.chave.slice(PREFIXO.length)
    const t = Date.parse(c.valor)
    if (!Number.isFinite(t)) {
      // Valor ilegível: trata como vencido (a IA já trata assim em
      // `humanoAtendendo`, que compara NaN e devolve falso).
      vencidos.push({ chave: c.chave, telefoneKey, desde: null })
      continue
    }
    const expira = t + prazo
    if (expira > agora.getTime()) {
      ativos.push({
        telefoneKey,
        desde: new Date(t),
        expiraEm: new Date(expira),
        restamHoras: Math.floor(((expira - agora.getTime()) / 3_600_000) * 10) / 10,
      })
    } else vencidos.push({ chave: c.chave, telefoneKey, desde: new Date(t) })
  }
  ativos.sort((a, b) => a.expiraEm.getTime() - b.expiraEm.getTime())
  return { ativos, vencidos }
}

export async function listarHandoffs(agora: Date = new Date()) {
  const cursores = await prisma.mvCursor.findMany({
    where: { chave: { startsWith: PREFIXO } },
    orderBy: { chave: 'asc' },
    take: 500,
    select: { chave: true, valor: true },
  })
  return separarHandoffs(cursores, agora)
}

export type ResultadoHandoff = {
  ativos: number
  expirados: number
  chatwootLigado: boolean
  detalhes: string[]
  falhas: string[]
}

/**
 * Uma passada: espelha etiqueta nos ativos e expira os vencidos.
 *
 * Falha de Chatwoot NÃO derruba a passada (o silêncio da IA é decidido pelo
 * cursor, não pela etiqueta), mas também não some: vai para `falhas`, e o tique
 * grava em LogEvento.
 */
export async function expirarHandoffs(agora: Date = new Date()): Promise<ResultadoHandoff> {
  const { ativos, vencidos } = await listarHandoffs(agora)
  const cfg = configChatwoot()
  const r: ResultadoHandoff = { ativos: ativos.length, expirados: 0, chatwootLigado: !!cfg, detalhes: [], falhas: [] }

  for (const v of vencidos) {
    await prisma.mvCursor.delete({ where: { chave: v.chave } }).catch(() => undefined)
    await prisma.logEvento.create({
      data: {
        origem: 'maquina-vendas',
        nivel: 'INFO',
        tipo: 'handoff_expirou',
        titulo: `Atendimento humano expirou (${HORAS_DE_VALIDADE}h) · final ${v.telefoneKey.slice(-4)}`,
        dados: JSON.stringify({ telefoneKey: v.telefoneKey, desde: v.desde?.toISOString() ?? null }),
      },
    })
    r.expirados++
    r.detalhes.push(`${v.telefoneKey.slice(-4)}: expirou`)
    if (!cfg) continue
    try {
      const conv = await conversaDoTelefone(cfg, v.telefoneKey)
      if (conv) {
        await tirarEtiqueta(cfg, conv, ETIQUETA_HANDOFF)
        await notaPrivada(
          cfg,
          conv,
          `🤖 Atendimento humano expirou (${HORAS_DE_VALIDADE}h sem nova fala da equipe). A IA volta a responder aqui. ` +
            'Para calá-la de novo, basta responder a cliente pelo celular ou pelo painel.',
        )
      }
    } catch (e) {
      r.falhas.push(`${v.telefoneKey.slice(-4)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (cfg) {
    for (const a of ativos) {
      try {
        const conv = await conversaDoTelefone(cfg, a.telefoneKey)
        if (conv) await porEtiqueta(cfg, conv, ETIQUETA_HANDOFF)
      } catch (e) {
        r.falhas.push(`${a.telefoneKey.slice(-4)}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return r
}
