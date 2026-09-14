/**
 * OS FUNIS DO CRM — a Máquina de Vendas aparecendo no pipeline.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Reunião de 14/09/2026 (16h04): o pipeline da Doce Lilium não é "novo lead,
 * qualificação, negociação, fechamento" — é varejo. São três esteiras:
 *
 *   WhatsApp · Atendimento IA   a conversa (já existia, `atendimento/funil.ts`)
 *   Carrinho abandonado         a régua de recuperação, toque a toque
 *   Pós-venda                   pagamento → envio com rastreio → entrega
 *
 * ── Derivado, e não empurrado ─────────────────────────────────────────────
 * Em vez de cada ponto da Máquina (observador, despachante, webhook) mexer no
 * funil, o tique DERIVA a etapa do estado da inscrição e das mensagens. Um
 * lugar só decide, e ele se corrige sozinho: se um tique falhar, o seguinte
 * acerta. O negócio fica ligado à inscrição por `MvInscricao.dealId`.
 *
 * O funil só ANDA PARA FRENTE: se a Marília arrastar o card adiante, o tique
 * não o puxa de volta.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { garantirFunilDefinido, NOME_FUNIL, type DefinicaoEtapa } from '@/lib/atendimento/funil'
import { apenasDigitos } from './telefone'
import { ORIGEM_ENVIADO } from './observador-rastreio'

export const FUNIL_CARRINHO = 'Carrinho abandonado'
export const FUNIL_POS_VENDA = 'Pós-venda'

const ETAPAS_CARRINHO: DefinicaoEtapa[] = [
  { nome: 'Carrinho abandonado', cor: '#f59e0b', probabilidade: 20 },
  { nome: '1º lembrete enviado', cor: '#fb923c', probabilidade: 25 },
  { nome: '2º toque enviado', cor: '#f97316', probabilidade: 30 },
  { nome: 'Último toque enviado', cor: '#ea580c', probabilidade: 35 },
  { nome: 'Respondeu', cor: '#a855f7', probabilidade: 50 },
  { nome: 'Recuperado', cor: '#22c55e', probabilidade: 100 },
  { nome: 'Não voltou', cor: '#94a3b8', probabilidade: 0 },
]

const ETAPAS_POS_VENDA: DefinicaoEtapa[] = [
  { nome: 'Pagamento aprovado', cor: '#22c55e', probabilidade: 100 },
  { nome: 'Pedido enviado', cor: '#0ea5e9', probabilidade: 100 },
  { nome: 'Entregue', cor: '#6366f1', probabilidade: 100 },
  { nome: 'Avaliação e recompra', cor: '#d946ef', probabilidade: 100 },
]

/** Quanto tempo depois do último toque sem compra o carrinho vira "Não voltou". */
const HORAS_ATE_NAO_VOLTOU = 48
/** Só inscrições mexidas neste intervalo são sincronizadas a cada tique. */
const JANELA_DIAS = 45

export type ResultadoFunis = { criados: number; movidos: number; atividades: number; erros: number }

type Funil = Awaited<ReturnType<typeof garantirFunilDefinido>>

/**
 * Na primeira vez que os funis de varejo nascem, eles viram a ordem do
 * pipeline: o atendimento abre como padrão, e o funil de vendas genérico vai
 * para o fim — sem apagar nada. Depois disso a ordem é da Marília.
 */
async function organizarNaPrimeiraVez(): Promise<void> {
  const jaExiste = await prisma.pipeline.findFirst({ where: { nome: FUNIL_CARRINHO }, select: { id: true } })
  if (jaExiste) return
  const atendimento = await prisma.pipeline.findFirst({ where: { nome: NOME_FUNIL } })
  const outros = await prisma.pipeline.findMany({
    where: { nome: { notIn: [NOME_FUNIL, FUNIL_CARRINHO, FUNIL_POS_VENDA] } },
    orderBy: { ordem: 'asc' },
  })
  for (const [i, p] of outros.entries()) {
    await prisma.pipeline.update({ where: { id: p.id }, data: { ordem: 10 + i, ...(atendimento ? { isDefault: false } : {}) } })
  }
  if (atendimento) await prisma.pipeline.update({ where: { id: atendimento.id }, data: { ordem: 0, isDefault: true } })
}

function etapaPorNome(funil: Funil, nome: string) {
  const s = funil.stages.find((x) => x.nome === nome)
  if (!s) throw new Error(`etapa "${nome}" ausente no funil ${funil.nome}`)
  return s
}

async function contatoDaInscricao(insc: { telefoneE164: string; telefoneKey: string; nomeSnapshot: string }, userId: string) {
  const existente = await prisma.contact.findFirst({
    where: { telefone: { endsWith: insc.telefoneKey } },
    orderBy: { createdAt: 'asc' },
  })
  if (existente) return existente
  return prisma.contact.create({
    data: {
      userId,
      nome: insc.nomeSnapshot,
      telefone: apenasDigitos(insc.telefoneE164),
      firstUtmSource: 'nuvemshop',
      lastUtmSource: 'nuvemshop',
      firstUtmAt: new Date(),
      lastUtmAt: new Date(),
    },
  })
}

