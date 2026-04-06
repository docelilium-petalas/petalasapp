import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  const password = await bcrypt.hash('admin123', 10)

  const admin = await prisma.profile.upsert({
    where: { email: 'admin@docelilium.com.br' },
    update: {},
    create: {
      nome: 'Administrador',
      email: 'admin@docelilium.com.br',
      password,
      perfil: 'admin',
      status: 'ativo',
      cota_mensal: 999,
      cota_usada: 0,
    },
  })

  console.log('Admin criado:', admin.email)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
