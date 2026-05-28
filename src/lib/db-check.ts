// Server-only: DB connectivity check with TTL cache (30s success / 10s failure).
// Kept separate from services.ts so the dynamic prisma import never enters the client bundle.

interface DbCheckCache { value: boolean; expiresAt: number }
let _dbCheck: DbCheckCache | null = null

export async function isDbOnline(): Promise<boolean> {
  if (_dbCheck && Date.now() < _dbCheck.expiresAt) return _dbCheck.value
  try {
    if (!process.env.DATABASE_URL) {
      _dbCheck = { value: false, expiresAt: Date.now() + 30_000 }
      return false
    }
    const { default: prisma } = await import('./prisma')
    await prisma.$queryRaw`SELECT 1`
    _dbCheck = { value: true, expiresAt: Date.now() + 30_000 }
    return true
  } catch {
    _dbCheck = { value: false, expiresAt: Date.now() + 10_000 }
    return false
  }
}

export function resetDbCheck() {
  _dbCheck = null
}
