# Relatório — porte da Máquina de Vendas CarBoss → Doce Lilium (04/10/2026)

Prompt executado: `PROMPT-PORTE-MAQUINA-VENDAS-CARBOSS.md`.
Matriz de paridade: [`PORTE-CARBOSS-PARIDADE.md`](./PORTE-CARBOSS-PARIDADE.md) (100%, todo ❌ com motivo).
Branch `feat/mv-paridade-carboss` → `main` em `9dc43a1` (fast-forward, 41 commits). Deploy manual no EasyPanel `petalasapp`.

## Entregue

| | item | resumo |
|---|---|---|
| ✔️ | Porte do motor | 43 libs, actions, telas/abas, dossiê, rotas e scripts `mv-ops`; tudo com teste n1/n2 |
| ✔️ | Identidade DL | só tokens semânticos; 10 telas × desktop 1440 / mobile 390: 0 estouro horizontal, 0 erro de console |
| ✔️ | Testes `npm run test:mv` | nível 1 **216/0** · nível 2 **97/0** · nível 3 motor **18/0** |
| ✔️ | Aba Prontidão | só admin, só mede, nunca envia |
| ✔️ | tsc / build / lint | tsc 0 · build 0 · lint: 0 erro novo (as 364 pendências já existiam em `114f498`) |
| ✔️ | Segredos / BOM | varredura das 18.966 linhas adicionadas: 0 segredo, 0 arquivo com BOM |
| ✔️ | Pureza do observador | 0 escrita no CRM, 0 chamada não-GET nos `observador*.ts` |
| ✔️ | Migration em produção | `20261004000001_mv_paridade_carboss` (só aditiva: `perfil`, `texto_entregue`, índice parcial único) |
| ✔️ | Migração de dados em produção | dry-run e depois `--apply`; 1 etapa criada, 6 textos entregues preenchidos |
| ✔️ | Campanha 10.10 intacta | sha256 `25514736…` igual antes e depois; snapshot pré/pós-deploy: zero diferença nas linhas da campanha |
| ✔️ | Deploy | build novo no ar (`/logs` 200, `/api/logs` 405 em GET = a rota existe); envio continua **pausado** |
| ✔️ | Defeito real corrigido: 132018 | o 2º toque do carrinho (`dl_carrinho_duvida_v1`, sem botão) recebia parâmetro de botão; 2 ERRO em produção em 15/09. Corrigido em `ad85fed` e provado no nível 3 |
| ✔️ | Defeito real corrigido: corrida | trava atômica `mv:despacho_trava` no despachante (`688a904`) |
| 📍 | Entregabilidade 131049 | 21 de 31 envios de teste aceitos pela Meta (HTTP 200 + wamid) voltaram como `failed 131049`; ver abaixo |
| 📍 | `dl_relatorio_pronto_v1` | submetido; Meta ainda **PENDING** |

## Nível 3 — evidência

Fonte: wamid do retorno da Meta (`logs_eventos.tipo='mv_teste_envio'` e saída do nível 3) cruzado com os webhooks `envio_falhou` de produção. "Sem falha" quer dizer que não chegou `failed`; o entregue/lido de envio de script não é gravado, porque o wamid não pertence a uma `MvMensagem` de produção.

