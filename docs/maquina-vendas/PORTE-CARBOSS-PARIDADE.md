# Matriz de paridade — Máquina de Vendas CarBoss → Doce Lilium

Legenda: ✔️ portado igual · 🔀 portado com tradução (motivo na linha) · ❌ não portado (motivo na linha).
Origem = `CRM CarBoss` @ `b1da943` (somente leitura). Destino = `Petalas/src/lib/maquina-vendas/` salvo indicação. Branch `feat/mv-paridade-carboss`.

Teste que prova:
- **n1 #N**: grupo N do nível 1 (`npm run test:mv -- 1`, `bateria-pura.ts`). Mesma bateria da aba Prontidão. Resultado: **211/0**.
- **n2 #N**: grupo N do nível 2 (`npm run test:mv -- 2`, `nivel2.ts`). Roda só em banco local `_qa`, com `fetch` falso. Resultado: **97/0**.
- **n3 item N**: item do nível 3 (envio real para a lista de teste, ver `RELATORIO-TESTES-*.md`).
- **smoke**: script somente leitura executado no banco `petalas_prova`.

Grupos do nível 1:
1. Catálogo
2. Cadências/modelos
3. Copy
4. Janela
5. Rampa
6. Prova
7. Disjuntor
8. Situação
9. Cupom MINHADL
10. Códigos Meta
11. Webhook formatos
12. Humano 12 h
13. Lista de teste
14. Opt-out/paradas
15. Grade
16. Rastreio assinado
17. Papéis/assuntos
18. Atenção
19. Observador de colunas
20. Briefing

Grupos do nível 2:
1. Cadências até CONCLUIDA
2. Resposta para a régua
3. Opt-out
4. Pedido pago
5. Humano 12 h
6. Pausar/retomar/cancelar/freio
7. Lista branca VETADA
8. Corrida de tiques
9. Disjuntor
10. Pureza do observador
11. Fechamento

## 1. Motor (43 arquivos da origem)

