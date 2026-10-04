# Matriz de paridade — Máquina de Vendas CarBoss → Doce Lilium

Legenda: ✔️ portado igual · 🔀 portado com tradução (motivo na linha) · ❌ não portado (motivo na linha) · ⏳ em andamento.
Destino = `Petalas/src/lib/maquina-vendas/` salvo indicação. Teste = bateria de `npm run test:mv` (nível 1 puro, nível 2 integração) ou item do nível 3.

## 1. Motor (43 arquivos)

| # | Origem | Destino | Status | Teste que prova |
|---|---|---|---|---|
| 1 | filtros.ts | filtros.ts | ⏳ | n1 `filtros` |
| 2 | grupos.ts | grupos.ts | ⏳ | n1 `indicadores` |
| 3 | chatwoot-api.ts | chatwoot-api.ts — conta/inbox/URL do Chatwoot DL por env | ⏳ | n2 `handoff` |
| 4 | condicao.ts | condicao.ts — condição = `MINHADL` só com carrinho vivo | ⏳ | n1 `cupom` |
| 5 | recebidas.ts | recebidas.ts — grava em `MvResposta`/LogEvento (DL não tem `n8n_chat_histories` no CRM) | ⏳ | n2 `recebidas` |
| 6 | resincronizar.ts | resincronizar.ts | ⏳ | n2 `resincronizar` |
| 7 | vocabulario.ts | vocabulario.ts — vocabulário DL | ⏳ | n1 `copy` |
| 8 | modelos.ts | modelos.ts — modelos de cadência DL | ⏳ | n1 `modelos` |
| 9 | handoff.ts | handoff.ts — 12 h, mesmo relógio de `HUMANO_HORAS` | ⏳ | n1 `handoff-12h`, n3 item 4 |
| 10 | situacao.ts | situacao.ts | ⏳ | n1 `situacao` |
| 11 | vigia.ts | vigia.ts — alerta em `MV_ALERTA_NUMERO`, sem número padrão | ⏳ | n2 `vigia` |
| 12 | disjuntor.ts | disjuntor.ts | ⏳ | n1 `disjuntor` |
| 13 | prova.ts | prova.ts — `codigoErro` no lugar de `falhaCodigo` | ⏳ | n1 `prova`, n3 item 9 |
| 14 | rampa.ts | rampa.ts | ⏳ | n1 `rampa` |
| 15 | grade.ts | grade.ts | ⏳ | n1 `grade` |
| 16 | pulso.ts | pulso.ts — URL `/api/webhook/whatsapp` | ⏳ | n2 `pulso` |
| 17 | desempenho-toque.ts | desempenho-toque.ts | ⏳ | n2 `desempenho-toque` |
| 18 | temperatura.ts | temperatura.ts — intenção de compra | ⏳ | n1 `temperatura` |
| 19 | resultado.ts | resultado.ts — baldes venda/pedido; "reunião" ❌ | ⏳ | n1 `resultados` |
| 20 | assinatura.ts | assinatura.ts — unifica com a validação já existente do webhook | ⏳ | n1 `assinatura` |
| 21 | templates.ts | templates.ts — lê `templateNome` da etapa + catálogo dos 16 | ⏳ | n1 `templates` |
| 22 | corpo-template.ts | corpo-template.ts | ⏳ | n1 `corpo-template` |
| 23 | chatwoot-nota.ts | chatwoot-nota.ts | ⏳ | n2 `chatwoot-nota` |
| 24 | sinais-meta.ts | sinais-meta.ts | ⏳ | n1 `sinais-meta` |
| 25 | janela.ts | janela.ts — todos os dias, janela 09–20 | ⏳ | n1 `janela` |
| 26 | conversa.ts | conversa.ts | ⏳ | n1 `conversa` |
| 27 | confirmacao.ts | confirmacao.ts | ⏳ | n2 `entrega-meta`, n3 item 9 |
| 28 | indicadores.ts | indicadores.ts | ⏳ | n1 `indicadores` |
| 29 | datafy.ts | canal.ts (existente) + datafy.ts fino | 🔀 | n1 `webhook-formatos` |
| 30 | respostas.ts | respostas.ts | ⏳ | n2 `respostas` |
| 31 | trajetoria.ts | trajetoria.ts | ⏳ | n2 `trajetoria` |
| 32 | programacao.ts | programacao.ts | ⏳ | n2 `programacao` |
| 33 | config.ts | config.ts (mesclado) | ⏳ | n1 `flags` |
| 34 | paradas.ts | paradas.ts | ⏳ | n1 `paradas` |
| 35 | entrega-meta.ts | entrega-meta.ts | ⏳ | n1 `entrega-meta` |
| 36 | copy.ts | copy.ts (mesclado; mantém `[[a\|b]]` FNV-1a do destino) | ⏳ | n1 `copy` |
| 37 | papeis.ts | papeis.ts — papéis dos 16 templates | ⏳ | n1 `papeis` |
| 38 | dossie.ts | dossie.ts | ⏳ | n2 `dossie` |
| 39 | cadencias-seed.ts | cadencias-seed.ts — as 8 cadências DL + perfis | ⏳ | n2 `cadencias` |
| 40 | observador.ts | observador.ts (mesclado; observador puro) | ⏳ | n2 `observador`, grep de pureza |
| 41 | despachante.ts | despachante.ts (mesclado; + `MV_NUMEROS_TESTE`, rampa, disjuntor, grade) | ⏳ | n1 `whitelist`, n2 `despachante` |
| 42 | briefing.ts | briefing.ts — porta `dl_relatorio_pronto_v1` | ⏳ | n3 item 8 |
| 43 | atencao.ts | atencao.ts | ⏳ | n1 `atencao` |

