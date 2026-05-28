import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

declare const globalThis: {
  prismaGlobal: PrismaClient | undefined;
} & typeof global;

let _instance: PrismaClient | undefined

function getInstance(): PrismaClient {
  if (!_instance) {
    if (globalThis.prismaGlobal) {
      _instance = globalThis.prismaGlobal
    } else {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL })
      const adapter = new PrismaPg(pool)
      _instance = new PrismaClient({ adapter })
      if (process.env.NODE_ENV !== 'production') {
        globalThis.prismaGlobal = _instance
      }
    }
  }
  return _instance
}

const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop: string | symbol) {
    return getInstance()[prop as keyof PrismaClient]
  }
})

export default prisma