type Retrato = { total?: string; itens?: { nome: string; qtd: number }[]; pedido?: number; rastreio?: string }

/** Move para frente, fecha como ganho/perdido quando a etapa é terminal. */
async function levarPara(
  dealId: string,
  funil: Funil,
  alvoNome: string,
  fechamento?: { status: 'WON' | 'LOST'; motivo?: string; valor?: number | null },
): Promise<boolean> {
  const deal = await prisma.deal.findUnique({ where: { id: dealId }, include: { stage: true } })
  if (!deal || deal.pipelineId !== funil.id) return false
  const alvo = etapaPorNome(funil, alvoNome)
  const anda = alvo.ordem > deal.stage.ordem
  const fecha = fechamento && deal.status === 'OPEN'
  if (!anda && !fecha) return false
  await prisma.deal.update({
    where: { id: deal.id },
    data: {
      ...(anda ? { stageId: alvo.id } : {}),
      ...(fecha
        ? {
            status: fechamento!.status,
            fechadoEm: new Date(),
            motivoPerda: fechamento!.status === 'LOST' ? (fechamento!.motivo ?? null) : null,
            ...(fechamento!.valor ? { valorEstimado: fechamento!.valor } : {}),
          }
        : {}),
    },
  })
  if (anda) {
    await prisma.dealStageHistory.create({
      data: { dealId: deal.id, deStageId: deal.stageId, paraStageId: alvo.id, mudouPor: 'Máquina de Vendas', fonte: 'ai' },
    })
  }
  return true
}

/** Cada mensagem ENVIADA vira uma atividade no negócio — uma vez só. */
async function registrarMensagens(
  dealId: string,
  contactId: string,
  userId: string,
  mensagens: { id: string; templateNome: string | null; mensagemFinal: string; enviadaEm: Date | null; status: string }[],
): Promise<number> {
  const enviadas = mensagens.filter((m) => m.status === 'ENVIADA' && m.enviadaEm)
  if (!enviadas.length) return 0
  const ja = await prisma.activity.findMany({
    where: { dealId, descricao: { contains: '[mv:' } },
    select: { descricao: true },
  })
  const vistos = new Set(ja.flatMap((a) => [...(a.descricao ?? '').matchAll(/\[mv:([0-9a-f-]{36})\]/g)].map((m) => m[1])))
  let n = 0
  for (const m of enviadas) {
    if (vistos.has(m.id)) continue
    await prisma.activity.create({
      data: {
        userId,
        dealId,
        contactId,
        tipo: 'WhatsApp',
        titulo: `Máquina de Vendas: ${m.mensagemFinal.replace(/\s+/g, ' ').slice(0, 150)}`,
        descricao: `${m.mensagemFinal.slice(0, 1800)}\n\n${m.templateNome ?? ''} [mv:${m.id}]`,
        status: 'DONE',
        doneAt: m.enviadaEm!,
        dueAt: m.enviadaEm!,
      },
    })
    n++
  }
  return n
}

