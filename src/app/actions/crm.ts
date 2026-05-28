'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DealPriority, ListaDisparoStatus, type Prisma } from '@prisma/client'
import type { Contact, Deal, Stage, Activity } from '@prisma/client'

type ContactRow = Contact
type DealRow = Deal & { contact?: Contact | null; stage?: Stage | null }
type ActivityRow = Activity & { deal?: DealRow | null; contact?: Contact | null }

type DealCreateInput = {
  contactId: string; pipelineId: string; stageId: string; titulo: string
  valorEstimado?: number | string; produtoInteresse?: string | null
  origem?: string | null; prioridade?: string; ownerUserId?: string | null
  telefone?: string; ramoEmpresa?: string | null; faturamentoMensal?: number | string
  utmSource?: string; utmMedium?: string; utmCampaign?: string
  utmContent?: string; utmTerm?: string; utmLandingPage?: string
  utmReferrer?: string; utmCapturedAt?: string
}
type DealUpdateInput = {
  titulo?: string; valorEstimado?: number | string; produtoInteresse?: string | null
  origem?: string | null; prioridade?: string; ownerUserId?: string | null
  stageId?: string; anotacoes?: string | null; anotacoesReuniao?: string | null
  ramoEmpresa?: string | null; faturamentoMensal?: number | string
}
type ActivityCreateInput = {
  ownerUserId?: string | null; dealId?: string | null; contactId?: string | null
  tipo: string; titulo: string; descricao?: string | null
  dueAt?: string | null; status?: string; doneAt?: string | null
}
type ActivityUpdateInput = {
  titulo?: string; descricao?: string | null; tipo?: string; status?: string
  dueAt?: string | null; doneAt?: string | null; ownerUserId?: string | null
}

async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ocr_auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return await verifyToken(token)
}

// Returns the userId of the current user plus all teammates
async function getTeamScope(userId: string): Promise<string[]> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  })
  if (memberships.length === 0) return [userId]
  const allMembers = await prisma.teamMember.findMany({
    where: { teamId: { in: memberships.map((m) => m.teamId) } },
    select: { userId: true },
  })
  return Array.from(new Set([userId, ...allMembers.map((m) => m.userId)]))
}

// ─── Helper: serialise Prisma Contact → MockContact-compatible plain object ───
function serializeContact(c: ContactRow) {
  const customRaw = c.camposCustomizados ? safeJsonParse(c.camposCustomizados, {}) : {}
  // Extra UI fields not present as first-class columns are stored in camposCustomizados
  const { _origem, _dataNascimento, ...camposCustomizados } = customRaw as Record<string, unknown>

  return {
    id: c.id,
    user_id: c.userId,
    nome: c.nome,
    sobrenome: c.sobrenome ?? undefined,
    email: c.email ?? undefined,
    telefone: c.telefone,
    cidade: c.cidade ?? undefined,
    estado: c.estado ?? undefined,
    documento: c.documento ?? undefined,
    origem: (_origem as string | undefined) ?? c.firstUtmSource ?? undefined,
    dataNascimento: (_dataNascimento as string | undefined) ?? undefined,
    tags: c.tags ? safeJsonParse<string[]>(c.tags, []) : [],
    enderecoCompleto: c.enderecoCompleto ? safeJsonParse(c.enderecoCompleto, {}) : {},
    camposCustomizados,
    fbMetadata: c.fbMetadata ? safeJsonParse(c.fbMetadata, {}) : {},
    consentimentoLgpd: c.consentimentoLgpd,
    firstUtmSource: c.firstUtmSource ?? undefined,
    firstUtmMedium: c.firstUtmMedium ?? undefined,
    firstUtmCampaign: c.firstUtmCampaign ?? undefined,
    firstUtmContent: c.firstUtmContent ?? undefined,
    firstUtmTerm: c.firstUtmTerm ?? undefined,
    firstLandingPage: c.firstLandingPage ?? undefined,
    firstUtmAt: c.firstUtmAt?.toISOString() ?? undefined,
    lastUtmSource: c.lastUtmSource ?? undefined,
    lastUtmMedium: c.lastUtmMedium ?? undefined,
    lastUtmCampaign: c.lastUtmCampaign ?? undefined,
    lastUtmContent: c.lastUtmContent ?? undefined,
    lastUtmTerm: c.lastUtmTerm ?? undefined,
    lastLandingPage: c.lastLandingPage ?? undefined,
    lastUtmAt: c.lastUtmAt?.toISOString() ?? undefined,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt?.toISOString() ?? c.createdAt.toISOString(),
  }
}

function serializeDeal(d: DealRow) {
  if (!d) throw new Error('Não é possível serializar um negócio nulo ou indefinido')
  return {
    id: d.id,
    pipelineId: d.pipelineId,
    stageId: d.stageId,
    contactId: d.contactId,
    userId: d.userId,
    ownerUserId: d.ownerUserId ?? undefined,
    ownerAssignedAt: d.createdAt.toISOString(),
    titulo: d.titulo,
    valorEstimado: d.valorEstimado,
    produtoInteresse: d.produtoInteresse ?? undefined,
    origem: d.origem ?? undefined,
    prioridade: d.prioridade,
    status: d.status,
    motivoPerda: d.motivoPerda ?? undefined,
    fechadoEm: d.fechadoEm?.toISOString() ?? undefined,
    telefone: d.telefone ?? undefined,
    ramoEmpresa: d.ramoEmpresa ?? undefined,
    faturamentoMensal: d.faturamentoMensal ?? undefined,
    utmSource: d.utmSource ?? undefined,
    utmMedium: d.utmMedium ?? undefined,
    utmCampaign: d.utmCampaign ?? undefined,
    utmContent: d.utmContent ?? undefined,
    utmTerm: d.utmTerm ?? undefined,
    utmLandingPage: d.utmLandingPage ?? undefined,
    utmReferrer: d.utmReferrer ?? undefined,
    utmCapturedAt: d.utmCapturedAt?.toISOString() ?? undefined,
    anotacoes: d.anotacoes ?? undefined,
    anotacoesReuniao: d.anotacoesReuniao ?? undefined,
    aiScore: d.aiScore,
    aiAnalysis: d.aiAnalysis ?? undefined,
    aiRecommendedAction: d.aiRecommendedAction ?? undefined,
    aiSessionId: d.aiSessionId ?? undefined,
    qualificationStatus: d.qualificationStatus ?? undefined,
    qualificationData: d.qualificationData ?? undefined,
    disqualificationReason: d.disqualificationReason ?? undefined,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt?.toISOString() ?? d.createdAt.toISOString(),
    contact: d.contact ? serializeContact(d.contact) : undefined,
    stage: d.stage ? {
      id: d.stage.id,
      pipelineId: d.stage.pipelineId,
      nome: d.stage.nome,
      cor: d.stage.cor,
      ordem: d.stage.ordem,
      probabilidade: d.stage.probabilidade,
      slaHours: d.stage.slaHours,
      createdAt: d.stage.createdAt.toISOString(),
      updatedAt: d.stage.updatedAt.toISOString(),
    } : undefined
  }
}

function serializeActivity(a: ActivityRow) {
  if (!a) throw new Error('Não é possível serializar uma atividade nula ou indefinida')
  return {
    id: a.id,
    userId: a.userId,
    ownerUserId: a.ownerUserId ?? undefined,
    dealId: a.dealId ?? undefined,
    contactId: a.contactId ?? undefined,
    tipo: a.tipo,
    titulo: a.titulo,
    descricao: a.descricao ?? undefined,
    dueAt: a.dueAt?.toISOString() ?? undefined,
    status: a.status,
    doneAt: a.doneAt?.toISOString() ?? undefined,
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt?.toISOString() ?? a.createdAt.toISOString(),
    deal: a.deal ? serializeDeal(a.deal) : undefined,
    contact: a.contact ? serializeContact(a.contact) : undefined
  }
}

function safeJsonParse<T>(str: string, fallback: T): T {
  try { return JSON.parse(str) as T } catch { return fallback }
}