| # | Origem | Destino | Status | Teste que prova |
|---|---|---|---|---|
| 1 | filtros.ts | filtros.ts | ✔️ | tsc + build; filtros da aba Tabela |
| 2 | grupos.ts | grupos.ts | ✔️ | tsc + build; agrupamento da aba Tabela |
| 3 | chatwoot-api.ts | chatwoot-api.ts. A conta, a inbox e a URL vêm do Chatwoot DL por env (CHATWOOT_*) | 🔀 | n2 #5; n3 item 4 |
| 4 | condicao.ts | condicao.ts. A única condição comercial é `MINHADL` com carrinho vivo | 🔀 | n1 #9 |
| 5 | recebidas.ts | recebidas.ts. Está portado, mas `gravarRecebidas` NÃO é chamado no webhook: na DL a mensagem de entrada já vive em `atendimento/conversa` (`registrarTurno`), e gravar em dobro duplicaria o histórico | 🔀 | n1 #11 |
| 6 | resincronizar.ts | resincronizar.ts | ✔️ | `mv-porte-migrar --apply` no `petalas_qa` (7/7 etapas alinhadas) |
| 7 | vocabulario.ts | vocabulario.ts. Vocabulário DL (cliente/pedido/drop/equipe) | 🔀 | n1 #3 |
| 8 | modelos.ts | modelos.ts. Modelos de cadência da loja (carrinho, pedido, coleção, reativação) | 🔀 | n1 #2 |
| 9 | handoff.ts | handoff.ts. 12 h no mesmo relógio de `HUMANO_HORAS` (`atendimento:humano:<chave>`) | 🔀 | n1 #12; n2 #5; n3 item 4 |
| 10 | situacao.ts | situacao.ts | ✔️ | n1 #8 |
| 11 | vigia.ts | vigia.ts. O alerta vai só para `MV_ALERTA_NUMERO`; não há número padrão (fail-closed) | 🔀 | etapa do tique do cron; o build e o tique em prova não deram erro |
| 12 | disjuntor.ts | disjuntor.ts | ✔️ | n1 #7; n2 #9 |
| 13 | prova.ts | prova.ts. Usa `codigoErro` no lugar de `falhaCodigo` | 🔀 | n1 #6; n3 item 9 |
| 14 | rampa.ts | rampa.ts | ✔️ | n1 #5 |
| 15 | grade.ts | grade.ts | ✔️ | n1 #15 |
| 16 | pulso.ts | pulso.ts. URL `/api/webhook/whatsapp` (`carimbar` no webhook) | 🔀 | tsc + build; carimbo visto no tique em prova |
| 17 | desempenho-toque.ts | desempenho-toque.ts, mais a action `getDesempenhoPorToque` | ✔️ | tsc + build; aba Ritmo |
| 18 | temperatura.ts | temperatura.ts. Mede intenção de compra (carrinho, pós-venda) em vez de calor do funil SDR | 🔀 | n1 #18, #20 |
| 19 | resultado.ts | resultado.ts. Baldes venda/pedido; o balde "reunião" não existe (a loja não agenda) | 🔀 | tela Resultados; tsc + build |
| 20 | assinatura.ts | assinatura.ts. Unificada com a validação do webhook. Assinatura inválida devolve **401** (a origem devolvia 200): na DL é fail-closed | 🔀 | n1 #11 |
| 21 | templates.ts | templates.ts. Lê `templateNome` da etapa e o catálogo dos 17 | 🔀 | n1 #1 |
| 22 | corpo-template.ts | corpo-template.ts | ✔️ | n1 #1; `mv-backfill-texto-entregue` (16 corpos lidos da Meta) |
| 23 | chatwoot-nota.ts | chatwoot-nota.ts | ✔️ | etapa do tique do cron (`anotarTextosNoChatwoot`) |
| 24 | sinais-meta.ts | sinais-meta.ts | ✔️ | n1 #10 |
| 25 | janela.ts | janela.ts. Todos os dias, janela 09–20 em São Paulo | 🔀 | n1 #4 |
| 26 | conversa.ts | conversa.ts | ✔️ | n1 #12, #14; n2 #2 |
| 27 | confirmacao.ts | confirmacao.ts (`aplicarStatuses` no webhook) | ✔️ | n1 #11; n3 item 9 |
| 28 | indicadores.ts | indicadores.ts | ✔️ | tsc + build; cartões da tela |
| 29 | datafy.ts | canal.ts (já existente) + datafy.ts fino. As credenciais vêm de `"Integration"` e, na falta, do env | 🔀 | n1 #11; n3 itens 1–2 |
| 30 | respostas.ts | respostas.ts. `registrarRespostas` foi igual; `registrarDesfechos` (reunião/venda do SDR) virou `creditarPedido` (o pedido pago credita a régua) | 🔀 | n2 #2, #4 |
| 31 | trajetoria.ts | trajetoria.ts | ✔️ | smoke `mv-ops/trajetoria-cliente.ts` |
| 32 | programacao.ts | programacao.ts | ✔️ | tsc + build; aba Programação |
| 33 | config.ts | config.ts (mesclado). ⚠ `liberadoParaEnvio` fica ABERTO se `MV_NUMEROS_TESTE` estiver vazio; isso está no relatório | 🔀 | n1 #13; n2 #7 |
| 34 | paradas.ts | paradas.ts. O opt-out usa `pediuParaSair` (opt-out.ts) | 🔀 | n1 #14; n2 #3 |
| 35 | entrega-meta.ts | entrega-meta.ts | ✔️ | n1 #10, #11 |
| 36 | copy.ts | copy.ts (mesclado; mantém o `[[a\|b]]` FNV-1a do destino) | 🔀 | n1 #3 |
| 37 | papeis.ts | papeis.ts. Papéis e assuntos dos 17 templates DL | 🔀 | n1 #17 |
| 38 | dossie.ts | dossie.ts | ✔️ | smoke `mv-ops/ver-dossie.ts`; tela `contato/[inscricaoId]` |
| 39 | cadencias-seed.ts | cadencias-seed.ts. As 8 cadências DL, perfis e a campanha 10.10 intocada | 🔀 | n1 #2; n2 #1 |
| 40 | observador.ts | observador.ts (mesclado). O observador é puro | 🔀 | n2 #10; grep de pureza = 0 (seção 7) |
| 41 | despachante.ts | despachante.ts (mesclado). Inclui `MV_NUMEROS_TESTE`, rampa, disjuntor, grade e **trava atômica `mv:despacho_trava`** (bug de corrida achado no porte) | 🔀 | n1 #13; n2 #1–#9 |
| 42 | briefing.ts | briefing.ts. A porta é `dl_relatorio_pronto_v1` (submetido em 04/10, UTILITY) | 🔀 | n1 #20; n3 item 8 |
| 43 | atencao.ts | atencao.ts | ✔️ | n1 #18 |

