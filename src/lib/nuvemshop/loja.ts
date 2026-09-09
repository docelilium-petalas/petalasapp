/**
 * O QUE A LOJA SABE — carrinho abandonado, pedido e cliente.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 🔴 A Nuvemshop NÃO tem webhook de carrinho abandonado.
 *
 * A tabela de eventos publicada cobre `app`, `category`, `customer`, `order`,
 * `product`, `product_variant`, `domain`, `subscription`, `fulfillment`,
 * `fulfillment_order` e `location`. Cart e checkout não estão lá.
 *
 * O recurso existe, mas só de leitura: `GET /checkouts`. Então o carrinho
 * abandonado é o ÚNICO fluxo da Máquina que não pode ser orientado a evento —
 * ele exige varredura. Não é escolha de arquitetura: é a única porta que a
 * plataforma abriu.
 *
 * Três regras da plataforma que definem o ritmo da varredura:
 *   · o carrinho só nasce quando a cliente chega ao 2º PASSO do checkout —
 *     o que é uma boa notícia: nesse ponto já existem nome e telefone;
 *   · o registro pode levar ATÉ 6 HORAS para aparecer na API;
 *   · fica acessível por 30 dias, e some de vez aos 90.
 *
 * ⚠️ A janela de 6h é o que impede prometer "toque em 1 hora". O relógio da
 * cadência tem de ser ancorado no `created_at` DO CHECKOUT, nunca no instante
 * em que a varredura o encontrou — senão um carrinho que apareceu com 6h de
 * atraso recebe o "esqueceu algo?" como se fosse recém-abandonado, e o terceiro
 * toque cai três dias depois da compra que ela já fez em outro lugar.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { listarTudo, requisitar } from './cliente'

// ── Formas ────────────────────────────────────────────────────────────────
// Só os campos que o CRM usa. A API devolve muito mais; declarar tudo cria a
// obrigação de manter tudo, e campo que ninguém lê é campo que ninguém corrige.

export type ItemCarrinho = {
  product_id: number
  variant_id: number
  name: string
  price: string
  quantity: number
  sku?: string | null
}

export type CarrinhoAbandonado = {
  id: number
  token: string
  /** Onde a cliente volta com o carrinho montado. É o link dos templates. */
  abandoned_checkout_url: string
  contact_name?: string | null
  contact_email?: string | null
  contact_phone?: string | null
  products: ItemCarrinho[]
  subtotal: string
  total: string
  currency: string
  /** ÂNCORA da cadência. Nunca use o instante da varredura no lugar dele. */
  created_at: string
  updated_at: string
  /** Preenchido quando o carrinho virou pedido — carrinho recuperado. */
  completed_at?: string | null
}

export type Pedido = {
  id: number
  number: number
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  /** open | closed | cancelled */
  status: string
  /** pending | authorized | paid | voided | refunded */
  payment_status: string
  /** unpacked | unfulfilled | fulfilled | shipped | delivered */
  shipping_status?: string | null
  shipping_tracking_number?: string | null
  shipping_tracking_url?: string | null
  total: string
  currency: string
  products: ItemCarrinho[]
  created_at: string
  paid_at?: string | null
  /** Token do carrinho que virou este pedido, quando houve um. */
  checkout_enabled?: boolean
}

// ── Leituras ──────────────────────────────────────────────────────────────

/**
 * Os carrinhos abandonados criados desde `desde`.
 *
 * O filtro é `created_at_min` e não "desde a última varredura pelo relógio
 * local": relógio de aplicação e relógio da Nuvemshop não são o mesmo, e
 * qualquer defasagem entre eles perde carrinho em silêncio — que é o pior
 * defeito possível aqui, porque some receita sem produzir erro.
 *
 * A sobreposição de segurança fica por conta de quem chama, guardando o cursor
 * com folga. Reprocessar carrinho já visto é barato: a inscrição é idempotente
 * pelo `token`.
 */
export async function listarCarrinhosAbandonados(desde: Date): Promise<CarrinhoAbandonado[]> {
  const carrinhos = await listarTudo<CarrinhoAbandonado>('checkouts', {
    created_at_min: desde.toISOString(),
  })
  // Quem já virou pedido não é carrinho abandonado — é venda. A API devolve os
  // dois no mesmo recurso, e filtrar aqui evita que a Máquina cobre alguém que
  // acabou de comprar. Foi o defeito que a OCR chamou de "vergonha operacional".
  return carrinhos.filter((c) => !c.completed_at)
}

export async function buscarCarrinho(id: number): Promise<CarrinhoAbandonado> {
  const { dados } = await requisitar<CarrinhoAbandonado>(`checkouts/${id}`)
  return dados
}

export async function buscarPedido(id: number): Promise<Pedido> {
  const { dados } = await requisitar<Pedido>(`orders/${id}`)
  return dados
}

export async function listarPedidos(desde: Date): Promise<Pedido[]> {
  return listarTudo<Pedido>('orders', { created_at_min: desde.toISOString() })
}

// ── Tradução para o vocabulário do CRM ────────────────────────────────────

/**
 * O telefone como o CRM guarda.
 *
 * Medido no banco de produção em 08/09/2026: **36 dos 56 contatos têm 12
 * dígitos** — ou seja, sem o 9º dígito. E as sessões do WhatsApp casam com
 * eles justamente por estarem no mesmo formato truncado.
 *
 * Por isso aqui NÃO se inventa o 9. Normalizar para 13 dígitos criaria um
 * telefone que não casa com nada do que já existe, e a cliente receberia
 * mensagem em duplicata: uma pela linha velha, outra pela nova. O casamento
 * definitivo é sempre pela chave de 8 dígitos.
 */
export function telefoneDoCarrinho(carrinho: CarrinhoAbandonado): string | null {
  const cru = (carrinho.contact_phone ?? '').replace(/\D/g, '')
  if (cru.length < 10) return null
  return cru.startsWith('55') ? cru : `55${cru}`
}

/** Os últimos 8 dígitos — a chave que casa loja, CRM e conversa do WhatsApp. */
export function chaveTelefone(telefone: string): string {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  return digitos.length >= 8 ? digitos.slice(-8) : ''
}

/** Primeiro nome, do jeito que a copy usa. */
export function primeiroNome(nomeCompleto?: string | null): string | null {
  const limpo = (nomeCompleto ?? '').trim()
  if (!limpo) return null
  const primeiro = limpo.split(/\s+/)[0]
  return primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase()
}

/**
 * A peça que a mensagem cita — `{{2}}` dos templates de carrinho.
 *
 * Uma peça: o nome dela. Várias: a primeira mais a contagem. Citar as cinco
 * viraria mensagem de catálogo, e a Meta lê mensagem longa com lista de
 * produtos como spam.
 */
export function ancoraDaPeca(carrinho: CarrinhoAbandonado): string {
  const itens = carrinho.products ?? []
  if (itens.length === 0) return 'suas peças'
  if (itens.length === 1) return itens[0].name
  return `${itens[0].name} e mais ${itens.length - 1} ${itens.length === 2 ? 'peça' : 'peças'}`
}