// Normalise phone → digits, prepend 55 if missing
function normalizeTelefone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  return digits.length > 0 && !digits.startsWith('55') ? '55' + digits : digits
}

// ====== DASHBOARD / KPIs ======

export async function getPipelines() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.pipeline.findMany({
    where: { userId: { in: scope } },
    orderBy: { createdAt: 'asc' },
    take: 100,
  })
}

export async function getDashboardKpis(_period: string = '30d') {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const [totalDeals, wonDeals, totalValue, activePipelines, topCampaignsRaw] = await Promise.all([
    prisma.deal.count({ where: { userId: { in: scope } } }),
    prisma.deal.count({ where: { status: 'WON', userId: { in: scope } } }),
    prisma.deal.aggregate({
      where: { status: 'WON', userId: { in: scope } },
      _sum: { valorEstimado: true },
    }),
    prisma.pipeline.count({ where: { userId: { in: scope } } }),
    prisma.deal.groupBy({
      by: ['utmCampaign'],
      where: { userId: { in: scope }, NOT: { utmCampaign: null } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 5,
    }),
  ])

  const topCampaigns = topCampaignsRaw.map(c => ({
    campanha: c.utmCampaign || 'Sem Campanha',
    leads: c._count.id
  }))

  if (topCampaigns.length === 0) {
    topCampaigns.push({ campanha: 'Sem Campanha', leads: totalDeals })
  }

  return {
    totalRevenue: totalValue._sum.valorEstimado ?? 0,
    newLeads: totalDeals,
    wonDeals,
    winRate: totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0,
    activePipelines,
    stageCounts: [],
    topCampaigns,
  }
}

export async function getAllDeals() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.deal.findMany({
    where: { 
      OR: [
        { userId: { in: scope } },
        { ownerUserId: { in: scope } }
      ]
    },
    include: {
      contact: true,
      stage: { include: { pipeline: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  return rows.map(serializeDeal)
}

export async function getActivities() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.activity.findMany({
    where: { 
      OR: [
        { userId: { in: scope } },
        { ownerUserId: { in: scope } }
      ]
    },
    include: {
      deal: { include: { contact: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 150,
  })
  return rows.map(serializeActivity)
}

// ====== BUSSOLA / RELATÓRIOS ======

export async function getAiDealsOrdered() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.deal.findMany({
    where: { userId: { in: scope } },
    include: { contact: true },
    orderBy: { aiScore: 'desc' },
    take: 10,
  })
}

// ====== CONTACTS ======

export async function getContacts() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.contact.findMany({
    where: { 
      OR: [
        { userId: { in: scope } },
        { ownerUserId: { in: scope } }
      ]
    },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })
  return rows.map(serializeContact)
}

export type ContactInput = {
  nome: string
  sobrenome?: string
  email?: string
  telefone: string
  cidade?: string
  estado?: string
  documento?: string
  origem?: string
  dataNascimento?: string
  consentimentoLgpd?: boolean
  tags?: string[]
  enderecoCompleto?: Record<string, string | undefined>
  camposCustomizados?: Record<string, unknown>
  firstUtmSource?: string
  firstUtmMedium?: string
  firstUtmCampaign?: string
  firstUtmContent?: string
  firstUtmTerm?: string
  firstLandingPage?: string
  firstUtmAt?: string
  lastUtmSource?: string
  lastUtmMedium?: string
  lastUtmCampaign?: string
  lastUtmContent?: string
  lastUtmTerm?: string
  lastLandingPage?: string
  lastUtmAt?: string
}

export async function createContact(data: ContactInput) {
  const auth = await requireAuth()

  if (!data.nome || data.nome.trim().length < 2) {
    throw new Error('O nome do contato deve ter pelo menos 2 caracteres.')
  }

  const telefone = normalizeTelefone(data.telefone || '')

  // Merge extra UI-only fields into camposCustomizados JSON
  const camposCustomizados: Record<string, unknown> = { ...(data.camposCustomizados ?? {}) }
  if (data.origem) camposCustomizados['_origem'] = data.origem
  if (data.dataNascimento) camposCustomizados['_dataNascimento'] = data.dataNascimento

  const firstUtmSource = data.firstUtmSource ?? data.origem ?? undefined
  const now = new Date()

  const created = await prisma.contact.create({
    data: {
      userId: auth.userId,
      nome: data.nome.trim(),
      sobrenome: data.sobrenome?.trim() || null,
      email: data.email?.trim() || null,
      telefone,
      cidade: data.cidade?.trim() || null,
      estado: data.estado?.trim() || null,
      documento: data.documento?.trim() || null,
      consentimentoLgpd: data.consentimentoLgpd ?? false,
      tags: data.tags && data.tags.length > 0 ? JSON.stringify(data.tags) : null,
      enderecoCompleto: data.enderecoCompleto ? JSON.stringify(data.enderecoCompleto) : null,
      camposCustomizados: Object.keys(camposCustomizados).length > 0 ? JSON.stringify(camposCustomizados) : null,
      firstUtmSource: firstUtmSource ?? null,
      firstUtmMedium: data.firstUtmMedium ?? null,
      firstUtmCampaign: data.firstUtmCampaign ?? null,
      firstUtmContent: data.firstUtmContent ?? null,
      firstUtmTerm: data.firstUtmTerm ?? null,
      firstLandingPage: data.firstLandingPage ?? null,
      firstUtmAt: firstUtmSource ? (data.firstUtmAt ? new Date(data.firstUtmAt) : now) : null,
      lastUtmSource: firstUtmSource ?? null,
      lastUtmMedium: data.firstUtmMedium ?? null,
      lastUtmCampaign: data.firstUtmCampaign ?? null,
      lastUtmContent: data.firstUtmContent ?? null,
      lastUtmTerm: data.firstUtmTerm ?? null,
      lastLandingPage: data.firstLandingPage ?? null,
      lastUtmAt: firstUtmSource ? now : null,
    },
  })

  return serializeContact(created)
}

export async function updateContact(id: string, data: Partial<ContactInput>) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  // Verify ownership
  const existing = await prisma.contact.findFirst({ 
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    } 
  })
  if (!existing) throw new Error('Contato não encontrado.')

  // Resolve telefone
  const telefone = data.telefone !== undefined ? normalizeTelefone(data.telefone) : undefined

  // Merge camposCustomizados preserving existing data
  let camposCustomizados: Record<string, unknown> | undefined
  if (data.camposCustomizados !== undefined || data.origem !== undefined || data.dataNascimento !== undefined) {
    const existingCustom = existing.camposCustomizados ? safeJsonParse<Record<string, unknown>>(existing.camposCustomizados, {}) : {}
    camposCustomizados = { ...existingCustom, ...(data.camposCustomizados ?? {}) }
    if (data.origem !== undefined) camposCustomizados['_origem'] = data.origem
    if (data.dataNascimento !== undefined) camposCustomizados['_dataNascimento'] = data.dataNascimento
  }

  const updated = await prisma.contact.update({
    where: { id },
    data: {
      ...(data.nome !== undefined && { nome: data.nome.trim() }),
      ...(data.sobrenome !== undefined && { sobrenome: data.sobrenome?.trim() || null }),
      ...(data.email !== undefined && { email: data.email?.trim() || null }),
      ...(telefone !== undefined && { telefone }),
      ...(data.cidade !== undefined && { cidade: data.cidade?.trim() || null }),
      ...(data.estado !== undefined && { estado: data.estado?.trim() || null }),
      ...(data.documento !== undefined && { documento: data.documento?.trim() || null }),
      ...(data.consentimentoLgpd !== undefined && { consentimentoLgpd: data.consentimentoLgpd }),
      ...(data.tags !== undefined && { tags: data.tags.length > 0 ? JSON.stringify(data.tags) : null }),
      ...(data.enderecoCompleto !== undefined && { enderecoCompleto: JSON.stringify(data.enderecoCompleto) }),
      ...(camposCustomizados !== undefined && { camposCustomizados: JSON.stringify(camposCustomizados) }),
      // lastUtm fields
      ...(data.lastUtmSource !== undefined && { lastUtmSource: data.lastUtmSource }),
      ...(data.lastUtmMedium !== undefined && { lastUtmMedium: data.lastUtmMedium }),
      ...(data.lastUtmCampaign !== undefined && { lastUtmCampaign: data.lastUtmCampaign }),
      ...(data.lastUtmContent !== undefined && { lastUtmContent: data.lastUtmContent }),
      ...(data.lastUtmTerm !== undefined && { lastUtmTerm: data.lastUtmTerm }),
      ...(data.lastLandingPage !== undefined && { lastLandingPage: data.lastLandingPage }),
      ...(data.lastUtmAt !== undefined && { lastUtmAt: new Date(data.lastUtmAt) }),
    },
  })

  return serializeContact(updated)
}

export async function deleteContact(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.contact.findFirst({ 
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    } 
  })
  if (!existing) throw new Error('Contato não encontrado.')
  // Cascade via FK (deals, activities, trackingEvents have onDelete: Cascade)
  await prisma.contact.delete({ where: { id } })
}

export async function deleteContacts(ids: string[]) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  await prisma.contact.deleteMany({
    where: { 
      id: { in: ids }, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    },
  })
}

export async function getContactStats(contactId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  // Verify ownership
  const contact = await prisma.contact.findFirst({ 
    where: { 
      id: contactId, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    } 
  })
  if (!contact) return { wonDealsCount: 0, totalValue: 0, dealsCount: 0, activitiesCount: 0 }

  const [deals, activities] = await Promise.all([
    prisma.deal.findMany({ where: { contactId }, select: { status: true, valorEstimado: true } }),
    prisma.activity.count({ where: { contactId } }),
  ])

  const wonDeals = deals.filter((d) => d.status === 'WON')
  return {
    wonDealsCount: wonDeals.length,
    totalValue: wonDeals.reduce((s, d) => s + d.valorEstimado, 0),
    dealsCount: deals.length,
    activitiesCount: activities,
  }
}

export async function mergeContacts(primaryId: string, secondaryId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const [primary, secondary] = await Promise.all([
    prisma.contact.findFirst({ 
      where: { 
        id: primaryId, 
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
      } 
    }),
    prisma.contact.findFirst({ 
      where: { 
        id: secondaryId, 
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
      } 
    }),
  ])
  if (!primary || !secondary) throw new Error('Contatos não encontrados.')

  const primaryTags: string[] = primary.tags ? safeJsonParse(primary.tags, []) : []
  const secondaryTags: string[] = secondary.tags ? safeJsonParse(secondary.tags, []) : []
  const mergedTags = Array.from(new Set([...primaryTags, ...secondaryTags]))

  // Move all deals and activities from secondary to primary
  await prisma.$transaction([
    prisma.deal.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }),
    prisma.activity.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }),
    prisma.trackingEvent.updateMany({ where: { contactId: secondaryId }, data: { contactId: primaryId } }),
    prisma.contact.update({
      where: { id: primaryId },
      data: { tags: mergedTags.length > 0 ? JSON.stringify(mergedTags) : null },
    }),
    prisma.contact.delete({ where: { id: secondaryId } }),
  ])

  const merged = await prisma.contact.findUnique({ where: { id: primaryId } })
  return serializeContact(merged!)
}

