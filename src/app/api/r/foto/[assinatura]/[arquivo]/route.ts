import { NextResponse } from 'next/server'
import { conferirFoto } from '@/lib/atendimento/foto-whatsapp'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * Conversor de foto para o WhatsApp: baixa a foto da CDN da Nuvemshop e
 * devolve JPEG. Público de propósito (quem baixa é a Meta), mas só abre link
 * assinado pelo CRM — ver `lib/atendimento/foto-whatsapp.ts`.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ assinatura: string; arquivo: string }> }) {
  const { assinatura, arquivo } = await ctx.params
  const url = conferirFoto(assinatura, arquivo)
  if (!url) return NextResponse.json({ erro: 'link inválido' }, { status: 404 })

  const origem = await fetch(url, { cache: 'no-store' })
  if (!origem.ok) return NextResponse.json({ erro: `origem ${origem.status}` }, { status: 502 })
  const bruto = Buffer.from(await origem.arrayBuffer())

  const sharp = (await import('sharp')).default
  const jpeg = await sharp(bruto)
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer()

  return new NextResponse(new Uint8Array(jpeg), {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(jpeg.length),
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  })
}