export async function sincronizarFunis(): Promise<ResultadoFunis> {
  const r: ResultadoFunis = { criados: 0, movidos: 0, atividades: 0, erros: 0 }

  await organizarNaPrimeiraVez()
  const carrinho = await garantirFunilDefinido(FUNIL_CARRINHO, ETAPAS_CARRINHO, 1)
  const posVenda = await garantirFunilDefinido(FUNIL_POS_VENDA, ETAPAS_POS_VENDA, 2)
  const atendimento = await prisma.pipeline.findFirst({
    where: { nome: NOME_FUNIL },
    include: { stages: { orderBy: { ordem: 'asc' } } },
  })

  const inscricoes = await prisma.mvInscricao.findMany({
    where: {
      origem: { in: ['carrinho', 'pedido', ORIGEM_ENVIADO] },
      updatedAt: { gte: new Date(Date.now() - JANELA_DIAS * 86_400_000) },
    },
    orderBy: { createdAt: 'asc' },
    include: {
      mensagens: {
        select: { id: true, templateNome: true, mensagemFinal: true, enviadaEm: true, status: true, etapaOrdem: true },
        orderBy: { etapaOrdem: 'asc' },
      },
    },
  })

  // O pedido pago e o aviso de envio do MESMO pedido são um negócio só.
  const dealDoPedido = new Map<string, string>()
  for (const i of inscricoes) if (i.origem !== 'carrinho' && i.dealId) dealDoPedido.set(i.refExterna, i.dealId)

  for (const insc of inscricoes) {
    try {
      const funil = insc.origem === 'carrinho' ? carrinho : posVenda
      const retrato = (insc.contexto ?? {}) as Retrato
      const contato = await contatoDaInscricao(insc, funil.userId)

      let dealId = insc.dealId ?? (insc.origem !== 'carrinho' ? dealDoPedido.get(insc.refExterna) : undefined) ?? null
      if (dealId && !(await prisma.deal.findUnique({ where: { id: dealId }, select: { id: true } }))) dealId = null

      if (!dealId) {
        const pecas = (retrato.itens ?? []).map((x) => x.nome).join(', ')
        const inicial = insc.origem === 'carrinho' ? 'Carrinho abandonado' : 'Pagamento aprovado'
        const etapa = etapaPorNome(funil, inicial)
        const deal = await prisma.deal.create({
          data: {
            pipelineId: funil.id,
            stageId: etapa.id,
            contactId: contato.id,
            userId: funil.userId,
            titulo:
              insc.origem === 'carrinho'
                ? `Carrinho · ${insc.nomeSnapshot}${pecas ? ` · ${pecas.slice(0, 60)}` : ''}`
                : `Pedido #${retrato.pedido ?? insc.refExterna} · ${insc.nomeSnapshot}`,
            valorEstimado: Number(retrato.total) || 0,
            produtoInteresse: pecas || null,
            origem: insc.origem === 'carrinho' ? 'nuvemshop-carrinho' : 'nuvemshop-pedido',
            telefone: apenasDigitos(insc.telefoneE164),
          },
        })
        await prisma.dealStageHistory.create({
          data: { dealId: deal.id, deStageId: null, paraStageId: etapa.id, mudouPor: 'Máquina de Vendas', fonte: 'ai' },
        })
        dealId = deal.id
        r.criados++
        if (insc.origem !== 'carrinho') dealDoPedido.set(insc.refExterna, deal.id)
      }
      if (insc.dealId !== dealId || insc.contactId !== contato.id) {
        await prisma.mvInscricao.update({ where: { id: insc.id }, data: { dealId, contactId: contato.id } })
      }

      // ── A etapa que o estado da inscrição pede ─────────────────────────
      const enviadas = insc.mensagens.filter((m) => m.status === 'ENVIADA')
      let moveu = false
      if (insc.origem === 'carrinho') {
        const valor = insc.valorConvertido ? Number(insc.valorConvertido) : null
        const ultimaEnvio = enviadas.at(-1)?.enviadaEm?.getTime() ?? 0
        if (insc.status === 'CONVERTEU') {
          moveu = await levarPara(dealId, funil, 'Recuperado', { status: 'WON', valor })
        } else if (['OPT_OUT', 'NUMERO_INVALIDO', 'BLOQUEADA_META'].includes(insc.status)) {
          moveu = await levarPara(dealId, funil, 'Não voltou', { status: 'LOST', motivo: insc.motivoParada ?? insc.status })
        } else if (insc.status === 'RESPONDEU' || insc.respondeuEm) {
          moveu = await levarPara(dealId, funil, 'Respondeu')
        } else if (
          insc.status === 'CONCLUIDA' &&
          ultimaEnvio &&
          Date.now() - ultimaEnvio > HORAS_ATE_NAO_VOLTOU * 3_600_000
        ) {
          moveu = await levarPara(dealId, funil, 'Não voltou', { status: 'LOST', motivo: 'régua cumprida sem compra' })
        } else if (enviadas.length) {
          const nome = ['1º lembrete enviado', '2º toque enviado', 'Último toque enviado'][Math.min(enviadas.length, 3) - 1]
          moveu = await levarPara(dealId, funil, nome)
        }
      } else if (insc.origem === ORIGEM_ENVIADO && enviadas.length) {
        moveu = await levarPara(dealId, funil, 'Pedido enviado')
      } else if (insc.origem === 'pedido') {
        // Quem comprou e estava conversando com a IA vai para "Comprou" no funil
        // do WhatsApp. Só mexe em conversa que existe: não cria negócio lá.
        if (atendimento?.stages.some((s) => s.nome === 'Comprou')) {
          const conversa = await prisma.deal.findFirst({
            where: { pipelineId: atendimento.id, contactId: contato.id, status: 'OPEN' },
            orderBy: { createdAt: 'desc' },
            select: { id: true },
          })
          if (conversa && (await levarPara(conversa.id, atendimento, 'Comprou'))) r.movidos++
        }
      }
      if (moveu) r.movidos++

      r.atividades += await registrarMensagens(dealId, contato.id, funil.userId, insc.mensagens)
    } catch (e) {
      r.erros++
      await prisma.logEvento
        .create({
          data: {
            origem: 'crm',
            nivel: 'ERRO',
            tipo: 'funis_falhou',
            titulo: `Inscrição ${insc.origem} ${insc.refExterna} não sincronizou o funil`,
            dados: JSON.stringify({ erro: e instanceof Error ? e.message : String(e) }).slice(0, 1000),
          },
        })
        .catch(() => undefined)
    }
  }
  return r
}
