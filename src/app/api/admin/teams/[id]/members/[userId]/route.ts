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

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const { id: teamId, userId } = await params
  await prisma.teamMember.deleteMany({ where: { teamId, userId } })
  return NextResponse.json({ success: true })
}
