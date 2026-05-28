process.env.DATABASE_URL = 'postgres://postgres:caixarapido2105@easy.devnetlife.com:2206/dbopcaixarapido?sslmode=disable'

async function main() {
  const prismaModule = await import('./src/lib/prisma')
  const prisma = prismaModule.default
  const rows: Array<{ table_name: string }> = await prisma.$queryRawUnsafe(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  )
  console.log('\n=== TABELAS DO BANCO ===')
  rows.forEach(r => console.log(' -', r.table_name))
  console.log(`\nTotal: ${rows.length} tabelas`)
}

main().catch(e => { console.error(e); process.exit(1) })
