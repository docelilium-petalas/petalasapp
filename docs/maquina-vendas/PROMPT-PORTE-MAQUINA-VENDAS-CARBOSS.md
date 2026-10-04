# PROMPT — Porte integral da Máquina de Vendas da CarBoss para a Doce Lilium

> Prompt de execução para o agente (Claude Code / Antigravity). Escrito em 04/10/2026
> a partir do inventário medido dos dois repositórios. Execute de ponta a ponta, sem
> pedir confirmação a cada passo — mas **pare e pergunte** sempre que uma regra da
> seção 1 for ameaçada.

---

## 0 · Missão

Trazer **todo** o módulo Máquina de Vendas do CRM CarBoss para o CRM da Doce Lilium
(Petalas), **sem perder nenhum recurso de nenhum dos dois lados**, vestido com a
identidade visual da Doce Lilium, com as campanhas que já existem na Doce Lilium
migradas para o motor novo, com os 16 templates Meta reaproveitados e testados, e com
um **módulo de testes próprio** que prove cada função — terminando em disparo real
para os dois números de teste.

"Todo" é literal. Paridade é medida arquivo por arquivo, função por função, numa
matriz (seção 3). Recurso que não for portado precisa de um ❌ com motivo escrito e
aceito pelo Owner — **nunca** de uma omissão silenciosa.

### Repositórios

| papel | caminho | estado medido |
|---|---|---|
| ORIGEM (somente leitura) | `C:\Users\L - Atlas\Documents\GitHub\Antigravity\CRM CarBoss` | `b1da943` · 28/09/2026 |
| DESTINO | `C:\Users\L - Atlas\Documents\GitHub\Antigravity\Petalas` | `114f498` · 29/09/2026 · Next 16.2.6, React 19.2, Prisma 7.8 |

⚠️ Os outros diretórios `Carboss`, `Carboss-qa-wt` e `SAS Carboss` **não** são a origem.
A Máquina de Vendas mora só em `CRM CarBoss`.

### Leitura obrigatória antes de escrever qualquer linha

Na origem:
1. `HANDOFF-MAQUINA-DE-VENDAS.md` (inteiro — 606 linhas, 21 gotchas)
2. `PLANO-MAQUINA-DE-VENDAS.md`, `DESCOBERTA-MAQUINA-DE-VENDAS.md`
3. `PLANO-DISJUNTOR-CARBOSS.md`, `PLANO-RESULTADOS-CARBOSS.md`,
   `PLANO-TEMPLATES-META-CARBOSS.md`, `PLANO-MONITORAMENTO-FUNIL-CARBOSS.md`,
   `PLANO-RELIGAR-MAQUINA-CARBOSS.md`, `PLANO-CADENCIAS-28-DIAS.md`,
   `HANDOFF-DATAFY.md`, `PEDIDO-DATAFY-ECO-DUPLICADO.md`, `VOCABULARIO-CARBOSS.md`

No destino:
1. `AGENTS.md` e `CLAUDE.md` — e **ler `node_modules/next/dist/docs/`** antes de tocar em
   rota, server action ou layout (esta versão do Next tem mudanças que quebram o que
   você sabe de memória).
2. `docs/maquina-vendas/TEMPLATES-META.md`, `docs/n8n/REFERENCIA-MAQUINA-VENDAS.md`,
   `docs/atendimento/JORNADA-IA-WHATSAPP.md`
3. O cabeçalho de **todos** os 16 arquivos de `src/lib/maquina-vendas/` — especialmente
   `campanha-datada.ts` (explica por que o drop 10.10 NÃO é uma cadência de 3 etapas).

---

## 1 · Regras invioláveis (violar = parar e perguntar)

1. **A campanha 10.10 está no ar.** A onda 1 (01/10) já saiu; as ondas 2 (09/10) e 3
   (10/10) dependem das inscrições da onda 1, dos cursores e do `MV_CAMPANHA_1010`.
   Nada deste trabalho pode apagar, renomear, re-semear ou reancorar a campanha.
   **Nenhum deploy em produção entre 08/10 e 11/10/2026.** Antes disso, só com prova
   escrita (query antes/depois) de que inscrições `d1`, cursores e mensagens `d2/d3`
   ficaram idênticos.
