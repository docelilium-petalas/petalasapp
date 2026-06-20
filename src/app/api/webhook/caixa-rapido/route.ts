import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  // Validate callback secret from n8n
  const callbackSecret = process.env.WEBHOOK_CALLBACK_SECRET
  if (callbackSecret) {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    if (token !== callbackSecret) {
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
    }
  }

  try {
    const body = await request.json()
    const { event, lista_id, total, finalizado_em } = body

    if (!event || !lista_id) {
      return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 })
    }

    if (event === 'mensagem_enviada') {
      const { telefone } = body

      if (!telefone) {
        return NextResponse.json({ success: false, error: 'Parâmetro telefone ausente.' }, { status: 400 })
      }

      // Format telefone just to be sure (remove non-digits)
      const formattedPhone = telefone.replace(/\D/g, '')
      const matchPhone = formattedPhone.length >= 8 ? formattedPhone.slice(-8) : formattedPhone

      // Encontrar o LeadListaDisparo
      const leadLista = await prisma.leadListaDisparo.findFirst({
        where: { listaId: lista_id, telefoneSnapshot: { endsWith: matchPhone } },
        include: { deal: true }
      })

      if (leadLista) {
        await prisma.leadListaDisparo.update({
          where: { id: leadLista.id },
          data: { statusEnvio: 'ENVIADO', dataEnvio: new Date() }
        })

        // Incrementar contagem na lista
        await prisma.listaDisparo.update({
          where: { id: lista_id },
          data: { enviados: { increment: 1 } }
        })

        // Atualizar tag 'mensagem_enviada' com contador de disparos
        const updateDisparosTag = (tags: string[]): string[] => {
          const idx = tags.findIndex(t => t.startsWith('disparos:'))
          const count = idx >= 0 ? parseInt(tags[idx].split(':')[1] || '0', 10) + 1 : 1
          const filtered = tags.filter(t => t !== 'mensagem_enviada' && !t.startsWith('disparos:'))
          return [...filtered, 'mensagem_enviada', `disparos:${count}`]
        }

        if (leadLista.leadId) {
          const contact = await prisma.contact.findUnique({ where: { id: leadLista.leadId } })
          if (contact) {
            const tags = contact.tags ? JSON.parse(contact.tags) : []
            await prisma.contact.update({ where: { id: leadLista.leadId }, data: { tags: JSON.stringify(updateDisparosTag(tags)) } })
          }
        }
        if (leadLista.dealId) {
          const deal = await prisma.deal.findUnique({ where: { id: leadLista.dealId } })
          if (deal) {
            const tags = deal.tags ? JSON.parse(deal.tags) : []
            await prisma.deal.update({ where: { id: leadLista.dealId }, data: { tags: JSON.stringify(updateDisparosTag(tags)) } })
          }
        }
        
        revalidatePath('/caixa-rapido')
        revalidatePath('/cadencias')
      }

      return NextResponse.json({ success: true, message: 'Status de envio atualizado.' })
    }

    if (event === 'lista_finalizada') {
      const lista = await prisma.listaDisparo.findUnique({
        where: { id: lista_id },
        include: { leads: { select: { id: true, dealId: true, leadId: true } } }
      })

      if (!lista) {
        return NextResponse.json({ success: false, error: 'Lista não encontrada.' }, { status: 404 })
      }

      // Mark all PENDENTE leads as ENVIADO so the report shows correct status
      await prisma.leadListaDisparo.updateMany({
        where: { listaId: lista_id, statusEnvio: 'PENDENTE' },
        data: { statusEnvio: 'ENVIADO', dataEnvio: new Date() }
      })

      // Count actual sent leads from DB instead of trusting webhook payload directly
      const actualSent = await prisma.leadListaDisparo.count({
        where: { listaId: lista_id, statusEnvio: 'ENVIADO' }
      })

      const updated = await prisma.listaDisparo.update({
        where: { id: lista_id },
        data: { status: 'CONCLUIDA', enviados: actualSent }
      })

      // Mark sent deals/contacts as "disparado" (replaces "listado")
      // Since all PENDENTE leads were just marked as ENVIADO, we can just use all leads from the list
      // that are now marked as ENVIADO.
      const sentLeads = await prisma.leadListaDisparo.findMany({
        where: { listaId: lista_id, statusEnvio: 'ENVIADO' },
        select: { dealId: true, leadId: true }
      })
      
      const sentDealIds = sentLeads.filter(l => l.dealId).map(l => l.dealId!)
      const sentContactIds = sentLeads.filter(l => l.leadId).map(l => l.leadId!)

      if (sentDealIds.length > 0) {
        const deals = await prisma.deal.findMany({ where: { id: { in: sentDealIds } } })
        for (const d of deals) {
          const tags: string[] = d.tags ? JSON.parse(d.tags) : []
          const disparosTag = tags.find(t => t.startsWith('disparos:'))
          const count = disparosTag ? parseInt(disparosTag.split(':')[1] || '0', 10) : 0
          const cleaned = tags.filter(t => t !== 'listado' && t !== 'mensagem_enviada' && !t.startsWith('disparos:'))
          cleaned.push('disparado', `disparos:${count || actualSent}`)
          await prisma.deal.update({ where: { id: d.id }, data: { tags: JSON.stringify(cleaned) } })
        }
      }
      if (sentContactIds.length > 0) {
        const contacts = await prisma.contact.findMany({ where: { id: { in: sentContactIds } } })
        for (const c of contacts) {
          const tags: string[] = c.tags ? JSON.parse(c.tags) : []
          const disparosTag = tags.find(t => t.startsWith('disparos:'))
          const count = disparosTag ? parseInt(disparosTag.split(':')[1] || '0', 10) : 0
          const cleaned = tags.filter(t => t !== 'listado' && t !== 'mensagem_enviada' && !t.startsWith('disparos:'))
          cleaned.push('disparado', `disparos:${count || actualSent}`)
          await prisma.contact.update({ where: { id: c.id }, data: { tags: JSON.stringify(cleaned) } })
        }
      }

      revalidatePath('/caixa-rapido')
      revalidatePath('/cadencias')

      return NextResponse.json({
        success: true,
        message: 'Status da lista finalizado com sucesso.',
        lista: {
          id: updated.id,
          nomeLista: updated.nomeLista,
          status: updated.status,
          enviados: updated.enviados
        }
      })
    }

    return NextResponse.json({ success: false, error: `Evento '${event}' não reconhecido.` }, { status: 400 })
  } catch (error: any) {
    console.error('Erro no webhook de retorno do Caixa Rápido:', error)
    return NextResponse.json({ success: false, error: error.message || 'Erro interno do servidor.' }, { status: 500 })
  }
}
