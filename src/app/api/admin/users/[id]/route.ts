import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function requireAdmin(request: Request) {
  const auth = await getUserFromRequest(request)
  if (!auth) return null
  const role = await prisma.userRole.findFirst({ where: { userId: auth.userId }, orderBy: { createdAt: 'desc' } })
  if (role?.role !== 'ADMIN') return null
  return auth
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const { id } = await params
  const body: unknown = await request.json()
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { role, password, permissions } = body as Record<string, unknown>

  if (typeof role === 'string' && ['ADMIN', 'MODERATOR', 'USER'].includes(role)) {
    const existing = await prisma.userRole.findFirst({ where: { userId: id }, orderBy: { createdAt: 'desc' } })
    if (existing) {
      await prisma.userRole.update({ where: { id: existing.id }, data: { role: role as 'ADMIN' | 'MODERATOR' | 'USER' } })
    } else {
      await prisma.userRole.create({ data: { userId: id, role: role as 'ADMIN' | 'MODERATOR' | 'USER' } })
    }
  }

  if (typeof password === 'string' && password.length >= 6) {
    const hash = await bcrypt.hash(password, 10)
    await prisma.user.update({ where: { id }, data: { passwordHash: hash } })
  }

  if (Array.isArray(permissions)) {
    await prisma.userFeaturePermission.deleteMany({ where: { userId: id } })
    if (permissions.length > 0) {
      await prisma.$transaction(
        (permissions as string[]).map((feature) =>
          prisma.userFeaturePermission.create({ data: { userId: id, feature, allowed: true } })
        )
      )
    }
  }


  return NextResponse.json({ success: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const { id } = await params

  if (id === auth.userId) return NextResponse.json({ error: 'Você não pode excluir sua própria conta.' }, { status: 400 })

  await prisma.user.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