2. **A origem é somente leitura.** Nenhum arquivo do `CRM CarBoss` é alterado.
3. **Migração 100% aditiva.** Nenhuma coluna/tabela existente do Petalas é removida ou
   renomeada. Dados vivos (`MvCadencia`, `MvCadenciaEtapa`, `MvInscricao`,
   `MvMensagem`, `MvCursor`, `MvResposta`, `MvOptOut`, `MvAjustes`,
   `MvTemplateRevisao`) são preservados com os mesmos ids.
4. **Observador puro** (regra da origem, vale aqui): o módulo nunca escreve em `Deal`,
   `Stage`, `Pipeline`, `Contact`, `Activity`, `DealStageHistory` nem em nada da
   Nuvemshop. Provar por grep no fim.
5. **Fail-closed em tudo:** sem `CRON_SECRET` → 503; sem credencial de canal → envio
   desabilitado com aviso na tela; config inválida → lança. Nunca `if (secret) {...}`.
6. **Modo teste com lista branca.** Durante todo o trabalho, envio só sai para os
   números da seção 8. Implementar `MV_NUMEROS_TESTE` (lista) como evolução do
   `MV_NUMERO_DEV` da origem: com a env setada, qualquer destino fora da lista é
   **bloqueado e registrado**, não redirecionado em silêncio. Zero lead real.
7. **Template aprovado não se edita.** Copy errada = novo `_v2`, submeter, apontar.
8. **Cupom:** a IA e a Máquina só oferecem `MINHADL` (10%, não cumulativo) e só com
   carrinho abandonado vivo daquele telefone. O `condicao.ts` da origem (preço de
   campanha) deve ser portado **respeitando** essa regra, não substituindo-a.
9. **Atendimento humano:** resposta da atendente (celular via `smb_message_echoes` ou
   painel Chatwoot) silencia a IA por 12 h (`HUMANO_HORAS = 12`). O `handoff.ts` da
   origem (etiqueta que expira) se funde com isso — não pode criar um segundo relógio.
10. **Nada silencioso.** Toda parada grava motivo visível; todo bloqueio de envio vira
    linha em log; erro de cron devolve 500.
11. **Texto:** UTF-8 sem BOM em todo arquivo gravado. Em PowerShell, use
    `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`; nunca `Out-File`/`>`
    em arquivo de dados. Comentários e copy em português com acento correto.
12. **Segredo nenhum** em código, commit, log ou relatório. Credenciais vêm do `.env`
    local e do cofre do Controller.

---

## 2 · Fase 0 — Descoberta (sem escrever código)

Entregar `docs/maquina-vendas/PORTE-CARBOSS-DESCOBERTA.md` com:

1. **Diff de schema**: cada `model Mv*` da origem × destino, campo a campo
   (a origem tem migrações `mv_ajustes`, `mv_canal_oficial`, `mv_resultados`,
   `mv_texto_entregue` que o destino pode não ter).
2. **Estado vivo do banco de produção do Petalas** (somente leitura): cadências, etapas,
   contagem de inscrições por status e por cadência, mensagens por status, cursores,
   opt-outs. Este é o retrato "antes" que a seção 7 tem que reproduzir "depois".
3. **Status dos 16 templates na Meta** (`npx tsx scripts/mv-submeter-templates.ts --status`).
4. **Tradução de domínio** (seção 5) validada contra os dados reais — não de memória.
5. A **matriz de paridade** da seção 3 preenchida com a coluna "destino proposto".

---

## 3 · Inventário obrigatório da origem — matriz de paridade

Cada linha abaixo vira uma linha da matriz `PORTE-CARBOSS-PARIDADE.md` com:
`origem · destino · status (✔️ portado / 🔀 fundido com equivalente DL / ❌ não se aplica + motivo) · teste que prova`.
Nenhuma linha pode ficar em branco.

### 3.1 Motor — `src/lib/maquina-vendas/` (46 arquivos)

