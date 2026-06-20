'use server'

import { cookies } from 'next/headers'
import { after } from 'next/server'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { DealPriority } from '@prisma/client'

async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ocr_auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return await verifyToken(token)
}

// Returns the userId of the current user plus all teammates (or just the user if restricted)
export async function getTeamScope(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { roles: true, permissions: true }
  })
  if (!user) return [userId]

  const isAdmin = user.roles.some(r => r.role === 'ADMIN')
  const canViewAll = user.permissions.some(p => p.feature === 'view-all-deals' && p.allowed)

  // If not admin and doesn't have view-all-deals permission, restrict to own data
  if (!isAdmin && !canViewAll) {
    return [userId]
  }

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

export async function getCurrentUser() {
  const auth = await requireAuth()
  const user = await prisma.user.findUnique({
    where: { id: auth.userId },
    include: { roles: true }
  })
  if (!user) throw new Error('Usuário não encontrado')
  return {
    id: user.id,
    email: user.email,
    roles: user.roles.map(r => r.role),
    isAdmin: user.roles.some(r => r.role === 'ADMIN')
  }
}

// ─── Helper: serialise Prisma Contact → MockContact-compatible plain object ───
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeContact(c: any) {
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

function serializeDeal(d: any) {
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
    tags: d.tags ?? undefined,
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

function serializeActivity(a: any) {
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

export async function getArchivedDeals() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.deal.findMany({
    where: { 
      OR: [
        { userId: { in: scope } },
        { ownerUserId: { in: scope } }
      ],
      status: { in: ['WON', 'LOST'] }
    },
    include: {
      contact: true,
      stage: { include: { pipeline: true } },
    },
    orderBy: { fechadoEm: 'desc' },
    take: 500,
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

export async function getAllStages() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.stage.findMany({
    where: { pipeline: { userId: { in: scope } } },
    orderBy: { ordem: 'asc' },
  })
}

export async function createPipeline(nome: string) {
  const auth = await requireAuth()
  let team = await prisma.team.findFirst({
    where: { members: { some: { userId: auth.userId } } }
  })
  if (!team) {
    team = await prisma.team.create({
      data: {
        nome: 'Meu Time',
        members: {
          create: {
            userId: auth.userId,
            role: 'ADMIN'
          }
        }
      }
    })
  }
  const count = await prisma.pipeline.count({
    where: { userId: auth.userId }
  })
  return prisma.pipeline.create({
    data: {
      userId: auth.userId,
      teamId: team.id,
      nome,
      isDefault: count === 0,
      ordem: count,
      ativo: true
    }
  })
}

export async function updatePipeline(id: string, data: any) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.pipeline.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Funil não encontrado')
  return prisma.pipeline.update({
    where: { id },
    data: {
      ...(data.nome !== undefined && { nome: data.nome }),
      ...(data.ativo !== undefined && { ativo: data.ativo }),
      ...(data.isDefault !== undefined && { isDefault: data.isDefault }),
      ...(data.ordem !== undefined && { ordem: data.ordem })
    }
  })
}

export async function deletePipeline(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const pipeline = await prisma.pipeline.findFirst({
    where: { id, userId: { in: scope } }
  })
  if (!pipeline) throw new Error('Funil não encontrado')

  await prisma.pipeline.delete({
    where: { id }
  })

  if (pipeline.isDefault) {
    const first = await prisma.pipeline.findFirst({
      where: { userId: auth.userId }
    })
    if (first) {
      await prisma.pipeline.update({
        where: { id: first.id },
        data: { isDefault: true }
      })
    }
  }
}

export async function setDefaultPipeline(pipelineId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  await prisma.$transaction([
    prisma.pipeline.updateMany({
      where: { userId: { in: scope } },
      data: { isDefault: false }
    }),
    prisma.pipeline.update({
      where: { id: pipelineId },
      data: { isDefault: true }
    })
  ])
}

export async function createStage(data: any) {
  const auth = await requireAuth()
  const count = await prisma.stage.count({
    where: { pipelineId: data.pipelineId }
  })
  const created = await prisma.stage.create({
    data: {
      pipelineId: data.pipelineId,
      nome: data.nome,
      cor: data.cor,
      probabilidade: parseInt(data.probabilidade) || 0,
      slaHours: parseInt(data.slaHours) || 24,
      ordem: data.ordem !== undefined ? parseInt(data.ordem) : count + 1
    }
  })
  revalidatePath('/pipeline')
  revalidatePath('/settings')
  return created
}

export async function updateStage(id: string, data: any) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const stage = await prisma.stage.findFirst({
    where: { id, pipeline: { userId: { in: scope } } }
  })
  if (!stage) throw new Error('Estágio não encontrado')

  const updated = await prisma.stage.update({
    where: { id },
    data: {
      ...(data.nome !== undefined && { nome: data.nome }),
      ...(data.cor !== undefined && { cor: data.cor }),
      ...(data.probabilidade !== undefined && { probabilidade: parseInt(data.probabilidade) || 0 }),
      ...(data.slaHours !== undefined && { slaHours: parseInt(data.slaHours) || 0 }),
      ...(data.ordem !== undefined && { ordem: parseInt(data.ordem) || 0 })
    }
  })
  revalidatePath('/pipeline')
  revalidatePath('/settings')
  return updated
}

export async function deleteStage(id: string, migrationStageId?: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const stage = await prisma.stage.findFirst({
    where: { id, pipeline: { userId: { in: scope } } }
  })
  if (!stage) throw new Error('Estágio não encontrado')

  if (migrationStageId) {
    await prisma.deal.updateMany({
      where: { stageId: id },
      data: { stageId: migrationStageId }
    })
  }

  await prisma.stage.delete({
    where: { id }
  })
  revalidatePath('/pipeline')
  revalidatePath('/settings')
}

export async function reorderStages(pipelineId: string, stages: any[]) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, userId: { in: scope } }
  })
  if (!pipeline) throw new Error('Pipeline não encontrada')

  await prisma.$transaction(
    stages.map((s, index) =>
      prisma.stage.update({
        where: { id: s.id },
        data: { ordem: index + 1 }
      })
    )
  )
  revalidatePath('/pipeline')
  revalidatePath('/settings')
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

