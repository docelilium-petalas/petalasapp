import { SignJWT, jwtVerify } from 'jose'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

function getJwtSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET
  if (!secret) {
    throw new Error(
      'JWT_SECRET or NEXTAUTH_SECRET environment variable is required but not set. ' +
      'Add JWT_SECRET=<random-64-char-string> to your .env file.'
    )
  }
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: JwtPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(getJwtSecret())
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getJwtSecret())
  return {
    userId: payload['userId'] as string,
    email: payload['email'] as string,
    role: payload['role'] as string,
  }
}

export async function getUserFromRequest(request: Request): Promise<JwtPayload | null> {
  const token = request.headers.get('cookie')?.match(/ocr_auth_token=([^;]+)/)?.[1]
  if (!token) return null
  try {
    return await verifyToken(token)
  } catch {
    return null
  }
}