| arquivo | linhas | o que é |
|---|---:|---|
| `assinatura.ts` | 249 | assinatura do webhook e as quatro formas de derivar a chave |
| `atencao.ts` | 1052 | respostas que merecem atenção — fila de leitura da atendente |
| `briefing.ts` | 935 | briefing diário: o que sai hoje, para quem, e quem vale contato humano |
| `cadencias-seed.ts` | 684 | cadências como dados, não script |
| `chatwoot-api.ts` | 59 | cliente único do Chatwoot para o tique |
| `chatwoot-nota.ts` | 253 | texto do template vira nota na conversa do Chatwoot |
| `condicao.ts` | 84 | condição de entrada / preço de campanha com prazo |
| `config.ts` | 351 | config lida a cada tique, valor inválido lança |
| `confirmacao.ts` | 297 | aplica o que a Meta confirmou — a única escrita que corrige a tabela |
| `conversa.ts` | 285 | linha do tempo por PESSOA |
| `copy.ts` | 450 | gerador + validador determinístico (7 regras) |
| `corpo-template.ts` | 251 | o texto que a pessoa realmente recebeu |
| `datafy.ts` | 305 | canal oficial Cloud API via Datafy |
| `desempenho-toque.ts` | 233 | qual toque funciona |
| `despachante.ts` | 901 | envio com guards na hora do envio |
| `disjuntor.ts` | 181 | corta envio com canal doente e avisa gente |
| `dossie.ts` | 678 | tudo que o contato recebeu e ainda vai receber |
| `entrega-meta.ts` | 376 | entrega, leitura e falha vindas da Meta |
| `filtros.ts` | 20 | constantes de filtro sem import (de propósito) |
| `grade.ts` | 190 | grade de vagas — onde cabe a próxima mensagem |
| `grupos.ts` | 42 | grupos dos indicadores (sem import, de propósito) |
| `handoff.ts` | 157 | atendimento humano com prazo |
| `indicadores.ts` | 304 | número do cartão = recorte da tabela, um só |
| `janela.ts` | 259 | janela na parede SP, grava UTC, anti-colapso |
| `modelos.ts` | 156 | modelos prontos para configurar pela tela |
| `observador.ts` | 735 | detecta entrada e inscreve (cursor, overlap, estoque) |
| `papeis.ts` | 462 | nome de cada mensagem — vocabulário da régua |
| `paradas.ts` | 364 | paradas na varredura e na hora do envio |
| `programacao.ts` | 318 | que mensagens caem em cada dia |
| `prova.ts` | 181 | prova de entrega em palavras que a equipe lê |
| `pulso.ts` | 222 | "a confirmação de entrega está chegando?" |
| `rampa.ts` | 181 | quantas conversas novas o número pode abrir hoje |
| `recebidas.ts` | 84 | grava a fala do contato |
| `resincronizar.ts` | 116 | editar copy na tela re-sincroniza o que vai sair |
| `respostas.ts` | 309 | quem respondeu e quem a IA atendeu |
| `resultado.ts` | 245 | desfecho de cada pessoa — um balde por inscrição |
| `sinais-meta.ts` | 253 | avisos que a Meta manda sozinha (qualidade, limite, pausa) |
| `situacao.ts` | 164 | "desligada" são três estados diferentes |
| `temperatura.ts` | 243 | quem a equipe deve contatar hoje |
| `templates.ts` | 250 | qual template abre a porta de cada etapa |
| `trajetoria.ts` | 312 | todos os motores numa linha do tempo |
| `vigia.ts` | 166 | mede o canal, chama o disjuntor, avisa |
| `vocabulario.ts` | 139 | vocabulário da marca (minerado, nunca inventado) |

### 3.2 Telas — origem

| peça | o que exige no destino |
|---|---|
| `src/app/maquina-vendas/page.tsx` (1111 l.) | 5 abas: **Mensagens programadas · Programação · Por conversa · Cadências · Ritmo e limites** (o destino hoje tem 4 — falta Programação). Selo de origem do texto, cartões de indicador clicáveis que filtram a tabela, banners de situação |
| `src/app/maquina-vendas/contato/[inscricaoId]/page.tsx` | página de dossiê do contato |
| `AbaConversas.tsx` (264) · `AbaProgramacao.tsx` (511) · `AbaRitmo.tsx` (235) | portar as três |
| `CartaoMensagensDeHoje.tsx` (118) | cartão "o que sai hoje" na `dashboard` da DL |
| `ConfigCadenciaModal.tsx` (420) | criar/editar cadência pela tela, com modelos prontos e validação de copy ao vivo |
| `DossieContato.tsx` (745) | conversa inteira com o futuro dentro dela |
| `src/app/resultados/page.tsx` + `actions/resultados.ts` | desfecho por pessoa / por toque — fundir com o `resultados` que o destino já tem |
| `src/app/logs/page.tsx` + `api/logs` + `actions/logs.ts` | tela de logs do módulo (o destino tem `LogEvento` — ligar nele) |