// ====== DEALS ======

export async function getDeals(pipelineId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.deal.findMany({
    where: { 
      pipelineId, 
      OR: [
        { userId: { in: scope } },
        { ownerUserId: { in: scope } }
      ]
    },
    include: { contact: true, stage: true },
    orderBy: { createdAt: 'desc' },
    take: 200,
  })
  return rows.map(serializeDeal)
}

export async function getStages(pipelineId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.stage.findMany({
    where: { pipelineId, pipeline: { userId: { in: scope } } },
    orderBy: { ordem: 'asc' },
  })
}

export async function getAllHistory() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.dealStageHistory.findMany({
    where: { deal: { userId: { in: scope } } },
    orderBy: { mudouEm: 'asc' },
    take: 2000,
  })
  return rows.map(h => ({
    id: h.id,
    dealId: h.dealId,
    deStageId: h.deStageId,
    paraStageId: h.paraStageId,
    mudouEm: h.mudouEm.toISOString(),
    mudouPor: h.mudouPor,
    fonte: h.fonte
  }))
}

export async function createDeal(data: DealCreateInput) {
  const auth = await requireAuth()
  
  if (!data.contactId) {
    throw new Error('Todo negócio precisa estar vinculado a um contato.')
  }
  
  const contact = await prisma.contact.findFirst({
    where: { id: data.contactId }
  })
  if (!contact) {
    throw new Error('Contato vinculado não encontrado.')
  }
  
  const rawTelefone = contact.telefone || data.telefone || ''
  const telefone = rawTelefone.replace(/\D/g, '')
  const origem = data.origem || (telefone ? 'whatsapp' : 'manual')
  
  const created = await prisma.deal.create({
    data: {
      userId: auth.userId,
      pipelineId: data.pipelineId,
      stageId: data.stageId,
      contactId: data.contactId,
      ownerUserId: data.ownerUserId || null,
      titulo: data.titulo,
      valorEstimado: parseFloat(String(data.valorEstimado ?? 0)) || 0,
      produtoInteresse: data.produtoInteresse || null,
      origem,
      prioridade: data.prioridade || 'MEDIA',
      status: 'OPEN',
      telefone,
      ramoEmpresa: data.ramoEmpresa || null,
      faturamentoMensal: parseFloat(String(data.faturamentoMensal ?? 0)) || 0,
      utmSource: contact.firstUtmSource || data.utmSource || 'Tráfego Direto',
      utmMedium: contact.firstUtmMedium || data.utmMedium || '',
      utmCampaign: contact.firstUtmCampaign || data.utmCampaign || '',
      utmContent: contact.firstUtmSource ? '' : (data.utmContent || ''),
      utmTerm: data.utmTerm || '',
      utmLandingPage: data.utmLandingPage || '/',
      utmReferrer: data.utmReferrer || '',
      utmCapturedAt: contact.firstUtmAt || (data.utmCapturedAt ? new Date(data.utmCapturedAt) : new Date()),
    },
    include: { contact: true, stage: true }
  })
  
  await prisma.dealStageHistory.create({
    data: {
      deal: { connect: { id: created.id } },
      paraStage: { connect: { id: created.stageId } },
      mudouPor: 'Sistema',
      fonte: 'manual_form'
    }
  })
  
  return serializeDeal(created)
}

export async function updateDeal(id: string, data: DealUpdateInput) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const oldDeal = await prisma.deal.findFirst({
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!oldDeal) throw new Error('Negociação não encontrada')
  
  const oldStageId = oldDeal.stageId
  const newStageId = data.stageId
  
  const updated = await prisma.deal.update({
    where: { id },
    data: {
      ...(data.titulo !== undefined && { titulo: data.titulo }),
      ...(data.valorEstimado !== undefined && { valorEstimado: parseFloat(String(data.valorEstimado)) || 0 }),
      ...(data.produtoInteresse !== undefined && { produtoInteresse: data.produtoInteresse }),
      ...(data.origem !== undefined && { origem: data.origem }),
      ...(data.prioridade !== undefined && { prioridade: data.prioridade }),
      ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId || null }),
      ...(data.stageId !== undefined && { stageId: data.stageId }),
      ...(data.anotacoes !== undefined && { anotacoes: data.anotacoes }),
      ...(data.anotacoesReuniao !== undefined && { anotacoesReuniao: data.anotacoesReuniao }),
      ...(data.ramoEmpresa !== undefined && { ramoEmpresa: data.ramoEmpresa }),
      ...(data.faturamentoMensal !== undefined && { faturamentoMensal: parseFloat(String(data.faturamentoMensal)) || 0 }),
    },
    include: { contact: true, stage: true }
  })
  
  if (newStageId && oldStageId !== newStageId) {
    await prisma.dealStageHistory.create({
      data: {
        dealId: id,
        deStageId: oldStageId,
        paraStageId: newStageId,
        mudouPor: 'Vendedor',
        fonte: 'menu'
      }
    })
  }
  
  return serializeDeal(updated)
}

