/**
 * O OBSERVADOR DE COLUNAS — o card que entra numa coluna do funil vira régua.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte do `rodarObservador` + `varrerEstoque` do CRM CarBoss. Lá era o único
 * observador; aqui é o QUARTO, ao lado de carrinho, pedido e marketing. Ele só
 * age em cadência que tem `stageId` — hoje nenhuma das sete da Doce Lilium tem,
 * então ligar este módulo não muda nada até alguém criar uma régua presa a uma
 * coluna do funil do CRM (ex.: "Atendimento WhatsApp · sem resposta").
 *
 * ⛔ REGRA DURA: NUNCA escreve em Deal, Stage, Pipeline, Contact, Activity ou
 *    DealStageHistory. Lê. Escreve só `MvInscricao`, `MvMensagem` e `MvCursor`.
 *    Quem move card é a equipe — nunca a Máquina. `scripts/test-mv` tem a
 *    varredura que prova isto por grep.
 *
 * ── O que veio da origem, inteiro ─────────────────────────────────────────
 *  · Duas fontes de evento: `DealStageHistory` (entrada em coluna) e Deal
 *    recém-criado já na coluna (nem todo caminho grava histórico).
 *  · Primeira execução NUNCA reprocessa histórico: cria o cursor e cobre o que
 *    já estava na coluna pela varredura de estoque.
 *  · Cursor nunca regride; sobreposição de 10 min (`OVERLAP_MS`).
 *  · Dedup ANTES do teto do tique, para reprocessar não travar a fila.
 *  · Opt-out é por TELEFONE, para sempre, e nada o dispensa.
 *  · Conversa viva cede a vez — exceto quando uma PESSOA arrastou o card
 *    (`MOVIMENTO_HUMANO`): quem arrasta sabe o que a Máquina não sabe.
 *  · Anti-spam de ERRO: 24 h sem empilhar a mesma linha de erro.
 *  · Falha nunca é silenciosa: vira inscrição `ERRO` com motivo.
 *  · Orçamento do estoque conta quem ENTROU, não quem foi olhado.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { CURSOR_OBSERVADOR_COLUNAS, INSCRICAO_STATUS, OVERLAP_MS, obterAjustes, type Ajustes } from './config'
import { chaveTelefone, paraE164, primeiroNome } from './telefone'
import { CopyIncompleta, type Contexto } from './copy'
import { inscrever } from './observador'
import { ehGatilhoDeCampanha } from './cadencias-seed'

/** Inscrições novas por tique, somando eventos e estoque. */
export const MAX_POR_TIQUE = 20
/** Deals olhados por cadência na varredura de estoque (inclui os que cedem a vez). */
export const LIMITE_DE_VARREDURA = 200
export const ORIGEM_FUNIL = 'funil'

/**
 * Fontes em que uma PESSOA moveu o card pela tela. `DealStageHistory.fonte`
 * aqui é `kanban_drag | menu | bulk | api | ai`; `api` e `ai` são integração
 * e continuam cedendo a vez para conversa viva.
 */
export const MOVIMENTO_HUMANO = new Set(['kanban_drag', 'menu', 'bulk'])

/** `MV_CONVERSA_VIVA_DIAS`, padrão 30. Valor inválido cai no padrão — nunca em 0. */
export const CONVERSA_VIVA_DIAS = (() => {
  const bruto = process.env.MV_CONVERSA_VIVA_DIAS
  if (!bruto) return 30
  const n = Number(bruto)
  return Number.isInteger(n) && n >= 0 ? n : 30
})()

/** Puro. `null` = nunca falou. Data no futuro conta como viva (relógio adiantado). */
export function conversaAindaViva(falouEm: Date | null | undefined, agora: Date, dias: number = CONVERSA_VIVA_DIAS): boolean {
  if (!falouEm) return false
  return falouEm.getTime() > agora.getTime() - dias * 86_400_000
}

export type ResultadoColunas = {
  inicializado?: boolean
  cadenciasObservadas: number
  eventosVistos: number
  inscricoesCriadas: number
  inscricoesComErro: number
  pulados: number
  sobraramParaProximoTick: number
  estoqueInscritos: number
  detalhes: string[]
}

type CadenciaDeColuna = {
  id: string
  nome: string
  stageId: string
  pipelineId: string | null
  etapas: Array<{ ordem: number; delayMinutos: number; ancoradaEm: string; templateBase: string; templateNome: string | null }>
}

const SELECT_DEAL = {
  id: true,
  stageId: true,
  telefone: true,
  titulo: true,
  contactId: true,
  contact: { select: { nome: true, telefone: true } },
} as const

