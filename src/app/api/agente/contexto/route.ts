import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { contextoDoCliente } from '@/lib/atendimento/cliente'

export const dynamic = 'force-dynamic'

/** Ferramenta `consultar_cliente`: quem é, pedidos, carrinho aberto e a dica. */
export async function GET(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const url = new URL(request.url)
  const telefone = telefoneDaRequisicao(url.searchParams.get('telefone'))
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })
  return NextResponse.json(await contextoDoCliente(telefone, url.searchParams.get('nome')))
}
