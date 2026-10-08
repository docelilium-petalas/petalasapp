# PROMPT — Peça sem estoque vai para a Marília (e provar que foi)

> Para colar no agente (Claude Code / Antigravity) com o repositório `Petalas` aberto.
> Escrito em 08/10/2026, a partir do estado de `9a4e2e0`.
> Origem: reunião Luan + Gabriel + Marília. Numa conversa revisada, a IA de atendimento
> **repetiu ofertas de vestidos esgotados**. Decisão da dona: **sem estoque, a IA não insiste —
> passa a cliente para a Marília atender de forma personalizada.**

---

Você está no repositório **Petalas** (CRM Doce Lilium, Next.js + Prisma + PostgreSQL), produção em
`https://petalas.docelilium.com.br` (EasyPanel `petalasapp`). A IA de atendimento roda no n8n
(`https://petalas-n8n.yt7ol2.easypanel.host`, workflow `DL · Atendimento IA (WhatsApp oficial)`,
id `jSksdytKwNUZBQIb`; cópia versionada em `docs/n8n/atendimento-ia.json`) e chama as rotas
`/api/agente/*` do CRM. Execute de ponta a ponta, sem pedir confirmação a cada passo. Só pare nas
travas abaixo ou nos pontos marcados **[Owner]**.

## Objetivo

Quando o que a cliente quer **não tem estoque**, a conversa passa para a Marília: a IA diz numa
frase que a Marília vai atender pessoalmente, sai da conversa por 12 h e a Marília recebe a conversa
com o resumo do que a cliente queria. A IA **nunca mais** oferece, cita, manda foto ou link de peça
esgotada, e não oferece "aviso quando voltar" (o template `dl_lista_desejos_voltou_v1` está PENDING —
promessa sem caminho).

"Sem estoque" significa um destes três casos:

| Caso | Exemplo | Hoje |
|---|---|---|
| **E1 · a peça que ela nomeou esgotou** | "tem o vestido Mônica?" e o Mônica está zerado | a busca devolve outras peças em `pecas` e a IA oferece por cima |
| **E2 · tudo o que bate com a busca esgotou** | "vestido verde" e o único verde está zerado | dica manda dizer que esgotou e "oferecer avisar quando voltar" |
| **E3 · a peça existe, mas não no tamanho dela** | "o Mônica no M" e só tem P | `filtrarCatalogo` **descarta** a peça (não vai nem para `esgotadas`) e a IA diz "não temos" |

Fora disso nada muda: se há peça disponível que atende ao que ela pediu, a IA segue vendendo.

## Travas (não negociáveis)

1. **A decisão sai do modelo.** Não resolva escrevendo mais uma regra no prompt do agente. Quem
   decide "isso é sem estoque → Marília" é o back-end, com dado da Nuvemshop; o prompt do n8n só
   acompanha. (Regra no prompt é o último recurso — o histórico da conversa ganha dela, e foi
   exatamente o histórico que fez a IA repetir a oferta.)
2. **Telefone reservado.** Teste só nos números internos `5562981191215` e `5562982444219`.
   Antes de começar, **pergunte ao Owner em qual dos dois ele está testando agora** e use o outro.
   Avise quando começar e quando terminar. Nunca mensagem para cliente real.
3. **Envio só pelos caminhos do sistema** (agente → `/api/agente/responder`). Nada de mandar texto
   por script para o telefone de teste: envio sem `wamid` gravado volta como eco e cala a IA por
   12 h — o teste passa a medir o eco, não a correção.
4. **Campanha 10.10 e Máquina de Vendas intocadas.** Nenhuma escrita em `MvMensagem`/`MvInscricao`
   de cliente; freio (`envioPausado`) no estado em que estava.
5. **Nunca apagar dado de cliente.** Limpeza de teste só nas linhas dos dois números internos, e
   sempre com leitura de volta.
6. Segredos só de `controller.cofre` / envs do `petalasapp` (n8n: `n8n-petalas-api`). Nada em
   arquivo, log, commit ou linha de comando. UTF-8 sem BOM; no PowerShell
   `$OutputEncoding = [System.Text.UTF8Encoding]::new($false)`.

