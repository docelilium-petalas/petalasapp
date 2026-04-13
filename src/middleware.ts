import { NextRequest, NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'

const publicRoutes = ['/login', '/cadastro', '/esqueci-senha', '/redefinir-senha']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  })

  const isPublicRoute = publicRoutes.some((route) => pathname.startsWith(route))

  if (!token) {
    if (isPublicRoute) return NextResponse.next()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Authenticated user
  if (isPublicRoute) {
    const dest = (token.perfil as string) === 'admin' ? '/admin/dashboard' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (pathname === '/') {
    const dest = (token.perfil as string) === 'admin' ? '/admin/dashboard' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  if (pathname.startsWith('/admin') && token.perfil !== 'admin') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/auth|api/videos/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
