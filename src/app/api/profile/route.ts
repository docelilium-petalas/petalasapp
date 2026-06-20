import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function PUT(request: Request) {
  const auth = await getUserFromRequest(request)
  if (!auth) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 })

  const body = await request.json() as {
    nome?: string
    sobrenome?: string
    telefone?: string
    avatarUrl?: string
    disparo_webhook_url?: string
    disparo_status_webhook_url?: string
    disparo_cancelar_webhook_url?: string
  }

  const updated = await prisma.profile.update({
    where: { userId: auth.userId },
    data: {
      ...(body.nome !== undefined && { nome: body.nome.trim() }),
      ...(body.sobrenome !== undefined && { sobrenome: body.sobrenome.trim() }),
      ...(body.telefone !== undefined && { telefone: body.telefone.trim() }),
      ...(body.avatarUrl !== undefined && { avatarUrl: body.avatarUrl.trim() }),
      ...(body.disparo_webhook_url !== undefined && { disparoWebhookUrl: body.disparo_webhook_url.trim() }),
      ...(body.disparo_status_webhook_url !== undefined && { disparoStatusWebhookUrl: body.disparo_status_webhook_url.trim() }),
      ...(body.disparo_cancelar_webhook_url !== undefined && { disparoCancelarWebhookUrl: body.disparo_cancelar_webhook_url.trim() }),
    },
  })

  return NextResponse.json({
    id: auth.userId,
    nome: updated.nome,
    sobrenome: updated.sobrenome,
    telefone: updated.telefone ?? '',
    avatarUrl: updated.avatarUrl ?? '',
    disparo_webhook_url: updated.disparoWebhookUrl ?? '',
    disparo_status_webhook_url: updated.disparoStatusWebhookUrl ?? '',
    disparo_cancelar_webhook_url: updated.disparoCancelarWebhookUrl ?? '',
  })
}