---

## Passo 0 — Onde estamos (só leitura)

- **A IA está respondendo?** Últimas execuções do workflow no n8n e `LogEvento` `resposta_falhou` /
  `atendimento_falhou` das últimas 24 h. Se a OpenAI estiver sem crédito, **pare e reporte**: não
  há como validar conversa com a IA muda.
- **O n8n em produção é igual à cópia do repo?** Baixe o workflow pela API e compare
  `systemMessage` + ferramentas com `docs/n8n/atendimento-ia.json`. Divergência → reporte qual é a
  verdade antes de editar qualquer um dos dois.
- **Temperatura do modelo** no nó `OpenAI`. Agente que executa ação roda em **0**; se não estiver,
  anote para o Passo 4.
- **Matéria-prima do teste.** Pelo `catalogoDaLoja(true)` liste: peças esgotadas (todas as
  variantes zeradas) e peças com algum tamanho zerado. Escolha uma para cada caso E1/E2/E3 e uma
  peça disponível para o controle. Se não existir peça para algum caso, **[Owner]**: peça para a
  Marília zerar temporariamente uma variante na Nuvemshop (e devolver depois) — não invente.

## Passo 1 — A conversa do defeito (só leitura)

Ache a conversa revisada na reunião (vestidos esgotados repetidos): `MvResposta.ultimasMsgs` das
conversas com turnos da loja citando peças hoje sem estoque, cruzando com as execuções do n8n.
Para ela, responda com evidência:

- por qual porta a esgotada entrou: a busca (`/api/agente/catalogo`), a foto (`/api/agente/fotos`
  diz "ofereça avisar quando voltar"), o **histórico** (a IA copiou a própria oferta anterior) ou o
  cache de 10 min do catálogo (a peça esgotou depois da oferta);
- quantas vezes ela repetiu e o que a cliente respondeu.

Isso vira o cenário **C6** do Passo 4 (replay) e entra no relatório.

## Passo 2 — A correção

### 2.1 · A decisão, pura e testável

Crie uma função pura (ex.: `situacaoDoPedido` em `src/lib/nuvemshop/catalogo.ts` ou
`src/lib/atendimento/estoque.ts`) que recebe os produtos + o filtro e devolve:

```ts
type Situacao =
  | { tipo: 'tem'; pecas: ProdutoCatalogo[] }                       // segue vendendo
  | { tipo: 'esgotou'; queria: string[]; caso: 'E1' | 'E2' }         // Marília
  | { tipo: 'sem_tamanho'; queria: string[]; tamanho: string }       // E3 → Marília
  | { tipo: 'nao_existe' }                                           // loja não tem isso
```

- **E3:** `filtrarCatalogo` hoje joga fora a peça que bate com a busca mas não tem o tamanho.
  Devolva-a numa lista `semTamanho` em vez de sumir com ela.
- **E1:** a esgotada cujo **nome** bateu com a busca (pontuação de nome, ≥ 3) e pontua mais que
  qualquer disponível é o que ela pediu — `pecas` com outras peças não salva o caso.
- **E2:** nenhuma disponível bateu e ao menos uma esgotada bateu.
- Escreva a condição **antes** da ação em cada ramo: uma dica incondicional é uma ordem
  incondicional, e o agente cumpre ao pé da letra.

### 2.2 · Quem passa para a Marília é a rota, não o modelo

- Extraia de `src/app/api/agente/humano/route.ts` uma função de lib (ex.:
  `passarParaMarilia(telefone, motivo, resumo)` em `src/lib/atendimento/`) que faz **exatamente** o
  que a rota faz hoje: `marcarHumano`, `LogEvento` AVISO `atendimento_humano`, `funilSemFalhar` na
  etapa `humano` com `usuarioPadrao()` como dona. A rota `humano` passa a chamar essa função.
  Idempotente: se `humanoAtendendo(telefone)` já é verdade, não duplica log nem atividade.
- `buscar_catalogo` passa a mandar o `telefone` (mesmo `fieldValue` de `chamar_atendente`:
  `={{ $('Webhook').first().json.body.telefone }}`).
