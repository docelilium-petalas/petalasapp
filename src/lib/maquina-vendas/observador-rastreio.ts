/**
 * O RASTREIO — o código que a loja põe no pedido chega sozinho no WhatsApp.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Reunião de 14/09/2026 (16h04): a Camila recebeu "assim que postar eu te
 * mando o código de rastreio por aqui", a Marília postou — e nada saiu, porque
 * a trilha de pedido pago só tinha a mensagem do pagamento. A decisão foi uma
 * verificação de 5 em 5 minutos na Nuvemshop.
 *
 * O tique da Máquina JÁ roda de 5 em 5 minutos, então a verificação mora nele
 * em vez de ganhar um cron próprio: um relógio só, um log só.
 *
 * ── Duas portas para o mesmo aviso ────────────────────────────────────────
 *   1. o webhook `order/fulfilled` (e qualquer `order/*`) chama `avisarRastreio`
 *      no ato;
 *   2. a varredura relê os pedidos MEXIDOS nos últimos dias e chama a mesma
 *      função — pega o que o webhook perdeu, e o código que a loja preencheu
 *      sem marcar o pedido como enviado.
 * A inscrição é idempotente pelo id do pedido: as duas portas juntas mandam
 * UMA mensagem.
 *
 * ── Espera a Meta sozinha ─────────────────────────────────────────────────
 * `dl_pedido_enviado_v1` foi submetido em 13/09. Enquanto não estiver
 * APPROVED, nada é inscrito — e no primeiro tique depois da aprovação os
 * pedidos postados nas últimas 96h entram. Ninguém precisa lembrar de ligar.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import {
  listarPedidosAtualizados,
  rastreioDoPedido,
  primeiroNome,
  telefoneDoCarrinho,
  type Pedido,
} from '@/lib/nuvemshop/loja'
import { chaveTelefone, paraE164 } from './telefone'
import { obterAjustes, type Ajustes } from './config'
import { inscrever } from './observador'
import { CopyIncompleta } from './copy'
import { esqueletoNomeado } from './catalogo-templates'
import { linkDeRastreio } from './rastreio'
import { statusDosTemplates } from './canal'

export const GATILHO_ENVIADO = 'pedido_enviado'
export const TEMPLATE_ENVIADO = 'dl_pedido_enviado_v1'
export const ORIGEM_ENVIADO = 'pedido_enviado'

/** Quantos dias de pedidos mexidos a varredura relê. */
const JANELA_DIAS = 15
/** Pedido postado há mais que isto não recebe o aviso: vira mensagem velha. */
const IDADE_MAXIMA_HORAS = 96

export type ResultadoRastreio = {
  vistos: number
  inscritos: number
  pulados: { motivo: string; quantos: number }[]
}

type Cadencia = Awaited<ReturnType<typeof garantirCadencia>>

