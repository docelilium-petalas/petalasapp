import { PrismaClient } from '@prisma/client'
const p = new PrismaClient()
const rows = await p.$queryRawUnsafe(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
)
rows.forEach(r => console.log(r.table_name))
await p.$disconnect()