## 2. Peças só do destino (mantidas)

| Destino | Status |
|---|---|
| campanha-datada.ts · observador-marketing.ts · observador-rastreio.ts · observador-colunas.ts · rastreio.ts · `api/r/rastreio/[pedido]` · gatilho-pedido.ts · agenda.ts · canal.ts · catalogo-templates.ts · eco.ts · opt-out.ts · funis-crm.ts · telefone.ts · bateria-pura.ts · `templates/page.tsx` | ✔️ mantidas |

## 3. Actions

| Origem | Status |
|---|---|
| getMvTabela · getTemplatesDasCadencias · getMvCadencias · getMvDashboard · pausarInscricao · retomarInscricao · cancelarInscricao · alternarCadencia · getColunasParaAcompanhamento · getAcompanhamentoDaColuna · validarEtapasCadencia · criarCadencia · atualizarCadencia · excluirCadencia · preverEstoqueDaCadencia · rodarObservadorManual · getMvAjustes · salvarMvAjustes · getMvConversas · getDossieDoContato · getProgramacao · getProgramacaoDoDia · getResumoDeHojeMv | ✔️ todas presentes; tsc + build; n2 #6 (pausar/retomar/cancelar), n2 #10 (rodarObservadorManual = "Atualizar") |
| (novas) getSouAdmin · getFilaDeAtencao · getDesempenhoPorToque · getProntidao | ✔️ |
| (destino) getEstadoMaquina · alternarPausa · salvarAjustes · getResultados | ✔️ mantidas |

## 4. Telas e componentes

| Origem | Destino | Status |
|---|---|---|
| `maquina-vendas/page.tsx` | `maquina-vendas/page.tsx` com as abas Atenção · Cadências · Conversas · Programação · Ritmo · Tabela · **Prontidão** (só admin, só leitura) | ✔️ |
| `contato/[inscricaoId]/page.tsx` + DossieContato | idem | ✔️ |
| AbaAtencao · AbaCadencias · AbaConversas · AbaProgramacao · AbaRitmo · AbaTabela · ConfigCadenciaModal · cartoes · comum | `components/maquina-vendas/*`, só com tokens DL | ✔️ |
| CartaoMensagensDeHoje | dashboard (4 linhas em `dashboard/page.tsx`) | ✔️ |

## 5. Rotas

| Origem | Destino | Status |
|---|---|---|
| `api/cron/maquina-vendas` | idem. Erro devolve 500 (linhas 156 e 165) | ✔️ |
| ↳ etapa `registrarDesfechos` | `creditarPedido`, chamado pelo evento de pedido pago | 🔀 a loja não tem reunião |
| ↳ etapa `rodarConselheiro` / `revisarAprendizado` | — | ❌ o Conselheiro é o assistente de LLM do funil SDR da CarBoss (tabela `conselheiro_rodadas`, funil de reunião); não há funil equivalente na loja |
| `api/webhook/datafy` | fundido em `api/webhook/whatsapp` | 🔀 |
| ↳ `repassarAoAgente` (POST fire-and-forget ao n8n) | `agendarAtendimento` (`atendimento/encaminhar`) | 🔀 o agente DL roda pelo encaminhador do próprio CRM, sem disparo cego |
| ↳ `gravarRecebidas` | não chamado | 🔀 ver linha 5 do motor |
| `api/webhook/carboss` | — | ❌ webhook do site CarBoss (ponte n8n → kanban); na DL o equivalente é `webhook/nuvemshop` + `webhook/doce-lilium` |
| `api/webhook/suporte` | — | ❌ suporte ao cliente do SaaS CarBoss; a DL não tem esse produto |
| (destino) `cron/disparo-agendado` | mantido | ✔️ é a `listaDisparo` legada, não a Máquina (§3.4) |

