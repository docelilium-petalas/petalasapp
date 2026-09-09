# A Máquina de Vendas na camada n8n — referência CarBoss e OCR

> Levantado em **08/09/2026** contra `bonyalbatross-n8n.cloudfy.live`
> (46 workflows, a maioria **ativos em produção**).
> Este documento existe para responder uma pergunta: **o que a Doce Lilium
> precisa construir no n8n para ter a Máquina de Vendas?**
>
> Resposta curta: **quase nada.** O detalhe está no §1.

---

## 1 · A descoberta que muda o esforço: o CRM é o cérebro, o n8n é só o braço

Os dois workflows que ligam a Máquina de Vendas têm **2 nós cada**:

| Workflow | intervalo | o que faz |
|---|---|---|
| `CB · MV Cron` 🟢 | 5 min | `GET https://crmcarboss.devnetlife.com/api/cron/maquina-vendas` |
| `MV · Cron (OCR)` 🟢 | **1 min** | `GET https://app.operacaocaixarapido.com.br/api/cron/maquina-vendas` |

É isso. Um gatilho de tempo e uma chamada HTTP.

**Toda a lógica de cadência — observador, despachante, paradas, janela, teto,
opt-out, tier, confirmação de entrega — vive no CRM**, nos 27 módulos de
`src/lib/maquina-vendas/`. O n8n não decide nada: ele só bate na porta.

Consequência direta para o nosso plano: portar a Máquina para a Doce Lilium é
**trabalho de código no CRM**, não de automação. Do lado do n8n, o que falta é
um workflow de 2 nós.

⚠️ A OCR tica a **cada minuto** e a CarBoss a cada 5. Não é descuido: a OCR tem
fila maior e janela de entrega mais apertada. O intervalo é parâmetro de
operação, e vale começar em 5 min.

---

## 2 · A camada que NÃO está no CRM — e é a que vale copiar

Ao lado da Máquina, a CarBoss roda uma segunda camada inteiramente em n8n,
contra o **Postgres operacional** (tabelas `leads`, `lembretes_log`, `erro_log`,
`followup_daily_budget`, `ia_msg_enviadas`, `config`) — que é um banco
diferente do CRM.

| Workflow | nós | ritmo | papel |
|---|---|---|---|
| `CB · Toque 5min · Lead sem agendar` 🟢 | 19 | 5 min | cadência `nao_agendou` implementada em SQL |
| `CB · Guard orcamento diario` 🟢 | 7 | 15 min | alerta em 70% e 100% do teto |
| `CB · Guarda Humano` 🟢 | 11 | — | pergunta ao Chatwoot se um humano já entrou |
| `CB · Heartbeat canal` 🟢 | 3 | 6 h | prova de vida do canal |
| `CB · No Show Detector` 🟢 | 17 | 15 min | marca `NO_SHOW` e resgata |
| `OCR · Watchdog de Vácuo` 🟢 | 25 | 5 min | detecta conversa que morreu no vácuo |
| `CB · Ponte Chatwoot → Datafy` 🟢 | 9 | webhook | a SDR humana fala pelo canal oficial |

### Cinco padrões que valem roubar inteiros

**1 · Orçamento com cobrança adiantada e estorno.**
`Cobra orcamento` → `Envia` → em caso de falha, `Estorna orcamento`. O comentário
no nó diz o porquê: *"cobramos antes de enviar e o envio falhou"*. Cobrar depois
do envio deixa uma janela em que dois ticks concorrentes passam pelo mesmo teto.

**2 · Anti-eco por chave única.**
`INSERT INTO ia_msg_enviadas (key_id) … ON CONFLICT DO NOTHING`, com o comentário:
*"sem esta linha o próprio envio volta pelo webhook como `fromMe`"*. Sem isso o
agente responde à própria mensagem.

**3 · A janela de entrega é função do banco.**
`SELECT fn_horario_valido(now())` — uma função, não um `if` replicado em cada
workflow. Onze workflows perguntam ao mesmo lugar.

**4 · "Humano no comando?" antes de qualquer ação automática.**
E, no `No Show Detector`, o par que quase ninguém escreve: *"Bloqueado NÃO é
no-show: devolve o status e deixa o próximo tique tentar."* Um guard que
consome o lead sem devolvê-lo perde o lead em silêncio.

**5 · `DRY RUN?` como nó de verdade.**
O Watchdog tem um ramo seco embutido. Não é `console.log` — é caminho de
execução que roda em produção sem tocar ninguém.

**6 · Webhook com segmento aleatório na URL.**
Os webhooks internos usam caminhos impossíveis de adivinhar (ex.:
`/webhook/<32 caracteres aleatórios>/cb-mv-envio`). A URL É a autenticação.
Os valores não estão neste documento de propósito.

---

## 3 · O canal: os dois já migraram de QR Code para oficial

Prova no próprio n8n. Os workflows que usam **Evolution API** (canal por QR
Code) estão **inativos**; os que usam **Datafy / Cloud API oficial** estão
**ativos**:

