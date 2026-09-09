'use server'

import prisma from '@/lib/prisma'
import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { getTeamScope } from '@/app/actions/crm'
import { PRIORITY_SYSTEM_TAGS } from '@/lib/systemTags'

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────
async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ocr_auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return await verifyToken(token)
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface DesafiosRules {
  agendamentoStages: string[]
  comparecimentoStages: string[]
  zonaCinzaStages: string[]
  leadsApStages: string[]
  desqualificadaStages: string[]
}

export interface MetricFilters {
  ownerUserId?: string | null
  pipelineId?: string | null
}

export interface DesafiosMetrics {
  conversas: number
  respostas: number
  vendas: number
  agendamentos: number
  comparecimentos: number
  leadsAp: number
  zonaCinza: number
  desqualificadas: number
  // Métricas derivadas (taxas em %)
  taxaResposta: number
  taxaComparecimento: number
  taxaFechamento: number
  receita: number
}

const EMPTY_RULES: DesafiosRules = {
  agendamentoStages: [],
  comparecimentoStages: [],
  zonaCinzaStages: [],
  leadsApStages: [],
  desqualificadaStages: [],
}

// Métricas em que "menor é melhor" (custo). Usado por metas.
// Não pode ser exportado: arquivos 'use server' só aceitam exports de funções async.
const METRICAS_MENOR_MELHOR = ['cpa', 'cpl']

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 1000) / 10 : 0)

// ─────────────────────────────────────────────────────────────────────────────
// Regras (UserConfig)
// ─────────────────────────────────────────────────────────────────────────────
export async function getDesafiosRules(): Promise<DesafiosRules> {
  const auth = await requireAuth()
  const config = await prisma.userConfig.findFirst({
    where: { userId: auth.userId, key: 'desafios_regras' },
  })
  if (!config) return { ...EMPTY_RULES }
  try {
    return { ...EMPTY_RULES, ...JSON.parse(config.value) }
  } catch {
    return { ...EMPTY_RULES }
  }
}

