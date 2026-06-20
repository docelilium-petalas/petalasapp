import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export async function POST(req: Request) {
  try {
    const user = await getUserFromRequest(req)
    if (!user) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const { estado, cidade, nicho } = body

    if (!estado || !cidade || !nicho) {
      return NextResponse.json({ error: 'Estado, cidade e nicho são obrigatórios' }, { status: 400 })
    }

    // Registrar no histórico de buscas
    const historico = await prisma.historicoBuscas.create({
      data: {
        userId: user.userId,
        nicho,
        cidade,
        estado,
        statusProcessamento: 'processando',
        payload: JSON.stringify(body)
      }
    })

    // Buscar Webhook configurado
    const setting = await prisma.systemSetting.findUnique({
      where: { chave: 'googleMapsWebhook' }
    })
    
    let webhookUrl = setting?.valor
    
    // Fallbacks para a URL do webhook
    if (!webhookUrl || !webhookUrl.startsWith('http')) {
      webhookUrl = 'https://auto.devnetlife.com/webhook/buscar-google-ocr'
    }

    const payload = {
      estado,
      cidade,
      nicho,
      user_id: user.userId,
      historico_id: historico.id
    }

    // Disparar N8N com timeout de 15 segundos
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      }).catch(err => {
        console.error('Erro silencioso no disparo do webhook:', err)
      })
      clearTimeout(timeoutId)
    } catch (fetchError: any) {
      console.warn('Timeout ou erro ao disparar N8N (esperado se demorar):', fetchError)
      // Não falhamos a request do frontend, apenas logamos
    }

    return NextResponse.json({
      success: true,
      message: 'Busca iniciada.'
    })
  } catch (error: any) {
    console.error('Erro ao iniciar busca google:', error)
    return NextResponse.json({ error: 'Erro ao iniciar busca' }, { status: 500 })
  }
}
