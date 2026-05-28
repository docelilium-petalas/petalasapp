import { NextResponse } from 'next/server'

// This is a dynamic route – never pre-render at build time
export const dynamic = 'force-dynamic'


export async function POST() {
  const response = NextResponse.json({ success: true })
  // Clear cookie
  response.cookies.set('ocr_auth_token', '', {
    httpOnly: true,
    expires: new Date(0),
    path: '/'
  })
  return response
}