export async function createDeal(data: any) {
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
      valorEstimado: parseFloat(data.valorEstimado) || 0,
      produtoInteresse: data.produtoInteresse || null,
      origem,
      prioridade: data.prioridade || 'MEDIA',
      status: 'OPEN',
      telefone,
      ramoEmpresa: data.ramoEmpresa || null,
      faturamentoMensal: parseFloat(data.faturamentoMensal) || 0,
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

export async function updateDeal(id: string, data: any) {
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
      ...(data.valorEstimado !== undefined && { valorEstimado: parseFloat(data.valorEstimado) || 0 }),
      ...(data.produtoInteresse !== undefined && { produtoInteresse: data.produtoInteresse }),
      ...(data.origem !== undefined && { origem: data.origem }),
      ...(data.prioridade !== undefined && { prioridade: data.prioridade }),
      ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId || null }),
      ...(data.stageId !== undefined && { stageId: data.stageId }),
      ...(data.anotacoes !== undefined && { anotacoes: data.anotacoes }),
      ...(data.anotacoesReuniao !== undefined && { anotacoesReuniao: data.anotacoesReuniao }),
      ...(data.ramoEmpresa !== undefined && { ramoEmpresa: data.ramoEmpresa }),
      ...(data.faturamentoMensal !== undefined && { faturamentoMensal: parseFloat(data.faturamentoMensal) || 0 }),
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

  // Create Activity log if notes changed
  if (data.anotacoes !== undefined && data.anotacoes !== oldDeal.anotacoes && data.anotacoes.trim().length > 0) {
    await prisma.activity.create({
      data: {
        tipo: 'nota',
        titulo: 'Anotação no Deal',
        descricao: data.anotacoes,
        status: 'DONE',
        dueAt: new Date(),
        doneAt: new Date(),
        userId: auth.userId,
        ownerUserId: auth.userId,
        dealId: id,
        contactId: oldDeal.contactId
      }
    })
  }

  if (data.anotacoesReuniao !== undefined && data.anotacoesReuniao !== oldDeal.anotacoesReuniao && data.anotacoesReuniao.trim().length > 0) {
    await prisma.activity.create({
      data: {
        tipo: 'nota',
        titulo: 'Anotação de Reunião no Deal',
        descricao: data.anotacoesReuniao,
        status: 'DONE',
        dueAt: new Date(),
        doneAt: new Date(),
        userId: auth.userId,
        ownerUserId: auth.userId,
        dealId: id,
        contactId: oldDeal.contactId
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

export async function deleteDeal(id: string, forcePermanent: boolean = false) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const deal = await prisma.deal.findFirst({
    where: { 
      id, 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    }
  })
  if (!deal) throw new Error('Negociação não encontrada')
  
  if (forcePermanent) {
    await prisma.deal.delete({
      where: { id }
    })
  } else {
    await prisma.deal.update({
      where: { id },
      data: {
        status: 'LOST',
        motivoPerda: 'Excluído / Arquivado',
        fechadoEm: new Date()
      }
    })
    
    await prisma.dealStageHistory.create({
      data: {
        dealId: id,
        deStageId: deal.stageId,
        paraStageId: deal.stageId,
        mudouPor: 'Sistema',
        fonte: 'arquivamento'
      }
    })
  }
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

export async function createActivity(data: any) {
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
  
  revalidatePath('/activities')
  revalidatePath('/pipeline')
  return serializeActivity(created)
}

export async function updateActivity(id: string, data: any) {
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
  
  revalidatePath('/activities')
  revalidatePath('/pipeline')
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
  revalidatePath('/activities')
  revalidatePath('/pipeline')
}

export async function getReportOverviewData(
  _pipelineId: string | null,
  _start: string | null,
  _end: string | null,
  _ownerIds: string[]
) {
  await requireAuth() // auth check; full implementation uses auth.userId when queries are built
  return {
    receitaTotal: 0,
    ticketMedio: 0,
    leadsGerados: 0,
    dealsGanhos: 0,
    dealsPerdidos: 0,
    cicloMedioDias: 0,
    taxaConversao: 0,
  }
}

export async function getBussolaFontes() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)

  const deals = await prisma.deal.findMany({
    where: { 
      OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] 
    },
    select: {
      origem: true,
      status: true,
      valorEstimado: true,
    }
  })

  const groups: Record<string, { label: string; iconName: string; color: string; leads: number; deals: number; receita: number; custo: number }> = {}

  const defaults = [
    { key: 'meta', label: 'Meta Ads', iconName: 'Megaphone', color: '#60A5FA', custoPerLead: 15 },
    { key: 'google', label: 'Google Ads', iconName: 'Search', color: '#FFB300', custoPerLead: 20 },
    { key: 'indicacao', label: 'Indicação', iconName: 'Star', color: '#a855f7', custoPerLead: 0 },
    { key: 'site', label: 'Site / Direto', iconName: 'Globe', color: '#FF5722', custoPerLead: 0 }
  ]

  defaults.forEach(d => {
    groups[d.key] = {
      label: d.label,
      iconName: d.iconName,
      color: d.color,
      leads: 0,
      deals: 0,
      receita: 0,
      custo: 0
    }
  })

  deals.forEach(deal => {
    const orig = deal.origem
    const norm = (orig || '').trim().toLowerCase()
    let key = 'site'
    let label = orig || 'Site / Direto'
    let iconName = 'Globe'
    let color = '#FF5722'
    let custoPerLead = 0

    if (norm.includes('facebook') || norm.includes('instagram') || norm.includes('meta') || norm.includes('ads') || norm === 'ia' || norm === 'inteligência artificial') {
      key = 'meta'
      label = 'Meta Ads'
      iconName = 'Megaphone'
      color = '#60A5FA'
      custoPerLead = 15
    } else if (norm.includes('google') || norm.includes('search')) {
      key = 'google'
      label = 'Google Ads'
      iconName = 'Search'
      color = '#FFB300'
      custoPerLead = 20
    } else if (norm.includes('whatsapp') || norm.includes('whats') || norm.includes('organico') || norm.includes('orgânico')) {
      key = 'whatsapp'
      label = 'WhatsApp / Orgânico'
      iconName = 'MessageCircle'
      color = '#00E676'
      custoPerLead = 0
    } else if (norm.includes('indicacao') || norm.includes('indicação') || norm.includes('indicado')) {
      key = 'indicacao'
      label = 'Indicação'
      iconName = 'Star'
      color = '#a855f7'
      custoPerLead = 0
    } else if (orig) {
      key = norm.replace(/\s+/g, '_')
    }

    if (!groups[key]) {
      groups[key] = { label, iconName, color, leads: 0, deals: 0, receita: 0, custo: 0 }
    }

    groups[key].leads += 1
    if (deal.status === 'WON') {
      groups[key].deals += 1
      groups[key].receita += deal.valorEstimado
    }
    groups[key].custo += custoPerLead
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
        const createdAt = r.created_at || r.timestamp || new Date().toISOString()
        const dateObj = new Date(createdAt)

        return {
          id: String(r.id),
          sender,
          text: content,
          time: dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
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
        return logs.map(l => {
          const d = new Date(l.createdAt)
          return {
            id: l.id,
            sender: l.role === 'user' ? 'lead' : l.role === 'assistant' ? 'ai' : 'user',
            text: l.content,
            time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            date: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
          }
        })
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
  const scope = await getTeamScope(auth.userId)
  return prisma.messageTemplate.findMany({
    where: { userId: { in: scope } },
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
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.messageTemplate.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Template não encontrado')
  return prisma.messageTemplate.update({ where: { id }, data })
}

export async function deleteTemplate(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.messageTemplate.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Template não encontrado')
  return prisma.messageTemplate.delete({ where: { id } })
}

// ====== LISTAS DE DISPARO ======

export async function getListasDisparo() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.listaDisparo.findMany({
    where: { userId: { in: scope } },
    include: {
      leads: true
    },
    orderBy: { createdAt: 'desc' }
  })
}

export async function getListaDisparoDetails(listaId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope } },
    include: { leads: { orderBy: { createdAt: 'asc' } } }
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

export async function updateListaDisparo(id: string, data: { nomeLista?: string; descricao?: string; mensagemTemplate?: string; status?: any; configEnvio?: string }) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.listaDisparo.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Lista não encontrada')
  return prisma.listaDisparo.update({ where: { id }, data })
}

export async function deleteListaDisparo(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.listaDisparo.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Lista não encontrada')
  return prisma.listaDisparo.delete({ where: { id } })
}

export async function reutilizarListaDisparo(listaId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const original = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope } },
    include: { leads: true }
  })
  if (!original) throw new Error('Lista não encontrada')

  const nova = await prisma.listaDisparo.create({
    data: {
      userId: auth.userId,
      nomeLista: `${original.nomeLista} — Reenvio`,
      descricao: original.descricao || null,
      mensagemTemplate: original.mensagemTemplate,
      status: 'ATIVA',
      configEnvio: original.configEnvio || null,
      totalLeads: original.leads.length
    }
  })

  if (original.leads.length > 0) {
    await prisma.leadListaDisparo.createMany({
      data: original.leads.map(l => ({
        listaId: nova.id,
        dealId: l.dealId || null,
        leadId: l.leadId || null,
        nomeSnapshot: l.nomeSnapshot,
        telefoneSnapshot: l.telefoneSnapshot,
        mensagemFinal: l.mensagemFinal
      }))
    })
  }

  return nova
}