### 3.3 Server actions — `src/app/actions/maquina-vendas.ts` (23 exports)

`getMvTabela · getTemplatesDasCadencias · getMvCadencias · getMvDashboard ·
pausarInscricao · retomarInscricao · cancelarInscricao · alternarCadencia ·
getColunasParaAcompanhamento · getAcompanhamentoDaColuna · validarEtapasCadencia ·
criarCadencia · atualizarCadencia · excluirCadencia · preverEstoqueDaCadencia ·
rodarObservadorManual · getMvAjustes · salvarMvAjustes · getMvConversas ·
getDossieDoContato · getProgramacao · getProgramacaoDoDia · getResumoDeHojeMv`

Os 4 exports atuais do destino (`getEstadoMaquina · alternarPausa · salvarAjustes ·
getResultados`) continuam existindo (ou viram fachada das novas) — nenhuma tela
existente pode quebrar.

### 3.4 Rotas

`api/cron/maquina-vendas` (tique — inclui briefing por último) ·
`api/cron/disparo-agendado` · `api/webhook/datafy` (statuses + recebidas + assinatura)
→ no destino, fundir com `api/webhook/whatsapp` sem duplicar ingestão.

### 3.5 Scripts operacionais da origem

`adiar-fila-mv · auditoria-maquina-vendas · freio-maquina-vendas ·
inscrever-estoque-cadencia · mv-alinhar-copy-com-templates · mv-backfill-respondeu-em ·
mv-backfill-respostas · mv-backfill-texto-entregue · mv-base-fria-5-toques ·
mv-completar-etapas-novas · mv-conferir-fila-no-chatwoot · mv-janela ·
mv-ligar-cadencias · mv-parar-quem-ja-falou · mv-reencaixar-vencidas ·
priorizar-cadencia-mv · prontidao-maquina-vendas · reencaixar-fila-mv ·
reset-maquina-vendas · resincronizar-copy-mv · seed-maquina-vendas ·
status-maquina-vendas · tick-maquina-vendas · briefing-do-dia · datafy-status ·
datafy-submeter-templates · datafy-templates-utility · datafy-teste-envio ·
vigia-duplicacao-e-funil`

Os que dependem de n8n/uazapi/Evolution (`n8n-*`, `chatwoot-importar-espelho-para-datafy`)
recebem ❌ justificado: o canal não oficial foi aposentado em 09/09/2026.

---

## 4 · O que o destino tem e NÃO pode perder

Estes recursos são da Doce Lilium e não existem na CarBoss. O motor portado tem que
acomodá-los como cidadãos de primeira classe:

| peça do Petalas | por que existe |
|---|---|
| `campanha-datada.ts` | drop 10.10 em 3 cadências de 1 etapa com `ABRE_EM`; ondas 2 e 3 só para quem recebeu a 1; arma com `MV_CAMPANHA_1010=1` |
| `observador-marketing.ts` | reativação 60d, coleção nova, lista de desejos |
| `observador-rastreio.ts` + `rastreio.ts` + `api/r/rastreio/[pedido]` | link assinado HMAC; assinatura inválida → `docelilium.com.br` |
| `gatilho-pedido.ts` | pedido confirmado / Pix pendente / pagamento aprovado / entregue |
| `agenda.ts` | `reancorarAposEnvio` — cauda conta do envio real |
| `canal.ts` + `catalogo-templates.ts` | 16 templates, status na Meta, esqueleto nomeado |
| `eco.ts` | eco do Datafy / detecção de mensagem humana |
| `opt-out.ts` + `MvOptOut` | pedido de parar vale para todos os motores |
| `funis-crm.ts` | pontes com o funil do CRM |
| `telefone.ts` | `chaveTelefone` (sufixo, 9º dígito) |
| `MvResposta`, `MvTemplateRevisao` | respostas e revisão de template |
| `maquina-vendas/templates/page.tsx` | tela de templates |
| Teto diário 60, 1 envio por tique com jitter 3–12 min, janela 09:00–20:00 | ritmo atual da DL — vira o valor padrão da aba Ritmo |

