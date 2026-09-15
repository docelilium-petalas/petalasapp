/**
 * O status de um contato na tela de Contatos (modelo CarBoss), derivado dos negócios.
 *
 *   CLIENTE    já comprou (ver `comprasDoContato`)
 *   LEAD       tem negócio aberto e ainda não comprou
 *   PERDIDO    todos os negócios foram perdidos
 *   RECUPERAR  nunca teve negócio — alguém a quem voltar a falar
 *
 * ── O que é compra ────────────────────────────────────────────────────────
 * 15/09/2026: a Laura pagou o pedido #163 e aparecia como LEAD, com "Total
 * comprado R$ 0,00". O pedido pago vira negócio no funil Pós-venda, e ele fica
 * ABERTO de propósito — é lá que andam envio, entrega e avaliação, e negócio
 * ganho some do quadro. Então compra não é "negócio ganho": é
 *   · todo pedido pago da loja (`nuvemshop-pedido`) que não foi perdido; e
 *   · todo negócio ganho que não é carrinho recuperado — carrinho recuperado
 *     só conta quando o pedido dele não virou negócio, senão a mesma compra
 *     entraria duas vezes.
 */

export const ORIGEM_PEDIDO_LOJA = 'nuvemshop-pedido'
export const ORIGEM_CARRINHO_LOJA = 'nuvemshop-carrinho'

type NegocioMinimo = { status: string; origem?: string | null }

export function comprasDoContato<T extends NegocioMinimo>(negocios: T[]): T[] {
  const pedidos = negocios.filter((d) => d.origem === ORIGEM_PEDIDO_LOJA && d.status !== 'LOST')
  const ganhos = negocios.filter(
    (d) =>
      d.status === 'WON' &&
      d.origem !== ORIGEM_PEDIDO_LOJA &&
      (d.origem !== ORIGEM_CARRINHO_LOJA || pedidos.length === 0),
  )
  return [...pedidos, ...ganhos]
}

export type ResumoContato = {
  abertos: number
  ganhos: number
  perdidos: number
  valorGanho: number
  ultimoNegocio: string | null
}

export type StatusContato = 'CLIENTE' | 'LEAD' | 'RECUPERAR' | 'PERDIDO'

/** `ganhos` aqui é o número de COMPRAS (`comprasDoContato`), não de negócios WON. */
export function statusDoContato(r?: Pick<ResumoContato, 'abertos' | 'ganhos' | 'perdidos'> | null): StatusContato {
  if (r?.ganhos) return 'CLIENTE'
  if (r?.abertos) return 'LEAD'
  if (r?.perdidos) return 'PERDIDO'
  return 'RECUPERAR'
}

export const COR_STATUS: Record<StatusContato, { texto: string; borda: string; fundo: string }> = {
  LEAD: { texto: 'text-success', borda: 'border-success/40', fundo: 'bg-success/10' },
  CLIENTE: { texto: 'text-primary', borda: 'border-primary/40', fundo: 'bg-primary/10' },
  RECUPERAR: { texto: 'text-warning', borda: 'border-warning/40', fundo: 'bg-warning/10' },
  PERDIDO: { texto: 'text-destructive', borda: 'border-destructive/40', fundo: 'bg-destructive/10' },
}