export async function addLeadsToListaDisparo(listaId: string, itemIds: string[], type: 'deal' | 'contact') {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const list = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope } }
  })
  if (!list) throw new Error('Lista não encontrada')

  let leadsData: Array<{ nome: string; telefone: string; dealId?: string; contactId?: string }> = []

  if (type === 'deal') {
    const deals = await prisma.deal.findMany({
      where: { id: { in: itemIds }, userId: { in: scope } },
      include: { contact: true }
    })
    leadsData = deals.map(d => ({
      nome: d.contact?.nome ? `${d.contact.nome} ${d.contact.sobrenome || ''}`.trim() : d.titulo,
      telefone: d.telefone || d.contact?.telefone || '',
      dealId: d.id
    }))
  } else {
    const contacts = await prisma.contact.findMany({
      where: { id: { in: itemIds }, userId: { in: scope } }
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

  // Tag contacts and deals with "listado"
  if (type === 'deal') {
    const dealsToTag = await prisma.deal.findMany({ where: { id: { in: itemIds } } })
    for (const d of dealsToTag) {
      const existingTags: string[] = d.tags ? JSON.parse(d.tags) : []
      if (!existingTags.includes('listado')) {
        existingTags.push('listado')
        await prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(existingTags) } })
      }
    }
  } else {
    const contactsToTag = await prisma.contact.findMany({ where: { id: { in: itemIds } } })
    for (const c of contactsToTag) {
      const existingTags: string[] = c.tags ? JSON.parse(c.tags) : []
      if (!existingTags.includes('listado')) {
        existingTags.push('listado')
        await prisma.contact.update({ where: { id: c.id }, data: { tags: JSON.stringify(existingTags) } })
      }
    }
  }

  return created.length
}

