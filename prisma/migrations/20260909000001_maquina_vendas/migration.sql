-- Modulos Maquina de Vendas e Desafios, mais as tabelas que o schema ja
-- declarava e nunca chegaram a producao (system_settings, google_leads, niches).
-- ADITIVA: nenhuma tabela ou coluna existente e apagada.
-- O DROP CONSTRAINT em UserConfig foi deixado de fora de proposito: muda
-- integridade referencial e merece decisao propria, nao carona em feature.

-- CreateEnum
CREATE TYPE "GoogleLeadStatus" AS ENUM ('NOVO', 'IMPORTADO', 'DESCARTADO');

-- AlterTable
ALTER TABLE "acoes_caixa_rapido" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "webhooks" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "system_settings" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "google_leads" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "userId" TEXT NOT NULL,
    "nome" TEXT,
    "telefone" TEXT,
    "endereco" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "nicho" TEXT,
    "site" TEXT,
    "dataBusca" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "GoogleLeadStatus" NOT NULL DEFAULT 'NOVO',
    "notas" TEXT,
    "importedToCrm" BOOLEAN NOT NULL DEFAULT false,
    "importedAt" TIMESTAMP(3),
    "crmContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niches" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "categoria" TEXT NOT NULL DEFAULT 'PROSPECCAO',
    "status" TEXT NOT NULL DEFAULT 'ativo',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "niches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_cadencias" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "gatilho" TEXT NOT NULL,
    "pipeline_id" TEXT,
    "stage_id" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_vendas_cadencias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_cadencia_etapas" (
    "id" TEXT NOT NULL,
    "cadencia_id" TEXT NOT NULL,
    "ordem" INTEGER NOT NULL,
    "delay_minutos" INTEGER NOT NULL,
    "ancorada_em" TEXT NOT NULL DEFAULT 'gatilho',
    "template_base" TEXT NOT NULL,
    "template_nome" TEXT,
    "eh_ultima" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "maquina_vendas_cadencia_etapas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_inscricoes" (
    "id" TEXT NOT NULL,
    "cadencia_id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "ref_externa" TEXT NOT NULL,
    "deal_id" TEXT,
    "contact_id" TEXT,
    "nome_snapshot" TEXT NOT NULL,
    "telefone_e164" TEXT NOT NULL,
    "telefone_key" TEXT NOT NULL,
    "prioridade" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ATIVA',
    "motivo_parada" TEXT,
    "tentativas" INTEGER NOT NULL DEFAULT 0,
    "ancora_em" TIMESTAMP(3) NOT NULL,
    "contexto" JSONB,
    "respondeu_em" TIMESTAMP(3),
    "respostas" INTEGER NOT NULL DEFAULT 0,
    "humano_falou_em" TIMESTAMP(3),
    "converteu_em" TIMESTAMP(3),
    "valor_convertido" DECIMAL(12,2),
    "resultado_manual" TEXT,
    "resultado_manual_em" TIMESTAMP(3),
    "resultado_manual_por" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_vendas_inscricoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_mensagens" (
    "id" TEXT NOT NULL,
    "inscricao_id" TEXT NOT NULL,
    "etapa_ordem" INTEGER NOT NULL,
    "mensagem_final" TEXT NOT NULL,
    "agendada_para" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AGENDADA',
    "enviada_em" TIMESTAMP(3),
    "erro" TEXT,
    "tentativas_envio" INTEGER NOT NULL DEFAULT 0,
    "payload_envio" TEXT,
    "id_externo" TEXT,
    "entregue_em" TIMESTAMP(3),
    "lida_em" TIMESTAMP(3),
    "codigo_erro" INTEGER,
    "falha_motivo" TEXT,
    "natureza_falha" TEXT,
    "template_nome" TEXT,
    "canal" TEXT NOT NULL DEFAULT 'nao_oficial',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_vendas_mensagens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_cursor" (
    "id" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_vendas_cursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "maquina_vendas_respostas" (
    "telefone_key" TEXT NOT NULL,
    "telefone_e164" TEXT,
    "respondido_em" TIMESTAMP(3) NOT NULL,
    "ultimas_msgs" JSONB,
    "origem" TEXT NOT NULL DEFAULT 'n8n',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "maquina_vendas_respostas_pkey" PRIMARY KEY ("telefone_key")
);

-- CreateTable
CREATE TABLE "maquina_vendas_opt_out" (
    "telefone_key" TEXT NOT NULL,
    "telefone_e164" TEXT,
    "origem" TEXT NOT NULL DEFAULT 'texto',
    "trecho" TEXT,
    "despedida_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "maquina_vendas_opt_out_pkey" PRIMARY KEY ("telefone_key")
);

-- CreateTable
CREATE TABLE "maquina_vendas_ajustes" (
    "id" TEXT NOT NULL DEFAULT 'unico',
    "teto_diario" INTEGER NOT NULL DEFAULT 40,
    "intervalo_min_minutos" INTEGER NOT NULL DEFAULT 3,
    "intervalo_max_minutos" INTEGER NOT NULL DEFAULT 12,
    "janela_inicio" TEXT NOT NULL DEFAULT '09:00',
    "janela_fim" TEXT NOT NULL DEFAULT '20:00',
    "envio_pausado" BOOLEAN NOT NULL DEFAULT true,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "atualizado_por" TEXT,

    CONSTRAINT "maquina_vendas_ajustes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logs_eventos" (
    "id" TEXT NOT NULL,
    "origem" TEXT NOT NULL,
    "nivel" TEXT NOT NULL DEFAULT 'INFO',
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalhe" TEXT,
    "dados" TEXT,
    "lido_em" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logs_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desafio_custos" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mesAno" TEXT NOT NULL,
    "valor" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desafio_custos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desafio_metas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "metrica" TEXT NOT NULL,
    "alvo" DOUBLE PRECISION NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'MAIOR_MELHOR',
    "ownerUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desafio_metas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "desafio_challenges" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "metrica" TEXT NOT NULL,
    "alvo" DOUBLE PRECISION NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "recompensa" TEXT,
    "ownerUserId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ATIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "desafio_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "system_settings_chave_key" ON "system_settings"("chave");

-- CreateIndex
CREATE INDEX "google_leads_userId_idx" ON "google_leads"("userId");

-- CreateIndex
CREATE INDEX "google_leads_status_idx" ON "google_leads"("status");

-- CreateIndex
CREATE INDEX "google_leads_cidade_idx" ON "google_leads"("cidade");

-- CreateIndex
CREATE INDEX "google_leads_uf_idx" ON "google_leads"("uf");

-- CreateIndex
CREATE INDEX "google_leads_nicho_idx" ON "google_leads"("nicho");

-- CreateIndex
CREATE INDEX "niches_userId_idx" ON "niches"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "niches_nome_userId_key" ON "niches"("nome", "userId");

-- CreateIndex
CREATE INDEX "maquina_vendas_cadencias_ativo_gatilho_idx" ON "maquina_vendas_cadencias"("ativo", "gatilho");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_vendas_cadencias_gatilho_pipeline_id_stage_id_key" ON "maquina_vendas_cadencias"("gatilho", "pipeline_id", "stage_id");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_vendas_cadencia_etapas_cadencia_id_ordem_key" ON "maquina_vendas_cadencia_etapas"("cadencia_id", "ordem");

-- CreateIndex
CREATE INDEX "maquina_vendas_inscricoes_status_idx" ON "maquina_vendas_inscricoes"("status");

-- CreateIndex
CREATE INDEX "maquina_vendas_inscricoes_telefone_key_idx" ON "maquina_vendas_inscricoes"("telefone_key");

-- CreateIndex
CREATE INDEX "maquina_vendas_inscricoes_respondeu_em_idx" ON "maquina_vendas_inscricoes"("respondeu_em");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_vendas_inscricoes_cadencia_id_origem_ref_externa_key" ON "maquina_vendas_inscricoes"("cadencia_id", "origem", "ref_externa");

-- CreateIndex
CREATE INDEX "maquina_vendas_mensagens_status_agendada_para_idx" ON "maquina_vendas_mensagens"("status", "agendada_para");

-- CreateIndex
CREATE INDEX "maquina_vendas_mensagens_id_externo_idx" ON "maquina_vendas_mensagens"("id_externo");

-- CreateIndex
CREATE UNIQUE INDEX "maquina_vendas_cursor_chave_key" ON "maquina_vendas_cursor"("chave");

-- CreateIndex
CREATE INDEX "maquina_vendas_respostas_respondido_em_idx" ON "maquina_vendas_respostas"("respondido_em");

-- CreateIndex
CREATE INDEX "logs_eventos_created_at_idx" ON "logs_eventos"("created_at");

-- CreateIndex
CREATE INDEX "logs_eventos_nivel_created_at_idx" ON "logs_eventos"("nivel", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "desafio_custos_userId_mesAno_key" ON "desafio_custos"("userId", "mesAno");

-- CreateIndex
CREATE INDEX "desafio_metas_userId_periodo_idx" ON "desafio_metas"("userId", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "desafio_metas_userId_periodo_metrica_ownerUserId_key" ON "desafio_metas"("userId", "periodo", "metrica", "ownerUserId");

-- CreateIndex
CREATE INDEX "desafio_challenges_userId_status_idx" ON "desafio_challenges"("userId", "status");

-- AddForeignKey
ALTER TABLE "google_leads" ADD CONSTRAINT "google_leads_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "niches" ADD CONSTRAINT "niches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_vendas_cadencia_etapas" ADD CONSTRAINT "maquina_vendas_cadencia_etapas_cadencia_id_fkey" FOREIGN KEY ("cadencia_id") REFERENCES "maquina_vendas_cadencias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_vendas_inscricoes" ADD CONSTRAINT "maquina_vendas_inscricoes_cadencia_id_fkey" FOREIGN KEY ("cadencia_id") REFERENCES "maquina_vendas_cadencias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "maquina_vendas_mensagens" ADD CONSTRAINT "maquina_vendas_mensagens_inscricao_id_fkey" FOREIGN KEY ("inscricao_id") REFERENCES "maquina_vendas_inscricoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desafio_custos" ADD CONSTRAINT "desafio_custos_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desafio_metas" ADD CONSTRAINT "desafio_metas_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "desafio_challenges" ADD CONSTRAINT "desafio_challenges_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