---

## 5 · Tradução de domínio CarBoss → Doce Lilium

A CarBoss é B2B com pipeline e reunião; a Doce Lilium é varejo de moda com Nuvemshop.
Portar o recurso **e** traduzir o conceito. Validar cada linha contra dados reais.

| CarBoss | Doce Lilium |
|---|---|
| Deal entrando em coluna da pipeline | carrinho abandonado, pedido (status Nuvemshop), envio, entrega, data de campanha, coluna do funil do CRM (`funis-crm.ts`) |
| Reunião (`ancoradaEm='reuniao'`) | âncora em evento datado: entrega prevista, data do drop. Manter o mecanismo genérico de âncora, sem o nome "reunião" na tela |
| SDR "Luiza" | agente de IA da DL (workflow n8n `jSksdytKwNUZBQIb`) |
| Perfil do lead (`LeadCalculadora.segmento`) | já comprou / nunca comprou / recorrente — medir a fonte antes de escolher |
| Vocabulário CarBoss | **novo** `vocabulario.ts` da DL minerado das conversas reais do atendimento e da copy aprovada da Marília (tom "querida", 🎀 💖 🤍). Lista proibida é POR CLIENTE — nada copiado da CarBoss |
| Briefing para o dono | briefing diário para a Marília / dono, pelo número oficial; template-porta próprio `dl_relatorio_pronto_v1` (botão de RESPOSTA RÁPIDA, nunca URL) |
| Temperatura (preço/horário/coluna) | intenção de compra: perguntou tamanho, preço, prazo, pediu foto, carrinho com valor alto |
| Condição de campanha | só `MINHADL` com carrinho vivo (regra 1.8) |
| Rampa / disjuntor / sinais Meta | iguais — o número é `+55 62 9963-0120`, WABA `1722319218643532` |

---

## 6 · Identidade visual

Toda tela portada usa **somente tokens semânticos** do `src/app/globals.css` do Petalas.
Zero cor literal, zero classe de cor do Tailwind cru, zero estilo copiado da CarBoss.

