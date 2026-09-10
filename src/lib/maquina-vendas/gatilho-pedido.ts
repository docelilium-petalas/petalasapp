/**
 * O GATILHO DE PEDIDO — o que a Máquina faz quando alguém compra.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Duas coisas acontecem no mesmo instante, e elas são opostas:
 *
 *   PARA  a régua de carrinho. Continuar mandando "esqueceu algo no carrinho?"
 *         para quem acabou de comprar é a falha mais constrangedora que este
 *         módulo pode ter.
 *   COMEÇA a régua de pedido. Quem comprou quer saber que deu certo, e depois
 *         quer saber onde está.
 *
 * ── A CONTABILIDADE, que é onde eu errei antes ────────────────────────────
 * A primeira versão marcava `CONVERTEU` com valor no `order/created`. Só que
 * pedido CRIADO não é pedido PAGO: no Brasil, boleto e Pix pendente nascem
 * como pedido criado e uma parte deles nunca é paga. Contar a receita ali
 * infla o resultado da Máquina com dinheiro que não entrou.
 *
 * Agora:
 *   order/created  →  para a régua de carrinho. SEM valor: a pessoa fechou o
 *                     pedido, e isso já justifica parar de insistir.
 *   order/paid     →  grava o valor, inclusive numa inscrição que o
 *                     `created` já tinha encerrado, e começa a régua de pedido.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import type { Pedido } from '@/lib/nuvemshop/loja'
import { ancoraDaPeca, primeiroNome, telefoneDoCarrinho } from '@/lib/nuvemshop/loja'
import { chaveTelefone, paraE164 } from './telefone'
import { obterAjustes } from './config'
import { inscrever } from './observador'
import { CopyIncompleta, type Contexto } from './copy'

export type ResultadoPedido = {
  cadenciasEncerradas: number
  valorGravado: number | null
  inscritoEmPedido: boolean
  motivo?: string
}

export async function tratarEventoPedido(event: string, pedido: Pedido): Promise<ResultadoPedido> {
  const vazio: ResultadoPedido = { cadenciasEncerradas: 0, valorGravado: null, inscritoEmPedido: false }

  const e164 = paraE164(telefoneDoCarrinho({ contact_phone: pedido.contact_phone } as never))
  const chave = e164 ? chaveTelefone(e164) : ''
  if (!chave) return { ...vazio, motivo: 'pedido sem telefone utilizável' }

  const pago = event === 'order/paid' || pedido.payment_status === 'paid'
  const agora = new Date()

  // ── 1 · PARA a régua de carrinho ────────────────────────────────────────
  let encerradas = 0
  const ativas = await prisma.mvInscricao.findMany({
    where: { telefoneKey: chave, status: 'ATIVA', origem: 'carrinho' },
    select: { id: true },
  })
  if (ativas.length) {
    const ids = ativas.map((i) => i.id)
    await prisma.$transaction([
      prisma.mvInscricao.updateMany({
        where: { id: { in: ids } },
        data: {
          status: 'CONVERTEU',
          motivoParada: `pedido ${pedido.number} ${pago ? 'pago' : 'criado'}`,
          converteuEm: agora,
          // Valor só quando pagou. Ver o cabeçalho.
          ...(pago ? { valorConvertido: Number(pedido.total) || null } : {}),
        },
      }),
      prisma.mvMensagem.updateMany({
        where: { inscricaoId: { in: ids }, status: 'AGENDADA' },
        data: { status: 'CANCELADA', erro: 'a pessoa comprou' },
      }),
    ])
    encerradas = ids.length
  }

  // ── 2 · O valor que faltou ──────────────────────────────────────────────
  // O `created` chegou primeiro e encerrou sem valor; o `paid` chega depois e
  // precisa preencher. Sem isto, todo pedido de Pix e boleto — que é a maior
  // parte — apareceria como carrinho recuperado de R$ 0,00.
  let valorGravado: number | null = null
  if (pago) {
    const total = Number(pedido.total) || null
    if (total) {
      const { count } = await prisma.mvInscricao.updateMany({
        where: { telefoneKey: chave, status: 'CONVERTEU', valorConvertido: null, origem: 'carrinho' },
        data: { valorConvertido: total },
      })
      if (count) valorGravado = total
    }
  }

  // ── 3 · COMEÇA a régua de pedido ────────────────────────────────────────
  if (!pago) return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: false }

  const cadencia = await prisma.mvCadencia.findFirst({
    where: { gatilho: 'pedido_pago', ativo: true },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (!cadencia || !cadencia.etapas.length) {
    return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: false, motivo: 'sem cadência de pedido pago' }
  }

  // Quem pediu para sair não recebe nem o transacional por template: a Meta
  // trata UTILITY diferente, mas quem disse "para" disse para tudo.
  const saiu = await prisma.mvOptOut.findUnique({ where: { telefoneKey: chave } })
  if (saiu) {
    return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: false, motivo: 'opt-out' }
  }

  const nome = primeiroNome(pedido.contact_name)
  if (!nome) {
    return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: false, motivo: 'pedido sem primeiro nome' }
  }

  const contexto: Contexto = {
    primeiro_nome: nome,
    pedido: `#${pedido.number}`,
    peca: ancoraDaPeca({ products: pedido.products } as never),
    rastreio: pedido.shipping_tracking_number || null,
    link: pedido.shipping_tracking_url || null,
  }

  try {
    await inscrever({
      ajustes: await obterAjustes(),
      cadenciaId: cadencia.id,
      etapas: cadencia.etapas,
      origem: 'pedido',
      // O id do pedido, e não o número: número pode repetir entre lojas, id não.
      refExterna: String(pedido.id),
      nome,
      e164: e164!,
      chave,
      // A âncora é o pagamento, não o instante do webhook: reentrega da
      // Nuvemshop chega horas depois e não pode mover o relógio da régua.
      ancora: pedido.paid_at ? new Date(pedido.paid_at) : agora,
      contexto,
      retrato: {
        pedido: pedido.number,
        total: pedido.total,
        moeda: pedido.currency,
        itens: (pedido.products ?? []).map((p) => ({ nome: p.name, qtd: p.quantity })),
      },
      // Quem já comprou vem na frente da fila.
      prioridade: 0,
    })
    return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: true }
  } catch (e) {
    if (e instanceof CopyIncompleta) {
      // Acontece de verdade: `dl_pedido_enviado_v1` pede {{rastreio}}, e a
      // medição de 09/09/2026 mostrou os 62 pedidos da loja com o campo de
      // rastreio vazio. É lacuna de processo da loja, não limite da API — e
      // não pode virar mensagem com buraco.
      return {
        cadenciasEncerradas: encerradas,
        valorGravado,
        inscritoEmPedido: false,
        motivo: `copy sem ${e.faltando.join('/')}`,
      }
    }
    // Já inscrito (reentrega do webhook) não é erro.
    if (e instanceof Error && e.name === 'JaInscrito') {
      return { cadenciasEncerradas: encerradas, valorGravado, inscritoEmPedido: false, motivo: 'já inscrito' }
    }
    throw e
  }
}
