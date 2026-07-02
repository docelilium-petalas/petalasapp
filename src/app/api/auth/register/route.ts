import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { signToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

const ALL_FEATURES = [
  'dashboard', 'pipeline', 'contacts', 'activities',
  'lead-search-google', 'lead-search-cnpj', 'listas-disparo',
  'utm-analytics', 'ai-insights', 'relatorios', 'settings',
]

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
    }

    const { nome, email, password } = body as Record<string, unknown>

    if (typeof nome !== 'string' || !nome.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }
    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email é obrigatório.' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Senha deve ter pelo menos 6 caracteres.' }, { status: 400 })
    }

    const normalizedEmail = email.trim().toLowerCase()

    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (existing) {
      return NextResponse.json({ error: 'Este email já está cadastrado.' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)

    const newUser = await prisma.user.create({ data: { email: normalizedEmail, passwordHash } })

    await prisma.profile.create({
      data: { userId: newUser.id, nome: nome.trim(), sobrenome: '' },
    })

    await prisma.userRole.create({ data: { userId: newUser.id, role: 'ADMIN' } })

    await prisma.$transaction(
      ALL_FEATURES.map((feature) =>
        prisma.userFeaturePermission.create({ data: { userId: newUser.id, feature, allowed: true } })
      )
    )

    // Create or find default team "petalas"
    let defaultTeam = await prisma.team.findFirst({
      where: { nome: 'petalas' }
    })
    
    if (!defaultTeam) {
      defaultTeam = await prisma.team.create({
        data: { nome: 'petalas' }
      })
    }

    await prisma.teamMember.create({
      data: {
        teamId: defaultTeam.id,
        userId: newUser.id,
        role: 'ADMIN'
      }
    })

    // Ensure a default pipeline exists for the user
    const defaultPipeline = await prisma.pipeline.create({
      data: {
        userId: newUser.id,
        teamId: defaultTeam.id,
        nome: 'Funil Principal',
        isDefault: true,
        ordem: 0,
        ativo: true
      }
    })

    // Create standard stages
    const defaultStages = [
      { nome: 'Novo Lead', cor: '#00E676', probabilidade: 10, slaHours: 24, ordem: 1 },
      { nome: 'Contato Feito', cor: '#39FF88', probabilidade: 30, slaHours: 24, ordem: 2 },
      { nome: 'Apresentação', cor: '#2979FF', probabilidade: 50, slaHours: 48, ordem: 3 },
      { nome: 'Negociação', cor: '#FF9100', probabilidade: 80, slaHours: 72, ordem: 4 },
      { nome: 'Ganho', cor: '#00E676', probabilidade: 100, slaHours: 0, ordem: 5 },
      { nome: 'Perdido', cor: '#E91E63', probabilidade: 0, slaHours: 0, ordem: 6 }
    ]

    await prisma.stage.createMany({
      data: defaultStages.map(stage => ({
        ...stage,
        pipelineId: defaultPipeline.id
      }))
    })

    const token = await signToken({ userId: newUser.id, email: normalizedEmail, role: 'ADMIN' })

    const user = { id: newUser.id, email: normalizedEmail, nome: nome.trim(), sobrenome: '', role: 'ADMIN' }
    const response = NextResponse.json({ success: true, user })
    response.cookies.set('ocr_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    })

    return response
  } catch (err: any) {
    console.error('Erro no registro:', err)
    return NextResponse.json({ error: 'Erro interno. Tente novamente.' }, { status: 500 })
  }
}