type DealLido = {
  id: string
  stageId: string
  telefone: string | null
  titulo: string
  contactId: string
  contact: { nome: string; telefone: string } | null
}

async function cadenciasDeColuna(): Promise<CadenciaDeColuna[]> {
  const todas = await prisma.mvCadencia.findMany({
    where: { ativo: true, stageId: { not: null } },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
    orderBy: { nome: 'asc' },
  })
  // Campanha datada nunca é régua de coluna: tem calendário próprio e é intocável.
  return todas
    .filter((c) => c.stageId && c.etapas.length && !ehGatilhoDeCampanha(c.gatilho))
    .map((c) => ({ id: c.id, nome: c.nome, stageId: c.stageId!, pipelineId: c.pipelineId, etapas: c.etapas }))
}

/** A última fala da cliente ou da equipe com este telefone, em qualquer inscrição. */
async function ultimaConversa(chave: string): Promise<Date | null> {
  const [insc, resposta, humano] = await Promise.all([
    prisma.mvInscricao.findFirst({
      where: { telefoneKey: chave, OR: [{ respondeuEm: { not: null } }, { humanoFalouEm: { not: null } }] },
      orderBy: { updatedAt: 'desc' },
      select: { respondeuEm: true, humanoFalouEm: true },
    }),
    prisma.mvResposta.findUnique({ where: { telefoneKey: chave }, select: { respondidoEm: true } }),
    prisma.mvCursor.findUnique({ where: { chave: `atendimento:humano:${chave}` } }),
  ])
  const datas = [insc?.respondeuEm, insc?.humanoFalouEm, resposta?.respondidoEm, humano ? new Date(humano.valor) : null]
    .filter((d): d is Date => !!d && !Number.isNaN(d.getTime()))
  return datas.length ? new Date(Math.max(...datas.map((d) => d.getTime()))) : null
}

function ehDuplicata(e: unknown): boolean {
  if ((e as { code?: string })?.code === 'P2002') return true
  const t = String(e)
  return t.includes('maquina_vendas_inscricoes_ativa_unica') || t.includes('Unique constraint failed')
}

type Saida = 'ok' | 'erro' | 'pulado'

/**
 * Cria a inscrição de um card numa cadência de coluna. A falha vira linha
 * `ERRO` visível; ceder a vez para conversa viva vira `pulado` (não é defeito).
 */
export async function inscreverDeal(
  cad: CadenciaDeColuna,
  deal: DealLido,
  agora: Date,
  ajustes: Ajustes,
  opts: { decididoPorHumano?: boolean; ref: string },
): Promise<{ r: Saida; motivo?: string }> {
  const telBruto = deal.contact?.telefone || deal.telefone || ''
  const e164 = paraE164(telBruto)
  const chave = e164 ? chaveTelefone(e164) : ''
  const nomeCru = deal.contact?.nome || deal.titulo

  const falhar = async (motivo: string): Promise<{ r: Saida; motivo: string }> => {
    await prisma.mvInscricao.create({
      data: {
        cadenciaId: cad.id,
        origem: ORIGEM_FUNIL,
        refExterna: `${opts.ref}:erro:${agora.getTime()}`,
        dealId: deal.id,
        contactId: deal.contactId,
        nomeSnapshot: nomeCru.slice(0, 120),
        telefoneE164: e164 ?? telBruto.slice(0, 30),
        telefoneKey: chave,
        ancoraEm: agora,
        status: INSCRICAO_STATUS.ERRO,
        motivoParada: motivo.slice(0, 200),
      },
    })
    return { r: 'erro', motivo }
  }

  if (!telBruto) return falhar('pre_requisito: card sem telefone')
  if (!e164 || !chave) return falhar(`pre_requisito: telefone não normalizável: "${telBruto}"`)

  // Opt-out é escolha da CLIENTE: nada dispensa, nem o arrasto humano.
  if (await prisma.mvOptOut.findUnique({ where: { telefoneKey: chave } })) return { r: 'pulado', motivo: 'opt-out' }

  if (!opts.decididoPorHumano && conversaAindaViva(await ultimaConversa(chave), agora)) {
    return { r: 'pulado', motivo: 'conversa viva' }
  }

  const nome = primeiroNome(deal.contact?.nome) ?? primeiroNome(deal.titulo)
  if (!nome) return falhar('pre_requisito: sem primeiro nome utilizável')

  const contexto: Contexto = { primeiro_nome: nome }
  try {
    await inscrever({
      ajustes,
      cadenciaId: cad.id,
      etapas: cad.etapas,
      origem: ORIGEM_FUNIL,
      refExterna: opts.ref,
      nome,
      e164,
      chave,
      ancora: agora,
      contexto,
      retrato: { deal: deal.id, coluna: deal.stageId, titulo: deal.titulo },
      dealId: deal.id,
      contactId: deal.contactId,
    })
    return { r: 'ok' }
  } catch (e) {
    if (e instanceof CopyIncompleta) return falhar(`copy sem ${e.faltando.join('/')}`)
    if (e instanceof Error && e.name === 'JaInscrito') return { r: 'pulado', motivo: 'já inscrito' }
    if (ehDuplicata(e)) return { r: 'pulado', motivo: 'já ativa neste telefone' }
    throw e
  }
}

