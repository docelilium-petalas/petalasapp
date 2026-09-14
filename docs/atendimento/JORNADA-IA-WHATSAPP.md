# Atendimento com IA no WhatsApp — Doce Lilium

> Montado em 13/09/2026. Canal: número oficial **+55 62 9963-0120** (Datafy / Cloud API
> da Meta), o mesmo do botão de WhatsApp do site.

---

## 1 · De onde veio o desenho

| | CarBoss | OCR | Doce Lilium (este) |
|---|---|---|---|
| Canal | uazapi (QR Code) | Datafy → Chatwoot | **Datafy direto no CRM** |
| Quem recebe a mensagem | webhook do n8n | Chatwoot | `/api/webhook/whatsapp` do CRM |
| Onde mora a IA | n8n (agente, 77 nós) | n8n (`OCR Agente · Gabriel`) | n8n (`DL · Atendimento IA`, 9 nós) |
| Ferramentas | API do app `/api/agente/*` | Chatwoot + CRM | API do CRM `/api/agente/*` |
| Memória | `n8n_chat_histories` + Redis | Chatwoot | **no CRM**, em `MvResposta.ultimasMsgs` |
| Agrupar mensagens seguidas | Redis + Wait | Chatwoot | `after()` + 9 s no CRM |
| Humano assume | `Desativar Agente` (Redis) | atribuição no Chatwoot | `chamar_atendente` → pausa 12 h + aviso nos Logs |

**O que veio da CarBoss:** o agente não escreve no banco; ele chama ferramentas do app,
e cada ferramenta devolve os dados **e uma `dica`** em português dizendo o que fazer e o
que não fazer. A regra fica no código (testável). O modelo só lê. Também vieram as regras
de escrita: curto, uma pergunta por vez, sem frase de enchimento, e "sim" sempre responde
à última pergunta.

**O que veio da OCR:** o canal oficial tem janela de 24 h, e o que é voltado à cliente passa
por um caminho só. Aviso interno não vai para WhatsApp: fica no CRM.

**O que mudou para varejo:** a CarBoss marca horário; aqui a conversa **vende peça**. As
ferramentas são catálogo, fotos, pedido e carrinho, e não agenda.

**Por que memória e buffer no CRM:** as credenciais de Redis e Postgres que vieram do n8n
antigo não foram provadas no host novo. A única credencial que o agente precisa é a da
OpenAI, que já está no n8n. O CRM não tem chave de modelo nenhuma (medido em 13/09).

⚠️ O `AGENTE SDR Petalas App` migrado **não é da Doce Lilium**: o prompt dele é o do
"Mateus, Investmais, Home Equity", sobra de outro cliente, e ele ouve a uazapi. O
atendimento da loja é o `DL · Atendimento IA`.

---

## 2 · O caminho de uma mensagem

```
cliente escreve no WhatsApp da loja
  → Meta → Datafy → POST /api/webhook/whatsapp          (assinatura timestamp.corpo)
      · grava o turno em MvResposta (memória + "respondeu" da Máquina)
      · pediu para sair? → opt-out e para aqui
      · marca esta mensagem como a última e devolve 200
      · after(): espera 9 s — chegou outra? esta desiste, a nova leva todas
      · IA desligada (MvCursor atendimento:ia = off)? humano nas últimas 12 h? → para
  → POST n8n /webhook/dl-atendimento   (Header Auth: CRON_SECRET)
      · agente gpt-4.1-mini com o prompt de varejo
      · consultar_cliente → GET  /api/agente/contexto
      · buscar_catalogo   → GET  /api/agente/catalogo
      · enviar_fotos      → POST /api/agente/fotos      (foto + nome + preço + link)
      · chamar_atendente  → POST /api/agente/humano     (pausa 12 h + AVISO nos Logs)
  → POST /api/agente/responder   (até 3 balões, texto livre dentro da janela de 24 h)
```

Desligar a IA sem deploy: gravar `off` em `maquina_vendas_cursor`, chave `atendimento:ia`.

---

## 3 · A jornada que o agente conduz

