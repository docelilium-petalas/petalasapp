import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { assinaturaValida } from '@/lib/nuvemshop/cliente'
import { obterCredenciais } from '@/lib/nuvemshop/config'
import { buscarPedido, telefoneDoCarrinho } from '@/lib/nuvemshop/loja'
import { chaveTelefone, paraE164 } from '@/lib/maquina-vendas/telefone'

export const dynamic = 'force-dynamic'

/**
 * WEBHOOK DA NUVEMSHOP — o que a loja avisa, e o que a Máquina faz com isso.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A loja publica evento para PEDIDO (created, paid, fulfilled, cancelled) — e
 * NÃO para carrinho abandonado. Carrinho só existe por varredura, no tique.
 * Por isso esta rota trata pedido, e só.
 *
 * ── Três regras da plataforma que moldam este arquivo ─────────────────────
 *
 *  1. TIMEOUT DE 3 SEGUNDOS. A Nuvemshop espera 2XX em 3s e desiste. Então a
 *     rota confirma primeiro e faz o trabalho pesado depois — nada de buscar
 *     o pedido inteiro antes de responder.
 *
 *  2. REENTREGA E ORDEM NÃO GARANTIDA. A própria documentação avisa que a
 *     mesma mensagem pode chegar duas vezes, e fora de ordem. Idempotência é
 *     obrigação nossa: por isso o `EventIngestLog` com chave de evento, e por
 *     isso nada aqui incrementa contador.
 *
 *  3. ASSINATURA HMAC-SHA256 no header `x-linkedstore-hmac-sha256` — nome
 *     herdado do nome antigo da empresa, impossível de adivinhar. Conferida
 *     sobre o corpo CRU: reserializar o JSON muda o hash e a assinatura
 *     nunca fecha.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function POST(request: Request) {
  // O corpo CRU, antes de qualquer parse. É sobre ele que o HMAC é calculado.
  const cru = await request.text()

  let cred
  try {
    cred = await obterCredenciais()
  } catch {
    return NextResponse.json({ erro: 'Nuvemshop não configurada.' }, { status: 503 })
  }

  if (!cred.appSecret) {
    // Sem segredo não há como distinguir a loja de qualquer um na internet.
    // Recusa, em vez de aceitar às cegas.
    return NextResponse.json(
      { erro: 'App secret da Nuvemshop ausente. A rota recusa em vez de aceitar sem verificar.' },
      { status: 503 },
    )
  }

  const assinatura = request.headers.get('x-linkedstore-hmac-sha256')
  if (!(await assinaturaValida(cru, assinatura, cred.appSecret))) {
    return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 })
  }

  let corpo: { store_id?: number; event?: string; id?: number }
  try {
    corpo = JSON.parse(cru)
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 })
  }

  const { event, id } = corpo
  if (!event || !id) {
    return NextResponse.json({ erro: 'Faltam event e id.' }, { status: 400 })
  }

  // Idempotência: a mesma entrega duas vezes vira uma linha só.
  const chaveEvento = `nuvemshop:${event}:${id}`
  try {
    const jaVisto = await prisma.eventIngestLog.findFirst({
      where: { source: chaveEvento },
      select: { id: true },
    })
    if (jaVisto) return NextResponse.json({ ok: true, repetido: true })

    await prisma.eventIngestLog.create({
      data: { source: chaveEvento, payload: cru.slice(0, 4000), status: 'received' },
    })
  } catch {
    // Sem o log a rota ainda funciona; perde só a proteção contra repetição.
  }

  // Trabalho pesado DEPOIS da verificação, mas ainda dentro do request: os
  // eventos de pedido são raros e baratos. Se um dia virarem volume, o certo
  // é responder 200 aqui e empurrar para uma fila.
  try {
    await tratar(event, id)
  } catch (e) {
    await logar('ERRO', 'webhook_loja', `Falha ao tratar ${event}`, e)
  }

  return NextResponse.json({ ok: true })
}

async function tratar(event: string, pedidoId: number): Promise<void> {
  // `order/paid` é o que interessa para a Máquina: e o momento em que um
  // carrinho recuperado vira venda, e em que a cadência precisa PARAR.
  if (!event.startsWith('order/')) return

  const pedido = await buscarPedido(pedidoId)
  const e164 = paraE164(telefoneDoCarrinho({ contact_phone: pedido.contact_phone } as never))
  const chave = e164 ? chaveTelefone(e164) : ''
  if (!chave) return

  if (event === 'order/paid' || event === 'order/created') {
    // ENCERRA a cadência de carrinho dessa pessoa e cancela o que estava
    // agendado. Continuar mandando "esqueceu algo no carrinho?" para quem
    // acabou de comprar é a falha mais constrangedora que este módulo pode ter.
    const agora = new Date()
    const inscricoes = await prisma.mvInscricao.findMany({
      where: { telefoneKey: chave, status: 'ATIVA' },
      select: { id: true },
    })
    if (inscricoes.length === 0) return

    const ids = inscricoes.map((i) => i.id)
    await prisma.$transaction([
      prisma.mvInscricao.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'CONVERTEU',
          motivoParada: `pedido ${pedido.number} ${event === 'order/paid' ? 'pago' : 'criado'}`,
          converteuEm: agora,
          valorConvertido: Number(pedido.total) || null,
        },
      }),
      prisma.mvMensagem.updateMany({
        where: { inscricaoId: { in: ids }, status: 'AGENDADA' },
        data: { status: 'CANCELADA', erro: 'a pessoa comprou' },
      }),
    ])

    await logar('INFO', 'carrinho_recuperado', `Pedido ${pedido.number} encerrou ${ids.length} cadência(s)`, {
      pedido: pedido.number,
      total: pedido.total,
    })
  }
}

async function logar(nivel: string, tipo: string, titulo: string, dados: unknown) {
  try {
    await prisma.logEvento.create({
      data: {
        origem: 'nuvemshop',
        nivel,
        tipo,
        titulo,
        dados: JSON.stringify(dados instanceof Error ? dados.message : dados).slice(0, 4000),
      },
    })
  } catch {
    // tabela ainda não migrada
  }
}
