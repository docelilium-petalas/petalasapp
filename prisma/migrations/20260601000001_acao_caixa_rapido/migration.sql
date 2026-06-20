-- CreateEnum
CREATE TYPE "AcaoStatus" AS ENUM ('ATIVA', 'CONCLUIDA', 'CANCELADA');

-- AlterEnum
ALTER TYPE "ListaDisparoStatus" ADD VALUE 'AGENDADA';

-- CreateTable
CREATE TABLE "acoes_caixa_rapido" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "cadencia_id" TEXT,
    "status" "AcaoStatus" NOT NULL DEFAULT 'ATIVA',
    "totalEtapas" INTEGER NOT NULL DEFAULT 0,
    "totalLeads" INTEGER NOT NULL DEFAULT 0,
    "configEnvio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acoes_caixa_rapido_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ListaDisparo"
    ADD COLUMN IF NOT EXISTS "acao_id" TEXT,
    ADD COLUMN IF NOT EXISTS "etapa_numero" INTEGER,
    ADD COLUMN IF NOT EXISTS "data_agendamento" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "acoes_caixa_rapido" ADD CONSTRAINT "acoes_caixa_rapido_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaDisparo" ADD CONSTRAINT "ListaDisparo_acao_id_fkey"
    FOREIGN KEY ("acao_id") REFERENCES "acoes_caixa_rapido"("id") ON DELETE CASCADE ON UPDATE CASCADE;