// ====== AÇÕES CAIXA RÁPIDO (multi-step) ======

function calcDataAgendamento(startTime: Date, etapas: { prazoValor: number; prazoUnidade: string }[], etapaIndex: number): Date {
  let cumulativeMs = 0
  for (let i = 0; i <= etapaIndex; i++) {
    const e = etapas[i]
    if (e.prazoUnidade === 'horas') cumulativeMs += e.prazoValor * 60 * 60 * 1000
    else if (e.prazoUnidade === 'dias') cumulativeMs += e.prazoValor * 24 * 60 * 60 * 1000
    else if (e.prazoUnidade === 'semanas') cumulativeMs += e.prazoValor * 7 * 24 * 60 * 60 * 1000
  }
  return new Date(startTime.getTime() + cumulativeMs)
}

async function buildLeadEntries(
  scope: string[],
  dealIds: string[],
  contactIds: string[],
  mensagem: string,
  googleLeadIds: string[] = []
) {
  const entries: Array<{ nomeSnapshot: string; telefoneSnapshot: string; dealId?: string; leadId?: string; mensagemFinal: string }> = []

  if (dealIds.length > 0) {
    const deals = await prisma.deal.findMany({
      where: { id: { in: dealIds }, userId: { in: scope } },
      include: { contact: true }
    })
    for (const d of deals) {
      const telefone = (d.telefone || d.contact?.telefone || '').replace(/\D/g, '')
      if (!telefone) continue
      const nome = d.contact?.nome ? `${d.contact.nome} ${d.contact.sobrenome || ''}`.trim() : d.titulo
      entries.push({ nomeSnapshot: nome, telefoneSnapshot: telefone, dealId: d.id, mensagemFinal: mensagem })
    }
  }

  if (contactIds.length > 0) {
    const contacts = await prisma.contact.findMany({ where: { id: { in: contactIds }, userId: { in: scope } } })
    for (const c of contacts) {
      const telefone = c.telefone.replace(/\D/g, '')
      if (!telefone) continue
      entries.push({ nomeSnapshot: `${c.nome} ${c.sobrenome || ''}`.trim(), telefoneSnapshot: telefone, leadId: c.id, mensagemFinal: mensagem })
    }
  }

  if (googleLeadIds.length > 0) {
    const googleLeads = await prisma.googleLead.findMany({ where: { id: { in: googleLeadIds }, userId: { in: scope } } })
    for (const gl of googleLeads) {
      const telefone = (gl.telefone || '').replace(/\D/g, '')
      if (!telefone) continue
      entries.push({ nomeSnapshot: `${gl.nome || 'Google Lead'}`.trim(), telefoneSnapshot: telefone, mensagemFinal: mensagem })
    }
  }

  return entries
}