- Fundo `--background` (#ECD8DD), cartão `--card` (#F9F0F3), texto `--foreground` (#34141C)
- Primário `--primary` (#44121E), assinatura `--brand-rose` (#C77A86),
  botão rosa `--brand-solid` (#BE5061), rosa como texto `--brand-ink` (#8C3445)
- Títulos em `--font-display` (Fraunces), corpo em `--font-sans` (DM Sans),
  raio `--radius` 0.75rem
- Reaproveitar `AppLayout`, os cartões de indicador e o padrão de abas já usados em
  `src/app/maquina-vendas/page.tsx` do destino
- Contraste AA mínimo em todo par texto/fundo novo (os comentários do `globals.css`
  trazem as razões medidas — manter o padrão de medir)
- Mobile: tabela vira lista de cartões abaixo de 640px, alvo de toque ≥ 40px
- Vocabulário de tela da DL ("cliente", "pedido", "drop") — nunca "lead", "deal",
  "reunião" ou "SDR" visível para a Marília

---

## 7 · Migração das campanhas já cadastradas na Doce Lilium

1. Script `scripts/mv-porte-migrar.ts` com `--dry-run` (padrão) e `--apply`.
2. Migrar, preservando ids, inscrições, mensagens e cursores:
   - Carrinho abandonado (3 etapas: `dl_carrinho_lembrete_v1`, `dl_carrinho_duvida_v1`, `dl_carrinho_ultimo_v2`)
   - Pedido (confirmado, Pix pendente, pagamento aprovado), enviado com rastreio,
     entregue, pós-entrega/avaliação, trocas
   - Reativação 60 dias, coleção nova, lista de desejos
   - Drop 10.10 — ondas `d1`, `d2`, `d3` (`campanha_1010_*`) **intocadas no estado**,
     apenas visíveis nas telas novas (Programação, Dossiê, Resultados)
   - Opt-outs e respostas já gravados
3. O dry-run imprime o retrato antes × depois (contagens da Fase 0). `--apply` só roda
   se o dry-run bater 100%.
4. Rodar primeiro numa **cópia local** do banco (container isolado), nunca direto em produção.
5. Backfill dos campos novos da origem (`respondeuEm`, texto entregue, resultado)
   com os scripts `mv-backfill-*` portados.

---

## 8 · Templates e números de teste

### 8.1 Templates
- Os 16 aprovados: `dl_carrinho_lembrete_v1 · dl_carrinho_duvida_v1 ·
  dl_carrinho_ultimo_v2 · dl_pedido_confirmado_v1 · dl_pix_pendente_v1 ·
  dl_pagamento_aprovado_v1 · dl_pedido_enviado_v1 · dl_pedido_entregue_v1 ·
  dl_pos_entrega_avaliacao_v1 · dl_troca_instrucoes_v1 · dl_reativacao_60d_v1 ·
  dl_colecao_nova_v1 · dl_lista_desejos_voltou_v1 · dl_drop_1010_save_the_date_v1 ·
  dl_drop_1010_vespera_v1 · dl_drop_1010_chegou_v1`
- Ligar cada um em `templates.ts` (qual template abre a porta de cada etapa) e em
  `corpo-template.ts` (o texto exato recebido aparece na tabela e no dossiê).
- Templates novos que o porte exigir (porta do briefing, utilidade de lembrete) seguem
  as lições da origem: oferta = MARKETING mesmo pedindo UTILITY; botão de resposta
  rápida para abrir janela; `{{1}}` do rastreio só com o sufixo do caminho; nenhum
  placeholder com fallback vazio em botão de link. Submeter com
  `mv-submeter-templates.ts --apply` e só usar depois de `APPROVED`.

### 8.2 Números de teste (lista branca `MV_NUMEROS_TESTE`)

| quem | número | como conferir a chegada |
|---|---|---|
| Esposa do Luan | `5562981191215` | WhatsApp Web logado no navegador do Controller, perfil `whatsapp-qa` — o agente lê, responde e tira print |
| Luan | `5562982444219` | celular do Luan — o agente registra `wamid` + status `delivered/read` do webhook e pede confirmação visual no relatório |

Antes do primeiro envio: abrir a sessão `whatsapp-qa` e **confirmar qual número está
logado**. Se não bater com a tabela, parar e perguntar.

Orçamento: templates MARKETING abrem conversa paga. Teto do teste: **60 envios no
total** somando os dois números. Passar disso exige autorização.

---

## 9 · Módulo de testes da Máquina de Vendas

Entregar `npm run test:mv` (runner único, exit 1 em qualquer falha, relatório em
tabela no terminal e em `docs/maquina-vendas/RELATORIO-TESTES-<data>.md`) e uma aba
**"Prontidão"** em `/maquina-vendas` (só admin, somente leitura: roda as baterias
puras e mostra verde/vermelho — **nunca** dispara mensagem).

### Nível 1 — Puro (sem banco, sem rede)
Portar e adaptar à DL **todas** as baterias da origem:
`test-copy-maquina-vendas · test-flags-maquina-vendas · test-grade-mv ·
test-mv-assinatura · test-mv-assuntos · test-mv-atencao · test-mv-botao-resposta ·
test-mv-cadencias · test-mv-capacidade · test-mv-conversa · test-mv-conversa-viva ·
test-mv-corpo-template · test-mv-desempenho-toque · test-mv-disjuntor ·
test-mv-entrega-meta · test-mv-followup-ui · test-mv-handoff · test-mv-modelos ·
test-mv-papeis · test-mv-prova · test-mv-rampa · test-mv-recebidas ·
test-mv-resultados · test-mv-sinais-meta · test-mv-situacao · test-mv-templates ·
test-mv-webhook-formatos · test-briefing-temperatura`

Mais as baterias próprias da DL (novas ou já existentes):
- `test-rastreio-link` e `test-handoff-eco` (já existem — continuar verdes)
- campanha datada: onda que não abriu não semeia; onda passada não semeia duas vezes;
  ondas 2/3 só para inscritos na 1; teto do dia não escorrega a véspera para 10/10
- cupom: `MINHADL` só com carrinho vivo; sem carrinho → nunca aparece
- opt-out: "parar", "sair", "não quero mais" bloqueiam todos os motores
- janela 09:00–20:00 SP, fim de semana conforme ajuste, anti-colapso 60 min
- 12 h de silêncio após humano (celular e Chatwoot) sem relógio duplicado
- lista branca: destino fora de `MV_NUMEROS_TESTE` é bloqueado e logado
- copy: validador com o vocabulário DL (emoji, linhas, "querida", lista proibida DL)

### Nível 2 — Integração (banco local isolado, canal mockado)
Portar `e2e-maquina-vendas · qa-integracao-maquina-vendas · loop-qa-maquina-vendas ·
bateria-mv · teste-ponta-a-ponta-funil · prontidao-maquina-vendas ·
auditoria-maquina-vendas`. Cobrir, com relógio controlado (`agora` injetado — o
`criarInscricao` da origem já aceita `agora` futuro):
- cada cadência migrada percorre todas as etapas até `CONCLUIDA`
- parada por resposta, por opt-out, por pedido pago (carrinho), por humano
- pausar / retomar (vencidas deslizam) / cancelar pela tela
- corrida: dois tiques simultâneos não duplicam inscrição (índice parcial único)
- disjuntor abre com taxa de falha simulada e a tela mostra o estado
- "Atualizar" da tela nunca envia
- prova do observador puro: grep + contagem das tabelas do CRM antes/depois = idênticas

### Nível 3 — Disparo real (só lista branca)
Executar em sequência, registrando cada envio numa tabela com
`template · número · wamid · enviado · entregue · lido · print/confirmação`:

1. **Os 16 templates** para a esposa (`whatsapp-qa`), com dados fictícios coerentes
   (nome "Teste", pedido fictício, link de rastreio assinado válido).
2. **Amostra de 6** para o Luan: um de cada família (carrinho, pedido, enviado com
   rastreio, pós-entrega, reativação, drop).
3. **Cadência de carrinho ponta a ponta** com tempo comprimido para a esposa:
   3 toques chegam na ordem certa; a resposta dela pelo `whatsapp-qa` para a régua
   (`RESPONDEU`) e aparece em "Por conversa", no Dossiê e no Chatwoot.
4. **Handoff**: responder pelo Chatwoot → IA silencia 12 h → tela mostra a etiqueta
   com prazo.
5. **Opt-out**: a esposa escreve "parar" → nada mais sai para ela em nenhum motor.
   Depois, limpar o opt-out de teste para não contaminar os próximos testes.
6. **Rastreio**: clicar no link recebido → redireciona à transportadora; adulterar
   a assinatura → cai em `docelilium.com.br`.
7. **Drop 10.10 em ensaio**: cadências-clone com prefixo `qa_` e audiência = só os
   dois números. Nunca usar as cadências reais `campanha_1010_*`.
8. **Briefing**: gerar o do dia para o número do Luan; janela fechada → porta
   (`dl_relatorio_pronto_v1`) → toque no botão → relatório inteiro no tique seguinte.
9. **Status Meta**: `entrega-meta`/`confirmacao` atualizam a tabela de `ENVIADA` para
   entregue/lida — mostrar o selo de prova na tela.

Ao fim: apagar inscrições, mensagens e cadências `qa_*` criadas no teste e provar
por query que **nenhum** telefone fora da lista branca recebeu linha `ENVIADA`.

---

## 10 · Definição de pronto

- [ ] Matriz de paridade 100% preenchida; todo ❌ com motivo
- [ ] `npx tsc --noEmit`, `npm run lint`, `npm run build` limpos
- [ ] `npm run test:mv` verde nos níveis 1 e 2
- [ ] Nível 3 executado, tabela de evidências completa
- [ ] Telas novas conferidas em desktop e mobile, só com tokens DL
- [ ] Campanha 10.10: retrato antes = depois
- [ ] Grep do observador puro sem ocorrências
- [ ] Zero segredo no diff; arquivos sem BOM
- [ ] Trabalho na branch `feat/mv-paridade-carboss`, commits pequenos e descritivos,
      **testado localmente primeiro**. Produção (EasyPanel `petalasapp`, deploy manual)
      só depois de 11/10/2026 ou com autorização explícita do Owner.

---

## 11 · Formato do relatório final

Fechar com duas tabelas:

1. `| | item | resumo |` — ✔️ feito, 📍 pendente com atenção, ❌ descartado (com motivo)
2. 🪤 `| | o que ainda não foi executado | por quê |`

Mais a tabela de evidências do nível 3 e o link para a matriz de paridade.
