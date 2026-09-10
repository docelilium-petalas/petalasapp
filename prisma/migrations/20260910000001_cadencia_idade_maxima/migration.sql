-- Teto de idade do evento para entrar numa cadência.
--
-- Sem ele, a PRIMEIRA varredura inscreve de uma vez todo carrinho da janela
-- inicial (7 dias) e dezenas de pessoas recebem "vi que você deixou algo no
-- carrinho" sobre um carrinho de uma semana atrás.
--
-- Coluna nula por omissão: nada muda para as cadências que já existirem, e
-- reativação (que quer justamente o evento antigo) continua sem teto.
ALTER TABLE "maquina_vendas_cadencias"
  ADD COLUMN IF NOT EXISTS "idade_maxima_horas" INTEGER;

-- O cupom do último toque da trilha de carrinho.
--
-- A copy de `dl_carrinho_ultimo_v1` pede {{cupom}} e {{desconto}}, e o
-- contexto de um carrinho não tem nenhum dos dois: sem estes campos,
-- `montarCopy` lança CopyIncompleta e derruba a INSCRIÇÃO INTEIRA — ninguém
-- entraria na fila de carrinho abandonado.
--
-- Nulos por omissão de propósito: sem cupom configurado, a trilha nasce com
-- dois toques em vez de três, em vez de prometer um cupom inexistente.
ALTER TABLE "maquina_vendas_ajustes"
  ADD COLUMN IF NOT EXISTS "cupom_carrinho" TEXT,
  ADD COLUMN IF NOT EXISTS "desconto_carrinho" TEXT;

-- Os valores das variáveis, congelados junto com a copy.
--
-- O envio por template manda os VALORES de fora; `mensagem_final` é a mesma
-- frase já montada, e serve para a tela. Sem esta coluna seria preciso
-- desmontar a frase de volta na hora do envio — impossível de fazer com
-- segurança quando a copy tem blocos de variação `[[a|b|c]]`, porque o
-- esqueleto muda de mensagem para mensagem.
ALTER TABLE "maquina_vendas_mensagens"
  ADD COLUMN IF NOT EXISTS "variaveis" JSONB;