export async function moveDealStage(dealId: string, newStageId: string, source: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const deal = await prisma.deal.findFirst({
    where: { 
      id: dealId, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!deal) return
  
  const oldStageId = deal.stageId
  
  await prisma.deal.update({
    where: { id: dealId },
    data: { stageId: newStageId }
  })
  
  await prisma.dealStageHistory.create({
    data: {
      dealId,
      deStageId: oldStageId,
      paraStageId: newStageId,
      mudouPor: 'Vendedor',
      fonte: source
    }
  })
}

export async function closeDeal(dealId: string, status: 'WON' | 'LOST', motivoPerda?: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const deal = await prisma.deal.findFirst({
    where: { 
      id: dealId, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!deal) throw new Error('Negociação não encontrada')
  
  let normalizedReason = motivoPerda || ''
  if (status === 'LOST') {
    if (!motivoPerda) {
      throw new Error('Motivo de perda é obrigatório para fechar como perdido.')
    }
    
    const normalizeLossReason = (reason: string): string => {
      const normalized = reason.trim().toLowerCase();
      if (normalized.includes('desist') || normalized.includes('desiti') || normalized.includes('cancelar')) {
        return 'Desistência';
      }
      if (normalized.includes('contato') || normalized.includes('não atende') || normalized.includes('nao atende') || normalized.includes('desligou') || normalized.includes('sumiu') || normalized.includes('vácuo') || normalized.includes('vacuo')) {
        return 'Falta de contato';
      }
      if (normalized.includes('orçamento') || normalized.includes('orcamento') || normalized.includes('caro') || normalized.includes('preço') || normalized.includes('preco') || normalized.includes('dinheiro') || normalized.includes('sem verba') || normalized.includes('grana')) {
        return 'Falta de orçamento';
      }
      if (normalized.includes('público') || normalized.includes('publico') || normalized.includes('perfil') || normalized.includes('segmento') || normalized.includes('pequeno') || normalized.includes('grande')) {
        return 'Não é o público-alvo';
      }
      if (normalized.includes('concorrente') || normalized.includes('outro crm') || normalized.includes('outra soluc') || normalized.includes('outra ferramenta')) {
        return 'Foi para concorrente';
      }
      if (normalized.includes('timing') || normalized.includes('momento') || normalized.includes('depois') || normalized.includes('futuro') || normalized.includes('sem tempo')) {
        return 'Timing inadequado';
      }
      if (normalized.includes('interesse') || normalized.includes('não quer') || normalized.includes('nao quer') || normalized.includes('recusou')) {
        return 'Sem interesse';
      }
      return reason;
    }
    normalizedReason = normalizeLossReason(motivoPerda)
  }
  
  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: {
      status,
      motivoPerda: status === 'LOST' ? normalizedReason : null,
      fechadoEm: new Date(),
    },
    include: { contact: true, stage: true }
  })
  
  await prisma.dealStageHistory.create({
    data: {
      dealId,
      deStageId: deal.stageId,
      paraStageId: deal.stageId,
      mudouPor: 'Vendedor',
      fonte: status === 'WON' ? 'fechamento_ganho' : 'fechamento_perdido'
    }
  })
  
  return serializeDeal(updated)
}

export async function reopenDeal(dealId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const deal = await prisma.deal.findFirst({
    where: { 
      id: dealId, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!deal) throw new Error('Negociação não encontrada')
  
  const updated = await prisma.deal.update({
    where: { id: dealId },
    data: {
      status: 'OPEN',
      motivoPerda: null,
      fechadoEm: null,
    },
    include: { contact: true, stage: true }
  })
  
  await prisma.dealStageHistory.create({
    data: {
      dealId,
      deStageId: deal.stageId,
      paraStageId: deal.stageId,
      mudouPor: 'Vendedor',
      fonte: 'reabertura'
    }
  })
  
  return serializeDeal(updated)
}

export async function deleteDeal(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const deal = await prisma.deal.findFirst({
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!deal) throw new Error('Negociação não encontrada')
  
  await prisma.deal.delete({
    where: { id }
  })
}

export async function getDealStageHistory(dealId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const logs = await prisma.dealStageHistory.findMany({
    where: { 
      dealId, 
      deal: { 
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
      } 
    },
    include: { deStage: true, paraStage: true },
    orderBy: { mudouEm: 'asc' }
  })
  
  return logs.map(l => ({
    id: l.id,
    dealId: l.dealId,
    deStageId: l.deStageId,
    deStage: l.deStage?.nome || (l.deStageId ? 'Etapa Removida' : 'Etapa Inicial'),
    paraStageId: l.paraStageId,
    paraStage: l.paraStage.nome,
    mudouEm: l.mudouEm.toISOString(),
    mudouPor: l.mudouPor,
    fonte: l.fonte
  }))
}

export async function createActivity(data: ActivityCreateInput) {
  const auth = await requireAuth()
  
  const created = await prisma.activity.create({
    data: {
      userId: auth.userId,
      ownerUserId: data.ownerUserId || null,
      dealId: data.dealId || null,
      contactId: data.contactId || null,
      tipo: data.tipo,
      titulo: data.titulo,
      descricao: data.descricao || null,
      dueAt: data.dueAt ? new Date(data.dueAt) : null,
      status: data.status || 'OPEN',
      doneAt: data.doneAt ? new Date(data.doneAt) : null,
    },
    include: { deal: { include: { contact: true } }, contact: true }
  })
  
  return serializeActivity(created)
}

export async function updateActivity(id: string, data: ActivityUpdateInput) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const existing = await prisma.activity.findFirst({
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!existing) throw new Error('Atividade não encontrada.')
  
  const updated = await prisma.activity.update({
    where: { id },
    data: {
      ...(data.titulo !== undefined && { titulo: data.titulo }),
      ...(data.descricao !== undefined && { descricao: data.descricao }),
      ...(data.tipo !== undefined && { tipo: data.tipo }),
      ...(data.status !== undefined && { status: data.status }),
      ...(data.dueAt !== undefined && { dueAt: data.dueAt ? new Date(data.dueAt) : null }),
      ...(data.doneAt !== undefined && { doneAt: data.doneAt ? new Date(data.doneAt) : null }),
      ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId || null }),
    },
    include: { deal: { include: { contact: true } }, contact: true }
  })
  
  return serializeActivity(updated)
}

export async function deleteActivity(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const existing = await prisma.activity.findFirst({
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!existing) throw new Error('Atividade não encontrada.')
  
  await prisma.activity.delete({
    where: { id }
  })
}

export async function getReportOverviewData(
  pipelineId: string | null,
  start: string | null,
  end: string | null,
  ownerIds: string[]
) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const where: Prisma.DealWhereInput = {
    OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }],
    ...(pipelineId ? { pipelineId } : {}),
    ...(ownerIds.length > 0 ? { ownerUserId: { in: ownerIds } } : {}),
    ...((start || end) ? { createdAt: { ...(start ? { gte: new Date(start) } : {}), ...(end ? { lte: new Date(end) } : {}) } } : {}),
  }

  const [won, dealsPerdidos, leadsGerados] = await Promise.all([
    prisma.deal.findMany({ where: { ...where, status: 'WON' }, select: { valorEstimado: true, createdAt: true, fechadoEm: true } }),
    prisma.deal.count({ where: { ...where, status: 'LOST' } }),
    prisma.deal.count({ where }),
  ])

  const receitaTotal = won.reduce((s, d) => s + d.valorEstimado, 0)
  const dealsGanhos = won.length
  const taxaConversao = leadsGerados > 0 ? (dealsGanhos / leadsGerados) * 100 : 0
  const ticketMedio = dealsGanhos > 0 ? receitaTotal / dealsGanhos : 0
  const withCycle = won.filter(d => d.fechadoEm)
  const cicloMedioDias = withCycle.length > 0
    ? Math.round(withCycle.reduce((s, d) => s + (d.fechadoEm!.getTime() - d.createdAt.getTime()) / 86_400_000, 0) / withCycle.length)
    : 0

  return { receitaTotal, ticketMedio, leadsGerados, dealsGanhos, dealsPerdidos, cicloMedioDias, taxaConversao }
}

export async function getBussolaFontes() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  // groupBy aggregates at the DB level — avoids loading all deals into memory
  const grouped = await prisma.deal.groupBy({
    by: ['origem', 'status'],
    where: { OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] },
    _count: { id: true },
    _sum: { valorEstimado: true },
  })

  const groups: Record<string, { label: string; iconName: string; color: string; leads: number; deals: number; receita: number; custo: number }> = {}

  const defaults = [
    { key: 'meta', label: 'Meta Ads', iconName: 'Megaphone', color: '#60A5FA', custoPerLead: 15 },
    { key: 'google', label: 'Google Ads', iconName: 'Search', color: '#FFB300', custoPerLead: 20 },
    { key: 'whatsapp', label: 'WhatsApp / Orgânico', iconName: 'MessageCircle', color: '#00E676', custoPerLead: 0 },
    { key: 'indicacao', label: 'Indicação', iconName: 'Star', color: '#a855f7', custoPerLead: 0 },
    { key: 'site', label: 'Site / Direto', iconName: 'Globe', color: '#FF5722', custoPerLead: 0 }
  ]
  defaults.forEach(d => { groups[d.key] = { label: d.label, iconName: d.iconName, color: d.color, leads: 0, deals: 0, receita: 0, custo: 0 } })

  grouped.forEach(row => {
    const orig = row.origem
    const norm = (orig || '').trim().toLowerCase()
    let key = 'site'; let label = orig || 'Site / Direto'; let iconName = 'Globe'; let color = '#FF5722'; let custoPerLead = 0

    if (norm.includes('facebook') || norm.includes('instagram') || norm.includes('meta') || norm.includes('ads')) {
      key = 'meta'; label = 'Meta Ads'; iconName = 'Megaphone'; color = '#60A5FA'; custoPerLead = 15
    } else if (norm.includes('google') || norm.includes('search')) {
      key = 'google'; label = 'Google Ads'; iconName = 'Search'; color = '#FFB300'; custoPerLead = 20
    } else if (norm.includes('whatsapp') || norm.includes('whats') || norm.includes('organico') || norm.includes('orgânico')) {
      key = 'whatsapp'; label = 'WhatsApp / Orgânico'; iconName = 'MessageCircle'; color = '#00E676'; custoPerLead = 0
    } else if (norm.includes('indicacao') || norm.includes('indicação') || norm.includes('indicado')) {
      key = 'indicacao'; label = 'Indicação'; iconName = 'Star'; color = '#a855f7'; custoPerLead = 0
    } else if (orig) {
      key = norm.replace(/\s+/g, '_')
    }

    if (!groups[key]) { groups[key] = { label, iconName, color, leads: 0, deals: 0, receita: 0, custo: 0 } }

    const count = row._count.id
    groups[key].leads += count
    if (row.status === 'WON') { groups[key].deals += count; groups[key].receita += row._sum.valorEstimado ?? 0 }
    groups[key].custo += custoPerLead * count
  })

  return Object.entries(groups).map(([id, val]) => ({
    id,
    ...val
  }))
}

