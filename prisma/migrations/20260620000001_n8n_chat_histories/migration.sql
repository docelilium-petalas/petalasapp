-- CreateTable
CREATE TABLE "n8n_chat_histories" (
    "id" SERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "message" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "n8n_chat_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "n8n_chat_histories_session_id_idx" ON "n8n_chat_histories"("session_id");