export async function createAcaoCaixaRapido(data: {
  nome: string
  descricao?: string
  cadenciaId: string
  dealIds: string[]
  contactIds: string[]
  googleLeadIds?: string[]
  configEnvio?: string
  dataHoraInicio?: string
}) {
  const auth = await requireAuth()

  const scope = await getTeamScope(auth.userId)
  const cadencia = await prisma.cadencia.findFirst({
    where: { id: data.cadenciaId, userId: { in: scope } },
    include: { etapas: { orderBy: { ordem: 'asc' } } }
  })
  if (!cadencia) throw new Error('Cadência não encontrada')
  if (cadencia.etapas.length < 1) throw new Error('Cadência sem etapas')

  const startTime = data.dataHoraInicio ? new Date(data.dataHoraInicio) : new Date()
  const totalLeads = data.dealIds.length + data.contactIds.length + (data.googleLeadIds?.length || 0)

  const acao = await prisma.acaoCaixaRapido.create({
    data: {
      userId: auth.userId,
      nome: data.nome,
      descricao: data.descricao || null,
      cadenciaId: data.cadenciaId,
      totalEtapas: cadencia.etapas.length,
      totalLeads,
      configEnvio: data.configEnvio || null
    }
  })

  for (let i = 0; i < cadencia.etapas.length; i++) {
    const etapa = cadencia.etapas[i]
    const dataAgendamento = calcDataAgendamento(startTime, cadencia.etapas, i)

    const lista = await prisma.listaDisparo.create({
      data: {
        userId: auth.userId,
        acaoId: acao.id,
        etapaNumero: etapa.ordem,
        dataAgendamento,
        nomeLista: `${data.nome} — Etapa ${etapa.ordem}`,
        mensagemTemplate: etapa.mensagem,
        status: 'AGENDADA',
        configEnvio: data.configEnvio || null
      }
    })

    const entries = await buildLeadEntries(scope, data.dealIds, data.contactIds, etapa.mensagem, data.googleLeadIds)
    if (entries.length > 0) {
      await prisma.leadListaDisparo.createMany({
        data: entries.map(e => ({ ...e, listaId: lista.id }))
      })
      await prisma.listaDisparo.update({ where: { id: lista.id }, data: { totalLeads: entries.length } })
    }
  }

  // After the for loop, find and dispatch lists that should fire now
  const listsToFireNow = await prisma.listaDisparo.findMany({
    where: { acaoId: acao.id, status: 'AGENDADA', dataAgendamento: { lte: new Date() } },
    select: { id: true, userId: true }
  })
  for (const l of listsToFireNow) {
    try { await dispararListaInternal(l.id, l.userId) } catch (err: any) {
      console.error('[createAcaoCaixaRapido] erro ao disparar lista imediata:', err?.message)
    }
  }

  // Tag deals and contacts as "listado"
  if (data.dealIds.length > 0) {
    const dealsToTag = await prisma.deal.findMany({ where: { id: { in: data.dealIds } } })
    for (const d of dealsToTag) {
      let existingTags: string[] = []
      try { existingTags = d.tags ? JSON.parse(d.tags) : [] } catch { existingTags = [] }
      if (!existingTags.includes('listado')) {
        existingTags.push('listado')
        await prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(existingTags) } })
      }
    }
  }
  if (data.contactIds.length > 0) {
    const contactsToTag = await prisma.contact.findMany({ where: { id: { in: data.contactIds } } })
    for (const c of contactsToTag) {
      let existingTags: string[] = []
      try { existingTags = c.tags ? JSON.parse(c.tags) : [] } catch { existingTags = [] }
      if (!existingTags.includes('listado')) {
        existingTags.push('listado')
        await prisma.contact.update({ where: { id: c.id }, data: { tags: JSON.stringify(existingTags) } })
      }
    }
  }

  return acao
}

export async function getAcoesCaixaRapido() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const result = await prisma.acaoCaixaRapido.findMany({
    where: { userId: { in: scope } },
    include: {
      listas: {
        include: { leads: { select: { id: true, statusEnvio: true, nomeSnapshot: true, telefoneSnapshot: true }, orderBy: { createdAt: 'asc' } } },
        orderBy: { etapaNumero: 'asc' }
      }
    },
    orderBy: { createdAt: 'desc' }
  })

  // Fallback: dispatch any overdue scheduled lists in background (guards against cron not running)
  after(async () => {
    const now = new Date()
    const overdue = await prisma.listaDisparo.findMany({
      where: { userId: { in: scope }, status: 'AGENDADA', dataAgendamento: { lte: now } },
      select: { id: true, userId: true }
    })
    for (const lista of overdue) {
      await dispararListaInternal(lista.id, lista.userId).catch(() => {})
    }
  })

  return result
}

export async function cancelarListaDaAcao(listaId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const lista = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope }, acaoId: { not: null } }
  })
  if (!lista) throw new Error('Lista não encontrada')
  if (lista.status === 'EM_ANDAMENTO') throw new Error('Lista em andamento não pode ser cancelada')

  await prisma.listaDisparo.update({ where: { id: listaId }, data: { status: 'CANCELADA' } })

  const acao = await prisma.acaoCaixaRapido.findFirst({ where: { id: lista.acaoId! } })
  if (acao) {
    const activeLists = await prisma.listaDisparo.count({
      where: { acaoId: acao.id, status: { notIn: ['CANCELADA', 'CONCLUIDA'] } }
    })
    if (activeLists === 0) {
      await prisma.acaoCaixaRapido.update({ where: { id: acao.id }, data: { status: 'CANCELADA' } })
    }
  }

  return { success: true }
}