export async function getBussolaAlerts() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const fortyEightHoursAgo = new Date()
  fortyEightHoursAgo.setDate(fortyEightHoursAgo.getDate() - 2)

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [noFollowUpCount, newDealsCount, bestSellers, totalDeals, wonDeals] = await Promise.all([
    prisma.deal.count({
      where: {
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }],
        status: 'OPEN',
        prioridade: 'ALTA',
        updatedAt: { lte: fortyEightHoursAgo }
      }
    }),
    prisma.deal.count({
      where: {
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }],
        createdAt: { gte: sevenDaysAgo }
      }
    }),
    prisma.deal.groupBy({
      by: ['ownerUserId'],
      where: {
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }],
        status: 'WON',
        fechadoEm: { gte: thirtyDaysAgo }
      },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 1
    }),
    prisma.deal.count({ 
      where: { OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] } 
    }),
    prisma.deal.count({ 
      where: { 
        status: 'WON', 
        OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
      } 
    })
  ])

  const alerts = []

  if (noFollowUpCount > 0) {
    alerts.push({
      id: 1,
      type: 'warning',
      iconName: 'Clock',
      msg: `${noFollowUpCount} lead${noFollowUpCount > 1 ? 's' : ''} quente${noFollowUpCount > 1 ? 's' : ''} sem follow-up há mais de 48h`,
      action: 'Ver leads'
    })
  } else {
    alerts.push({
      id: 1,
      type: 'success',
      iconName: 'CheckCircle2',
      msg: 'Excelente! Todos os leads quentes têm acompanhamento em dia.',
      action: null
    })
  }

  const winRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0
  alerts.push({
    id: 2,
    type: 'info',
    iconName: 'TrendingUp',
    msg: `Taxa de conversão histórica do funil está em ${winRate.toFixed(1)}%`,
    action: null
  })

  if (newDealsCount === 0) {
    alerts.push({
      id: 3,
      type: 'danger',
      iconName: 'AlertCircle',
      msg: 'Alerta: 0 novos leads recebidos nos últimos 7 dias.',
      action: 'Ver pipeline'
    })
  } else {
    alerts.push({
      id: 3,
      type: 'success',
      iconName: 'CheckCircle2',
      msg: `${newDealsCount} novo${newDealsCount > 1 ? 's' : ''} lead${newDealsCount > 1 ? 's' : ''} recebido${newDealsCount > 1 ? 's' : ''} nos últimos 7 dias.`,
      action: null
    })
  }

  if (bestSellers.length > 0 && bestSellers[0].ownerUserId) {
    let name = 'Vendedor'
    const profile = await prisma.profile.findUnique({
      where: { userId: bestSellers[0].ownerUserId }
    })
    if (profile) {
      name = `${profile.nome} ${profile.sobrenome || ''}`.trim()
    }
    alerts.push({
      id: 4,
      type: 'success',
      iconName: 'CheckCircle2',
      msg: `${name} converteu ${bestSellers[0]._count.id} negócio${bestSellers[0]._count.id > 1 ? 's' : ''} em 30 dias — melhor performance`,
      action: null
    })
  } else {
    alerts.push({
      id: 4,
      type: 'info',
      iconName: 'AlertCircle',
      msg: 'Sem novos negócios fechados nos últimos 30 dias.',
      action: null
    })
  }

  return alerts
}

