import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { getUserFromRequest } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALL_FEATURES = [
  'dashboard', 'pipeline', 'contacts', 'activities',
  'lead-search-google', 'lead-search-cnpj', 'listas-disparo',
  'utm-analytics', 'ai-insights', 'relatorios', 'settings',
]

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

  const dbUsers = await prisma.user.findMany({
    include: {
      profile: true,
      roles: { orderBy: { createdAt: 'desc' }, take: 1 },
      permissions: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  const users = dbUsers.map((u) => ({
    id: u.id,
    email: u.email,
    nome: u.profile?.nome ?? '',
    sobrenome: u.profile?.sobrenome ?? '',
    role: (u.roles[0]?.role ?? 'USER') as string,
    permissions: u.permissions.filter((p: { allowed: boolean }) => p.allowed).map((p: { feature: string }) => p.feature),
    visiblePipelines: [] as string[],
  }))

  return NextResponse.json(users)
}

export async function POST(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth) return NextResponse.json({ error: 'Proibido.' }, { status: 403 })

  const body: unknown = await request.json()
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })

  const { email, nome, role, password } = body as Record<string, unknown>

  if (typeof email !== 'string' || !email.trim()) return NextResponse.json({ error: 'Email obrigatório.' }, { status: 400 })
  if (typeof nome !== 'string' || !nome.trim()) return NextResponse.json({ error: 'Nome obrigatório.' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
  if (existing) return NextResponse.json({ error: 'E-mail já cadastrado.' }, { status: 409 })

  const rawPassword = typeof password === 'string' && password ? password : Math.random().toString(36).slice(2, 10)
  const passwordHash = await bcrypt.hash(rawPassword, 10)
  const appRole = (['ADMIN', 'MODERATOR', 'USER'].includes(role as string) ? role : 'USER') as 'ADMIN' | 'MODERATOR' | 'USER'

  const newUser = await prisma.user.create({ data: { email: normalizedEmail, passwordHash } })
  await prisma.profile.create({ data: { userId: newUser.id, nome: nome.trim(), sobrenome: '' } })
  await prisma.userRole.create({ data: { userId: newUser.id, role: appRole } })
  await prisma.$transaction(
    ALL_FEATURES.map((feature) => prisma.userFeaturePermission.create({ data: { userId: newUser.id, feature, allowed: true } }))
  )

  return NextResponse.json({
    id: newUser.id,
    email: normalizedEmail,
    nome: nome.trim(),
    sobrenome: '',
    role: appRole,
    permissions: ALL_FEATURES,
    visiblePipelines: [],
  })
}
