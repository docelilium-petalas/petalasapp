import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const callbackSecret = process.env.N8N_CALLBACK_SECRET
  if (callbackSecret) {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader
    if (token !== callbackSecret) {
      return NextResponse.json({ success: false, error: 'Não autorizado.' }, { status: 401 })
    }
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ success: false, error: 'Corpo da requisição inválido.' }, { status: 400 })
  }

  const { event, lista_id, total, finalizado_em, telefone } = body as {
    event?: string
    lista_id?: string
    total?: number | string
    finalizado_em?: string
    telefone?: string
  }

  if (!event || !lista_id) {
    return NextResponse.json({ success: false, error: 'Parâmetros obrigatórios ausentes.' }, { status: 400 })
  }

  try {
    if (event === 'mensagem_enviada') {
      if (!telefone) {
        return NextResponse.json({ success: false, error: 'Parâmetro telefone ausente.' }, { status: 400 })
      }

      const formattedPhone = telefone.replace(/\D/g, '')
      const matchPhone = formattedPhone.length >= 8 ? formattedPhone.slice(-8) : formattedPhone

      const leadLista = await prisma.leadListaDisparo.findFirst({
        where: { listaId: lista_id, telefoneSnapshot: { endsWith: matchPhone } },
        include: { deal: true }
      })

      if (leadLista) {
        await prisma.leadListaDisparo.update({
          where: { id: leadLista.id },
          data: { statusEnvio: 'ENVIADO', dataEnvio: new Date() }
        })

        await prisma.listaDisparo.update({
          where: { id: lista_id },
          data: { enviados: { increment: 1 } }
        })

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

      await prisma.leadListaDisparo.updateMany({
        where: { listaId: lista_id, statusEnvio: 'PENDENTE' },
        data: { statusEnvio: 'ENVIADO', dataEnvio: new Date() }
      })

      const actualSent = await prisma.leadListaDisparo.count({
        where: { listaId: lista_id, statusEnvio: 'ENVIADO' }
      })

      const updated = await prisma.listaDisparo.update({
        where: { id: lista_id },
        data: { status: 'CONCLUIDA', enviados: actualSent }
      })

      await prisma.eventIngestLog.create({
        data: {
          source: 'n8n/doce-lilium',
          payload: JSON.stringify({ event, lista_id, total, finalizado_em }),
          status: 'processed'
        }
      })

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
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro interno do servidor.'
    console.error('Erro no webhook Doce Lilium:', error)
    return NextResponse.json({ success: false, error: msg }, { status: 500 })
  }
}
