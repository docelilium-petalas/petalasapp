export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    // Aceita tanto o formato do n8n (video/videoId) quanto o formato interno (video_url/video_id)
    const video_id = body.video_id || body.videoId
    const video_url = body.video_url || body.video

    if (!video_id || !video_url) {
      return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
    }

    const video = await prisma.video.findUnique({ where: { id: video_id } })
    if (!video) {
      return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 })
    }

    await prisma.video.update({
      where: { id: video_id },
      data: { status: 'concluido', video_url },
    })

    await prisma.profile.update({
      where: { id: video.user_id },
      data: { cota_usada: { increment: 1 }, last_activity: new Date() },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