export async function saveDesafiosRules(rules: DesafiosRules) {
  const auth = await requireAuth()
  await prisma.userConfig.upsert({
    where: { userId_key: { userId: auth.userId, key: 'desafios_regras' } },
    update: { value: JSON.stringify(rules) },
    create: { userId: auth.userId, key: 'desafios_regras', value: JSON.stringify(rules) },
  })
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Custos de operação (ROI)
// ─────────────────────────────────────────────────────────────────────────────
export async function getCustosOperacao() {
  const auth = await requireAuth()
  return prisma.desafioCusto.findMany({
    where: { userId: auth.userId },
    orderBy: { mesAno: 'desc' },
  })
}

export async function saveCustoOperacao(mesAno: string, valor: number) {
  const auth = await requireAuth()
  return prisma.desafioCusto.upsert({
    where: { userId_mesAno: { userId: auth.userId, mesAno } },
    update: { valor },
    create: { userId: auth.userId, mesAno, valor },
  })
}

export async function deleteCustoOperacao(id: string) {
  const auth = await requireAuth()
  await prisma.desafioCusto.deleteMany({ where: { id, userId: auth.userId } })
  return { success: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pipelines / Stages / Vendedores (fontes para configuração e filtros)
// ─────────────────────────────────────────────────────────────────────────────
export async function getDesafiosStages() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.pipeline.findMany({
    where: { userId: { in: scope } },
    include: { stages: { orderBy: { ordem: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })
}

export interface Vendedor {
  id: string
  nome: string
  initial: string
}

/** Lista vendedores dentro do escopo do time (para filtros e ranking). */
export async function getVendedores(): Promise<Vendedor[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const profiles = await prisma.profile.findMany({
    where: { userId: { in: scope } },
    select: { userId: true, nome: true, sobrenome: true },
  })
  return scope.map((id) => {
    const prof = profiles.find((p) => p.userId === id)
    const nome = prof ? `${prof.nome} ${prof.sobrenome || ''}`.trim() : 'Usuário'
    return { id, nome, initial: nome.substring(0, 2).toUpperCase() || 'US' }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor de métricas
// ─────────────────────────────────────────────────────────────────────────────

/** Filtro de "vendedor dono" do deal: ownerUserId, ou userId quando não há owner. */
function sellerWhere(ownerUserId?: string | null) {
  if (!ownerUserId) return {}
  return {
    OR: [{ ownerUserId }, { AND: [{ ownerUserId: null }, { userId: ownerUserId }] }],
  }
}

/** Monta o `where` base de deals para escopo do time + filtros de vendedor/pipeline. */
function buildDealBase(scope: string[], filters: MetricFilters = {}): any {
  const scopeWhere = { OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] }
  const pipelineWhere = filters.pipelineId ? { pipelineId: filters.pipelineId } : {}
  const sellerFilter = sellerWhere(filters.ownerUserId)
  return { AND: [scopeWhere, sellerFilter, pipelineWhere].filter((o) => Object.keys(o).length) }
}

/** Núcleo reutilizável: calcula todas as métricas de um período para um escopo/filtros. */
async function computeMetrics(
  scope: string[],
  startDate: Date,
  endDate: Date,
  rules: DesafiosRules,
  filters: MetricFilters = {}
): Promise<DesafiosMetrics> {
  const dealBase = buildDealBase(scope, filters)

  // Coorte base: deals criados no período (com telefone do contato e tags).
  const dealsPeriod = await prisma.deal.findMany({
    where: { ...dealBase, createdAt: { gte: startDate, lte: endDate } },
    select: { id: true, tags: true, telefone: true, contact: { select: { telefone: true } } },
  })
  const phoneOf = (d: (typeof dealsPeriod)[number]) =>
    (d.contact?.telefone || d.telefone || '').replace(/\D/g, '')

  // Sessões do n8n para os telefones da coorte, separando iniciada × respondida.
  const { initiated, responded } = await resolveTypedSessions(dealsPeriod.map(phoneOf))

  // Conversas = deals com conversa iniciada por nós (≥1 mensagem no n8n).
  const conversasCount = dealsPeriod.filter((d) => {
    const t = phoneOf(d)
    return t.length >= 10 && initiated.has(t)
  }).length
  // Respostas = deals cujo contato respondeu ao menos 1 vez (mensagem 'human').
  const respostasCount = dealsPeriod.filter((d) => {
    const t = phoneOf(d)
    return t.length >= 10 && responded.has(t)
  }).length

  // Vendas = WON fechadas no período
  const vendasAgg = await prisma.deal.aggregate({
    where: { ...dealBase, status: 'WON', fechadoEm: { gte: startDate, lte: endDate } },
    _count: { id: true },
    _sum: { valorEstimado: true },
  })
  const vendasCount = vendasAgg._count.id
  const receita = vendasAgg._sum.valorEstimado ?? 0

  // Deals da coorte que possuam alguma das tags
  const countDealsWithTags = (tags: string[] | undefined) => {
    if (!tags || tags.length === 0) return 0
    return dealsPeriod.filter((d) => d.tags && tags.some((tag) => d.tags?.includes(tag))).length
  }

  const [agendamentoStageIds, comparecimentoStageIds] = await Promise.all([
    resolveAgendamentoStageIds(scope, rules),
    resolveComparecimentoStageIds(scope, rules),
  ])

  // Sem configuração explícita em Regras, cai para as tags de sistema
  // (mesmas usadas pelo status de prioridade no Pipeline: Lead AP / Zona Cinza / Lead Desqualificado).
  const withDefaultTag = (configured: string[] | undefined, defaultLabel: string) =>
    configured && configured.length > 0 ? configured : [defaultLabel]

  const [agendamentosCount, comparecimentosCount] = await Promise.all([
    countDealsEnteringStages(dealBase, agendamentoStageIds, startDate, endDate),
    countDealsEnteringStages(dealBase, comparecimentoStageIds, startDate, endDate),
  ])
  const leadsApCount = countDealsWithTags(withDefaultTag(rules.leadsApStages, PRIORITY_SYSTEM_TAGS.BAIXA))
  const zonaCinzaCount = countDealsWithTags(withDefaultTag(rules.zonaCinzaStages, PRIORITY_SYSTEM_TAGS.MEDIA))
  const desqualificadasCount = countDealsWithTags(withDefaultTag(rules.desqualificadaStages, PRIORITY_SYSTEM_TAGS.ALTA))

  return {
    conversas: conversasCount,
    respostas: respostasCount,
    vendas: vendasCount,
    agendamentos: agendamentosCount,
    comparecimentos: comparecimentosCount,
    leadsAp: leadsApCount,
    zonaCinza: zonaCinzaCount,
    desqualificadas: desqualificadasCount,
    taxaResposta: pct(respostasCount, conversasCount),
    taxaComparecimento: pct(comparecimentosCount, agendamentosCount),
    taxaFechamento: pct(vendasCount, comparecimentosCount),
    receita,
  }
}

/** Conta deals que ENTRARAM em certas etapas no período (histórico + criados já na etapa). */
async function countDealsEnteringStages(dealBase: any, stageIds: string[] | undefined, startDate: Date, endDate: Date): Promise<number> {
  const ids = await dealsEnteringStages(dealBase, stageIds, startDate, endDate)
  return ids.size
}

/** Retorna o conjunto de dealIds que entraram em certas etapas no período. */
async function dealsEnteringStages(dealBase: any, stageIds: string[] | undefined, startDate: Date, endDate: Date): Promise<Set<string>> {
  if (!stageIds || stageIds.length === 0) return new Set()
  const historyMatches = await prisma.dealStageHistory.findMany({
    where: {
      deal: dealBase,
      mudouEm: { gte: startDate, lte: endDate },
      paraStageId: { in: stageIds },
    },
    select: { dealId: true },
    distinct: ['dealId'],
  })
  const ids = new Set(historyMatches.map((h) => h.dealId))
  const createdMatches = await prisma.deal.findMany({
    where: {
      ...dealBase,
      createdAt: { gte: startDate, lte: endDate },
      stageId: { in: stageIds },
      id: { notIn: Array.from(ids) },
    },
    select: { id: true },
  })
  createdMatches.forEach((d) => ids.add(d.id))
  return ids
}

/** Variações de sessionId do n8n para um telefone normalizado (com/sem 55 e com/sem o 9º dígito). */
function phoneSessionVariants(t: string): string[] {
  const noCountry = t.startsWith('55') ? t.substring(2) : t

  // Variações do 9º dígito do celular (n8n às vezes registra sem o 9)
  const locals = new Set<string>([noCountry])
  if (noCountry.length === 11 && noCountry[2] === '9') {
    locals.add(noCountry.substring(0, 2) + noCountry.substring(3)) // sem o 9
  } else if (noCountry.length === 10) {
    locals.add(noCountry.substring(0, 2) + '9' + noCountry.substring(2)) // com o 9
  }

  const out: string[] = []
  for (const local of locals) {
    for (const p of [local, `55${local}`]) {
      out.push(p, `${p}@c.us`, `${p}@s.whatsapp.net`)
    }
  }
  return out
}

/** Dado um conjunto de telefones normalizados, retorna quais têm sessão no n8n. */
async function resolvePhoneSessions(telefones: string[]): Promise<Set<string>> {
  const uniq = [...new Set(telefones.filter((t) => t && t.length >= 10))]
  if (uniq.length === 0) return new Set()
  const possibleSessions = uniq.flatMap(phoneSessionVariants)
  const sessionRecords = await prisma.n8nChatHistory.findMany({
    where: { sessionId: { in: possibleSessions } },
    select: { sessionId: true },
    distinct: ['sessionId'],
  })
  const activeSessions = new Set(sessionRecords.map((s) => s.sessionId))
  return new Set(uniq.filter((t) => phoneSessionVariants(t).some((v) => activeSessions.has(v))))
}

/**
 * Classifica os telefones em:
 *  - initiated: conversa iniciada por nós (existe ao menos 1 mensagem no n8n)
 *  - responded: o contato respondeu ao menos 1 vez (mensagem com type 'human')
 * Independe de data das mensagens (o n8n nem sempre carimba createdAt).
 */
async function resolveTypedSessions(
  telefones: string[]
): Promise<{ initiated: Set<string>; responded: Set<string> }> {
  const uniq = [...new Set(telefones.filter((t) => t && t.length >= 10))]
  if (uniq.length === 0) return { initiated: new Set(), responded: new Set() }
  const possibleSessions = uniq.flatMap(phoneSessionVariants)
  const rows = await prisma.n8nChatHistory.findMany({
    where: { sessionId: { in: possibleSessions } },
    select: { sessionId: true, message: true },
  })

  const initiatedSessions = new Set<string>()
  const respondedSessions = new Set<string>()
  for (const r of rows) {
    initiatedSessions.add(r.sessionId)
    let type: string | undefined
    try {
      const msg = typeof r.message === 'string' ? JSON.parse(r.message) : (r.message as any)
      type = msg?.type
    } catch {
      type = undefined
    }
    if (type === 'human') respondedSessions.add(r.sessionId)
  }

  const initiated = new Set(uniq.filter((t) => phoneSessionVariants(t).some((v) => initiatedSessions.has(v))))
  const responded = new Set(uniq.filter((t) => phoneSessionVariants(t).some((v) => respondedSessions.has(v))))
  return { initiated, responded }
}

/** Conta quantos deals do período tiveram conversa iniciada no n8n (WhatsApp). */
async function countRespostas(dealBase: any, startDate: Date, endDate: Date): Promise<number> {
  const dealsPeriod = await prisma.deal.findMany({
    where: { ...dealBase, createdAt: { gte: startDate, lte: endDate } },
    select: { telefone: true, contact: { select: { telefone: true } } },
  })
  // O telefone fica no contato; deal.telefone quase sempre é nulo.
  const telefones = dealsPeriod
    .map((d) => (d.contact?.telefone || d.telefone || '').replace(/\D/g, ''))
    .filter(Boolean)
  const { initiated } = await resolveTypedSessions(telefones)
  return telefones.filter((t) => initiated.has(t)).length
}

/** Resolve etapas configuradas nas regras; se vazias, detecta pelo nome da etapa. */
async function resolveStageIdsByName(scope: string[], configured: string[] | undefined, terms: string[]): Promise<string[]> {
  if (configured && configured.length > 0) return configured
  const stages = await prisma.stage.findMany({
    where: {
      pipeline: { userId: { in: scope } },
      OR: terms.map((t) => ({ nome: { contains: t, mode: 'insensitive' as const } })),
    },
    select: { id: true },
  })
  return stages.map((s) => s.id)
}

/** Etapas de "reunião agendada" (config ou fallback por nome). */
function resolveAgendamentoStageIds(scope: string[], rules: DesafiosRules): Promise<string[]> {
  return resolveStageIdsByName(scope, rules.agendamentoStages, ['agendad'])
}

/** Etapas de "comparecimento / reunião realizada" (config ou fallback por nome). */
function resolveComparecimentoStageIds(scope: string[], rules: DesafiosRules): Promise<string[]> {
  return resolveStageIdsByName(scope, rules.comparecimentoStages, ['realizad', 'comparec'])
}

/**
 * Métricas do período (compatível com a chamada antiga de 2 argumentos).
 * Agora aceita filtros opcionais por vendedor e pipeline.
 */
export async function getDesafiosMetrics(startDate: Date, endDate: Date, filters: MetricFilters = {}) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  return computeMetrics(scope, startDate, endDate, rules, filters)
}

/**
 * Métricas do período + comparação com o período anterior de igual duração.
 * Retorna deltas percentuais por métrica.
 */
export async function getMetricsComparison(startDate: Date, endDate: Date, filters: MetricFilters = {}) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()

  const durationMs = endDate.getTime() - startDate.getTime()
  const prevEnd = new Date(startDate.getTime() - 1)
  const prevStart = new Date(prevEnd.getTime() - durationMs)

  const [atual, anterior] = await Promise.all([
    computeMetrics(scope, startDate, endDate, rules, filters),
    computeMetrics(scope, prevStart, prevEnd, rules, filters),
  ])

  const deltas: Record<string, number> = {}
  ;(Object.keys(atual) as (keyof DesafiosMetrics)[]).forEach((k) => {
    const cur = atual[k] as number
    const prev = anterior[k] as number
    deltas[k] = prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0
  })

  return { atual, anterior, deltas, periodoAnterior: { start: prevStart, end: prevEnd } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Funil de conversão (taxas etapa-a-etapa + gargalo)
// ─────────────────────────────────────────────────────────────────────────────
export interface FunnelStep {
  key: string
  label: string
  valor: number
  taxaDaAnterior: number // % de conversão em relação à etapa anterior
}

export async function getFunnelConversion(startDate: Date, endDate: Date, filters: MetricFilters = {}) {
  const m = await getDesafiosMetrics(startDate, endDate, filters)

  const ordered: { key: string; label: string; valor: number }[] = [
    { key: 'conversas', label: 'Conversas', valor: m.conversas },
    { key: 'respostas', label: 'Respostas', valor: m.respostas },
    { key: 'leadsAp', label: 'Leads AP', valor: m.leadsAp },
    { key: 'agendamentos', label: 'Agendamentos', valor: m.agendamentos },
    { key: 'comparecimentos', label: 'Comparecimentos', valor: m.comparecimentos },
    { key: 'vendas', label: 'Vendas', valor: m.vendas },
  ]

  const steps: FunnelStep[] = ordered.map((s, i) => ({
    ...s,
    taxaDaAnterior: i === 0 ? 100 : pct(s.valor, ordered[i - 1].valor),
  }))

  // Gargalo = menor taxa de passagem (ignorando a primeira etapa)
  let gargalo: FunnelStep | null = null
  for (let i = 1; i < steps.length; i++) {
    if (steps[i - 1].valor > 0 && (!gargalo || steps[i].taxaDaAnterior < gargalo.taxaDaAnterior)) {
      gargalo = steps[i]
    }
  }

  return { steps, gargalo, metrics: m }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tempo médio entre etapas (velocidade do funil)
// ─────────────────────────────────────────────────────────────────────────────
export interface FunnelTiming {
  leadToAgendamento: number | null // horas
  agendamentoToComparecimento: number | null
  leadToVenda: number | null
  amostras: { agendamento: number; comparecimento: number; venda: number }
}

export async function getFunnelTiming(startDate: Date, endDate: Date, filters: MetricFilters = {}): Promise<FunnelTiming> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  const dealBase = buildDealBase(scope, filters)

  const [agStages, compStages] = await Promise.all([
    resolveAgendamentoStageIds(scope, rules),
    resolveComparecimentoStageIds(scope, rules),
  ])

  // Coorte: deals criados no período
  const deals = await prisma.deal.findMany({
    where: { ...dealBase, createdAt: { gte: startDate, lte: endDate } },
    select: { id: true, createdAt: true, fechadoEm: true, status: true },
  })
  if (deals.length === 0) {
    return { leadToAgendamento: null, agendamentoToComparecimento: null, leadToVenda: null, amostras: { agendamento: 0, comparecimento: 0, venda: 0 } }
  }
  const dealIds = deals.map((d) => d.id)
  const dealMap = new Map(deals.map((d) => [d.id, d]))

  // Primeira entrada em etapa de agendamento / comparecimento por deal
  const trackedStages = [...agStages, ...compStages]
  const histories = trackedStages.length > 0
    ? await prisma.dealStageHistory.findMany({
        where: { dealId: { in: dealIds }, paraStageId: { in: trackedStages } },
        select: { dealId: true, paraStageId: true, mudouEm: true },
        orderBy: { mudouEm: 'asc' },
      })
    : []

  const firstAg = new Map<string, Date>()
  const firstComp = new Map<string, Date>()
  for (const h of histories) {
    if (agStages.includes(h.paraStageId) && !firstAg.has(h.dealId)) firstAg.set(h.dealId, h.mudouEm)
    if (compStages.includes(h.paraStageId) && !firstComp.has(h.dealId)) firstComp.set(h.dealId, h.mudouEm)
  }

  const HOUR = 1000 * 60 * 60
  const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null)

  const leadToAg: number[] = []
  const agToComp: number[] = []
  const leadToVenda: number[] = []

  for (const [dealId, ag] of firstAg) {
    const d = dealMap.get(dealId)!
    leadToAg.push((ag.getTime() - d.createdAt.getTime()) / HOUR)
  }
  for (const [dealId, comp] of firstComp) {
    const ag = firstAg.get(dealId)
    if (ag) agToComp.push((comp.getTime() - ag.getTime()) / HOUR)
  }
  for (const d of deals) {
    if (d.status === 'WON' && d.fechadoEm) leadToVenda.push((d.fechadoEm.getTime() - d.createdAt.getTime()) / HOUR)
  }

  return {
    leadToAgendamento: avg(leadToAg.filter((v) => v >= 0)),
    agendamentoToComparecimento: avg(agToComp.filter((v) => v >= 0)),
    leadToVenda: avg(leadToVenda.filter((v) => v >= 0)),
    amostras: { agendamento: leadToAg.length, comparecimento: agToComp.length, venda: leadToVenda.length },
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Metas (CRUD)
// ─────────────────────────────────────────────────────────────────────────────
export interface MetaInput {
  periodo: string
  metrica: string
  alvo: number
  tipo?: string
  ownerUserId?: string | null
}

export async function getMetas(periodo: string) {
  const auth = await requireAuth()
  return prisma.desafioMeta.findMany({
    where: { userId: auth.userId, periodo },
    orderBy: { createdAt: 'asc' },
  })
}

export async function saveMeta(input: MetaInput) {
  const auth = await requireAuth()
  const tipo = input.tipo ?? (METRICAS_MENOR_MELHOR.includes(input.metrica) ? 'MENOR_MELHOR' : 'MAIOR_MELHOR')
  const ownerUserId = input.ownerUserId ?? null

  try {
    // upsert manual: campo nullable em unique composto não é suportado no where do Prisma
    const existing = await prisma.desafioMeta.findFirst({
      where: { userId: auth.userId, periodo: input.periodo, metrica: input.metrica, ownerUserId },
      select: { id: true },
    })

    if (existing) {
      return await prisma.desafioMeta.update({ where: { id: existing.id }, data: { alvo: input.alvo, tipo } })
    }
    return await prisma.desafioMeta.create({
      data: { userId: auth.userId, periodo: input.periodo, metrica: input.metrica, alvo: input.alvo, tipo, ownerUserId },
    })
  } catch (error) {
    console.error('Erro ao salvar meta (saveMeta):', error)
    throw new Error('Falha ao registrar meta no banco de dados.')
  }
}

export async function deleteMeta(id: string) {
  const auth = await requireAuth()
  await prisma.desafioMeta.deleteMany({ where: { id, userId: auth.userId } })
  return { success: true }
}

/**
 * Cruza metas do período × realizado × ritmo, devolvendo progresso e projeção.
 * `periodo` no formato "YYYY-MM".
 */
export async function getMetasProgress(periodo: string, filters: MetricFilters = {}) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()

  const [yearStr, monthStr] = periodo.split('-')
  const year = parseInt(yearStr)
  const month = parseInt(monthStr) - 1
  const startDate = new Date(year, month, 1, 0, 0, 0, 0)
  const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999)

  const metrics = await computeMetrics(scope, startDate, endDate, rules, filters)

  // Custo do mês → CPA / CPL
  const custo = await prisma.desafioCusto.findFirst({ where: { userId: auth.userId, mesAno: periodo } })
  const custoValor = custo?.valor ?? 0
  // CPA = custo / vendas (deals ganhos); CPL = custo / reuniões agendadas.
  const cpa = custoValor > 0 && metrics.vendas > 0 ? custoValor / metrics.vendas : 0
  const cpl = custoValor > 0 && metrics.agendamentos > 0 ? custoValor / metrics.agendamentos : 0

  const realizadoDe = (metrica: string): number => {
    if (metrica === 'cpa') return cpa
    if (metrica === 'cpl') return cpl
    return (metrics as any)[metrica] ?? 0
  }

  // Ritmo: dias decorridos vs total (limitado ao mês corrente)
  const now = new Date()
  const totalDias = endDate.getDate()
  const isPast = now > endDate
  const isFuture = now < startDate
  const diasDecorridos = isPast ? totalDias : isFuture ? 0 : now.getDate()

  const metas = await prisma.desafioMeta.findMany({
    where: { userId: auth.userId, periodo, ownerUserId: filters.ownerUserId ?? null },
    orderBy: { createdAt: 'asc' },
  })

  const progresso = metas.map((meta) => {
    const realizado = realizadoDe(meta.metrica)
    const menorMelhor = meta.tipo === 'MENOR_MELHOR'
    const pctAtingido = menorMelhor
      ? meta.alvo > 0
        ? Math.round(Math.min((meta.alvo / (realizado || meta.alvo)) * 100, 999))
        : 0
      : meta.alvo > 0
        ? Math.round((realizado / meta.alvo) * 100)
        : 0

    // Projeção linear apenas para métricas de contagem (não taxas/custo)
    const isContagem = !['cpa', 'cpl', 'taxaResposta', 'taxaComparecimento', 'taxaFechamento'].includes(meta.metrica)
    const projecao = isContagem && diasDecorridos > 0 && !isPast
      ? Math.round((realizado / diasDecorridos) * totalDias)
      : realizado

    const restante = Math.max(meta.alvo - realizado, 0)
    const diasRestantes = Math.max(totalDias - diasDecorridos, 0)
    const necessarioPorDia = isContagem && diasRestantes > 0 ? Math.ceil(restante / diasRestantes) : 0

    return {
      id: meta.id,
      metrica: meta.metrica,
      alvo: meta.alvo,
      tipo: meta.tipo,
      realizado: Math.round(realizado * 10) / 10,
      pctAtingido,
      projecao,
      restante: Math.round(restante * 10) / 10,
      diasRestantes,
      necessarioPorDia,
      noRitmo: menorMelhor ? realizado <= meta.alvo || realizado === 0 : projecao >= meta.alvo,
    }
  })

  return {
    periodo,
    metrics,
    cpa,
    cpl,
    custoValor,
    diasDecorridos,
    totalDias,
    progresso,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Ranking de vendedores
// ─────────────────────────────────────────────────────────────────────────────
export interface RankingVendedor {
  id: string
  nome: string
  initial: string
  vendas: number
  comparecimentos: number
  agendamentos: number
  conversas: number
  receita: number
  taxaFechamento: number
}

export async function getRankingVendedores(startDate: Date, endDate: Date, pipelineId?: string | null) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  const vendedores = await getVendedores()

  const results: RankingVendedor[] = []
  for (const v of vendedores) {
    const m = await computeMetrics(scope, startDate, endDate, rules, { ownerUserId: v.id, pipelineId })
    results.push({
      id: v.id,
      nome: v.nome,
      initial: v.initial,
      vendas: m.vendas,
      comparecimentos: m.comparecimentos,
      agendamentos: m.agendamentos,
      conversas: m.conversas,
      receita: m.receita,
      taxaFechamento: m.taxaFechamento,
    })
  }

  return results.sort((a, b) => b.vendas - a.vendas || b.receita - a.receita)
}

// ─────────────────────────────────────────────────────────────────────────────
// ROI: histórico de CPA/CPL e desempenho por origem
// ─────────────────────────────────────────────────────────────────────────────
export interface RoiMes {
  periodo: string
  custo: number
  vendas: number
  conversas: number
  cpa: number
  cpl: number
}

export async function getRoiHistorico(meses = 6): Promise<RoiMes[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  const dealBase = buildDealBase(scope, {})
  const agStages = await resolveAgendamentoStageIds(scope, rules)

  const custos = await prisma.desafioCusto.findMany({ where: { userId: auth.userId } })
  const custoMap = new Map(custos.map((c) => [c.mesAno, c.valor]))

  const now = new Date()
  const out: RoiMes[] = []
  for (let i = meses - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const periodo = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const start = new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0)
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999)

    const [conversas, vendas, agendamentos] = await Promise.all([
      prisma.deal.count({ where: { ...dealBase, createdAt: { gte: start, lte: end } } }),
      prisma.deal.count({ where: { ...dealBase, status: 'WON', fechadoEm: { gte: start, lte: end } } }),
      countDealsEnteringStages(dealBase, agStages, start, end),
    ])
    const custo = custoMap.get(periodo) ?? 0
    out.push({
      periodo,
      custo,
      vendas,
      conversas,
      // CPA = custo / vendas; CPL = custo / reuniões agendadas.
      cpa: custo > 0 && vendas > 0 ? Math.round((custo / vendas) * 100) / 100 : 0,
      cpl: custo > 0 && agendamentos > 0 ? Math.round((custo / agendamentos) * 100) / 100 : 0,
    })
  }
  return out
}

export interface RoiOrigem {
  origem: string
  leads: number
  vendas: number
  receita: number
  taxaConversao: number
}

export async function getRoiPorOrigem(startDate: Date, endDate: Date, filters: MetricFilters = {}): Promise<RoiOrigem[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const dealBase = buildDealBase(scope, filters)

  const [leadsByOrigem, vendasByOrigem] = await Promise.all([
    prisma.deal.groupBy({
      by: ['origem'],
      where: { ...dealBase, createdAt: { gte: startDate, lte: endDate } },
      _count: { id: true },
    }),
    prisma.deal.groupBy({
      by: ['origem'],
      where: { ...dealBase, status: 'WON', fechadoEm: { gte: startDate, lte: endDate } },
      _count: { id: true },
      _sum: { valorEstimado: true },
    }),
  ])

  const map = new Map<string, RoiOrigem>()
  const keyOf = (o: string | null) => o || 'Sem origem'

  leadsByOrigem.forEach((l) => {
    const k = keyOf(l.origem)
    map.set(k, { origem: k, leads: l._count.id, vendas: 0, receita: 0, taxaConversao: 0 })
  })
  vendasByOrigem.forEach((v) => {
    const k = keyOf(v.origem)
    const cur = map.get(k) || { origem: k, leads: 0, vendas: 0, receita: 0, taxaConversao: 0 }
    cur.vendas = v._count.id
    cur.receita = v._sum.valorEstimado ?? 0
    map.set(k, cur)
  })

  const result = Array.from(map.values()).map((r) => ({
    ...r,
    taxaConversao: r.leads > 0 ? Math.round((r.vendas / r.leads) * 1000) / 10 : 0,
  }))
  return result.sort((a, b) => b.vendas - a.vendas || b.leads - a.leads)
}

// ─────────────────────────────────────────────────────────────────────────────
// Bússola: funil-mestre (Conversas Meta/n8n → Leads agendados → Vendas)
// ─────────────────────────────────────────────────────────────────────────────
export interface BussolaFunnel {
  conversas: number
  leads: number
  vendas: number
  taxaConversaLead: number
  taxaLeadVenda: number
  taxaConversaVenda: number
}

export async function getBussolaFunnel(startDate?: Date | null, endDate?: Date | null, filters: MetricFilters = {}): Promise<BussolaFunnel> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  const dealBase = buildDealBase(scope, filters)

  const start = startDate ?? new Date(2000, 0, 1)
  const end = endDate ?? new Date()
  const agStages = await resolveAgendamentoStageIds(scope, rules)

  const [conversas, leadsSet, vendas] = await Promise.all([
    countRespostas(dealBase, start, end),
    dealsEnteringStages(dealBase, agStages, start, end),
    prisma.deal.count({ where: { ...dealBase, status: 'WON', fechadoEm: { gte: start, lte: end } } }),
  ])
  const leads = leadsSet.size

  return {
    conversas,
    leads,
    vendas,
    taxaConversaLead: pct(leads, conversas),
    taxaLeadVenda: pct(vendas, leads),
    taxaConversaVenda: pct(vendas, conversas),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Bússola: origens reais (Meta via n8n, Google, Indicação, Network)
// ─────────────────────────────────────────────────────────────────────────────
export interface BussolaOrigem {
  id: string
  label: string
  iconName: string
  color: string
  leads: number
  deals: number
  receita: number
  custo: number
}

export async function getBussolaOrigens(startDate?: Date | null, endDate?: Date | null, filters: MetricFilters = {}): Promise<BussolaOrigem[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const dealBase = buildDealBase(scope, filters)

  const dateWhere = startDate || endDate
    ? { createdAt: { gte: startDate ?? new Date(2000, 0, 1), lte: endDate ?? new Date() } }
    : {}

  const deals = await prisma.deal.findMany({
    where: { ...dealBase, ...dateWhere },
    select: { origem: true, status: true, valorEstimado: true, telefone: true, contact: { select: { telefone: true } } },
  })

  // O telefone fica no contato; deal.telefone quase sempre é nulo.
  const phoneOf = (d: (typeof deals)[number]) => (d.contact?.telefone || d.telefone || '').replace(/\D/g, '')
  const phones = deals.map(phoneOf).filter(Boolean)
  const withSession = await resolvePhoneSessions(phones)
  const hasSession = (d: (typeof deals)[number]) => {
    const t = phoneOf(d)
    return t.length >= 10 && withSession.has(t)
  }

  const mk = (id: string, label: string, iconName: string, color: string): BussolaOrigem =>
    ({ id, label, iconName, color, leads: 0, deals: 0, receita: 0, custo: 0 })

  const buckets: Record<string, BussolaOrigem> = {
    meta: mk('meta', 'Meta Ads', 'Megaphone', '#60A5FA'),
    google: mk('google', 'Google Ads', 'Search', '#FFB300'),
    social: mk('social', 'Social Selling', 'MessageCircle', '#22d3ee'),
    indicacao: mk('indicacao', 'Indicação', 'Star', '#a855f7'),
    whatsapp: mk('whatsapp', 'WhatsApp', 'MessageSquare', '#00E676'),
  }

  deals.forEach((d) => {
    const norm = (d.origem || '').trim().toLowerCase()
    let key: string
    // Social selling é uma origem própria: prospecção ativa em redes sociais.
    if (norm.includes('social') || norm.includes('selling') || norm.includes('prospec')) {
      key = 'social'
    } else if (norm.includes('google') || norm.includes('search')) {
      key = 'google'
    } else if (norm.includes('indica')) {
      key = 'indicacao'
    } else if (norm.includes('whatsapp') || norm.includes('whats')) {
      key = 'whatsapp'
    } else {
      // Sem origem reconhecida ("Outros") passa a contar como Meta Ads — o canal
      // pago é a fonte padrão da operação; também cobre os leads com sessão de IA/n8n.
      key = 'meta'
    }
    buckets[key].leads++
    if (d.status === 'WON') {
      buckets[key].deals++
      buckets[key].receita += d.valorEstimado
    }
  })

  return [buckets.meta, buckets.google, buckets.social, buckets.indicacao, buckets.whatsapp]
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenges (CRUD)
// ─────────────────────────────────────────────────────────────────────────────
export interface ChallengeInput {
  titulo: string
  descricao?: string | null
  metrica: string
  alvo: number
  inicio: Date
  fim: Date
  recompensa?: string | null
  ownerUserId?: string | null
}

export async function getChallenges() {
  const auth = await requireAuth()
  return prisma.desafioChallenge.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function saveChallenge(input: ChallengeInput, id?: string) {
  const auth = await requireAuth()
  const data = {
    titulo: input.titulo,
    descricao: input.descricao ?? null,
    metrica: input.metrica,
    alvo: input.alvo,
    inicio: input.inicio,
    fim: input.fim,
    recompensa: input.recompensa ?? null,
    ownerUserId: input.ownerUserId ?? null,
  }
  if (id) {
    await prisma.desafioChallenge.updateMany({ where: { id, userId: auth.userId }, data })
    return { success: true, id }
  }
  const created = await prisma.desafioChallenge.create({ data: { userId: auth.userId, ...data } })
  return { success: true, id: created.id }
}

export async function updateChallengeStatus(id: string, status: 'ATIVO' | 'CONCLUIDO' | 'FALHOU') {
  const auth = await requireAuth()
  await prisma.desafioChallenge.updateMany({ where: { id, userId: auth.userId }, data: { status } })
  return { success: true }
}

export async function deleteChallenge(id: string) {
  const auth = await requireAuth()
  await prisma.desafioChallenge.deleteMany({ where: { id, userId: auth.userId } })
  return { success: true }
}

/** Progresso de cada challenge ativo, calculado na sua própria janela de datas. */
export async function getChallengesProgress() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rules = await getDesafiosRules()
  const challenges = await prisma.desafioChallenge.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' },
  })

  const out = []
  for (const c of challenges) {
    const m = await computeMetrics(scope, c.inicio, c.fim, rules, { ownerUserId: c.ownerUserId })
    const realizado = (m as any)[c.metrica] ?? 0
    const menorMelhor = METRICAS_MENOR_MELHOR.includes(c.metrica)
    const pctAtingido = menorMelhor
      ? c.alvo > 0 ? Math.round(Math.min((c.alvo / (realizado || c.alvo)) * 100, 999)) : 0
      : c.alvo > 0 ? Math.round((realizado / c.alvo) * 100) : 0
    const now = new Date()
    const diasRestantes = Math.max(Math.ceil((c.fim.getTime() - now.getTime()) / 86400000), 0)
    out.push({ ...c, realizado, pctAtingido, diasRestantes, concluido: pctAtingido >= 100 })
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak (dias consecutivos com vendas)
// ─────────────────────────────────────────────────────────────────────────────
export interface StreakResult {
  atual: number
  recorde: number
  hojeTemVenda: boolean
  ultimosDias: { data: string; vendas: number }[]
}

export async function getStreak(ownerUserId?: string | null): Promise<StreakResult> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const dias = 90
  const now = new Date()
  const inicio = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dias + 1, 0, 0, 0, 0)

  const dealBase = buildDealBase(scope, { ownerUserId })

  const vendas = await prisma.deal.findMany({
    where: { ...dealBase, status: 'WON', fechadoEm: { gte: inicio, lte: now } },
    select: { fechadoEm: true },
  })

  // Bucket por dia local (YYYY-MM-DD)
  const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const buckets: Record<string, number> = {}
  vendas.forEach((v) => { if (v.fechadoEm) buckets[key(v.fechadoEm)] = (buckets[key(v.fechadoEm)] || 0) + 1 })

  const ultimosDias: { data: string; vendas: number }[] = []
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
    ultimosDias.push({ data: key(d), vendas: buckets[key(d)] || 0 })
  }

  // Recorde: maior sequência de dias com venda no período
  let recorde = 0
  let run = 0
  ultimosDias.forEach((d) => {
    if (d.vendas > 0) { run++; recorde = Math.max(recorde, run) } else { run = 0 }
  })

  // Streak atual: conta para trás a partir de hoje (com carência: se hoje=0, começa de ontem)
  const hojeKey = key(now)
  const hojeTemVenda = (buckets[hojeKey] || 0) > 0
  let atual = 0
  let startIdx = ultimosDias.length - 1
  if (!hojeTemVenda) startIdx-- // carência do dia corrente
  for (let i = startIdx; i >= 0; i--) {
    if (ultimosDias[i].vendas > 0) atual++
    else break
  }

  return { atual, recorde, hojeTemVenda, ultimosDias: ultimosDias.slice(-30) }
}

// ─────────────────────────────────────────────────────────────────────────────
// Motor de insights (recomendações acionáveis)
// ─────────────────────────────────────────────────────────────────────────────
export interface Insight {
  tipo: 'positivo' | 'alerta' | 'critico' | 'info'
  titulo: string
  descricao: string
}

export async function getInsights(startDate: Date, endDate: Date, filters: MetricFilters = {}) {
  const { atual, deltas } = await getMetricsComparison(startDate, endDate, filters)
  const insights: Insight[] = []

  // Taxa de comparecimento baixa
  if (atual.agendamentos >= 3 && atual.taxaComparecimento < 50) {
    insights.push({
      tipo: 'critico',
      titulo: 'Comparecimento abaixo do esperado',
      descricao: `Apenas ${atual.taxaComparecimento}% dos agendados compareceram. Reforce confirmação e lembretes antes da reunião.`,
    })
  }

  // Taxa de fechamento baixa com bom comparecimento
  if (atual.comparecimentos >= 3 && atual.taxaFechamento < 30) {
    insights.push({
      tipo: 'alerta',
      titulo: 'Conversão em venda pode melhorar',
      descricao: `${atual.taxaFechamento}% dos comparecimentos viraram venda. Revise a abordagem de fechamento e tratamento de objeções.`,
    })
  }

  // Vendas caindo vs período anterior
  if (deltas.vendas < -15) {
    insights.push({
      tipo: 'alerta',
      titulo: 'Vendas em queda',
      descricao: `Vendas caíram ${Math.abs(deltas.vendas)}% vs o período anterior. Verifique volume de agendamentos e comparecimento.`,
    })
  } else if (deltas.vendas > 15) {
    insights.push({
      tipo: 'positivo',
      titulo: 'Vendas em alta',
      descricao: `Vendas subiram ${deltas.vendas}% vs o período anterior. Mantenha o ritmo e o padrão de qualificação.`,
    })
  }

  // Taxa de resposta baixa
  if (atual.conversas >= 5 && atual.taxaResposta < 40) {
    insights.push({
      tipo: 'alerta',
      titulo: 'Baixo engajamento no WhatsApp',
      descricao: `Só ${atual.taxaResposta}% das conversas tiveram resposta no bot. Avalie o primeiro contato e o horário de abordagem.`,
    })
  }

  if (insights.length === 0) {
    insights.push({
      tipo: 'info',
      titulo: 'Operação estável',
      descricao: 'Nenhum alerta relevante no período. Defina metas para acompanhar seu progresso rumo aos objetivos.',
    })
  }

  return insights
}