## 6. Scripts (169 da origem)

| Origem | Destino | Status | Motivo / teste |
|---|---|---|---|
| adiar-fila-mv · auditoria-maquina-vendas · briefing-do-dia · datafy-status · datafy-teste-envio · freio-maquina-vendas · inscrever-estoque-cadencia · mv-alinhar-copy-com-templates · mv-backfill-respondeu-em · mv-backfill-respostas · mv-backfill-texto-entregue · mv-completar-etapas-novas · mv-conferir-fila-no-chatwoot · mv-janela · mv-ligar-cadencias · mv-parar-quem-ja-falou · mv-reencaixar-vencidas · priorizar-cadencia-mv · prontidao-maquina-vendas · reencaixar-fila-mv · resincronizar-copy-mv · status-maquina-vendas · tick-maquina-vendas · ver-dossie · ver-logs | `scripts/mv-ops/<mesmo nome>` | ✔️ | os 4 da migração rodaram via `mv-porte-migrar`; ver-dossie e ver-logs com smoke em prova |
| trajetoria-lead-carboss | `mv-ops/trajetoria-cliente` | 🔀 | vocabulário DL; smoke em prova |
| vigia-duplicacao-e-funil | `mv-ops/vigia-duplicacao` | 🔀 | sem a parte de funil SDR |
| seed-maquina-vendas | `cadencias-seed.ts` + `scripts/mv-cadencia-carrinho` / `mv-cadencia-pedido` | 🔀 | cadências DL |
| datafy-submeter-templates | `scripts/mv-submeter-templates` | 🔀 | catálogo DL; só submete o que foi revisado; nunca edita template aprovado |
| reset-maquina-vendas | `mv-ops/cancelar-fila-mv` | 🔀 | cancela a fila sem apagar histórico (dados sagrados) |
| test-mv-templates · test-mv-corpo-template | n1 #1 | 🔀 | |
| test-mv-cadencias · test-mv-modelos | n1 #2 | 🔀 | |
| test-copy-maquina-vendas | n1 #3 | 🔀 | |
| test-mv-rampa | n1 #5 | 🔀 | |
| test-mv-prova | n1 #6 | 🔀 | |
| test-mv-disjuntor | n1 #7; n2 #9 | 🔀 | |
| test-mv-situacao | n1 #8 | 🔀 | |
| test-mv-sinais-meta · test-mv-entrega-meta | n1 #10 | 🔀 | |
| test-mv-webhook-formatos · test-mv-assinatura | n1 #11 | 🔀 | |
| test-mv-handoff | n1 #12; n2 #5 | 🔀 | |
| test-flags-maquina-vendas | n1 #13; n2 #7 | 🔀 | |
| test-mv-conversa · test-mv-botao-resposta | n1 #14; n2 #3 | 🔀 | |
| test-grade-mv · test-mv-capacidade | n1 #15 | 🔀 | |
| test-mv-papeis · test-mv-assuntos | n1 #17 | 🔀 | |
| test-mv-atencao | n1 #18 | 🔀 | |
| test-briefing-temperatura | n1 #20 | 🔀 | |
| test-mv-conversa-viva | n2 #2 | 🔀 | |
| e2e-maquina-vendas · qa-integracao-maquina-vendas · loop-qa-maquina-vendas · bateria-mv · limpar-teste-e2e | `scripts/test-mv/nivel2.ts` | 🔀 | o nível 2 isola, testa e restaura sozinho (a limpeza vem embutida) |
| teste-eco-caminho-nativo | `scripts/test-handoff-eco` (já existente) | 🔀 | o eco na DL é por `smb_message_echoes` |
| test-mv-resultados · test-mv-recebidas · test-mv-desempenho-toque · test-mv-followup-ui · test-logs | — | ❌ | sem bateria dedicada nesta rodada: o código está coberto por tsc + build e pelas telas; ficam no 🪤 do relatório |
| os 42 `n8n-*` (agenda-manda-na-vaga … voltar-carboss-para-evolution, incluindo n8n-cron-maquina-vendas, n8n-parar-maquina-de-vendas e n8n-provisionar-mv-envio) · lib-n8n-consulta | — | ❌ | a máquina DL roda no cron do próprio CRM; os canais não oficiais (Evolution/uazapi) foram aposentados em 09/09/2026 |
| chatwoot-entrega-unica · chatwoot-espelho-carboss · chatwoot-etiquetas-carboss · chatwoot-historico-leads · chatwoot-importar-espelho-para-datafy · chatwoot-limpar-teste-ponte · chatwoot-medir-espelho · chatwoot-reparar-contatos-sem-9 · chatwoot-texto-real | — | ❌ | ponte n8n ↔ inbox 6 da CarBoss; a DL anota pelo `chatwoot-nota.ts` e recebe pelo `webhook/chatwoot` |
| conselheiro-partida · test-conselheiro · auditoria-cadeia-agendamento · bateria-agente-carboss · mv-base-fria-5-toques · agenda-quem-e-a-primary · orcamento-cap-do-dia · tirar-da-lista-carboss · diagnostico-lembretes-fantasma · varre-resposta-dobrada | — | ❌ | agente SDR, agenda de reunião e base fria da CarBoss; não existem na loja |
| test-funil-50 · test-funil-corrida · test-funil-e2e · teste-ponta-a-ponta-funil | — | ❌ | funil kanban de reunião da CarBoss; a corrida da Máquina está no n2 #8 |
| reparar-conta-suspensa · reparar-represadas · diagnostico-0012 · diagnostico-coluna | — | ❌ | consertos pontuais de incidentes da CarBoss (31/08, 131049); a regra que eles ensinaram ficou no despachante e no disjuntor |
| datafy-templates-utility | — | ❌ | são os 24 templates da CarBoss; a DL tem o próprio catálogo de 17 |
| alinhar-valor-com-plano · apagar-contatos-teste · apagar-deals-arquivados · apply-sql · backfill-valor-pago · backfill_names · backup-producao · check-caixa · check-funil · check-fuso-prisma · check-leads · check-users · consultar-producao · criar-colunas-funil · debug-visibility · ensure-pipeline-operacional · gerar-modelos-importacao · limpar-contas-teste-hub · limpar-contatos-teste · limpar-historico-numero · podar-historico-sem-vinculo · restaurar-teste · selar-migrations-producao · sync-leads · test-backup-retencao · test-import-e2e · test-import-parse · test-import-ui-import · test-import-ui-tags · test-import-ui-volume · testar-diagnostico-quiz · update-origens · update-teams | — | ❌ | fora do escopo: CRM geral, importação, SaaS e quiz da CarBoss; não fazem parte da Máquina de Vendas |