export async function getChatHistory(phone: string, dealId: string) {
  try {
    await requireAuth()
    const cleanPhone = phone.replace(/\D/g, '')
    const phonesToTry = [cleanPhone]
    if (cleanPhone.startsWith('55')) {
      phonesToTry.push(cleanPhone.substring(2))
    } else {
      phonesToTry.push('55' + cleanPhone)
    }

    try {
      const rows: any[] = await prisma.$queryRawUnsafe(
        `SELECT * FROM "n8n_chat_histories" 
         WHERE "session_id" = $1 OR "session_id" = $2
         ORDER BY "id" ASC`,
        phonesToTry[0],
        phonesToTry[1]
      )

      return rows.map(r => {
        const msg = typeof r.message === 'string' ? JSON.parse(r.message) : r.message
        const type = msg?.type
        const content = msg?.content || ''
        const sender = (type === 'human' || type === 'user') ? 'lead' : 'user'

        return {
          id: String(r.id),
          sender,
          text: content,
          time: ''
        }
      })
    } catch (dbErr) {
      // Table doesn't exist or query failed, fallback to AiConversationLog
      const logs = await prisma.aiConversationLog.findMany({
        where: { dealId },
        orderBy: { createdAt: 'asc' },
        take: 100
      })

      if (logs.length > 0) {
        return logs.map(l => ({
          id: l.id,
          sender: l.role === 'user' ? 'lead' : l.role === 'assistant' ? 'ai' : 'user',
          text: l.content,
          time: new Date(l.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }))
      }

      // Default mock messages
      return [
        { id: 'm1', sender: 'lead', text: 'Olá! Gostaria de saber mais sobre a implantação comercial.', time: '10:15' },
        { id: 'm2', sender: 'user', text: 'Olá, que ótimo! Qual o tamanho atual da sua equipe de vendas hoje?', time: '10:17' },
        { id: 'm3', sender: 'lead', text: 'Temos 4 vendedores ativos atualmente.', time: '10:20' },
        { id: 'm4', sender: 'ai', text: '🤖 Qualificado: BANT validado (Necessidade = Automação comercial, Orçamento = R$ 5k - 10k). Aline agendou chamada de demonstração.', time: '10:22' }
      ]
    }
  } catch (err) {
    console.error('Error fetching chat history:', err)
    return []
  }
}

// ====== MESSAGE TEMPLATES ======

export async function getTemplates() {
  const auth = await requireAuth()
  return prisma.messageTemplate.findMany({
    where: { userId: auth.userId },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createTemplate(data: { nome: string; categoria: string; corpo: string }) {
  const auth = await requireAuth()
  return prisma.messageTemplate.create({
    data: {
      userId: auth.userId,
      nome: data.nome,
      categoria: data.categoria,
      corpo: data.corpo
    }
  })
}

export async function updateTemplate(id: string, data: { nome?: string; categoria?: string; corpo?: string }) {
  const auth = await requireAuth()
  return prisma.messageTemplate.update({
    where: { id, userId: auth.userId },
    data
  })
}

export async function deleteTemplate(id: string) {
  const auth = await requireAuth()
  return prisma.messageTemplate.delete({
    where: { id, userId: auth.userId }
  })
}

// ====== LISTAS DE DISPARO ======

export async function getListasDisparo() {
  const auth = await requireAuth()
  return prisma.listaDisparo.findMany({
    where: { userId: auth.userId },
    include: {
      leads: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createListaDisparo(data: { nomeLista: string; descricao?: string; mensagemTemplate: string; configEnvio?: string }) {
  const auth = await requireAuth()
  return prisma.listaDisparo.create({
    data: {
      userId: auth.userId,
      nomeLista: data.nomeLista,
      descricao: data.descricao || null,
      mensagemTemplate: data.mensagemTemplate,
      status: 'ATIVA',
      configEnvio: data.configEnvio || null
    }
  })
}

export async function updateListaDisparo(id: string, data: { nomeLista?: string; descricao?: string; mensagemTemplate?: string; status?: ListaDisparoStatus; configEnvio?: string }) {
  const auth = await requireAuth()
  return prisma.listaDisparo.update({
    where: { id, userId: auth.userId },
    data
  })
}

export async function deleteListaDisparo(id: string) {
  const auth = await requireAuth()
  return prisma.listaDisparo.delete({
    where: { id, userId: auth.userId }
  })
}

export async function addLeadsToListaDisparo(listaId: string, itemIds: string[], type: 'deal' | 'contact') {
  const auth = await requireAuth()
  
  const list = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: auth.userId }
  })
  if (!list) throw new Error('Lista não encontrada')

  let leadsData: Array<{ nome: string; telefone: string; dealId?: string; contactId?: string }> = []

  if (type === 'deal') {
    const deals = await prisma.deal.findMany({
      where: { id: { in: itemIds }, userId: auth.userId },
      include: { contact: true }
    })
    leadsData = deals.map(d => ({
      nome: d.contact?.nome ? `${d.contact.nome} ${d.contact.sobrenome || ''}`.trim() : d.titulo,
      telefone: d.telefone || d.contact?.telefone || '',
      dealId: d.id
    }))
  } else {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: itemIds }, userId: auth.userId }
    })
    leadsData = contacts.map(c => ({
      nome: `${c.nome} ${c.sobrenome || ''}`.trim(),
      telefone: c.telefone,
      contactId: c.id
    }))
  }

  leadsData = leadsData.filter(l => l.telefone)

  const created = await Promise.all(
    leadsData.map(l => prisma.leadListaDisparo.create({
      data: {
        listaId,
        dealId: l.dealId || null,
        leadId: l.contactId || null,
        nomeSnapshot: l.nome,
        telefoneSnapshot: l.telefone.replace(/\D/g, ''),
        mensagemFinal: list.mensagemTemplate
      }
    }))
  )

  await prisma.listaDisparo.update({
    where: { id: listaId },
    data: {
      totalLeads: {
        increment: created.length
      }
    }
  })

  return created.length
}

// ====== CADENCIAS ======

export async function getCadencias() {
  const auth = await requireAuth()
  return prisma.cadencia.findMany({
    where: { userId: auth.userId },
    include: {
      etapas: true,
      leads: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createCadence(data: { 
  nome: string; 
  tipo: string; 
  webhookUrl?: string; 
  pipelineId?: string; 
  status?: string; 
  etapas: Array<{ ordem: number; prazoValor: number; prazoUnidade: string; mensagem: string; templateId?: string; pararAoResponder?: boolean }> 
}) {
  const auth = await requireAuth()
  
  return prisma.cadencia.create({
    data: {
      userId: auth.userId,
      nome: data.nome,
      tipo: data.tipo,
      webhookUrl: data.webhookUrl || null,
      pipelineId: data.pipelineId || null,
      status: data.status || 'ATIVO',
      etapas: {
        create: data.etapas.map(e => ({
          ordem: e.ordem,
          prazoValor: e.prazoValor,
          prazoUnidade: e.prazoUnidade,
          mensagem: e.mensagem,
          templateId: e.templateId || null,
          pararAoResponder: e.pararAoResponder ?? true
        }))
      }
    },
    include: {
      etapas: true
    }
  })
}

export async function updateCadence(id: string, data: { 
  nome?: string; 
  tipo?: string; 
  webhookUrl?: string; 
  pipelineId?: string; 
  status?: string; 
  etapas?: Array<{ id?: string; ordem: number; prazoValor: number; prazoUnidade: string; mensagem: string; templateId?: string; pararAoResponder?: boolean }> 
}) {
  const auth = await requireAuth()
  
  const updateData: Prisma.CadenciaUpdateInput = {
    ...(data.nome !== undefined && { nome: data.nome }),
    ...(data.tipo !== undefined && { tipo: data.tipo }),
    ...(data.webhookUrl !== undefined && { webhookUrl: data.webhookUrl || null }),
    ...(data.pipelineId !== undefined && { pipelineId: data.pipelineId || null }),
    ...(data.status !== undefined && { status: data.status })
  }

  if (data.etapas !== undefined) {
    await prisma.cadenciaEtapa.deleteMany({
      where: { cadenciaId: id }
    })
    
    updateData.etapas = {
      create: data.etapas.map(e => ({
        ordem: e.ordem,
        prazoValor: e.prazoValor,
        prazoUnidade: e.prazoUnidade,
        mensagem: e.mensagem,
        templateId: e.templateId || null,
        pararAoResponder: e.pararAoResponder ?? true
      }))
    }
  }

  return prisma.cadencia.update({
    where: { id, userId: auth.userId },
    data: updateData,
    include: {
      etapas: true
    }
  })
}

export async function deleteCadence(id: string) {
  const auth = await requireAuth()
  return prisma.cadencia.delete({
    where: { id, userId: auth.userId }
  })
}

export async function addLeadsToCadence(cadenceId: string, itemIds: string[], type: 'deal' | 'contact') {
  const auth = await requireAuth()
  
  const cadence = await prisma.cadencia.findFirst({
    where: { id: cadenceId, userId: auth.userId },
    include: { etapas: true }
  })
  if (!cadence) throw new Error('Cadência não encontrada')
  if (cadence.etapas.length === 0) throw new Error('Esta cadência não possui etapas configuradas.')

  const firstStage = cadence.etapas.sort((a, b) => a.ordem - b.ordem)[0]

  let proximoEnvio = new Date()
  if (firstStage.prazoValor > 0) {
    const val = firstStage.prazoValor
    const unit = firstStage.prazoUnidade
    if (unit === 'horas') {
      proximoEnvio.setHours(proximoEnvio.getHours() + val)
    } else if (unit === 'dias') {
      proximoEnvio.setDate(proximoEnvio.getDate() + val)
    } else if (unit === 'semanas') {
      proximoEnvio.setDate(proximoEnvio.getDate() + val * 7)
    }
  }

  const cadenceTag = `em-cadencia-${cadence.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`

  // Batch dedup check
  const existingIds = new Set<string>()
  if (type === 'deal') {
    const rows = await prisma.cadenciaLead.findMany({ where: { cadenciaId: cadenceId, status: 'ATIVO', dealId: { in: itemIds } }, select: { dealId: true } })
    rows.forEach(r => { if (r.dealId) existingIds.add(r.dealId) })
  } else {
    const rows = await prisma.cadenciaLead.findMany({ where: { cadenciaId: cadenceId, status: 'ATIVO', leadId: { in: itemIds } }, select: { leadId: true } })
    rows.forEach(r => { if (r.leadId) existingIds.add(r.leadId) })
  }
  const newIds = itemIds.filter(id => !existingIds.has(id))
  if (newIds.length === 0) return 0

  // Batch create
  await prisma.cadenciaLead.createMany({
    data: newIds.map(id => type === 'deal'
      ? { cadenciaId: cadenceId, dealId: id, etapaAtual: 1, status: 'ATIVO', proximoEnvio }
      : { cadenciaId: cadenceId, leadId: id, etapaAtual: 1, status: 'ATIVO', proximoEnvio }
    ),
  })

  // Batch tag deals
  if (type === 'deal') {
    const deals = await prisma.deal.findMany({ where: { id: { in: newIds } }, select: { id: true, tags: true } })
    await Promise.all(
      deals
        .filter(d => { const t: string[] = safeJsonParse(d.tags ?? '', []); return !t.includes(cadenceTag) })
        .map(d => { const t: string[] = safeJsonParse(d.tags ?? '', []); t.push(cadenceTag); return prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(t) } }) })
    )
  }

  return newIds.length
}

export async function getCadenceDashboard(cadenceId: string) {
  const auth = await requireAuth()
  
  const cadence = await prisma.cadencia.findFirst({
    where: { id: cadenceId, userId: auth.userId },
    include: { etapas: true, leads: { include: { deal: { include: { contact: true } } } } }
  })
  if (!cadence) throw new Error('Cadência não encontrada')

  // leadId stores Contact IDs (legacy convention) — batch-fetch in one query
  const leadContactIds = cadence.leads.filter(l => l.leadId).map(l => l.leadId!)
  const contactMap = leadContactIds.length > 0
    ? new Map((await prisma.contact.findMany({ where: { id: { in: leadContactIds } } })).map(c => [c.id, c]))
    : new Map<string, Contact>()

  const activeLeads = cadence.leads.filter(l => l.status === 'ATIVO')
  const stageCounts: Record<number, number> = {}
  cadence.etapas.forEach(e => { stageCounts[e.ordem] = 0 })
  activeLeads.forEach(l => { stageCounts[l.etapaAtual] = (stageCounts[l.etapaAtual] || 0) + 1 })

  const totalCompleted = cadence.leads.filter(l => l.status === 'CONCLUIDA').length
  const totalStopped = cadence.leads.filter(l => l.status === 'RESPONDIDA').length

  const leadsList = cadence.leads.map(l => {
    let nome = 'Lead'; let telefone = ''
    if (l.deal) {
      nome = l.deal.contact?.nome ? `${l.deal.contact.nome} ${l.deal.contact.sobrenome || ''}`.trim() : l.deal.titulo
      telefone = l.deal.telefone || l.deal.contact?.telefone || ''
    } else if (l.leadId) {
      const c = contactMap.get(l.leadId)
      if (c) { nome = `${c.nome} ${c.sobrenome || ''}`.trim(); telefone = c.telefone }
    }
    return { id: l.id, nome, telefone, etapaAtual: l.etapaAtual, status: l.status, proximoEnvio: l.proximoEnvio ? l.proximoEnvio.toISOString() : null, updatedAt: l.updatedAt.toISOString() }
  })

  return {
    totalAtivos: activeLeads.length,
    etapas: stageCounts,
    totalConcluidos: totalCompleted,
    totalParados: totalStopped,
    leads: leadsList
  }
}

export async function updateCadenceLeadStatus(cadenceLeadId: string, status: string) {
  const auth = await requireAuth()
  const lead = await prisma.cadenciaLead.findFirst({
    where: { id: cadenceLeadId },
    include: { cadencia: true }
  })
  if (!lead || lead.cadencia.userId !== auth.userId) {
    throw new Error('Lead de cadência não encontrado ou permissão negada')
  }

  const updated = await prisma.cadenciaLead.update({
    where: { id: cadenceLeadId },
    data: { status }
  })

  // Remove cadence tag when lead stops (RESPONDIDA, CONCLUIDA, PAUSADA)
  if (['RESPONDIDA', 'CONCLUIDA', 'PAUSADA'].includes(status) && lead.dealId) {
    const cadenceTag = `em-cadencia-${lead.cadencia.nome.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}`
    const deal = await prisma.deal.findUnique({ where: { id: lead.dealId } })
    if (deal) {
      let tags: string[] = []
      try { tags = deal.tags ? JSON.parse(deal.tags as string) : [] } catch { tags = [] }
      const filtered = tags.filter(t => t !== cadenceTag)
      if (filtered.length !== tags.length) {
        await prisma.deal.update({ where: { id: lead.dealId }, data: { tags: JSON.stringify(filtered) } })
      }
    }
  }

  return updated
}

export async function removeLeadFromCadence(cadenceLeadId: string) {
  const auth = await requireAuth()
  const lead = await prisma.cadenciaLead.findFirst({
    where: { id: cadenceLeadId },
    include: { cadencia: true }
  })
  if (!lead || lead.cadencia.userId !== auth.userId) {
    throw new Error('Lead de cadência não encontrado ou permissão negada')
  }

  return prisma.cadenciaLead.delete({
    where: { id: cadenceLeadId }
  })
}

// ====== TEAM USERS (real DB) ======

export async function getTeamUsers() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const profiles = await prisma.profile.findMany({
    where: { userId: { in: scope } },
    select: {
      userId: true,
      nome: true,
      sobrenome: true,
      avatarUrl: true,
      user: {
        select: { email: true }
      }
    }
  })

  return profiles.map(p => ({
    id: p.userId,
    nome: p.nome,
    sobrenome: p.sobrenome ?? undefined,
    email: p.user?.email ?? undefined,
    avatarUrl: p.avatarUrl ?? undefined,
  }))
}

// ====== SEGMENTOS (stored in segmentos table) ======

export type SegmentoRegra =
  | { tipo: 'sem_resposta'; horasMin: number }
  | { tipo: 'negocios_perdidos'; motivoPerda?: string }
  | { tipo: 'etapa_especifica'; stageId: string; horasMin?: number }
  | { tipo: 'leads_frios'; diasSemAtividade: number }
  | { tipo: 'prioridade'; prioridade: string }
  | { tipo: 'origem'; origem: string }
  | { tipo: 'sem_responsavel' }

export type SegmentoItem = {
  id: string
  nome: string
  descricao: string
  regras: SegmentoRegra[]
  prioridade?: string
  tipo?: string
  createdAt: string
}

export async function getSegmentos(): Promise<SegmentoItem[]> {
  const auth = await requireAuth()
  const rows = await prisma.segmento.findMany({
    where: {
      OR: [
        { userId: null },
        { userId: auth.userId }
      ]
    },
    orderBy: [
      { tipo: 'asc' },
      { createdAt: 'asc' }
    ]
  })
  return rows.map(r => ({
    id: r.id,
    nome: r.nome,
    descricao: r.descricao || '',
    regras: safeJsonParse<SegmentoRegra[]>(r.filtros, []),
    prioridade: r.prioridade || undefined,
    tipo: r.tipo,
    createdAt: r.createdAt.toISOString()
  }))
}

export async function createSegmento(data: {
  nome: string
  descricao: string
  regras: SegmentoRegra[]
  pipelineId?: string
}): Promise<SegmentoItem> {
  const auth = await requireAuth()
  const row = await prisma.segmento.create({
    data: {
      userId: auth.userId,
      nome: data.nome,
      descricao: data.descricao || '',
      tipo: 'personalizado',
      filtros: JSON.stringify(data.regras)
    }
  })
  return {
    id: row.id,
    nome: row.nome,
    descricao: row.descricao || '',
    regras: safeJsonParse<SegmentoRegra[]>(row.filtros, []),
    tipo: row.tipo,
    createdAt: row.createdAt.toISOString()
  }
}

export async function updateSegmento(id: string, data: Partial<{ nome: string; descricao: string; regras: SegmentoRegra[]; pipelineId: string }>): Promise<SegmentoItem> {
  const auth = await requireAuth()
  const existing = await prisma.segmento.findFirst({
    where: { id, userId: auth.userId }
  })
  if (!existing) throw new Error('Segmento não encontrado ou sem permissão para editar')
  const updated = await prisma.segmento.update({
    where: { id },
    data: {
      ...(data.nome !== undefined && { nome: data.nome }),
      ...(data.descricao !== undefined && { descricao: data.descricao }),
      ...(data.regras !== undefined && { filtros: JSON.stringify(data.regras) })
    }
  })
  return {
    id: updated.id,
    nome: updated.nome,
    descricao: updated.descricao || '',
    regras: safeJsonParse<SegmentoRegra[]>(updated.filtros, []),
    prioridade: updated.prioridade || undefined,
    tipo: updated.tipo,
    createdAt: updated.createdAt.toISOString()
  }
}

export async function deleteSegmento(id: string): Promise<void> {
  const auth = await requireAuth()
  const existing = await prisma.segmento.findFirst({
    where: { id, userId: auth.userId }
  })
  if (!existing) throw new Error('Segmento não encontrado ou sem permissão para remover')
  await prisma.segmento.delete({ where: { id } })
}

// Internal: run rules against DB and return raw IDs
async function runSegmentoRegras(
  regras: SegmentoRegra[],
  scope: string[]
): Promise<{ dealIds: string[]; contactIds: string[] }> {
  const results = await Promise.all(regras.map(async (regra) => {
    const sel = { id: true, contactId: true }
    let deals: { id: string; contactId: string }[] = []

    if (regra.tipo === 'sem_resposta') {
      const cutoff = new Date(); cutoff.setHours(cutoff.getHours() - regra.horasMin)
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'OPEN', updatedAt: { lte: cutoff } }, select: sel })
    } else if (regra.tipo === 'negocios_perdidos') {
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'LOST', ...(regra.motivoPerda ? { motivoPerda: regra.motivoPerda } : {}) }, select: sel })
    } else if (regra.tipo === 'etapa_especifica') {
      const w: Prisma.DealWhereInput = { userId: { in: scope }, status: 'OPEN', stageId: regra.stageId }
      if (regra.horasMin) { const c = new Date(); c.setHours(c.getHours() - regra.horasMin); w.updatedAt = { lte: c } }
      deals = await prisma.deal.findMany({ where: w, select: sel })
    } else if (regra.tipo === 'leads_frios') {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - regra.diasSemAtividade)
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'OPEN', updatedAt: { lte: cutoff } }, select: sel })
    } else if (regra.tipo === 'prioridade') {
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'OPEN', prioridade: regra.prioridade as DealPriority }, select: sel })
    } else if (regra.tipo === 'origem') {
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'OPEN', origem: regra.origem }, select: sel })
    } else if (regra.tipo === 'sem_responsavel') {
      deals = await prisma.deal.findMany({ where: { userId: { in: scope }, status: 'OPEN', ownerUserId: null }, select: sel })
    }
    return { dealIds: deals.map(d => d.id), contactIds: deals.map(d => d.contactId) }
  }))

  return {
    dealIds: Array.from(new Set(results.flatMap(r => r.dealIds))),
    contactIds: Array.from(new Set(results.flatMap(r => r.contactIds))),
  }
}