## 2. Peças só do destino (mantidas)

| Destino | Status |
|---|---|
| campanha-datada.ts · observador-marketing.ts · observador-rastreio.ts · rastreio.ts · `api/r/rastreio/[pedido]` · gatilho-pedido.ts · agenda.ts · canal.ts · catalogo-templates.ts · eco.ts · opt-out.ts · funis-crm.ts · telefone.ts · `templates/page.tsx` | ✔️ mantidas |

## 3. Actions

| Origem | Status |
|---|---|
| getMvTabela · getTemplatesDasCadencias · getMvCadencias · getMvDashboard · pausarInscricao · retomarInscricao · cancelarInscricao · alternarCadencia · getColunasParaAcompanhamento · getAcompanhamentoDaColuna · validarEtapasCadencia · criarCadencia · atualizarCadencia · excluirCadencia · preverEstoqueDaCadencia · rodarObservadorManual · getMvAjustes · salvarMvAjustes · getMvConversas · getDossieDoContato · getProgramacao · getProgramacaoDoDia · getResumoDeHojeMv | ⏳ |
| (destino) getEstadoMaquina · alternarPausa · salvarAjustes · getResultados | ✔️ mantidas |

## 4. Telas e componentes

| Origem | Destino | Status |
|---|---|---|
| `maquina-vendas/page.tsx` | `maquina-vendas/page.tsx` + aba Prontidão | ⏳ |
| `contato/[inscricaoId]/page.tsx` + DossieContato | idem | ⏳ |
| AbaConversas · AbaProgramacao · AbaRitmo · ConfigCadenciaModal | `components/maquina-vendas/*` | ⏳ |
| CartaoMensagensDeHoje | dashboard | ⏳ |

## 5. Rotas

| Origem | Destino | Status |
|---|---|---|
| `api/cron/maquina-vendas` | idem — erro devolve 500 | ⏳ |
| `api/webhook/datafy` | fundido em `api/webhook/whatsapp` | ⏳ |
| `api/webhook/carboss` | ❌ webhook do site CarBoss; o equivalente DL é `webhook/nuvemshop` + `webhook/doce-lilium` | ❌ |
| `api/webhook/suporte` | ❌ suporte de cliente CarBoss (SaaS); a DL não tem esse produto | ❌ |

## 6. Scripts

| Origem | Status |
|---|---|
| 28 baterias `test-*` | ⏳ → `scripts/test-mv/*` + `npm run test:mv` |
| n8n-provisionar-mv-envio · scripts de Evolution/uazapi | ❌ canal não oficial aposentado em 09/09/2026 |
| demais operacionais | ⏳ |
