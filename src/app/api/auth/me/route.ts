import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { isDbOnline } from '@/lib/db-check'
import { verifyToken } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const cookiesStr = request.headers.get('cookie') ?? ''
    const token = cookiesStr.match(/ocr_auth_token=([^;]+)/)?.[1]

    if (!token) {
      return NextResponse.json({ authenticated: false }, { status: 401 })
    }

    // Throws if expired or tampered
    const decoded = await verifyToken(token)

    const dbOnline = await isDbOnline()

    if (dbOnline) {
      try {
        const dbUser = await prisma.user.findUnique({
          where: { id: decoded.userId },
          include: { profile: true },
        })
        if (dbUser) {
          return NextResponse.json({
            authenticated: true,
            user: {
              id: dbUser.id,
              email: dbUser.email,
              nome: dbUser.profile?.nome ?? 'Vendedor',
              sobrenome: dbUser.profile?.sobrenome ?? '',
              telefone: dbUser.profile?.telefone ?? '',
              avatarUrl: dbUser.profile?.avatarUrl ?? '',
              role: decoded.role,
            },
          })
        }
      } catch {
        // DB query failed — serve from verified token claims below
      }
    }

    // DB offline or user not found: trust the verified JWT claims
    return NextResponse.json({
      authenticated: true,
      user: {
        id: decoded.userId,
        email: decoded.email,
        nome: 'Vendedor',
        sobrenome: '',
        role: decoded.role,
      },
    })
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 401 })
  }
}
