-- Paridade com a Máquina de Vendas da CarBoss (porte de 04/10/2026).
--
-- SÓ ADITIVA: nenhuma coluna sai, nenhum id muda, nenhuma linha é reescrita.
-- Toda coluna nova é nula ou tem DEFAULT — o código que já está no ar continua
-- funcionando antes e depois do deploy, nas duas ordens.

-- O PERFIL da cliente no momento da inscrição (nunca_comprou / ja_comprou /
-- recorrente). Decide a âncora da copy e o corte do relatório. Congelado na
-- inscrição pelo mesmo motivo que a copy: o relatório de setembro não pode
-- mudar porque a cliente comprou em outubro. `default` = não se sabe; nunca
-- adivinhar.
ALTER TABLE "maquina_vendas_inscricoes"
  ADD COLUMN IF NOT EXISTS "perfil" TEXT NOT NULL DEFAULT 'default';

-- O TEXTO QUE A CLIENTE RECEBEU, carimbado no envio (`corpo-template.ts`).
-- Envio por template entrega o corpo aprovado, não `mensagem_final`; sem este
-- carimbo a tela e a nota do Chatwoot mostram uma frase que ela nunca viu.
-- Nulo para o que saiu antes desta migration — a tela diz isso em vez de
-- inventar.
ALTER TABLE "maquina_vendas_mensagens"
  ADD COLUMN IF NOT EXISTS "texto_entregue" TEXT;

-- UMA inscrição ATIVA por cliente por cadência. A CarBoss teve a mesma pessoa
-- duas vezes na mesma régua por corrida entre dois tiques (o observador e a
-- tela inscrevendo juntos) e a cliente recebeu o mesmo toque duas vezes.
-- Índice PARCIAL: histórico (CONCLUIDA, RESPONDEU...) pode repetir à vontade;
-- só a fila viva é única. Conferido em produção antes: zero duplicatas ATIVAS.
CREATE UNIQUE INDEX IF NOT EXISTS "maquina_vendas_inscricoes_ativa_unica"
  ON "maquina_vendas_inscricoes" ("cadencia_id", "telefone_key")
  WHERE "status" = 'ATIVA';
