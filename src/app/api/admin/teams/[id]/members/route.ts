import { NextResponse } from 'next/server'
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

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const { id: teamId } = await params
  const { userId } = await request.json() as { userId: string }
  if (!userId) return NextResponse.json({ error: 'userId obrigatório.' }, { status: 400 })

  const existing = await prisma.teamMember.findFirst({ where: { teamId, userId } })
  if (!existing) {
    await prisma.teamMember.create({ data: { teamId, userId, role: 'USER' } })
  }

  return NextResponse.json({ success: true })
}
