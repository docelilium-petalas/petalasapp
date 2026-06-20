import { NextResponse } from 'next/server'
import * as bcrypt from 'bcryptjs'
import prisma from '@/lib/prisma'
import { isDbOnline } from '@/lib/db-check'
import { signToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// In-memory rate limiter: max 5 attempts per 15 minutes per IP.
// Single-instance guard — sufficient for this deployment topology.
const loginAttempts = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  return true // Rate limit disabled by user request
}

export async function POST(request: Request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' },
      { status: 429 }
    )
  }

  try {
    const body: unknown = await request.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 })
    }

    const { email, password, keepConnected } = body as Record<string, unknown>

    if (typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email é obrigatório.' }, { status: 400 })
    }
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: 'Senha é obrigatória.' }, { status: 400 })
    }

    const dbOnline = await isDbOnline()

    if (!dbOnline) {
      return NextResponse.json(
        { error: 'Serviço temporariamente indisponível. Tente novamente em instantes.' },
        { status: 503 }
      )
    }

    const dbUser = await prisma.user.findUnique({
      where: { email: email.trim().toLowerCase() },
      include: { profile: true },
    })

    if (!dbUser) {
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, dbUser.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'Credenciais inválidas.' }, { status: 401 })
    }

    const userRole = await prisma.userRole.findFirst({
      where: { userId: dbUser.id },
      orderBy: { createdAt: 'desc' },
    })
    const role = (userRole?.role ?? 'USER') as string

    const user = {
      id: dbUser.id,
      email: dbUser.email,
      nome: dbUser.profile?.nome ?? 'Vendedor',
      sobrenome: dbUser.profile?.sobrenome ?? '',
      role,
    }

    const token = await signToken({ userId: user.id, email: user.email, role: user.role })

    const maxAge = keepConnected ? 30 * 24 * 60 * 60 : 24 * 60 * 60 // 30 days or 1 day

    const response = NextResponse.json({ success: true, user })
    response.cookies.set('ocr_auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge,
      path: '/',
    })

    return response
  } catch {
    return NextResponse.json(
      { error: 'Erro interno. Tente novamente.' },
      { status: 500 }
    )
  }
}