export async function cancelarAcaoCaixaRapido(acaoId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const acao = await prisma.acaoCaixaRapido.findFirst({ where: { id: acaoId, userId: { in: scope } } })
  if (!acao) throw new Error('Ação não encontrada')

  await prisma.listaDisparo.updateMany({
    where: { acaoId, status: { in: ['AGENDADA', 'ATIVA', 'PAUSADA'] } },
    data: { status: 'CANCELADA' }
  })
  await prisma.acaoCaixaRapido.update({ where: { id: acaoId }, data: { status: 'CANCELADA' } })
  return { success: true }
}

export async function excluirAcaoCaixaRapido(acaoId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const acao = await prisma.acaoCaixaRapido.findFirst({
    where: { id: acaoId, userId: { in: scope } },
    include: { listas: { select: { id: true } } }
  })
  if (!acao) throw new Error('Ação não encontrada')
  if (acao.status === 'ATIVA') throw new Error('Cancele a ação antes de excluir.')

  const listaIds = acao.listas.map((l: any) => l.id)
  if (listaIds.length > 0) {
    await prisma.leadListaDisparo.deleteMany({ where: { listaId: { in: listaIds } } })
    await prisma.listaDisparo.deleteMany({ where: { id: { in: listaIds } } })
  }
  await prisma.acaoCaixaRapido.delete({ where: { id: acaoId } })
  return { success: true }
}

export async function removeLeadFromLista(leadListaId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const item = await prisma.leadListaDisparo.findFirst({
    where: { id: leadListaId },
    include: { lista: true }
  })
  if (!item || !scope.includes(item.lista.userId)) throw new Error('Lead não encontrado')
  if (item.statusEnvio !== 'PENDENTE') throw new Error('Lead já processado')

  await prisma.leadListaDisparo.delete({ where: { id: leadListaId } })
  await prisma.listaDisparo.update({
    where: { id: item.listaId },
    data: { totalLeads: { decrement: 1 } }
  })
  return { success: true }
}

export async function addLeadsToListaDaAcao(listaId: string, dealIds: string[], contactIds: string[]) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const lista = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope }, acaoId: { not: null } }
  })
  if (!lista) throw new Error('Lista não encontrada')
  if (!['AGENDADA', 'ATIVA'].includes(lista.status)) throw new Error('Lista não está em estado editável')

  const entries = await buildLeadEntries(scope, dealIds, contactIds, lista.mensagemTemplate)
  if (entries.length === 0) return 0

  const existingPhones = new Set(
    (await prisma.leadListaDisparo.findMany({ where: { listaId }, select: { telefoneSnapshot: true } }))
      .map(l => l.telefoneSnapshot)
  )
  const novos = entries.filter(e => !existingPhones.has(e.telefoneSnapshot))
  if (novos.length === 0) return 0

  await prisma.leadListaDisparo.createMany({ data: novos.map(e => ({ ...e, listaId })) })
  await prisma.listaDisparo.update({ where: { id: listaId }, data: { totalLeads: { increment: novos.length } } })
  return novos.length
}

// Internal dispatch used by cron and direct calls
export async function dispararListaInternal(listaId: string, userId: string) {
  const list = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId },
    include: { leads: { where: { statusEnvio: 'PENDENTE' } } }
  })
  if (!list) throw new Error('Lista não encontrada')
  if (list.leads.length === 0) {
    await prisma.listaDisparo.update({ where: { id: listaId }, data: { status: 'CONCLUIDA' } })
    return { success: true, skipped: true }
  }

  const isScheduled = !!list.dataAgendamento

  const profile = await prisma.profile.findUnique({ where: { userId } })
  const configObj = list.configEnvio ? (() => { try { return JSON.parse(list.configEnvio) } catch { return {} } })() : {}
  const webhookUrl = configObj.webhookUrl || profile?.disparoWebhookUrl || 'https://auto.devnetlife.com/webhook/disparo-docelilium'
  const intervaloSegundos: number = configObj.intervaloSegundos ?? 30

  await prisma.listaDisparo.update({ where: { id: listaId }, data: { status: 'EM_ANDAMENTO' } })

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const payload = {
      lista_id: list.id,
      nome_lista: list.nomeLista,
      mensagem_template: list.mensagemTemplate,
      intervalo_segundos: intervaloSegundos,
      leads: list.leads.map(l => ({ nome: l.nomeSnapshot, telefone: l.telefoneSnapshot, mensagem: l.mensagemFinal })),
      callback_url: 'https://petalas.docelilium.com.br/api/webhook/doce-lilium'
    }
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    clearTimeout(timeout)
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`Webhook retornou HTTP ${response.status}${body ? ': ' + body.slice(0, 300) : ''}`)
    }
  } catch (error: any) {
    clearTimeout(timeout)
    const novosErros = (list.erros ?? 0) + 1
    // For scheduled lists: retry up to 3 times before giving up
    if (isScheduled && novosErros < 3) {
      await prisma.listaDisparo.update({ where: { id: listaId }, data: { status: 'AGENDADA', erros: novosErros } }).catch(() => {})
    } else {
      await prisma.listaDisparo.update({ where: { id: listaId }, data: { status: 'ATIVA', erros: novosErros } }).catch(() => {})
    }
    throw new Error(error.name === 'AbortError' ? 'Timeout: webhook não respondeu em 15s' : (error.message ?? String(error)))
  }

  return { success: true }
}

