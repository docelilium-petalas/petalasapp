/**
 * QUAL TOQUE FUNCIONA — porte de `desempenho-toque.ts` da CarBoss (19/09/2026).
 *
 * "Precisamos saber que follow up está funcionando e qual não." Contar
 * mensagem e pessoa não responde isso; é preciso saber DEPOIS DE QUAL toque a
 * cliente respondeu ou comprou.
 *
 * ── ATRIBUIÇÃO ──────────────────────────────────────────────────────────────
 * A resposta conta para o ÚLTIMO toque que saiu ANTES dela. O WhatsApp não diz
 * "estou respondendo à mensagem X" (o `context.id` só vem quando ela usa
 * "responder"), então esta é a única regra honesta. Viés conhecido: o toque 1
 * leva crédito de quem já ia responder — por isso a tela mostra PEDIDO ao lado
 * de RESPOSTA. Conversa sem pedido é entretenimento, não venda.
 *
 * Quem respondeu sem toque anterior vai para `SEM_TOQUE`, visível — somá-lo no
 * toque 1 inflaria justamente o toque mais suspeito.
 *
 * ── DENOMINADOR ─────────────────────────────────────────────────────────────
 * Taxa = respostas ÷ ENTREGUES, nunca ÷ enviadas: mensagem que não chegou não
 * testa copy. `cobertura` (entregues ÷ enviadas) diz quanto da linha é medido.
 *
 * Diferenças da origem (vocabulário DL): "reunião" não existe aqui; o desfecho
 * é PEDIDO (`converteuEm`) e a RECEITA atribuída (`valorConvertido`). E há
 * várias réguas (carrinho, pós-venda, drop) — misturar o toque 2 de uma com o
 * de outra não mede copy nenhuma, então o recorte por `cadenciaId` é o normal.
 */

import prisma from '@/lib/prisma'

/** Entregas confirmadas abaixo disto não recebem veredito. */
export const MINIMO_PARA_VEREDITO = 20

/** O balde de quem falou antes de a gente falar. */
export const SEM_TOQUE = 0

export interface LinhaDoToque {
  toque: number
  enviadas: number
  entregues: number
  lidas: number
  respostas: number
  pedidos: number
  /** Soma de `valorConvertido` das inscrições creditadas a este toque. */
  receita: number
  taxaResposta: number | null
  taxaPedido: number | null
  cobertura: number | null
  temVeredito: boolean
}

export interface DesempenhoPorToque {
  linhas: LinhaDoToque[]
  medidoEm: Date
  semToque: number
  /** Viaja junto do número: a tela é client e não pode importar daqui. */
  minimoParaVeredito: number
}

const pct = (num: number, den: number): number | null => (den > 0 ? Math.round((num / den) * 1000) / 10 : null)

/** Atribuição pura — exportada para o teste de nível 1 provar a regra sem banco. */
export function atribuirToque(
  enviosEmOrdem: Array<{ etapaOrdem: number; enviadaEm: Date | null }>,
  respondeuEm: Date,
): number {
  let toque = SEM_TOQUE
  for (const m of enviosEmOrdem) if (m.enviadaEm && m.enviadaEm <= respondeuEm) toque = m.etapaOrdem
  return toque
}

/**
 * `desde`/`ate` recortam pela data de ENVIO: "esta copy, mandada neste
 * período, funcionou?".
 */
export async function medirDesempenhoPorToque(
  opcoes: { desde?: Date; ate?: Date; cadenciaId?: string } = {},
): Promise<DesempenhoPorToque> {
  const { desde, ate, cadenciaId } = opcoes
  const recorte = desde || ate ? { ...(desde && { gte: desde }), ...(ate && { lte: ate }) } : undefined
  const daCadencia = cadenciaId ? { inscricao: { cadenciaId } } : {}

  const mensagens = await prisma.mvMensagem.findMany({
    where: { status: 'ENVIADA', ...(recorte ? { enviadaEm: recorte } : {}), ...daCadencia },
    select: { inscricaoId: true, etapaOrdem: true, enviadaEm: true, entregueEm: true, lidaEm: true },
    orderBy: { enviadaEm: 'asc' },
  })

  const ids = [...new Set(mensagens.map((m) => m.inscricaoId))]
  const inscricoes = await prisma.mvInscricao.findMany({
    where: {
      OR: [
        { id: { in: ids } },
        // Respondeu no período sem envio no recorte — a CarBoss somava 92 aqui
        // enquanto Resultados mostrava 113. Vira SEM_TOQUE, nunca some.
        {
          AND: [
            { respondeuEm: recorte ? recorte : { not: null } },
            { id: { notIn: ids } },
            ...(cadenciaId ? [{ cadenciaId }] : []),
          ],
        },
      ],
    },
    select: { id: true, respondeuEm: true, converteuEm: true, valorConvertido: true },
  })

  const linhas = new Map<number, LinhaDoToque>()
  const pegar = (t: number) => {
    if (!linhas.has(t)) {
      linhas.set(t, {
        toque: t,
        enviadas: 0, entregues: 0, lidas: 0, respostas: 0, pedidos: 0, receita: 0,
        taxaResposta: null, taxaPedido: null, cobertura: null, temVeredito: false,
      })
    }
    return linhas.get(t)!
  }

  const porInscricao = new Map<string, typeof mensagens>()
  for (const m of mensagens) {
    const l = pegar(m.etapaOrdem)
    l.enviadas++
    if (m.entregueEm) l.entregues++
    if (m.lidaEm) l.lidas++
    const lista = porInscricao.get(m.inscricaoId)
    if (lista) lista.push(m)
    else porInscricao.set(m.inscricaoId, [m])
  }

  let semToque = 0
  for (const i of inscricoes) {
    // O pedido sem resposta também é crédito: a cliente que comprou direto
    // pelo link do toque 2 nunca escreveu, e é a melhor notícia da régua.
    const marco = i.respondeuEm ?? i.converteuEm
    if (!marco) continue
    const toque = atribuirToque(porInscricao.get(i.id) ?? [], marco)
    if (toque === SEM_TOQUE) semToque++
    const l = pegar(toque)
    if (i.respondeuEm) l.respostas++
    if (i.converteuEm) {
      l.pedidos++
      l.receita += Number(i.valorConvertido ?? 0)
    }
  }

  for (const l of linhas.values()) {
    l.taxaResposta = pct(l.respostas, l.entregues)
    l.taxaPedido = pct(l.pedidos, l.entregues)
    l.cobertura = pct(l.entregues, l.enviadas)
    l.temVeredito = l.entregues >= MINIMO_PARA_VEREDITO
    l.receita = Math.round(l.receita * 100) / 100
  }

  return {
    linhas: [...linhas.values()].sort((a, b) => a.toque - b.toque),
    medidoEm: new Date(),
    semToque,
    minimoParaVeredito: MINIMO_PARA_VEREDITO,
  }
}
