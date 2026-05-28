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

export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const teams = await prisma.team.findMany({
    include: { members: { include: { user: { include: { profile: true } } } } },
    orderBy: { createdAt: 'asc' },
  })

  return NextResponse.json(
    teams.map((t) => ({
      id: t.id,
      nome: t.nome,
      ownerUserId: t.members.find((m) => m.role === 'ADMIN')?.userId ?? '',
      members: t.members.map((m) => m.userId),
      membersDetail: t.members.map((m) => ({
        id: m.userId,
        nome: m.user.profile?.nome ?? '',
        sobrenome: m.user.profile?.sobrenome ?? '',
        email: m.user.email,
        role: m.role,
      })),
    }))
  )
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const body = await request.json() as { nome: string; ownerUserId: string }
  if (!body.nome?.trim() || !body.ownerUserId) {
    return NextResponse.json({ error: 'Nome e líder são obrigatórios.' }, { status: 400 })
  }

  const team = await prisma.team.create({ data: { nome: body.nome.trim() } })
  await prisma.teamMember.create({ data: { teamId: team.id, userId: body.ownerUserId, role: 'ADMIN' } })

  return NextResponse.json({ id: team.id, nome: team.nome, ownerUserId: body.ownerUserId, members: [body.ownerUserId] })
}