| Etapa | Gatilho | O que a IA faz | O que ela nunca faz |
|---|---|---|---|
| Descobrir | "oi", "vi no Instagram" | cumprimenta e faz UMA pergunta: o que procura ou para que ocasião | interrogatório; pedir nome de cara |
| Recomendar | falou de peça, cor, ocasião, tamanho ou preço | busca na hora, escolhe até 3, manda as **fotos** com preço e link, pergunta se alguma agradou | oferecer peça diferente fingindo que é o que ela pediu |
| Tamanho e detalhes | "tem M?", "qual o tecido?" | só tamanho com estoque; tecido e medida só se estiverem na descrição da loja | inventar medida; sem o dado, passa para a Marília |
| Fechar | escolheu | manda o link da peça; frete e pagamento aparecem no site com o CEP | calcular frete, prometer prazo, reservar peça |
| Carrinho | respondeu ao lembrete ou tem carrinho aberto | tira a dúvida e manda o link do carrinho | **cupom ou desconto** (decisão da Marília em 11/09) |
| Pedido | "cadê meu pedido?" | situação, pagamento e envio que a loja informa; link de rastreio se houver | data de entrega |
| Pós-compra | recebeu, elogiou | agradece numa frase | — |
| Assunto de gente | troca, defeito, reclamação, pagamento, desconto, atraso, atacado, "quero falar com alguém" | `chamar_atendente` com resumo, avisa que a Marília responde por aqui e sai por 12 h | tentar resolver sozinha |

---

## 4 · O catálogo

- **Fonte:** Nuvemshop, sempre. O CRM não copia produto. Há cache de 10 min em memória.
- **Medido em 13/09/2026:** 20 peças publicadas, 6 fotos cada, categorias Saias, Vestidos,
  Partes de cima, Acessório, Sale e Collab DL by Lari.
- **Por peça:** nome, categorias, preço vigente e preço "de" quando há promoção,
  tamanhos com estoque (`stock_management: false` conta como disponível), fotos em
  ordem, link da loja e descrição sem HTML.
- **Busca** (`lib/nuvemshop/catalogo.ts`): sem acento, plural simples, nome vale mais
  que categoria e descrição. Com busca, só volta peça que bate com alguma palavra, e
  por isso "tem blazer?" volta vazio. O filtro de tamanho só aceita tamanho **com
  estoque**.
- **Tela** `/catalogo` no CRM: a mesma vitrine que a IA vê, com fotos, tamanhos riscados
  quando esgotam e botão para atualizar da loja.

⚠️ No teste de 13/09, as variantes vieram com `stock = 0` nas 4 primeiras peças. Se a
loja controla estoque e está zerada, a IA vai dizer "esgotada". Se a loja vende sob
encomenda, o certo é desligar o controle de estoque na Nuvemshop, e não mexer na IA.

---

## 5 · Os 13 templates e o que depende da Meta

A IA conversa com **texto livre**, que só vale dentro de 24 h depois da última mensagem
da cliente. Para **puxar** a conversa (carrinho, pedido, reativação), só template aprovado.

| Template | Categoria | Estado 13/09 | O que dispara |
|---|---|---|---|
| dl_carrinho_lembrete_v1 · _duvida_v1 · _ultimo_v2 | MARKETING | APPROVED | varredura de carrinho abandonado |
| dl_pedido_confirmado_v1 · dl_pagamento_aprovado_v1 · dl_pedido_entregue_v1 · dl_troca_instrucoes_v1 | UTILITY | APPROVED | webhook de pedido |
| dl_pix_pendente_v1 · dl_pos_entrega_avaliacao_v1 | MARKETING (reclassificados) | APPROVED | pedido |
| **dl_pedido_enviado_v1** | UTILITY | **PENDING** | pedido enviado, com botão de rastreio |
| **dl_reativacao_60d_v1** | MARKETING | **PENDING** | 60 dias sem compra |
| **dl_colecao_nova_v1** | MARKETING | **PENDING** | lançamento de coleção |
| **dl_lista_desejos_voltou_v1** | MARKETING | **PENDING** | peça voltou ao estoque |

**Depende da revisão da Meta:** só os 4 em PENDING. A conversa com IA **não depende**
dela: responde a quem escreveu. Aprovados, os 4 ainda precisam de gatilho que não existe
hoje. Os 62 pedidos estão sem código de rastreio. O CRM não lê coleções nem lista de
desejos da loja.

---

## 6 · Como testar

1. Do WhatsApp de teste (6281191215), escrever para +55 62 9963-0120: "oi, tem vestido
   azul?". Em até ~30 s: fotos de até 3 peças e uma pergunta curta.
2. "quero falar com alguém sobre troca" → a IA avisa que a Marília responde, e aparece um
   AVISO `atendimento_humano` nos Logs. Mandar outra mensagem não gera resposta por 12 h.
3. Carrinho: montar carrinho na loja com o telefone de teste e parar no pagamento. A
   Nuvemshop publica o carrinho em até 6 h. A varredura inscreve e o primeiro toque sai
   na janela da Máquina (9h–20h). Responder ao lembrete volta à IA com
   `respondendo_template = dl_carrinho_*`.
