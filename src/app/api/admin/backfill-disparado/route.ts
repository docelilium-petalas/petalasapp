import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const auth = await getUserFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  // Find all CONCLUIDA lists with their sent leads
  const listas = await prisma.listaDisparo.findMany({
    where: { status: 'CONCLUIDA' },
    include: {
      leads: {
        where: { statusEnvio: 'ENVIADO' },
        select: { dealId: true, leadId: true }
      }
    }
  })

  let dealsUpdated = 0
  let contactsUpdated = 0

  for (const lista of listas) {
    const sentDealIds = lista.leads.filter(l => l.dealId).map(l => l.dealId!)
    const sentContactIds = lista.leads.filter(l => l.leadId).map(l => l.leadId!)

    if (sentDealIds.length > 0) {
      const deals = await prisma.deal.findMany({ where: { id: { in: sentDealIds } } })
      for (const d of deals) {
        const tags: string[] = d.tags ? JSON.parse(d.tags) : []
        if (tags.includes('disparado')) continue // already migrated
        const disparosTag = tags.find(t => t.startsWith('disparos:'))
        const count = disparosTag ? parseInt(disparosTag.split(':')[1] || '0', 10) : lista.enviados || 1
        const cleaned = tags.filter(t => t !== 'listado' && t !== 'mensagem_enviada' && !t.startsWith('disparos:'))
        cleaned.push('disparado', `disparos:${count}`)
        await prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(cleaned) } })
        dealsUpdated++
      }
    }

    if (sentContactIds.length > 0) {
      const contacts = await prisma.contact.findMany({ where: { id: { in: sentContactIds } } })
      for (const c of contacts) {
        const tags: string[] = c.tags ? JSON.parse(c.tags) : []
        if (tags.includes('disparado')) continue
        const disparosTag = tags.find(t => t.startsWith('disparos:'))
        const count = disparosTag ? parseInt(disparosTag.split(':')[1] || '0', 10) : lista.enviados || 1
        const cleaned = tags.filter(t => t !== 'listado' && t !== 'mensagem_enviada' && !t.startsWith('disparos:'))
        cleaned.push('disparado', `disparos:${count}`)
        await prisma.contact.update({ where: { id: c.id }, data: { tags: JSON.stringify(cleaned) } })
        contactsUpdated++
      }
    }
  }

  return NextResponse.json({
    success: true,
    listasProcessadas: listas.length,
    dealsUpdated,
    contactsUpdated
  })
}
