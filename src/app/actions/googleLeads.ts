'use server'

import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { cookies } from 'next/headers'
import { getTeamScope } from '@/app/actions/crm'

async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ocr_auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return await verifyToken(token)
}

export async function getGoogleLeads(options: {
  status?: string;
  timeRange?: string; // 'hoje', '7d', '30d', 'todos'
  page?: number;
  pageSize?: number;
  search?: string;
}) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  const { status, timeRange, page = 1, pageSize = 10, search } = options
  const skip = (page - 1) * pageSize

  const where: any = { userId: { in: scope } }

  if (status && status !== 'TODOS') {
    where.status = status
  }

  if (timeRange && timeRange !== 'todos') {
    const now = new Date()
    const past = new Date()
    if (timeRange === 'hoje') past.setHours(0, 0, 0, 0)
    if (timeRange === '7d') past.setDate(now.getDate() - 7)
    if (timeRange === '30d') past.setDate(now.getDate() - 30)
    
    where.dataBusca = { gte: past }
  }

  if (search) {
    where.OR = [
      { nome: { contains: search, mode: 'insensitive' } },
      { cidade: { contains: search, mode: 'insensitive' } },
      { telefone: { contains: search, mode: 'insensitive' } },
      { nicho: { contains: search, mode: 'insensitive' } }
    ]
  }

  const [leads, total] = await Promise.all([
    prisma.googleLead.findMany({
      where,
      orderBy: { dataBusca: 'desc' },
      skip,
      take: pageSize
    }),
    prisma.googleLead.count({ where })
  ])

  // KPIs
  const allLeadsWhere = { userId: { in: scope } }
  const [totalMinerados, totalNovos, totalImportados, totalDescartados] = await Promise.all([
    prisma.googleLead.count({ where: allLeadsWhere }),
    prisma.googleLead.count({ where: { ...allLeadsWhere, status: 'NOVO' } }),
    prisma.googleLead.count({ where: { ...allLeadsWhere, status: 'IMPORTADO' } }),
    prisma.googleLead.count({ where: { ...allLeadsWhere, status: 'DESCARTADO' } })
  ])

  return {
    leads,
    total,
    totalPages: Math.ceil(total / pageSize),
    kpis: {
      total: totalMinerados,
      novos: totalNovos,
      importados: totalImportados,
      descartados: totalDescartados
    }
  }
}

export async function updateGoogleLeadStatus(id: string, status: 'NOVO' | 'IMPORTADO' | 'DESCARTADO') {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  await prisma.googleLead.updateMany({
    where: { id, userId: { in: scope } },
    data: { status }
  })
  return { success: true }
}

export async function bulkDiscardLeads(ids: string[]) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  await prisma.googleLead.updateMany({
    where: { id: { in: ids }, userId: { in: scope } },
    data: { status: 'DESCARTADO' }
  })
  return { success: true }
}

export async function bulkRestoreLeads(ids: string[]) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  await prisma.googleLead.updateMany({
    where: { id: { in: ids }, userId: { in: scope } },
    data: { status: 'NOVO' }
  })
  return { success: true }
}

export async function bulkDeleteLeads(ids: string[]) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  await prisma.googleLead.deleteMany({
    where: { id: { in: ids }, userId: { in: scope } }
  })
  return { success: true }
}

export async function importToCrm(ids: string[]) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  const leads = await prisma.googleLead.findMany({
    where: { id: { in: ids }, userId: { in: scope }, status: 'NOVO' }
  })

  let importedCount = 0

  for (const lead of leads) {
    if (!lead.telefone) continue // Precisamos de pelo menos o telefone

    // Verifica se já existe contato no CRM com esse telefone
    let contact = await prisma.contact.findFirst({
      where: { userId: { in: scope }, telefone: lead.telefone }
    })

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          userId: user.userId,
          ownerUserId: user.userId,
          nome: lead.nome || 'Sem Nome',
          telefone: lead.telefone,
          cidade: lead.cidade,
          estado: lead.uf,
          tags: lead.nicho ? JSON.stringify([lead.nicho]) : null
        }
      })
    }

    await prisma.googleLead.update({
      where: { id: lead.id },
      data: {
        status: 'IMPORTADO',
        importedToCrm: true,
        importedAt: new Date(),
        crmContactId: contact.id
      }
    })
    
    importedCount++
  }

  return { success: true, importedCount }
}