// ====== WEBHOOKS CADASTRADOS ======

export async function getWebhooks() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.webhook.findMany({
    where: { userId: { in: scope } },
    orderBy: { createdAt: 'desc' }
  })
}

export async function createWebhook(data: { nome: string; url: string }) {
  const auth = await requireAuth()
  if (!data.nome?.trim()) throw new Error('Nome obrigatório')
  if (!data.url?.trim()) throw new Error('URL obrigatória')
  return prisma.webhook.create({
    data: { userId: auth.userId, nome: data.nome.trim(), url: data.url.trim() }
  })
}

export async function deleteWebhook(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.webhook.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Webhook não encontrado')
  return prisma.webhook.delete({ where: { id } })
}

// ====== CADENCIAS ======

export async function getCadencias() {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return prisma.cadencia.findMany({
    where: { userId: { in: scope } },
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
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.cadencia.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Cadência não encontrada')
  
  const updateData: any = {
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
    where: { id },
    data: updateData,
    include: {
      etapas: true
    }
  })
}

export async function deleteCadence(id: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.cadencia.findFirst({ where: { id, userId: { in: scope } } })
  if (!existing) throw new Error('Cadência não encontrada')
  return prisma.cadencia.delete({ where: { id } })
}

export async function addLeadsToCadence(cadenceId: string, itemIds: string[], type: 'deal' | 'contact') {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const cadence = await prisma.cadencia.findFirst({
    where: { id: cadenceId, userId: { in: scope } },
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

  const created = await Promise.all(
    itemIds.map(async id => {
      const existing = await prisma.cadenciaLead.findFirst({
        where: {
          cadenciaId: cadenceId,
          dealId: type === 'deal' ? id : null,
          leadId: type === 'contact' ? id : null,
          status: 'ATIVO'
        }
      })
      if (existing) return null

      const record = await prisma.cadenciaLead.create({
        data: {
          cadenciaId: cadenceId,
          dealId: type === 'deal' ? id : null,
          leadId: type === 'contact' ? id : null,
          etapaAtual: 1,
          status: 'ATIVO',
          proximoEnvio
        }
      })

      // Add auto-tag to deal
      if (type === 'deal') {
        const deal = await prisma.deal.findUnique({ where: { id } })
        if (deal) {
          let tags: string[] = []
          try { tags = deal.tags ? JSON.parse(deal.tags as string) : [] } catch { tags = [] }
          if (!tags.includes(cadenceTag)) {
            tags.push(cadenceTag)
            await prisma.deal.update({ where: { id }, data: { tags: JSON.stringify(tags) } })
          }
        }
      }

      return record
    })
  )

  const filtered = created.filter(c => c !== null)
  return filtered.length
}

export async function getCadenceDashboard(cadenceId: string) {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  
  const cadence = await prisma.cadencia.findFirst({
    where: { id: cadenceId, userId: { in: scope } },
    include: { etapas: true, leads: true }
  })
  if (!cadence) throw new Error('Cadência não encontrada')

  const activeLeads = cadence.leads.filter(l => l.status === 'ATIVO')
  
  const stageCounts: Record<number, number> = {}
  cadence.etapas.forEach(e => {
    stageCounts[e.ordem] = 0
  })
  activeLeads.forEach(l => {
    stageCounts[l.etapaAtual] = (stageCounts[l.etapaAtual] || 0) + 1
  })

  const totalCompleted = cadence.leads.filter(l => l.status === 'CONCLUIDA').length
  const totalStopped = cadence.leads.filter(l => l.status === 'RESPONDIDA').length

  const leadsList = await Promise.all(
    cadence.leads.map(async l => {
      let nome = 'Lead'
      let telefone = ''

      if (l.dealId) {
        const d = await prisma.deal.findUnique({
          where: { id: l.dealId },
          include: { contact: true }
        })
        if (d) {
          nome = d.contact?.nome ? `${d.contact.nome} ${d.contact.sobrenome || ''}`.trim() : d.titulo
          telefone = d.telefone || d.contact?.telefone || ''
        }
      } else if (l.leadId) {
        const c = await prisma.contact.findUnique({
          where: { id: l.leadId }
        })
        if (c) {
          nome = `${c.nome} ${c.sobrenome || ''}`.trim()
          telefone = c.telefone
        }
      }

      return {
        id: l.id,
        nome,
        telefone,
        etapaAtual: l.etapaAtual,
        status: l.status,
        proximoEnvio: l.proximoEnvio ? l.proximoEnvio.toISOString() : null,
        updatedAt: l.updatedAt.toISOString()
      }
    })
  )

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
  const scope = await getTeamScope(auth.userId)
  const lead = await prisma.cadenciaLead.findFirst({
    where: { id: cadenceLeadId },
    include: { cadencia: true }
  })
  if (!lead || !scope.includes(lead.cadencia.userId)) {
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
  const scope = await getTeamScope(auth.userId)
  const lead = await prisma.cadenciaLead.findFirst({
    where: { id: cadenceLeadId },
    include: { cadencia: true }
  })
  if (!lead || !scope.includes(lead.cadencia.userId)) {
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
  | { tipo: 'aniversariantes' }

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
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.segmento.findMany({
    where: {
      OR: [
        { userId: null },
        { userId: { in: scope } }
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
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.segmento.findFirst({ where: { id } })
  if (!existing) throw new Error('Segmento não encontrado')
  if (existing.tipo !== 'template' && !scope.includes(existing.userId!)) {
    throw new Error('Sem permissão para editar este segmento')
  }
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
  const scope = await getTeamScope(auth.userId)
  const existing = await prisma.segmento.findFirst({
    where: { id, userId: { in: scope } }
  })
  if (!existing) throw new Error('Segmento não encontrado ou sem permissão para remover')
  await prisma.segmento.delete({ where: { id } })
}

// Internal: run rules against DB and return raw IDs
async function runSegmentoRegras(
  regras: SegmentoRegra[],
  scope: string[]
): Promise<{ dealIds: string[]; contactIds: string[] }> {
  let dealIds: string[] = []
  let contactIds: string[] = []

  for (const regra of regras) {
    if (regra.tipo === 'sem_resposta') {
      const cutoff = new Date()
      cutoff.setHours(cutoff.getHours() - regra.horasMin)
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN', updatedAt: { lte: cutoff } },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'negocios_perdidos') {
      const deals = await prisma.deal.findMany({
        where: {
          userId: { in: scope },
          status: 'LOST',
          ...(regra.motivoPerda ? { motivoPerda: regra.motivoPerda } : {})
        },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'etapa_especifica') {
      const whereClause: any = { userId: { in: scope }, status: 'OPEN', stageId: regra.stageId }
      if (regra.horasMin) {
        const cutoff = new Date()
        cutoff.setHours(cutoff.getHours() - regra.horasMin)
        whereClause.updatedAt = { lte: cutoff }
      }
      const deals = await prisma.deal.findMany({ where: whereClause, select: { id: true, contactId: true } })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'leads_frios') {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - regra.diasSemAtividade)
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN', updatedAt: { lte: cutoff } },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'prioridade') {
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN', prioridade: regra.prioridade as DealPriority },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'origem') {
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN', origem: regra.origem },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'sem_responsavel') {
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN', ownerUserId: null },
        select: { id: true, contactId: true }
      })
      dealIds.push(...deals.map(d => d.id))
      contactIds.push(...deals.map(d => d.contactId))
    } else if (regra.tipo === 'aniversariantes') {
      const deals = await prisma.deal.findMany({
        where: { userId: { in: scope }, status: 'OPEN' },
        include: { contact: true }
      })
      const today = new Date()
      const todayMonth = today.getMonth() + 1 // 1-12
      const todayDay = today.getDate() // 1-31

      for (const d of deals) {
        if (!d.contact) continue
        const customRaw = d.contact.camposCustomizados ? safeJsonParse<any>(d.contact.camposCustomizados, {}) : {}
        const birthDateStr = customRaw._dataNascimento // "YYYY-MM-DD"
        if (birthDateStr && typeof birthDateStr === 'string') {
          const parts = birthDateStr.split('-')
          if (parts.length === 3) {
            const birthMonth = parseInt(parts[1], 10)
            const birthDay = parseInt(parts[2], 10)
            if (birthMonth === todayMonth && birthDay === todayDay) {
              dealIds.push(d.id)
              contactIds.push(d.contactId)
            }
          }
        }
      }
    }
  }

  return {
    dealIds: Array.from(new Set(dealIds)),
    contactIds: Array.from(new Set(contactIds))
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

export async function dispararLista(listaId: string) {
  const auth = await requireAuth()
  return dispararListaInternal(listaId, auth.userId)
}

export async function testWebhook(url: string) {
  await requireAuth()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        test: true,
        event: 'webhook_test',
        timestamp: new Date().toISOString(),
        details: 'Disparo de teste simulado pela interface'
      })
    })
    return { success: res.ok, status: res.status }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function tagDealsAsListado(dealIds: string[]): Promise<void> {
  const auth = await requireAuth()
  const deals = await prisma.deal.findMany({ where: { id: { in: dealIds }, userId: auth.userId } })
  for (const d of deals) {
    const existingTags: string[] = d.tags ? JSON.parse(d.tags) : []
    if (!existingTags.includes('listado')) {
      existingTags.push('listado')
      await prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(existingTags) } })
    }
  }
}

export async function updateUser(userId: string, data: Partial<{ nome: string; sobrenome: string; email: string }>): Promise<void> {
  const auth = await requireAuth();
  const currentUser = await prisma.user.findUnique({ where: { id: auth.userId }, include: { roles: true } });
  const isAdmin = currentUser?.roles.some((r: any) => r.role === 'ADMIN');
  if (!isAdmin && auth.userId !== userId) throw new Error('Acesso Negado');
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.nome && { nome: data.nome }),
      ...(data.sobrenome !== undefined && { sobrenome: data.sobrenome }),
      ...(data.email && { email: data.email })
    }
  });
}