- `/api/agente/catalogo`: com situação `esgotou` ou `sem_tamanho` **e telefone válido**, a rota chama
  `passarParaMarilia` com motivo `peça sem estoque` (ou `tamanho sem estoque`) e resumo
  `Procurou: <busca/tamanho>. Sem estoque: <peças>.` e devolve **sem** `pecas`, sem `esgotadas`
  com id/link, e com uma dica de uma linha só:
  > "Já passei a conversa para a Marília. Diga numa frase, com carinho, que essa peça está sem
  > estoque e que a Marília vai te atender pessoalmente por aqui. Não ofereça outra peça, não mande
  > foto nem link, e pare."
- `/api/agente/fotos`: se cair ali uma esgotada (última porta), mesmo caminho — passa para a
  Marília e troca o aviso "ofereça avisar quando voltar" pela mesma dica.
- Sem telefone (chamada de teste, n8n antigo) a rota **não** passa ninguém e só devolve a dica de
  `chamar_atendente`: nada de efeito colateral sem dono.
- Chatwoot: confirme que a etiqueta `atendimento-humano` aparece na conversa no tique seguinte
  (`expirarHandoffs` espelha os ativos). Se a nota privada não sair para handoff novo, acrescente
  uma nota curta com o resumo — é o que a Marília lê ao abrir.

### 2.3 · O prompt do agente só acompanha

No `systemMessage` (n8n **e** `docs/n8n/atendimento-ia.json`, idênticos):

- em RECOMENDAR, troque "ofereça avisar quando voltar" pela regra: *se a ferramenta disser que
  passou para a Marília, diga a frase e pare*;
- em ASSUNTO DE GENTE, acrescente "peça ou tamanho sem estoque";
- descrição de `buscar_catalogo`: tire a menção a campo `esgotada` que não existe mais na resposta.

Nada além disso no prompt. Temperatura **0** no nó `OpenAI` se não estiver.

### 2.4 · **[Owner]** antes de fechar

- A frase de passagem acima serve, ou a Marília quer outra?
- A Marília deve receber um aviso no WhatsApp a cada passagem por estoque (hoje vai para o funil,
  para o log e para o Chatwoot; `MV_ALERTA_NUMERO` está com o número do Luan, em teste)?

## Passo 3 — Testes sem rede (Nível 1)

Em `scripts/test-mv/nivel1.ts`, uma seção nova com produtos fixos (`normalizarProduto` sobre JSON
no formato da Nuvemshop):

| # | Entrada | Esperado |
|---|---|---|
| 1 | busca pelo nome da esgotada, há outras disponíveis | `esgotou` E1 |
| 2 | busca que só casa com esgotada | `esgotou` E2 |
| 3 | peça existe, tamanho pedido zerado, outro tamanho tem | `sem_tamanho` |
| 4 | busca casa com disponível | `tem` (nenhuma esgotada na lista) |
| 5 | `stock_management: false` com `stock: 0` | conta como **disponível** (vende sob encomenda) |
| 6 | busca sem nada parecido ("blazer") | `nao_existe` |
| 7 | plural/acento ("acessorios", "Mônica"/"monica") | mesmo resultado da forma canônica |

`npm run test:mv` inteiro verde (hoje 216/216), `npx tsc --noEmit`, eslint nos arquivos tocados e
`npm run build`.

## Passo 4 — Validação ponta a ponta (produção, telefone reservado)

### Limpeza — antes de CADA cenário, e conferida

A memória da IA mora no CRM, por telefone. Para o número de teste, zere **e leia de volta**:

| Camada | Onde |
|---|---|
| Histórico da conversa | `MvResposta.ultimasMsgs` (`telefoneKey`) |
| Silêncio de 12 h | `MvCursor` `atendimento:humano:<chave>` |
| Última mensagem respondida | `MvCursor` `atendimento:ultimo:<chave>` |
| Negócio no funil | deal do contato no funil "WhatsApp - Atendimento IA" (mover/arquivar só o do número de teste) |
| Chatwoot | etiqueta `atendimento-humano` na conversa do número de teste |