export async function addGoogleLeadsToList(ids: string[], listaId: string) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  const lista = await prisma.listaDisparo.findFirst({
    where: { id: listaId, userId: { in: scope } }
  })

  if (!lista) throw new Error('Lista não encontrada')

  const leads = await prisma.googleLead.findMany({
    where: { id: { in: ids }, userId: { in: scope } }
  })

  let addedCount = 0

  for (const lead of leads) {
    if (!lead.telefone) continue

    // Checa se já está na lista
    const exists = await prisma.leadListaDisparo.findFirst({
      where: {
        listaId: lista.id,
        telefoneSnapshot: lead.telefone
      }
    })

    if (!exists) {
      await prisma.leadListaDisparo.create({
        data: {
          listaId: lista.id,
          nomeSnapshot: lead.nome || 'Sem Nome',
          telefoneSnapshot: lead.telefone,
          mensagemFinal: lista.mensagemTemplate || ''
        }
      })
      addedCount++
      
      const newNotas = lead.notas ? `${lead.notas}\n[listado]` : '[listado]'
      if (!lead.notas || !lead.notas.includes('[listado]')) {
        await prisma.googleLead.update({ where: { id: lead.id }, data: { notas: newNotas } })
      }
    }
  }

  if (addedCount > 0) {
    await prisma.listaDisparo.update({
      where: { id: lista.id },
      data: { totalLeads: { increment: addedCount } }
    })
  }

  return { success: true, addedCount }
}

export async function createDealsFromGoogleLeads(ids: string[], pipelineId: string, stageId: string) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  const leads = await prisma.googleLead.findMany({
    where: { id: { in: ids }, userId: { in: scope } }
  })

  let createdCount = 0

  for (const lead of leads) {
    if (!lead.telefone) continue

    // Verifica se já existe contato
    let contact = await prisma.contact.findFirst({
      where: { userId: { in: scope }, telefone: lead.telefone }
    })

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          userId: user.userId,
          ownerUserId: user.userId,
          nome: lead.nome || 'Sem Nome',
          telefone: lead.telefone,
          cidade: lead.cidade,
          estado: lead.uf,
          tags: lead.nicho ? JSON.stringify([lead.nicho]) : null
        }
      })
    }

    // Verifica se já existe deal aberto na pipeline para este contato
    const existingDeal = await prisma.deal.findFirst({
      where: {
        pipelineId,
        contactId: contact.id,
        status: 'OPEN'
      }
    })

    if (!existingDeal) {
      const deal = await prisma.deal.create({
        data: {
          pipelineId,
          stageId,
          contactId: contact.id,
          userId: user.userId,
          ownerUserId: user.userId,
          titulo: lead.nome || 'Sem Nome',
          origem: 'Google',
          prioridade: 'MEDIA',
          tags: lead.nicho ? JSON.stringify([lead.nicho]) : null,
          telefone: lead.telefone,
          ramoEmpresa: lead.nicho,
          valorEstimado: 0
        }
      })
      
      // Registrar history
      await prisma.dealStageHistory.create({
        data: {
          dealId: deal.id,
          paraStageId: stageId,
          mudouPor: user.userId,
          fonte: 'api'
        }
      })

      createdCount++
    }
    
    // Atualiza status do lead do google para indicar que já gerou um negócio ou importou
    if (lead.status === 'NOVO') {
      await prisma.googleLead.update({
        where: { id: lead.id },
        data: {
          status: 'IMPORTADO',
          importedToCrm: true,
          importedAt: new Date(),
          crmContactId: contact.id
        }
      })
    }
  }

  return { success: true, createdCount }
}

export async function updateLeadNotes(id: string, notas: string) {
  const user = await requireAuth()
  if (!user) throw new Error('Não autorizado')
  const scope = await getTeamScope(user.userId)

  await prisma.googleLead.updateMany({
    where: { id, userId: { in: scope } },
    data: { notas }
  })
  
  return { success: true }
}

export async function getIbgeCities(uf: string) {
  if (!uf) return []
  try {
    const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`)
    if (!res.ok) throw new Error('Falha ao buscar cidades do IBGE')
    return await res.json()
  } catch (error) {
    console.error('Error fetching IBGE cities:', error)
    return []
  }
}