/** A cadência de um toque, criada na primeira vez. Desligada pela tela, fica desligada. */
async function garantirCadencia() {
  const existente = await prisma.mvCadencia.findFirst({
    where: { gatilho: GATILHO_ENVIADO },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (existente && existente.etapas.length) return existente

  const cadencia =
    existente ??
    (await prisma.mvCadencia.create({
      data: { nome: 'Pedido enviado', gatilho: GATILHO_ENVIADO, idadeMaximaHoras: IDADE_MAXIMA_HORAS, ativo: true },
    }))
  await prisma.mvCadenciaEtapa.create({
    data: {
      cadenciaId: cadencia.id,
      ordem: 1,
      delayMinutos: 0,
      ancoradaEm: 'gatilho',
      templateBase: esqueletoNomeado(TEMPLATE_ENVIADO),
      templateNome: TEMPLATE_ENVIADO,
      ehUltima: true,
    },
  })
  return prisma.mvCadencia.findFirstOrThrow({
    where: { id: cadencia.id },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
}

/** Por que a trilha ainda não pode inscrever ninguém — ou `null` se pode. */
async function bloqueio(cadencia: Cadencia): Promise<string | null> {
  if (!cadencia.ativo) return 'cadência de pedido enviado desligada'
  const status = await statusDosTemplates()
  if (!status) return 'sem como conferir a aprovação do template (DATAFY_WABA_ID ou canal)'
  const s = status.get(TEMPLATE_ENVIADO)
  if (s !== 'APPROVED') return `template ${TEMPLATE_ENVIADO} ${s ? s.toLowerCase() : 'ausente'} na Meta`
  return null
}

/**
 * Um pedido: tem código novo? então inscreve o aviso. Devolve o motivo quando não.
 * Chamado pela varredura e pelo webhook — ver o cabeçalho.
 */
export async function avisarRastreio(
  pedido: Pedido,
  pre?: { cadencia: Cadencia; ajustes: Ajustes; liberado: boolean },
): Promise<{ inscrito: boolean; motivo?: string }> {
  const cadencia = pre?.cadencia ?? (await garantirCadencia())
  if (!pre) {
    const b = await bloqueio(cadencia)
    if (b) return { inscrito: false, motivo: b }
  } else if (!pre.liberado) {
    return { inscrito: false, motivo: 'trilha bloqueada' }
  }

  if (pedido.status === 'cancelled') return { inscrito: false, motivo: 'pedido cancelado' }
  if (pedido.payment_status !== 'paid') return { inscrito: false, motivo: 'pedido não pago' }

  // Antes da leitura cara: quem já foi avisado não custa chamada à loja.
  const ja = await prisma.mvInscricao.findUnique({
    where: {
      cadenciaId_origem_refExterna: { cadenciaId: cadencia.id, origem: ORIGEM_ENVIADO, refExterna: String(pedido.id) },
    },
    select: { id: true },
  })
  if (ja) return { inscrito: false, motivo: 'já avisado' }

  const rastreio = await rastreioDoPedido(pedido)
  if (!rastreio) return { inscrito: false, motivo: 'sem código de rastreio' }

  const postadoEm = new Date(pedido.shipped_at || pedido.updated_at || Date.now())
  if ((Date.now() - postadoEm.getTime()) / 3_600_000 > IDADE_MAXIMA_HORAS) {
    return { inscrito: false, motivo: `postado há mais de ${IDADE_MAXIMA_HORAS}h` }
  }

  const e164 = paraE164(telefoneDoCarrinho({ contact_phone: pedido.contact_phone } as never))
  const chave = e164 ? chaveTelefone(e164) : ''
  if (!e164 || !chave) return { inscrito: false, motivo: 'pedido sem telefone utilizável' }

  const saiu = await prisma.mvOptOut.findUnique({ where: { telefoneKey: chave } })
  if (saiu) return { inscrito: false, motivo: 'opt-out' }

  const nome = primeiroNome(pedido.contact_name)
  if (!nome) return { inscrito: false, motivo: 'pedido sem primeiro nome' }

  try {
    await inscrever({
      ajustes: pre?.ajustes ?? (await obterAjustes()),
      cadenciaId: cadencia.id,
      etapas: cadencia.etapas,
      origem: ORIGEM_ENVIADO,
      refExterna: String(pedido.id),
      nome,
      e164,
      chave,
      // Agora, e não o `shipped_at`: o aviso é UTILITY e sai no próximo tique.
      ancora: new Date(),
      contexto: { primeiro_nome: nome, pedido: `#${pedido.number}`, rastreio: rastreio.codigo },
      retrato: {
        pedido: pedido.number,
        total: pedido.total,
        moeda: pedido.currency,
        rastreio: rastreio.codigo,
        transportadora: rastreio.transportadora,
        itens: (pedido.products ?? []).map((p) => ({ nome: p.name, qtd: p.quantity })),
        // O botão do template aponta para o CRM, que redireciona na hora do clique.
        url: linkDeRastreio(pedido.id),
      },
      prioridade: 0,
    })
    return { inscrito: true }
  } catch (e) {
    if (e instanceof CopyIncompleta) return { inscrito: false, motivo: `copy sem ${e.faltando.join('/')}` }
    if (e instanceof Error && e.name === 'JaInscrito') return { inscrito: false, motivo: 'já avisado' }
    throw e
  }
}

/** A varredura do tique. */
export async function observarRastreios(): Promise<ResultadoRastreio> {
  const cadencia = await garantirCadencia()
  const b = await bloqueio(cadencia)
  if (b) return { vistos: 0, inscritos: 0, pulados: [{ motivo: b, quantos: 1 }] }

  const ajustes = await obterAjustes()
  const pedidos = await listarPedidosAtualizados(new Date(Date.now() - JANELA_DIAS * 86_400_000))
  const pulados = new Map<string, number>()
  let inscritos = 0

  for (const pedido of pedidos) {
    const r = await avisarRastreio(pedido, { cadencia, ajustes, liberado: true })
    if (r.inscrito) inscritos++
    else if (r.motivo) pulados.set(r.motivo, (pulados.get(r.motivo) ?? 0) + 1)
  }

  return { vistos: pedidos.length, inscritos, pulados: [...pulados].map(([motivo, quantos]) => ({ motivo, quantos })) }
}
