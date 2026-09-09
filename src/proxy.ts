import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

async function verifyAuthToken(token: string): Promise<boolean> {
  const secret = process.env.JWT_SECRET
  if (!secret) return false
  try {
    await jwtVerify(token, new TextEncoder().encode(secret))
    return true
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const token = request.cookies.get('ocr_auth_token')?.value
  const { pathname } = request.nextUrl

  const isPublic =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/api/webhook') ||
    pathname.startsWith('/api/cron') ||
    // Callback do OAuth da Nuvemshop. Publico POR NATUREZA: a loja redireciona
    // o NAVEGADOR para ca, e quem instala pode nao ter sessao no CRM — se
    // cair no login, o codigo de autorizacao se perde, e ele vale 5 minutos.
    // A protecao nao e sessao: e o codigo so existir se a Nuvemshop o emitiu,
    // e a troca por token exigir o nosso client secret.
    pathname === '/api/nuvemshop/oauth' ||
    pathname.startsWith('/_next') ||
    pathname.includes('.')

  if (isPublic) {
    if (pathname === '/auth' && token && (await verifyAuthToken(token))) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return NextResponse.next()
  }

  if (!token || !(await verifyAuthToken(token))) {
    const response = NextResponse.redirect(new URL('/auth', request.url))
    if (token) {
      // Clear invalid/expired token to avoid redirect loops
      response.cookies.delete('ocr_auth_token')
    }
    return response
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
