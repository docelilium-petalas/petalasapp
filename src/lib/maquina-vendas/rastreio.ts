/**
 * O LINK DE RASTREIO — domínio fixo na frente, transportadora atrás.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A Meta só aprova botão de URL com domínio FIXO terminado em variável. O
 * rastreio mora no domínio da transportadora, e ele muda de pedido para
 * pedido. Então o botão do `dl_pedido_enviado_v1` aponta para o CRM, e o CRM
 * redireciona para o `shipping_tracking_url` do pedido na hora do clique.
 *
 * ── Por que assinado ──────────────────────────────────────────────────────
 * O id do pedido da Nuvemshop é sequencial. Sem assinatura, qualquer um
 * trocaria o número e descobriria o rastreio (e a cidade) de outra cliente.
 * O caminho é `<id>.<hmac>`, e só abre o que o próprio CRM emitiu.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

function segredo(): string {
  const s = process.env.JWT_SECRET
  if (!s) throw new Error('JWT_SECRET ausente: sem ele o link de rastreio não é assinável.')
  return s
}

export function assinaturaDoPedido(pedidoId: string | number): string {
  return createHmac('sha256', segredo()).update(`rastreio:${pedidoId}`).digest('hex').slice(0, 20)
}

/** O caminho que vai no `{{1}}` do botão, sem o domínio. */
export function caminhoDeRastreio(pedidoId: string | number): string {
  return `api/r/rastreio/${pedidoId}.${assinaturaDoPedido(pedidoId)}`
}

export function linkDeRastreio(pedidoId: string | number): string {
  const base = (process.env.APP_URL || 'https://petalas.docelilium.com.br').replace(/\/+$/, '')
  return `${base}/${caminhoDeRastreio(pedidoId)}`
}

/** Devolve o id do pedido se a assinatura confere; senão, null. */
export function conferirRastreio(parametro: string): string | null {
  const m = /^(\d{1,20})\.([0-9a-f]{20})$/.exec(parametro)
  if (!m) return null
  const esperado = Buffer.from(assinaturaDoPedido(m[1]))
  const veio = Buffer.from(m[2])
  return esperado.length === veio.length && timingSafeEqual(esperado, veio) ? m[1] : null
}
