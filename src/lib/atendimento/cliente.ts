/**
 * QUEM ESTÁ FALANDO — o que a loja sabe da cliente, pronto para a IA ler.
 *
 * Mesmo desenho da ferramenta `listar_servicos` da CarBoss: a resposta traz os
 * dados E um campo `dica`, que diz em português o que a IA deve e não deve
 * fazer com eles. A decisão fica no código, que é testável; o modelo só lê.
 */

import prisma from '@/lib/prisma'
import { listarPedidos, listarCarrinhosAbandonados, type Pedido, type CarrinhoAbandonado } from '@/lib/nuvemshop/loja'
import { chaveTelefone, primeiroNome } from '@/lib/maquina-vendas/telefone'
import { linkDeRastreio } from '@/lib/maquina-vendas/rastreio'
import { formatarPreco } from '@/lib/nuvemshop/catalogo'

const TTL_MS = 5 * 60_000
let pedidosCache: { em: number; lista: Pedido[] } | null = null
let carrinhosCache: { em: number; lista: CarrinhoAbandonado[] } | null = null

async function pedidosRecentes(): Promise<Pedido[]> {
  if (pedidosCache && Date.now() - pedidosCache.em < TTL_MS) return pedidosCache.lista
  const lista = await listarPedidos(new Date(Date.now() - 180 * 86_400_000))
  pedidosCache = { em: Date.now(), lista }
  return lista
}

async function carrinhosRecentes(): Promise<CarrinhoAbandonado[]> {
  if (carrinhosCache && Date.now() - carrinhosCache.em < TTL_MS) return carrinhosCache.lista
  const lista = await listarCarrinhosAbandonados(new Date(Date.now() - 30 * 86_400_000))
  carrinhosCache = { em: Date.now(), lista }
  return lista
}

const PAGAMENTO: Record<string, string> = {
  pending: 'aguardando pagamento',
  authorized: 'pagamento autorizado',
  paid: 'pago',
  voided: 'pagamento cancelado',
  refunded: 'reembolsado',
  abandoned: 'pagamento não concluído',
}

const ENVIO: Record<string, string> = {
  unpacked: 'em separação',
  unfulfilled: 'em separação',
  fulfilled: 'enviado',
  shipped: 'enviado',
  delivered: 'entregue',
}

function data(iso?: string | null): string {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
}

export type ContextoCliente = {
  cliente: { primeiro_nome: string | null; ja_comprou: boolean; pedidos_pagos: number }
  pedidos: {
    numero: string
    feito_em: string
    total: string
    situacao: string
    pagamento: string
    envio: string
    pecas: string[]
    rastreio: string | null
  }[]
  carrinho_aberto: { pecas: string[]; total: string; link: string; montado_em: string } | null
  dica: string
}

export async function contextoDoCliente(e164: string, nomeWhatsApp?: string | null): Promise<ContextoCliente> {
  const chave = chaveTelefone(e164)
  const [pedidos, carrinhos] = await Promise.all([
    pedidosRecentes().catch(() => [] as Pedido[]),
    carrinhosRecentes().catch(() => [] as CarrinhoAbandonado[]),
  ])

  const meus = pedidos
    .filter((p) => chave && chaveTelefone(p.contact_phone ?? '') === chave)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const carrinho = carrinhos
    .filter((c) => chave && chaveTelefone(c.contact_phone ?? '') === chave)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

  let nome = primeiroNome(meus[0]?.contact_name ?? carrinho?.contact_name ?? null)
  if (!nome && chave) {
    const contato = await prisma.contact
      .findFirst({ where: { telefone: { endsWith: chave } }, select: { nome: true } })
      .catch(() => null)
    nome = primeiroNome(contato?.nome ?? nomeWhatsApp ?? null)
  }

  const pagos = meus.filter((p) => p.payment_status === 'paid')
  const ultimos = meus.slice(0, 3).map((p) => ({
    numero: `#${p.number}`,
    feito_em: data(p.created_at),
    total: formatarPreco(Number(p.total)),
    situacao: p.status === 'cancelled' ? 'cancelado' : p.status === 'closed' ? 'concluído' : 'em andamento',
    pagamento: PAGAMENTO[p.payment_status] ?? p.payment_status,
    envio: ENVIO[p.shipping_status ?? ''] ?? 'em separação',
    pecas: (p.products ?? []).map((i) => `${i.name}${i.quantity > 1 ? ` (x${i.quantity})` : ''}`),
    rastreio: p.shipping_tracking_url ? linkDeRastreio(p.id) : null,
  }))

  // Carrinho que já virou pedido não é carrinho: a loja preenche `completed_at`,
  // mas um pedido feito DEPOIS do carrinho, com o mesmo telefone, também fecha.
  const carrinhoVivo =
    carrinho && !(meus[0] && meus[0].created_at > carrinho.created_at)
      ? {
          pecas: (carrinho.products ?? []).map((i) => i.name),
          total: formatarPreco(Number(carrinho.total)),
          link: carrinho.abandoned_checkout_url,
          montado_em: data(carrinho.created_at),
        }
      : null

  const dicas: string[] = []
  const aberto = ultimos.find((p) => p.situacao === 'em andamento')
  if (aberto?.pagamento === 'aguardando pagamento') {
    dicas.push(`O pedido ${aberto.numero} está aguardando pagamento. Se ela perguntar, diga isso; não reenvie cobrança nem invente prazo do PIX.`)
  } else if (aberto?.rastreio) {
    dicas.push(`O pedido ${aberto.numero} foi enviado: mande o link de rastreio se ela perguntar da entrega.`)
  } else if (aberto) {
    dicas.push(`O pedido ${aberto.numero} está ${aberto.envio}. Não prometa data de entrega: você não tem esse dado.`)
  }
  if (carrinhoVivo) {
    dicas.push('Ela tem um carrinho montado. Se o assunto for comprar essas peças, ajude a finalizar e mande o link do carrinho. NUNCA ofereça cupom: a loja não trabalha com cupom acumulado.')
  }
  if (!ultimos.length && !carrinhoVivo) {
    dicas.push('Cliente sem compra nem carrinho: descubra o que ela procura com UMA pergunta por vez.')
  }
  if (pagos.length) dicas.push(`Ela já comprou ${pagos.length === 1 ? 'uma vez' : `${pagos.length} vezes`}: trate como cliente da casa, sem se apresentar de novo.`)
  if (!nome) dicas.push('Não sabemos o nome dela. Não pergunte logo de cara; se ela disser, use.')

  return {
    cliente: { primeiro_nome: nome, ja_comprou: pagos.length > 0, pedidos_pagos: pagos.length },
    pedidos: ultimos,
    carrinho_aberto: carrinhoVivo,
    dica: dicas.join(' '),
  }
}
