-- A marca como dado, e não como texto cravado no código.
--
-- Nome, logo e assinatura estavam em oito lugares do código-fonte: trocar
-- qualquer um deles exigia edição e deploy, e o deploy aqui é manual.
--
-- A logo vai como data URI numa coluna TEXT porque o container não tem volume
-- persistente: arquivo gravado em disco some no próximo deploy.
CREATE TABLE IF NOT EXISTS "marca" (
  "id"             TEXT PRIMARY KEY DEFAULT 'unica',
  "nome"           TEXT NOT NULL DEFAULT 'Doce Lilium',
  "subtitulo"      TEXT NOT NULL DEFAULT 'Operação CRM',
  "logo_data_uri"  TEXT,
  "assinatura"     TEXT NOT NULL DEFAULT 'Doce Lilium',
  "atualizado_em"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_por" TEXT
);