Só do destino: `mv-porte-migrar` (migração com impressão digital da 10.10), `mv-*-conferir`, `test-rastreio-link`, `test-mv/rodar.mjs`.

## 7. Provas transversais (04/10/2026)

| Prova | Resultado |
|---|---|
| Grep de escrita em Deal/Stage/Pipeline/Contact/Activity/DealStageHistory nos `observador*.ts` | **0** |
| Chamadas HTTP não-GET nos `observador*.ts` | **0** |
| Escrita no CRM em `lib/maquina-vendas` fora dos observadores | só em `funis-crm.ts` (`sincronizarFunis`), que já existia na base `114f498` e não foi alterado pela branch; é uma etapa própria do cron, não do observador |
| Snapshot da 10.10 em produção, antes × depois (`snap.sql`) | cadências, etapas, inscrições, mensagens, cursor da campanha, ajustes e templates idênticos; mudaram só os cursores das varreduras de rotina e o contador de tiques |
| Impressão digital da 10.10 no `mv-porte-migrar --apply` (petalas_qa) | `4c0b276d081d1945…` idêntica antes e depois |
| Lint dos arquivos da branch | 0 erro novo (os 8 de `dashboard/page.tsx` já existiam na base) |
| tsc · build | limpos · `next build` EXIT 0 |