| template | número | wamid (fim) | enviado | depois |
|---|---|---|---|---|
| **Item 1 · 16 templates → esposa** | | | | |
| dl_carrinho_lembrete_v1 | •••215 | …ZCOTcwNjk0OTIA | ✔️ | sem falha |
| dl_carrinho_duvida_v1 | •••215 | …g5OTg1QkQ4OUEA | ✔️ | sem falha |
| dl_carrinho_ultimo_v2 | •••215 | …U0NjJDM0Q2NzgA | ✔️ | sem falha |
| dl_pedido_confirmado_v1 | •••215 | …VGQjYxN0YwOTMA | ✔️ | sem falha |
| dl_pix_pendente_v1 | •••215 | …QyNzYyOEYzMTIA | ✔️ | ❌ 131049 |
| dl_pagamento_aprovado_v1 | •••215 | …U3RDM5Nzc1QjgA | ✔️ | sem falha |
| dl_pedido_enviado_v1 | •••215 | …I5RDlEQkRCRUQA | ✔️ | sem falha |
| dl_pedido_entregue_v1 | •••215 | …c2NzVERDUxMTEA | ✔️ | sem falha |
| dl_pos_entrega_avaliacao_v1 | •••215 | …I4NERGQUM0MjQA | ✔️ | ❌ 131049 |
| dl_troca_instrucoes_v1 | •••215 | …M2RDFCQTYxRDgA | ✔️ | sem falha |
| dl_reativacao_60d_v1 | •••215 | …Y4MTA3MzMzQTMA | ✔️ | ❌ 131049 |
| dl_colecao_nova_v1 | •••215 | …kyMkFGQ0ZERUMA | ✔️ | ❌ 131049 |
| dl_lista_desejos_voltou_v1 | •••215 | …ExMkY4OTMxNEMA | ✔️ | ❌ 131049 |
| dl_drop_1010_save_the_date_v1 | •••215 | …Y5NEQ5RjFDODkA | ✔️ | ❌ 131049 |
| dl_drop_1010_vespera_v1 | •••215 | …RFQUQ3QkY5RTAA | ✔️ | ❌ 131049 |
| dl_drop_1010_chegou_v1 | •••215 | …BBMzcyRkJCRkIA | ✔️ | ❌ 131049 |
| **Item 2 · amostra por família → Luan** | | | | |
| dl_carrinho_lembrete_v1 | •••219 | …JGNjQ5NjNCODcA | ✔️ | ❌ 131049 |
| dl_pagamento_aprovado_v1 | •••219 | …ZDNUQyMEM1Q0QA | ✔️ | sem falha |
| dl_pedido_enviado_v1 (rastreio assinado, pedido #162) | •••219 | …dCMkFGODdBQ0IA | ✔️ | sem falha |
| dl_pos_entrega_avaliacao_v1 | •••219 | …kyRTFEQjNCNUMA | ✔️ | ❌ 131049 |
| dl_reativacao_60d_v1 | •••219 | …Y5MDBFODk0QkUA | ✔️ | ❌ 131049 |
| dl_drop_1010_chegou_v1 | •••219 | …E1MzZFREUzMzgA | ✔️ | ❌ 131049 |
| **Item 3 · carrinho ponta a ponta (motor real, tempo comprimido)** | | | | |
| dl_carrinho_lembrete_v1 → duvida_v1 → ultimo_v2 | •••215 | 3 wamids | ✔️ 3/3 na ordem, `textoEntregue` carimbado, inscrição CONCLUIDA | ❌ 131049 nos 3 |
| **Item 7 · ensaio do drop 10.10 com clones `qa_`** | | | | |
| save_the_date / vespera / chegou | •••215 e •••219 | 6 wamids | ✔️ 6/6; cadências reais idênticas antes e depois | ❌ 131049 nos 6 |
| **Item 6 · rastreio (produção, curl sem seguir o redirect)** | | | | |
| link assinado do pedido #162 | — | — | 302 → `melhorrastreio.com.br/rastreio/ME…` | ✔️ |
| assinatura adulterada | — | — | 302 → `www.docelilium.com.br/` | ✔️ |
| id trocado com a assinatura de outro pedido | — | — | 302 → `www.docelilium.com.br/` | ✔️ |
| **Item 9 · status da Meta** | | | | |
| pipeline de webhook em produção | — | — | 26 `failed` recebidos e logados hoje; 4 `entregue_em` e 1 `lida_em` em MvMensagem real | ✔️ |

Envios usados: **40 de 60**. Encerramento: 0 mensagem enviada hoje fora dos dois números (qa, prova e produção); 0 resto `qa_` nos três bancos.

### O 131049, sem rodeio

Todo o código do envio está certo: a Meta aceitou os 40 envios. O 131049 ("not delivered to maintain healthy ecosystem engagement") é o **limite da Meta de MARKETING por pessoa**. Ele bateu em quase todo template MARKETING para esses dois números e em nenhum UTILITY. A causa provável é o volume de marketing que os dois receberam em sequência hoje. Para a 10.10 isso pesa: parte da audiência pode estar no mesmo teto, e o despachante já trata 131049 como "não encerra" (a inscrição segue). Não há o que corrigir no código; é a régua de frequência que decide.

## 🪤 O que ainda não foi executado

| | o que ainda não foi executado | por quê |
|---|---|---|
| 🪤 | Item 3, segunda metade: a esposa responder e a inscrição virar RESPONDEU | precisa de uma resposta humana no celular dela |
| 🪤 | Item 4: handoff pelo Chatwoot (12 h de silêncio, etiqueta na tela) | não existe nenhuma `CHATWOOT_*` no `petalasapp` nem no local; a integração está desligada em produção |
| 🪤 | Item 5: opt-out real ("parar") e a limpeza depois | precisa da esposa escrevendo; a lógica está provada no n1 (grupo 3) |
| 🪤 | Item 8: briefing (porta `dl_relatorio_pronto_v1` → toque → relatório) | template PENDING na Meta e `MV_BRIEFING_NUMERO` ausente em produção |
| 🪤 | Entregue/lido dos envios de script | wamid de script não é MvMensagem; só a falha aparece no log |
| 🪤 | Decisão sobre a campanha 10.10 | d1 tem 47 AGENDADA vencidas, com envio pausado desde 29/09; d2 nasce em 09/10 e d3 em 10/10. Decisão do Owner: "decidir depois" — reperguntar antes de 09/10 |
| 🪤 | Despausar o envio | ao despausar, sai também o 3º toque de carrinho da Bianca (agendado 04/10 15:53, já vencido) |
| 🪤 | Variáveis de produção | faltam `MV_ALERTA_NUMERO`, `MV_BRIEFING_NUMERO`, `APP_URL`, `WHATSAPP_VERIFY_TOKEN`, `WEBHOOK_CALLBACK_SECRET` e todo o `CHATWOOT_*`. `MV_NUMEROS_TESTE` vazia = produção aberta (correto para operar, mas não existe modo de teste em produção). O app define `DATAFY_BASE` e o código lê `DATAFY_BASE_URL` (inofensivo: cai no padrão) |
| 🪤 | Bancos locais `petalas_prova` / `petalas_qa` | ficam até os itens 3b, 4, 5 e 8 serem fechados; são cópia de produção e têm dado pessoal, então devem ser apagados depois |
