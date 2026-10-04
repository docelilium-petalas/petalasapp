/**
 * QUEM RESPONDEU, QUEM A EQUIPE ATENDEU e QUEM COMPROU — os sinais que se perdiam.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte de `src/lib/maquina-vendas/respostas.ts` do CRM CarBoss, com a mesma
 * correção conceitual que deu origem ao arquivo:
 *
 *   **Detectar resposta não é avaliar parada.** É leitura, não decide nada, e
 *   por isso roda para TODA inscrição que já recebeu mensagem, em qualquer
 *   status. Pausar a régua para de mandar; nunca deveria parar de escutar.
 *
 * Aqui o defeito era o mesmo: o webhook do WhatsApp carimba `respondeuEm` só
 * em inscrição `ATIVA`. Quem respondeu um dia depois da última mensagem (régua
 * já `CONCLUIDA`) sumia do Resultados.
 *
 * ── O que muda em relação à origem ────────────────────────────────────────
 *  · A fonte não é `n8n_chat_histories`: são os turnos de `MvResposta`
 *    (`@/lib/atendimento/conversa`), onde o webhook já separou cliente de eco.
 *  · `sdrFalouEm` vira **`humanoFalouEm`**, lido do cursor
 *    `atendimento:humano:<chave>` — o mesmo relógio de 12 h do handoff. O
 *    `handoff.ts` APAGA esse cursor ao expirar; por isso o tique do cron roda
 *    este módulo ANTES de `expirarHandoffs()`.
 *  · O desfecho não é reunião/venda no Deal: é **pedido pago na Nuvemshop**
 *    (`creditarPedido`, chamado por `gatilho-pedido.ts`). Carrinho continua
 *    sendo creditado lá, como já era.
 *
 * ── O que fica de fora, de propósito ──────────────────────────────────────
 *  · Inscrições da campanha 10.10 (`campanha_1010`): decisão do Owner em
 *    04/10/2026 — "não mexer em nada da campanha agora". Entram quando ele
 *    decidir; é uma linha em `ORIGENS_FORA`.
 *  · Transacionais (`pedido`, `pedido_enviado`): a mensagem é consequência da
 *    compra, não causa. Creditar pedido nelas seria contar a venda duas vezes.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Este módulo escreve SOMENTE `respondeuEm`, `respostas`, `humanoFalouEm`,
 * `converteuEm` e `valorConvertido` em `MvInscricao`. Não muda status, não
 * cancela mensagem, não toca Deal/Contact/Activity/Nuvemshop.
 */

import prisma from '@/lib/prisma'
import { chaveTelefone } from './telefone'

/** Origens que este módulo não lê nem escreve. Ver o cabeçalho. */
export const ORIGENS_FORA = ['campanha_1010'] as const
/** Origens transacionais: nunca recebem crédito de pedido. */
export const ORIGENS_TRANSACIONAIS = ['pedido', 'pedido_enviado'] as const

/** Folga para relógio: a resposta pode chegar "antes" do envio por segundos. */
export const FOLGA_MS = 2 * 60_000
/** Quantas inscrições por tique. Sempre com ORDER BY (regra do HANDOFF). */
export const LOTE = 500

const PREFIXO_HUMANO = 'atendimento:humano:'

export interface ResultadoRespostas {
  avaliadas: number
  respondeu: number
  equipe: number
  semConversa: number
}

export interface ResultadoCredito {
  creditadas: number
  valor: number | null
}

export type TurnoLido = { em: Date; de: 'cliente' | 'loja'; texto: string }

/** Janela de atribuição em dias — `MV_JANELA_ATRIBUICAO_DIAS`, padrão 15, entre 1 e 90. */
export function janelaAtribuicaoDias(): number {
  const n = Number(process.env.MV_JANELA_ATRIBUICAO_DIAS)
  if (!Number.isFinite(n) || n <= 0) return 15
  return Math.min(90, Math.max(1, Math.floor(n)))
}

/** Puro: lê os turnos do JSON de `ultimasMsgs` sem confiar no formato. */
export function lerTurnosCrus(json: unknown): TurnoLido[] {
  if (!Array.isArray(json)) return []
  const saida: TurnoLido[] = []
  for (const t of json) {
    if (!t || typeof t !== 'object') continue
    const r = t as { em?: unknown; de?: unknown; texto?: unknown }
    const em = typeof r.em === 'string' ? new Date(r.em) : null
    if (!em || Number.isNaN(em.getTime())) continue
    saida.push({ em, de: r.de === 'loja' ? 'loja' : 'cliente', texto: typeof r.texto === 'string' ? r.texto : '' })
  }
  return saida
}

export type SinaisDaInscricao = {
  respondeuEm: Date | null
  respostas: number
  humanoFalouEm: Date | null
}

/**
 * Puro: decide o que carimbar. Nunca apaga um carimbo, nunca diminui contagem
 * (os turnos guardados são os últimos 30, então a contagem é piso, não total).
 */
export function sinaisNovos(args: {
  primeiroEnvio: Date
  atual: SinaisDaInscricao
  turnos: TurnoLido[]
  respondidoEm: Date | null
  humanoDesde: Date | null
}): Partial<SinaisDaInscricao> | null {
  const ref = args.primeiroEnvio.getTime() - FOLGA_MS
  const falas = args.turnos.filter((t) => t.de === 'cliente' && t.em.getTime() >= ref)
  const novo: Partial<SinaisDaInscricao> = {}

  if (!args.atual.respondeuEm) {
    const primeira = falas.length ? falas.reduce((a, b) => (a.em <= b.em ? a : b)).em : null
    const quando = primeira ?? (args.respondidoEm && args.respondidoEm.getTime() >= ref ? args.respondidoEm : null)
    if (quando) novo.respondeuEm = quando
  }
  const contagem = Math.max(falas.length, novo.respondeuEm && !falas.length ? 1 : 0)
  if (contagem > args.atual.respostas) novo.respostas = contagem

  if (!args.atual.humanoFalouEm && args.humanoDesde && args.humanoDesde.getTime() >= ref) {
    novo.humanoFalouEm = args.humanoDesde
  }
  return Object.keys(novo).length ? novo : null
}