export async function observarColunas(agora: Date = new Date()): Promise<ResultadoColunas> {
  const vazio: ResultadoColunas = {
    cadenciasObservadas: 0,
    eventosVistos: 0,
    inscricoesCriadas: 0,
    inscricoesComErro: 0,
    pulados: 0,
    sobraramParaProximoTick: 0,
    estoqueInscritos: 0,
    detalhes: [],
  }
  const cadencias = await cadenciasDeColuna()
  if (!cadencias.length) return { ...vazio, detalhes: ['nenhuma cadência presa a coluna do funil'] }

  const ajustes = await obterAjustes()
  const porStage = new Map<string, CadenciaDeColuna[]>()
  for (const c of cadencias) porStage.set(c.stageId, [...(porStage.get(c.stageId) ?? []), c])
  const stages = [...porStage.keys()]

  const cursor = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_OBSERVADOR_COLUNAS } })
  if (!cursor) {
    await prisma.mvCursor.create({ data: { chave: CURSOR_OBSERVADOR_COLUNAS, valor: agora.toISOString() } })
    const estoque = await varrerEstoque(cadencias, agora, ajustes, MAX_POR_TIQUE)
    return { ...vazio, cadenciasObservadas: cadencias.length, inicializado: true, ...estoque }
  }

  const desde = new Date(new Date(cursor.valor).getTime() - OVERLAP_MS)
  const [historico, novos] = await Promise.all([
    prisma.dealStageHistory.findMany({
      where: { mudouEm: { gt: desde, lte: agora }, paraStageId: { in: stages } },
      orderBy: { mudouEm: 'asc' },
      take: 1000,
    }),
    prisma.deal.findMany({
      where: { createdAt: { gt: desde, lte: agora }, stageId: { in: stages }, status: 'OPEN' },
      select: { id: true, stageId: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 1000,
    }),
  ])

  type Evento = { dealId: string; stageId: string; quando: Date; porHumano: boolean }
  const eventos: Evento[] = [
    ...historico
      .filter((h) => h.deStageId !== h.paraStageId)
      .map((h) => ({ dealId: h.dealId, stageId: h.paraStageId, quando: h.mudouEm, porHumano: MOVIMENTO_HUMANO.has(h.fonte) })),
    ...novos.map((d) => ({ dealId: d.id, stageId: d.stageId, quando: d.createdAt, porHumano: false })),
  ].sort((a, b) => a.quando.getTime() - b.quando.getTime())

  // Dedup antes do teto.
  const ja = await prisma.mvInscricao.findMany({
    where: { dealId: { in: [...new Set(eventos.map((e) => e.dealId))] }, origem: ORIGEM_FUNIL },
    select: { dealId: true, cadenciaId: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  })
  const processado = (e: Evento) =>
    (porStage.get(e.stageId) ?? []).every((c) =>
      ja.some((i) => i.dealId === e.dealId && i.cadenciaId === c.id && (i.status === INSCRICAO_STATUS.ATIVA || i.createdAt >= e.quando)),
    )
  const candidatos = eventos.filter((e) => !processado(e))
  const doTique = candidatos.slice(0, MAX_POR_TIQUE)
  const sobraram = candidatos.length - doTique.length

  const detalhes: string[] = []
  let criadas = 0
  let comErro = 0
  let pulados = 0

  for (const ev of doTique) {
    try {
      const deal = (await prisma.deal.findUnique({ where: { id: ev.dealId }, select: SELECT_DEAL })) as DealLido | null
      if (!deal) {
        detalhes.push(`card ${ev.dealId.slice(0, 8)}: não existe mais`)
        continue
      }
      if (deal.stageId !== ev.stageId) {
        pulados++
        continue
      }
      for (const cad of porStage.get(ev.stageId) ?? []) {
        const ativa = await prisma.mvInscricao.findFirst({
          where: { cadenciaId: cad.id, dealId: deal.id, status: INSCRICAO_STATUS.ATIVA },
          select: { id: true },
        })
        if (ativa) {
          pulados++
          continue
        }
        const erroRecente = await prisma.mvInscricao.findFirst({
          where: {
            cadenciaId: cad.id,
            dealId: deal.id,
            status: INSCRICAO_STATUS.ERRO,
            createdAt: { gt: new Date(agora.getTime() - 24 * 3_600_000) },
          },
          select: { id: true },
        })
        if (erroRecente) {
          pulados++
          continue
        }
        const { r, motivo } = await inscreverDeal(cad, deal, agora, ajustes, {
          decididoPorHumano: ev.porHumano,
          ref: `deal:${deal.id}:${ev.quando.getTime()}`,
        })
        if (r === 'ok') criadas++
        else if (r === 'erro') comErro++
        else {
          pulados++
          if (motivo) detalhes.push(`card ${deal.id.slice(0, 8)}: ${motivo}`)
        }
      }
    } catch (e) {
      // Um card problemático não trava a fila — mas aparece.
      detalhes.push(`card ${ev.dealId.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  // Cursor nunca regride.
  const novoValor =
    sobraram > 0 && doTique.length > 0
      ? new Date(Math.max(doTique[doTique.length - 1].quando.getTime(), new Date(cursor.valor).getTime()))
      : agora
  await prisma.mvCursor.update({ where: { chave: CURSOR_OBSERVADOR_COLUNAS }, data: { valor: novoValor.toISOString() } })

  let estoqueInscritos = 0
  if (sobraram === 0) {
    const orcamento = MAX_POR_TIQUE - criadas - comErro
    if (orcamento > 0) {
      const r = await varrerEstoque(cadencias, agora, ajustes, orcamento)
      estoqueInscritos = r.estoqueInscritos
      criadas += r.inscricoesCriadas
      comErro += r.inscricoesComErro
      detalhes.push(...r.detalhes)
    }
  } else {
    detalhes.push(`${sobraram} evento(s) ficaram para o próximo tique`)
  }

  return {
    cadenciasObservadas: cadencias.length,
    eventosVistos: eventos.length,
    inscricoesCriadas: criadas,
    inscricoesComErro: comErro,
    pulados,
    sobraramParaProximoTick: sobraram,
    estoqueInscritos,
    detalhes,
  }
}

/**
 * Rede de segurança: card OPEN numa coluna observada que nunca teve inscrição
 * naquela cadência é inscrito aqui. Transforma "todo mundo na coluna tem
 * acompanhamento" em invariante. O orçamento conta quem ENTROU.
 */
async function varrerEstoque(
  cadencias: CadenciaDeColuna[],
  agora: Date,
  ajustes: Ajustes,
  orcamento: number,
): Promise<{ inscricoesCriadas: number; inscricoesComErro: number; estoqueInscritos: number; detalhes: string[] }> {
  let criadas = 0
  let comErro = 0
  let restante = orcamento
  const detalhes: string[] = []

  for (const cad of cadencias) {
    if (restante <= 0) break
    const jaTiveram = await prisma.mvInscricao.findMany({
      where: { cadenciaId: cad.id, dealId: { not: null } },
      select: { dealId: true },
      distinct: ['dealId'],
      orderBy: { dealId: 'asc' },
    })
    const excluir = jaTiveram.map((i) => i.dealId!).filter(Boolean)
    const deals = (await prisma.deal.findMany({
      where: {
        stageId: cad.stageId,
        ...(cad.pipelineId ? { pipelineId: cad.pipelineId } : {}),
        status: 'OPEN',
        ...(excluir.length ? { id: { notIn: excluir } } : {}),
      },
      select: SELECT_DEAL,
      orderBy: { createdAt: 'asc' },
      take: Math.min(LIMITE_DE_VARREDURA, Math.max(restante, restante * 8)),
    })) as DealLido[]

    let entraram = 0
    let cederam = 0
    let olhados = 0
    for (const d of deals) {
      if (restante <= 0) break
      olhados++
      const { r } = await inscreverDeal(cad, d, agora, ajustes, { ref: `deal:${d.id}:estoque` })
      if (r === 'ok') {
        criadas++
        entraram++
        restante--
      } else if (r === 'pulado') cederam++
      else {
        comErro++
        restante--
      }
    }
    const naoOlhados = deals.length - olhados
    if (naoOlhados > 0 && entraram === 0) detalhes.push(`estoque "${cad.nome}": ${naoOlhados} card(s) não olhado(s) — orçamento do tique acabou`)
    if (entraram > 0) detalhes.push(`estoque "${cad.nome}": ${entraram} card(s) inscrito(s)`)
    if (cederam > 0) detalhes.push(`estoque "${cad.nome}": ${cederam} cederam a vez (conversa viva/opt-out/já ativa)`)
  }
  return { inscricoesCriadas: criadas, inscricoesComErro: comErro, estoqueInscritos: criadas, detalhes }
}