O número chega com e sem o nono dígito: limpe as duas formas. O `delete` devolve sucesso para chave
que nunca existiu — **leia de volta**. Saída obrigatória:
`N turnos · X de X chaves conferidas vazias · etiqueta ausente`.

### Como a cliente fala

Mensagem real do telefone de teste para o número da loja (+55 62 9963-0120), pelo WhatsApp Web da
lane `whatsapp-qa` do Controller (foco por CDP, nunca clique genérico). Espere a **execução daquela
mensagem** no n8n (case pelo id da mensagem), não pelo relógio.

### Cenários

| # | A cliente escreve | PASSA quando | REPROVA se |
|---|---|---|---|
| C1 · E1 | "Oi! Tem o vestido <esgotada>?" | IA responde com a frase de passagem; existe `LogEvento` `atendimento_humano` com motivo de estoque para o telefone; cursor `atendimento:humano` criado; deal na etapa `humano` com dona Marília | cita ou oferece qualquer peça, manda foto/link, oferece "aviso quando voltar", ou o log não existe |
| C2 · E2 | "Queria um vestido <cor/termo que só a esgotada tem>" | igual ao C1 | "não temos" sem passar; oferece outra peça como se fosse a pedida |
| C3 · E3 | "Tem o <peça> no <tamanho zerado>?" | igual ao C1, motivo `tamanho sem estoque` | responde "não temos essa peça"; oferece o tamanho que existe sem passar |
| C4 · controle | "Tem vestido para casamento?" (com disponível) | IA oferece até 3 disponíveis, com fotos; **nenhum** handoff | chama a Marília; cita esgotada |
| C5 · silêncio | logo depois do C1, "e aquele outro?" | IA **não** responde (12 h); a fala entra no histórico | IA responde por cima da Marília |
| C6 · replay | as falas da cliente da conversa do Passo 1, na ordem | passa para a Marília na primeira menção ao que esgotou; nenhuma oferta repetida | qualquer repetição de oferta esgotada |

Prova de cada cenário = **linha no banco** (o `id` do `LogEvento`, a chave do cursor, o deal) e os
**nós que rodaram** na execução do n8n (`buscar_catalogo` → resposta com a passagem; `enviar_fotos`
ausente ou só com ids disponíveis). Nunca o texto do modelo sozinho, e nunca a busca do nome da
ferramenta no JSON da execução (ele aparece na definição de toda execução).

Cada cenário roda **3 vezes**, cada vez do zero. Ciclo: **zera → conversa → confere no banco →
desfaz (cursor, deal, etiqueta) → zera de novo**. No começo de cada ciclo, varra sobras do anterior.
3/3 em todos para declarar verde; 2/3 é falha reprodutível a investigar, não "quase".

## Passo 5 — Subida

1. Commit com os testes; push em `feat/mv-paridade-carboss` e `git push origin HEAD:main`.
2. `%TEMP%\ep_api.py deploy` (o timeout de 60 s é esperado) e acompanhar `inspectService` até
   `commit.sha` = commit novo; site respondendo 307.
3. n8n: atualizar o workflow pela API (cofre `n8n-petalas-api`) **depois** do deploy do CRM — a
   ordem inversa deixa o n8n mandando `telefone` para uma rota que ainda não usa — e exportar a
   versão final para `docs/n8n/atendimento-ia.json` no mesmo commit ou num seguinte.
4. Só então o Passo 4.

## Relatório final

Em português, tabela com ✔️ / 📍 / ❌ por item e uma segunda tabela 🪤 com o que ficou de fora.
Obrigatório:

- a causa do defeito da conversa revisada (Passo 1), com a porta por onde a esgotada entrou;
- o placar C1–C6 (3 rodadas cada) com o id do `LogEvento` de cada passagem;
- a saída da limpeza final do telefone de teste (zerado e conferido);
- a variante zerada na Nuvemshop para o teste, se houve, e a confirmação de que voltou;
- as respostas do Owner aos pontos **[Owner]** ou o que ficou aguardando.
