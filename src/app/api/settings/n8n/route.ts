import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { chave: 'googleMapsWebhook' }
    })
    
    return NextResponse.json({
      googleMapsWebhook: setting?.valor || 'https://auto.devnetlife.com/webhook/buscar-google-ocr'
    })
  } catch (error: any) {
    console.error('Erro ao buscar settings n8n:', error)
    return NextResponse.json({ error: 'Erro ao buscar settings' }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const { googleMapsWebhook } = await req.json()

    if (!googleMapsWebhook || !googleMapsWebhook.startsWith('http')) {
      return NextResponse.json({ error: 'URL inválida' }, { status: 400 })
    }

    const updated = await prisma.systemSetting.upsert({
      where: { chave: 'googleMapsWebhook' },
      update: { valor: googleMapsWebhook },
      create: { chave: 'googleMapsWebhook', valor: googleMapsWebhook }
    })

    return NextResponse.json({ success: true, setting: updated })
  } catch (error: any) {
    console.error('Erro ao salvar settings n8n:', error)
    return NextResponse.json({ error: 'Erro ao salvar settings' }, { status: 500 })
  }
}