export async function evaluateSegmento(segmentoId: string): Promise<{ dealIds: string[]; contactIds: string[]; count: number }> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const segmentos = await getSegmentos()
  const seg = segmentos.find(s => s.id === segmentoId)
  if (!seg) throw new Error('Segmento não encontrado')
  const result = await runSegmentoRegras(seg.regras, scope)
  return { ...result, count: Math.max(result.dealIds.length, result.contactIds.length) }
}

// Returns last message timestamp per phone (map: phone -> {time, isRecent})
export async function getLastMessagesForPhones(phones: string[]): Promise<Record<string, { time: string; isRecent: boolean }>> {
  if (phones.length === 0) return {}
  try {
    await requireAuth()
    const cleanPhones = phones.map(p => p.replace(/\D/g, '')).filter(Boolean)
    if (cleanPhones.length === 0) return {}

    // Build phone variants (with/without 55 prefix)
    const allVariants = Array.from(new Set(
      cleanPhones.flatMap(p => {
        const variants = [p]
        if (p.startsWith('55')) variants.push(p.substring(2))
        else variants.push('55' + p)
        return variants
      })
    ))

    const placeholders = allVariants.map((_, i) => `$${i + 1}`).join(',')
    const rows: Array<{ session_id: string; created_at: Date | null }> = await prisma.$queryRawUnsafe(
      `SELECT DISTINCT ON ("session_id") "session_id", "created_at"
       FROM "n8n_chat_histories"
       WHERE "session_id" IN (${placeholders})
       ORDER BY "session_id", "created_at" DESC`,
      ...allVariants
    )

    const result: Record<string, { time: string; isRecent: boolean }> = {}
    const oneHourAgo = Date.now() - 60 * 60 * 1000

    for (const row of rows) {
      const ts = row.created_at ? new Date(row.created_at).getTime() : 0
      const timeStr = row.created_at
        ? new Date(row.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        : ''
      const entry = { time: timeStr, isRecent: ts > oneHourAgo }

      // Map back to original phone variants
      const sid = row.session_id
      cleanPhones.forEach(orig => {
        if (sid === orig || sid === orig.replace(/^55/, '') || sid === '55' + orig) {
          result[orig] = entry
        }
      })
    }
    return result
  } catch {
    return {}
  }
}

// Returns dealIds that are currently in an active cadence
export async function getActiveDealsInCadences(): Promise<string[]> {
  try {
    await requireAuth()
    const leads = await prisma.cadenciaLead.findMany({
      where: { status: 'ATIVO', dealId: { not: null } },
      select: { dealId: true }
    })
    return leads.map(l => l.dealId!).filter(Boolean)
  } catch {
    return []
  }
}

export type DealPreview = {
  id: string
  titulo: string
  contato: string
  telefone: string
  stage: string
  updatedAt: string
}

export async function getSegmentoDealsPreview(segmentoId: string): Promise<DealPreview[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const segmentos = await getSegmentos()
  const seg = segmentos.find(s => s.id === segmentoId)
  if (!seg) throw new Error('Segmento não encontrado')

  const { dealIds } = await runSegmentoRegras(seg.regras, scope)
  if (dealIds.length === 0) return []

  const deals = await prisma.deal.findMany({
    where: { id: { in: dealIds } },
    include: { contact: true, stage: true },
    orderBy: { updatedAt: 'asc' },
    take: 100
  })

  return deals.map(d => ({
    id: d.id,
    titulo: d.titulo,
    contato: d.contact ? `${d.contact.nome} ${d.contact.sobrenome || ''}`.trim() : d.titulo,
    telefone: d.telefone || d.contact?.telefone || '',
    stage: d.stage.nome,
    updatedAt: d.updatedAt.toISOString()
  }))
}