| Workflow | canal | estado |
|---|---|---|
| `CB · MV Envio (Evolution)` | Evolution — `…/message/sendText/carboss-zap` | ⚪ **desligado** |
| `MV · Disparo (OCR)` | Evolution — `…/message/sendText/ocr-zap` | ⚪ **desligado** |
| `CB · Toque 5min` | Datafy — `cloud.datafyapi.com.br/v1/1221224107742477/messages` | 🟢 ativo |
| `CB · Ponte Chatwoot → Datafy` | Datafy — mesmo `phone_number_id` | 🟢 ativo |
| `OCR · Ponte Chatwoot → Datafy` | Datafy — `…/v1/746832058521529/messages` | 🟢 ativo |

**A Doce Lilium está hoje exatamente onde CarBoss e OCR estavam antes da
migração** — em canal por QR Code (uazapi, ver
[MIGRACAO-DOCE-LILIUM.md](MIGRACAO-DOCE-LILIUM.md) §6).

Os dois projetos percorreram esse caminho e o registraram: Evolution → Datafy.
Nenhum dos dois voltou. Isso não é opinião de arquitetura — é o histórico de
duas operações do mesmo grupo, medido no estado ativo/inativo dos workflows.

---

## 4 · A terceira peça: Chatwoot como camada humana

`bonyalbatross-chatwoot.cloudfy.live` aparece em 4 dos 13 workflows do núcleo.
O papel dele é o que o CRM sozinho não faz: **dar à SDR humana uma caixa de
entrada**, e ao mesmo tempo ser a fonte que responde *"um humano já entrou nesta
conversa?"* — pergunta que `MvInscricao.sdrFalouEm` no CRM declara mas nunca
consegue preencher, porque o webhook da Meta não distingue agente de pessoa.

A `Ponte Chatwoot → Datafy` resolve o caminho de volta: a SDR escreve no
Chatwoot, a ponte entrega pela Cloud API. Sem ela, responder exigiria sair do
painel.

**Para a Doce Lilium isso é uma decisão em aberto.** Hoje quem atende é o agente
de IA (`AGENTE SDR Petalas App`) e não há caixa humana. Enquanto não houver,
`sdrFalouEm` fica `NULL` — e é honesto que fique.

---

## 5 · O que a Doce Lilium precisa construir no n8n

| # | Peça | Esforço | Depende de |
|---|---|---|---|
| 1 | `DL · MV Cron` — 2 nós, 5 min, `GET /api/cron/maquina-vendas` | trivial | a rota existir no CRM (Fase 2) |
| 2 | `DL · Carrinho abandonado` — varredura da Nuvemshop | pequeno | token da Nuvemshop |
| 3 | Anti-eco por `key_id` | pequeno | tabela no banco |
| 4 | Guard de orçamento com estorno | médio | teto definido |
| 5 | Heartbeat de canal | trivial | — |
| 6 | Ponte para caixa humana | grande | decidir se haverá Chatwoot |

O item 2 é o único sem equivalente na CarBoss ou na OCR — porque nenhuma das
duas vende por e-commerce. É o que a Doce Lilium tem de original, e é onde a
Nuvemshop obriga varredura em vez de evento (ver
[TEMPLATES-META.md](../maquina-vendas/TEMPLATES-META.md) §4).

---

## 6 · Inventário completo da instância

**CarBoss (24):** `CB · Agente Gabriel` (80n) · `CB · Filtro Entrada (etiqueta)` (34n) ·
`CB · Toque 5min` (19n) · `CB · No Show Detector` (17n) · `CB · Lembrete D1/R1/R2`
(22/22/19n) · `CB · Painel Chatwoot` (13n) · `CB · Confirmação` + `T0` (11/14n) ·
`CB · Guarda Humano` (11n) · `CB · Ponte Chatwoot → Datafy` (9n) ·
`CB · Guard orcamento diario` (7n) · `CB · Notify lead novo` (5n) ·
`CB · Heartbeat canal` (3n) · `CB · MV Cron` (2n) · `CB · MV Envio (Evolution)` (18n, off) ·
+ 5 webhooks (`Lead Create`, `Lead Schedule`, `Available Times`, `Cancel-Adiar`, `CRM Ponte`) ·
`CB - Error Logger`

**OCR (20):** `OCR Agente · Gabriel` v1/v2/BLOCO1 (63/66/60n) · `OCR Lead Intake` (37n) ·
`OCR · Follow-up IA` (32n) · `OCR · Watchdog de Vácuo` (25n) ·
`OCR · Máquina de Lembretes` (12n) · `OCR · Ponte Chatwoot → Datafy` (9n) ·
`OCR · Vencimento de Call` (2n) · `MV · Cron (OCR)` (2n) · `MV · Disparo (OCR)` (8n, off) ·
`MV · Respostas (OCR)` (5n, off) · + 5 webhooks · `OCR Error Logger`

**Descarte:** `_scaffold-nao-usar`, `My workflow`, `My workflow 2`,
`webhook agente de ia`, `ZZ STRESS · capturador de intencao`.

---

## 7 · Nota sobre acesso

A chave desta instância foi renovada em 08/09 22:25 UTC e **não expira** — como
as outras duas. Três chaves de n8n sem expiração, todas coladas em conversa.
Vale rotacionar as três quando a integração estabilizar, e emitir as próximas
com prazo.
