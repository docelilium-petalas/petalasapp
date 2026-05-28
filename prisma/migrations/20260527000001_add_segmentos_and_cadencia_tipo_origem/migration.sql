-- CreateTable: user_config (missing from initial migration)
CREATE TABLE IF NOT EXISTS "UserConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConfig_pkey" PRIMARY KEY ("id")
);

-- UniqueIndex for UserConfig
CREATE UNIQUE INDEX IF NOT EXISTS "UserConfig_userId_key_key" ON "UserConfig"("userId", "key");

-- AddForeignKey for UserConfig
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'UserConfig_userId_fkey'
  ) THEN
    ALTER TABLE "UserConfig" ADD CONSTRAINT "UserConfig_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable: add tipo_origem to cadencias
ALTER TABLE "cadencias" ADD COLUMN IF NOT EXISTS "tipo_origem" TEXT DEFAULT 'personalizada';

-- CreateTable: segmentos
CREATE TABLE IF NOT EXISTS "segmentos" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "prioridade" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'personalizado',
    "filtros" TEXT NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "segmentos_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey for segmentos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'segmentos_userId_fkey'
  ) THEN
    ALTER TABLE "segmentos" ADD CONSTRAINT "segmentos_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