/**
 * Uma passada: toda inscrição que recebeu mensagem dentro da janela de
 * atribuição e ainda tem algum sinal em branco. Lança em erro de banco — o
 * cron devolve 500 (nada silencioso).
 */
export async function registrarRespostas(agora: Date = new Date()): Promise<ResultadoRespostas> {
  const desde = new Date(agora.getTime() - janelaAtribuicaoDias() * 86_400_000)
  const inscricoes = await prisma.mvInscricao.findMany({
    where: {
      tentativas: { gt: 0 },
      origem: { notIn: [...ORIGENS_FORA] },
      OR: [{ respondeuEm: null }, { humanoFalouEm: null }],
      mensagens: { some: { status: 'ENVIADA', enviadaEm: { gte: desde } } },
    },
    select: {
      id: true,
      telefoneKey: true,
      respondeuEm: true,
      respostas: true,
      humanoFalouEm: true,
      mensagens: {
        where: { status: 'ENVIADA', enviadaEm: { not: null } },
        orderBy: { enviadaEm: 'asc' },
        take: 1,
        select: { enviadaEm: true },
      },
    },
    orderBy: { id: 'asc' },
    take: LOTE,
  })

  const res: ResultadoRespostas = { avaliadas: inscricoes.length, respondeu: 0, equipe: 0, semConversa: 0 }
  if (!inscricoes.length) return res

  const chaves = [...new Set(inscricoes.map((i) => i.telefoneKey))]
  const [respostas, cursores] = await Promise.all([
    prisma.mvResposta.findMany({ where: { telefoneKey: { in: chaves } }, orderBy: { telefoneKey: 'asc' } }),
    prisma.mvCursor.findMany({ where: { chave: { in: chaves.map((k) => PREFIXO_HUMANO + k) } }, orderBy: { chave: 'asc' } }),
  ])
  const porChave = new Map(respostas.map((r) => [r.telefoneKey, r]))
  const humanoPorChave = new Map(
    cursores
      .map((c) => [c.chave.slice(PREFIXO_HUMANO.length), new Date(c.valor)] as const)
      .filter(([, d]) => !Number.isNaN(d.getTime())),
  )

  for (const i of inscricoes) {
    const primeiroEnvio = i.mensagens[0]?.enviadaEm
    if (!primeiroEnvio) continue
    const conversa = porChave.get(i.telefoneKey)
    const humanoDesde = humanoPorChave.get(i.telefoneKey) ?? null
    if (!conversa && !humanoDesde) {
      res.semConversa++
      continue
    }
    const novo = sinaisNovos({
      primeiroEnvio,
      atual: { respondeuEm: i.respondeuEm, respostas: i.respostas, humanoFalouEm: i.humanoFalouEm },
      turnos: lerTurnosCrus(conversa?.ultimasMsgs),
      respondidoEm: conversa?.respondidoEm ?? null,
      humanoDesde,
    })
    if (!novo) continue
    await prisma.mvInscricao.update({ where: { id: i.id }, data: novo })
    if (novo.respondeuEm) res.respondeu++
    if (novo.humanoFalouEm) res.equipe++
  }
  return res
}

/**
 * O desfecho da loja: um pedido PAGO credita as inscrições de marketing do
 * mesmo telefone que receberam mensagem dentro da janela de atribuição antes
 * do pagamento. Carrinho já é creditado por `gatilho-pedido.ts`; transacional
 * e campanha ficam de fora (ver o cabeçalho). Escreve só `MvInscricao`.
 */
export async function creditarPedido(args: { e164: string; pagoEm: Date; total: number | null }): Promise<ResultadoCredito> {
  const chave = chaveTelefone(args.e164)
  if (!chave) return { creditadas: 0, valor: null }
  const desde = new Date(args.pagoEm.getTime() - janelaAtribuicaoDias() * 86_400_000)
  const candidatas = await prisma.mvInscricao.findMany({
    where: {
      telefoneKey: chave,
      converteuEm: null,
      tentativas: { gt: 0 },
      origem: { notIn: ['carrinho', ...ORIGENS_FORA, ...ORIGENS_TRANSACIONAIS] },
      mensagens: { some: { status: 'ENVIADA', enviadaEm: { gte: desde, lte: args.pagoEm } } },
    },
    select: {
      id: true,
      mensagens: {
        where: { status: 'ENVIADA', enviadaEm: { lte: args.pagoEm } },
        orderBy: { enviadaEm: 'desc' },
        take: 1,
        select: { enviadaEm: true },
      },
    },
    orderBy: { id: 'asc' },
    take: 20,
  })
  if (!candidatas.length) return { creditadas: 0, valor: null }
  // Último toque leva o crédito — UMA inscrição por pedido. Creditar todas
  // somaria o mesmo pedido N vezes na receita da Máquina.
  const ultimo = candidatas
    .map((c) => ({ id: c.id, em: c.mensagens[0]?.enviadaEm?.getTime() ?? 0 }))
    .sort((a, b) => b.em - a.em || a.id.localeCompare(b.id))[0]
  const { count } = await prisma.mvInscricao.updateMany({
    where: { id: ultimo.id, converteuEm: null },
    data: { converteuEm: args.pagoEm, ...(args.total ? { valorConvertido: args.total } : {}) },
  })
  return { creditadas: count, valor: args.total }
}
