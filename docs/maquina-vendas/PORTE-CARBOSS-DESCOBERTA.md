# Porte da Máquina de Vendas CarBoss → Doce Lilium — Descoberta (Fase 0)

Data: 04/10/2026 · Origem: `CRM CarBoss` @ `b1da943` (somente leitura) · Destino: `Petalas` @ `114f498`, branch `feat/mv-paridade-carboss`.

## 1. Inventário medido

| Lado | Motor (`src/lib/maquina-vendas`) | Actions | Telas | Rotas | Scripts |
|---|---|---|---|---|---|
| Origem | 43 arquivos | `actions/maquina-vendas.ts` 1456 linhas (23 exports) | `page.tsx` 1111 + dossiê 31 + 6 componentes (2293) | cron 136, `webhook/datafy` 450, `webhook/carboss` 333, `webhook/suporte` 257 | 28 baterias `test-*` + ~35 operacionais |
| Destino | 16 arquivos | `actions/maquina-vendas.ts` 242 linhas (4 exports) | `page.tsx` 442 + `templates/page.tsx` 378 | cron 121, `webhook/whatsapp` 505, `webhook/chatwoot` 131, `webhook/nuvemshop` 142 | 15 scripts, nenhuma bateria `test:*` |

## 2. Diferença de schema (Mv*)

| Ponto | Origem | Destino | Decisão |
|---|---|---|---|
| `MvCadencia.pipelineId/stageId` | obrigatórios | opcionais | manter opcional (DL dispara por evento de loja, não por coluna) |
| `MvCadenciaEtapa.ancoradaEm/templateNome` | não existe (mapa em `templates.ts`) | existe | manter o do destino; `templates.ts` portado lê da etapa |
| `MvInscricao.dealId` | obrigatório | opcional | manter opcional |
| `MvInscricao.perfil` | `default` | ausente | **adicionar** (já comprou / nunca comprou / recorrente) |
| `MvInscricao.stageIdOrigem, sdrFalouEm, reuniaoEm, vendaEm` | existe | `humanoFalouEm`, `converteuEm`, `valorConvertido` | traduzir: SDR→humano, reunião→não se aplica (❌), venda→conversão |
| `MvMensagem.textoEntregue` | existe | ausente | **adicionar** |
| `MvMensagem.falhaCodigo` | existe | `codigoErro` | manter nome do destino; motor portado usa `codigoErro` |
| índice parcial `ativa_unica` | `(cadencia_id, deal_id) WHERE status='ATIVA'` | ausente | **adicionar** sobre `(cadencia_id, telefone_key) WHERE status='ATIVA'` (DL não tem deal obrigatório) |
| `MvResposta`, `MvOptOut`, `MvTemplateRevisao`, `LogEvento`, `Marca` | não existem | existem | manter |

Toda migration é aditiva, preserva ids, e roda primeiro em `petalas_prova` (cópia local de produção).

## 3. Snapshot de produção (antes) — 04/10/2026 ~14:00 UTC

Arquivo bruto: `%TEMP%\mv-porte\snap-antes.txt` (somente leitura).

- 10 migrations; última `20260910000002_marca`.
- 8 cadências ativas: carrinho (3 etapas), pedido pago, pedido enviado, reativação 60d, coleção nova, drop d1/d2/d3 (`campanha_1010_*`).
- Inscrições: carrinho ATIVA 1 / CONCLUIDA 1 / RESPONDEU 2 · d1 ATIVA 47 · pedido pago CONCLUIDA 2.
- Mensagens: carrinho CANCELADA 4 / ENVIADA 4 / ERRO 3 (132018×2, 131049×1) · d1 AGENDADA 47 · pedido pago ENVIADA 2.
- Opt-out 0 · respostas 8 · `envio_pausado = true` desde 29/09 13:49 (`admin@petalas.com`) · teto 60 · intervalo 3–12 · janela 09:00–20:00 · cupom `MINHADL` 10%.

## 4. Templates Meta

16/16 `APPROVED` na WABA `1722319218643532` (conferido por `mv-submeter-templates.ts --status`). Template aprovado não é editado; o que mudar vira `_v2`. Novo template a submeter: `dl_relatorio_pronto_v1` (porta do briefing).

## 5. Tradução de domínio (validada contra dados reais)

| CarBoss | Doce Lilium |
|---|---|
| deal entra numa coluna do funil | evento de loja: carrinho abandonado, pedido pago, pedido enviado, entregue, reativação 60d, coleção nova, drop datado, coluna do CRM (`funis-crm`) |
| lead / deal / reunião / SDR | cliente / pedido / drop / atendente humana |
| SDR (n8n) | agente IA `jSksdytKwNUZBQIb` + Marília no Chatwoot |
| perfil | já comprou · nunca comprou · recorrente |
| vocabulário automotivo | vocabulário DL (tom "querida", 🎀 💖 🤍) |
| briefing diário por texto livre | porta `dl_relatorio_pronto_v1` → relatório completo no tique seguinte ao toque |
| temperatura do lead | intenção de compra (carrinho vivo, pedido recente, resposta) |
| handoff 6 h | **12 h** (`HUMANO_HORAS`), um relógio só |
| `MV_NUMERO_DEV` redireciona | `MV_NUMEROS_TESTE` **bloqueia** fora da lista e registra; nunca redireciona |
| domingo bloqueado, janela 07–00 | todos os dias, janela 09–20 (ajuste do destino) |
| `NUMERO_PADRAO` do dono CarBoss | `MV_ALERTA_NUMERO` (sem valor padrão; ausente = só LogEvento) |

## 6. Achados que exigem decisão

### 6.1 Campanha 10.10 — onda d1 não saiu (decisão adiada pelo Owner em 04/10)

47 mensagens d1 estão `AGENDADA` desde 01/10 12:00 UTC porque o envio está pausado desde 29/09. `quemRecebeu()` escolhe o público da onda 2 a partir das **inscrições** da d1, não das mensagens enviadas: em 09/10 a d2 vai semear essas 47 mesmo sem a d1 ter saído. O porte **não toca** em nada da campanha (cadências, cursores, `MV_CAMPANHA_1010`); a pergunta volta ao Owner no relatório final.

### 6.2 Cron devolve 200 no erro

`api/cron/maquina-vendas/route.ts` devolve `{ok:false}` com **status 200** de propósito, e as subfases (rastreio, marketing, campanha, funis) engolem erro com `.catch`; `registrar()` engole falha de `LogEvento`. Regra §1.10 e a origem exigem 500. O porte muda para 500 com o nome da fase que falhou, e o n8n do cron passa a ver a falha.

### 6.3 Despachante sem lista de teste

Não existe `MV_NUMEROS_TESTE`. O porte adiciona a guarda antes de qualquer chamada ao canal: fora da lista → `VETADA` com motivo `fora_da_lista_de_teste` + `LogEvento`, sem redirecionar.

## 7. Matriz de paridade

Ver [`PORTE-CARBOSS-PARIDADE.md`](./PORTE-CARBOSS-PARIDADE.md).
