import { NextResponse } from 'next/server'
import { conferirRastreio } from '@/lib/maquina-vendas/rastreio'
import { buscarPedido, rastreioDoPedido, urlDeRastreioPadrao } from '@/lib/nuvemshop/loja'

export const dynamic = 'force-dynamic'

/** A loja, para onde vai quem clica num link inválido ou num pedido sem rastreio ainda. */
const LOJA = 'https://www.docelilium.com.br/'

/**
 * O botão "Rastrear pedido" do WhatsApp cai aqui. Ver `lib/maquina-vendas/rastreio.ts`.
 *
 * Nunca responde erro para a cliente: link adulterado, pedido sem rastreio ou
 * Nuvemshop fora do ar levam para a loja. Uma página 404 no celular dela é
 * pior do que a vitrine.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ pedido: string }> }) {
  const { pedido } = await ctx.params
  const id = conferirRastreio(pedido)
  if (!id) return NextResponse.redirect(LOJA, 302)

  try {
    const p = await buscarPedido(Number(id))
    const r = await rastreioDoPedido(p)
    const destino = r?.url || (r ? urlDeRastreioPadrao(r.codigo) : null)
    if (destino && /^https?:\/\//i.test(destino)) return NextResponse.redirect(destino, 302)
  } catch {
    // cai na loja
  }
  return NextResponse.redirect(LOJA, 302)
}
