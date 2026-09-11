# Migração n8n → Doce Lilium

> Executada em **08/09/2026 ~19h30 BRT**, de `auto.devnetlife.com` para
> `petalas-n8n.yt7ol2.easypanel.host`.
> **9 workflows · 268 nós · 0 ativos.** Nada foi ligado, e nada foi apagado na origem.

---

## 1 · O que moveu

O destino estava **vazio** (0 workflows), então não houve sobrescrita. Ambas as
instâncias rodam **n8n 1.120.4** — mesma versão, o que elimina o risco de
`typeVersion` de nó não existir do outro lado.

| # | Workflow | nós | id origem | id destino | estava ativo lá? |
|---|---|---|---|---|---|
| 1 | AGENTE SDR Petalas App | 69 | `TpjnFmCsfGgOCDNr` | `Pas5NE31CK7iopo8` | 🟢 sim |
| 2 | AGENTE SDR Doce Llium - V1 | 74 | `CL2L0kUkRh0zi9uA` | `BVbMObwqsn1FXlES` | não |
| 3 | Disparo Wpp (Doce Lilium) | 13 | `rLG1axSh7gxE3zud` | `GvYGFWodjnzlTkUB` | 🟢 sim |
| 4 | RELATÓRIO SEMANAL - Doce Lilium | 48 | `hbsDLD4uotrEnuzx` | `Uf8YgrebdeRZzJpZ` | 🟢 sim |
| 5 | GERADOR DE IDÉIAS - Doce Llium | 8 | `0EjrQ9Vfsgklo0Fv` | `1vJCqNg8InUz5hHN` | 🟢 sim |
| 6 | POSTAR AGENDADOS - Doce Lilium | 14 | `YuTl9icCUIwisdNx` | `1se3Nzfs8Levihar` | não |
| 7 | REELS UGC-LOVABLE Doce Lilium | 19 | `lFuW1rNUUG17karZ` | `Iy00gSIPrtfBhB5z` | não |
| 8 | REELS INSTITUCIONAL - PETALAS | 17 | `p0k3zk6oPD72nS1K` | `w7m5Io7ZcKCqDnhS` | não |
| 9 | Automação de Noticia no Grupo | 6 | `syNvBdzqqAL7B2cR` | `do3QFRFS5QkN2RwM` | não |

**O export cru NÃO está versionado aqui de propósito** — ele carrega um token
em texto claro (§5). Ele vive apenas no diretório temporário da sessão.

---

## 2 · ⛔ Tudo chegou INATIVO, e assim tem que ficar por enquanto

Quatro desses workflows **continuam ativos na origem, agora mesmo**. Ligar as
cópias antes de desligar os originais faria as duas instâncias responderem ao
mesmo trabalho:

- **`Disparo Wpp (Doce Lilium)`** — duas instâncias disparando o mesmo lote
  significa **cliente real recebendo a mensagem em duplicata**, pelo mesmo
  número. É o pior desfecho possível, e é silencioso: nenhuma das duas erra.
- **`AGENTE SDR Petalas App`** — dois agentes lendo o mesmo `n8n_chat_histories`
  e respondendo a mesma pessoa, cada um sem saber do outro.
- **`RELATÓRIO SEMANAL`** e **`GERADOR DE IDÉIAS`** — duplicariam escrita no Notion.

**A ordem de corte é sempre: desliga lá → religa aqui.** Nunca o inverso, e
nunca os dois ligados "só para testar".

---

## 3 · 🔴 As credenciais NÃO atravessam — e isso é por desenho

A API pública do n8n devolve, em cada nó, apenas a **referência** da credencial
(id + nome). O segredo nunca sai. Não existe endpoint de leitura de credencial —
é uma decisão de segurança do n8n, não uma limitação da migração.

Resultado: os 9 workflows estão no destino com a estrutura íntegra e **13
credenciais apontando para o vazio**. Precisam ser recriadas na UI do n8n novo,
com **exatamente os mesmos nomes** abaixo:

| usos | tipo | nome exato |
|---|---|---|
| 24 | `redis` | `Redis account` |
| 16 | `notionApi` | `IG OS Doce Lilium` |
| 14 | `openAiApi` | `OpenAi Credencial` |
| 5 | `blotatoApi` | `IG DOCE LILIUM` |
| 4 | `postgres` | `Postgres Petalas App` |
| 4 | `postgres` | `Postgres Petalas-db` |
| 4 | `openRouterApi` | `OpenRouter CREDENCIAL` |
| 3 | `googleDriveOAuth2Api` | `credencial n8n google` |
| 2 | `postgres` | `Postgres SUPABASE` |
| 2 | `apifyApi` | `Apify IG OS GABRIEL` |
| 2 | `googlePalmApi` | `Google Gemini IG OS` |
| 2 | `blotatoApi` | `IG NL Blotato` |
| 2 | `evolutionApi` | `Doce Lilium` |

⚠️ **O nome igual não basta** — o n8n casa por **id**, e o id novo será outro.
Depois de criadas, é preciso reescrever as referências nos 268 nós. Isso é
script, não trabalho de mão: assim que as 13 existirem, eu leio os ids novos e
faço o religamento de uma vez.

⚠️ **`Postgres Petalas-db` × `Postgres Petalas App` × `Postgres SUPABASE`** são
três bancos diferentes convivendo. Antes de recriar, vale decidir se os três
ainda existem — ver §6.

---

## 3b · A chave de criptografia compartilhada — feito em 10/09/2026

O §3 dizia que as 13 credenciais teriam de ser recriadas na mão. **Existe um
caminho melhor, e ele foi executado:** fazer as duas instâncias usarem a MESMA
`N8N_ENCRYPTION_KEY`. Com isso as credenciais atravessam **cifradas**, com o
mesmo id — e as referências nos 268 nós continuam válidas, sem religamento.

### O estado de partida, medido

| | origem (`automacoes_netlife/n8n`) | destino (`petalas/n8n`) |
|---|---|---|
| `N8N_ENCRYPTION_KEY` no painel | **não existia** | existia, valor próprio |
| `~/.n8n/config` | existia, 56 bytes, com a chave | existia, com a chave própria |
| credenciais | 13 | **0** |
| workflows | 9 | 9, todos inativos |

O destino ter **zero credenciais** é o que torna a operação segura: trocar a
chave lá não deixa nada ilegível, porque não há nada cifrado.

### ⛔ A armadilha: o n8n guarda a chave em DOIS lugares

A chave vive na variável de ambiente **e** no arquivo `~/.n8n/config`. Quando os
dois discordam, o n8n **se recusa a subir**:

```
Error: Mismatching encryption keys. The encryption key in the settings file
/home/node/.n8n/config does not match the N8N_ENCRYPTION_KEY env var.
```

E aí não adianta abrir o terminal para consertar: o container morre em loop, e o
console do EasyPanel responde `container ... is not running`. **A ordem importa,
e não é a óbvia.**

### A sequência que funciona

1. **Origem** — ler a chave sem despejar o JSON na tela:
   ```sh
   grep -o "[A-Za-z0-9+/=_-]\{24,\}" ~/.n8n/config
   ```
   (Um `sed` casando `":"` sem espaço NÃO funciona: o n8n grava o arquivo
   formatado, com espaço depois dos dois-pontos.)

2. **Destino** — apagar o arquivo ANTES de pôr a variável:
   ```sh
   rm ~/.n8n/config
   ```

3. **Destino** — só então gravar `N8N_ENCRYPTION_KEY` no painel e fazer Deploy.
   Sem arquivo, não há com o que discordar; o n8n grava a chave nova.

4. **Prova**, sem revelar valor nenhum:
   ```sh
   [ "$(grep -o "[A-Za-z0-9+/=_-]\{24,\}" ~/.n8n/config)" = "$N8N_ENCRYPTION_KEY" ] \
     && echo IGUAIS || echo DIFERENTES
   ```

Se a variável for posta antes de apagar o arquivo — que foi o que aconteceu na
primeira tentativa — o conserto é: **tirar** a variável, deixar subir pelo
arquivo, aí apagar o arquivo, aí recolocar a variável. Três deploys em vez de um.

### O que sobrou como pendência de segurança

Durante a operação, apareceram em print (e portanto no histórico da conversa):
a chave de criptografia das duas instâncias, a senha do Postgres do n8n de
destino e o `N8N_RUNNERS_AUTH_TOKEN`. Nenhum deles é alcançável de fora — o
Postgres só responde na rede interna do EasyPanel, e a chave só serve a quem
já tiver o banco. Ficam registrados para rotação quando a fase fechar.

---

## 3c · As 13 credenciais atravessaram — feito em 11/09/2026

O §3b deixou as duas instâncias com a mesma chave. Com isso, o que faltava era
mover as linhas — **cifradas**, e sem passar por área de transferência.

### O transporte, e por que não foi uma pasta nova

Bind mount para uma pasta inventada **não funciona**: o Docker em Swarm não cria
o caminho no host, e o deploy morre com `bind source path does not exist`. E
tentar consertar removendo o mount na origem tirou junto o volume de dados —
o n8n antigo ficou **15 minutos fora do ar** (16:47→17:02 de 11/09). Nada foi
perdido (remover mount não apaga a pasta do host), mas webhook que chegou nesse
intervalo se perdeu.

O caminho certo aproveita o que já existe: o `/home/node/.n8n` da origem **é**
uma pasta do host, em `/etc/easypanel/projects/<projeto>/<serviço>/volumes/<nome>`.
Montar ESSA pasta dentro do destino não cria nada e **não reinicia a origem**.

```
destino → Storage → Add Bind Mount
  Host Path : /etc/easypanel/projects/automacoes_netlife/n8n/volumes/data
  Mount Path: /troca
```

### O filtro, que é obrigatório

O n8n de origem tem **55 credenciais, de vários clientes** (BGB Abogados,
Investmais, PickStar, NetLife), algumas de outro usuário. `export:credentials
--all` seguido de `import` levaria acesso de cliente para dentro da instância
que a Doce Lilium administra.

O filtro não usa lista de nomes digitada: usa as credenciais que os **9
workflows migrados realmente referenciam**. Nem uma a mais, nem uma a menos.

```sh
# no container do DESTINO, lendo uma copia do banco da origem
mkdir -p /tmp/src/.n8n && cp /troca/database.sqlite /tmp/src/.n8n/
N8N_USER_FOLDER=/tmp/src DB_TYPE=sqlite n8n export:credentials --all --output=/tmp/creds.json
n8n export:workflow --all --output=/tmp/wf.json     # do proprio destino
# guarda so as credenciais citadas pelos workflows -> /tmp/cd.json
n8n import:credentials --input=/tmp/cd.json
rm -rf /tmp/src /tmp/creds.json /tmp/cd.json /tmp/wf.json
```

Medido: `13 usadas / 13 achadas / 55 total` → `Successfully imported 13
credentials` → reexport do destino devolveu `13`, com os mesmos nomes. As 42 de
outros clientes ficaram na origem.

**Os ids foram preservados**, então as referências nos 268 nós continuam
válidas: não há religamento a fazer.

O bind mount foi removido depois, e o destino voltou a responder. O destino não
tem mais acesso nenhum à pasta viva da origem.

---

## 3d · O relógio da Máquina, pronto para importar

[`cron-maquina-vendas.json`](cron-maquina-vendas.json) — dois nós, inativo.

O segredo **não está no arquivo**: o nó de HTTP referencia uma credencial do
tipo *Header Auth* chamada `CRM Cron Doce Lilium`, que precisa ser criada na
tela do n8n com `Authorization: Bearer <CRON_SECRET>`. Arquivo versionado com
segredo dentro é segredo publicado.

```sh
n8n import:workflow --input=<caminho>/cron-maquina-vendas.json
```

Ele nasce **inativo**, e assim deve ficar até a virada.

---

## 4 · Os webhooks mudam de endereço

Todo webhook migrado passa a responder no host novo. **O caminho não muda; o
host sim.** Tudo que aponta para o antigo precisa ser atualizado:

```
de:    https://auto.devnetlife.com/webhook/<caminho>
para:  https://petalas-n8n.yt7ol2.easypanel.host/webhook/<caminho>
```

| Workflow | caminho |
|---|---|
| AGENTE SDR Petalas App | `sdr-petalas` |
| AGENTE SDR Doce Llium - V1 | `agente-petalas` |
| Disparo Wpp (Doce Lilium) | `disparo-docelilium` **e** `6625ad53-9333-41dc-a698-7bdb63a3736a` |
| RELATÓRIO SEMANAL | `ideias-docelilium` |
| GERADOR DE IDÉIAS | `mais-ideias-docelilium` |
| POSTAR AGENDADOS | `post-docelilium` |
| REELS UGC-LOVABLE | `docelilium` |
| REELS INSTITUCIONAL | `petalasinstitucional` |

Quem aponta para esses endereços hoje, e precisa ser revisto:

- o **CRM** — `Cadencia.webhook_url`, `AcaoCaixaRapido.configEnvio.webhookUrl`
  e a env `N8N_WEBHOOK_URL`;
- a **uazapi** (`docelilium.uazapi.com`) — o webhook de mensagem recebida que
  alimenta o agente;
- o site `petalas.docelilium.com.br`.

⚠️ `Disparo Wpp (Doce Lilium)` tem **dois** webhooks, um deles um UUID cru
(`6625ad53-…`) — sobra do duplicado do fluxo original. Vale conferir se algo
ainda chama o UUID antes de aposentá-lo. Mesmo padrão encontrado na CarBoss.

---

## 5 · 🔴 Segredo em texto claro dentro do workflow

O token do **api.kie.ai** está cravado como `Bearer <hex de 32>` em **4 nós**,
fora do cofre de credenciais. O valor não é reproduzido aqui de propósito —
para vê-lo, abra qualquer um dos nós abaixo:

| Workflow | nós |
|---|---|
| REELS UGC-LOVABLE Doce Lilium | `HTTP Request2`, `HTTP Request3` |
| REELS INSTITUCIONAL - PETALAS | `HTTP Request`, `HTTP Request1` |

Consequências: ele foi copiado junto para o n8n novo, aparece em qualquer
export, e não pode ser rotacionado num lugar só.

**Ação:** rotacionar o token na kie.ai e recriar como credencial do tipo
*Header Auth*, referenciada pelos 4 nós. Enquanto isso não acontece, todo export
desses dois workflows é material sensível.

---

## 6 · O que a migração revelou sobre o resto

**O canal de WhatsApp é uazapi — não é a Cloud API oficial.**
`Disparo Wpp (Doce Lilium)` chama `https://docelilium.uazapi.com`. Isso fecha a
contradição do "QR Code": o número da Doce Lilium está num provedor
não-oficial. Consequência direta para
[TEMPLATES-META.md](../maquina-vendas/TEMPLATES-META.md): **os 13 templates só
passam a valer se houver migração para o canal oficial.** No canal atual não
existe template, nem categoria, nem confirmação de entrega.

**Há duas pilhas de WhatsApp convivendo.** `Automação de Noticia no Grupo` usa
**Evolution API** (credencial `evolutionApi: Doce Lilium`), enquanto o disparo
usa **uazapi**. Dois provedores, provavelmente dois números.

**Há duas gerações do mesmo agente.**
`AGENTE SDR Doce Llium - V1` (74 nós, inativo) fala com `Postgres SUPABASE` **e**
`Postgres Petalas-db`. `AGENTE SDR Petalas App` (69 nós, **ativo**) fala só com
`Postgres Petalas App`. O V1 é a geração anterior; migrei os dois porque
descartar geração antiga sem o Owner olhar é decisão que não é minha.

**`REELS INSTITUCIONAL` tem `https://your-domain.com`** — placeholder que nunca
foi configurado. O workflow está inativo, então nunca doeu.

**Três workflows dependem de community nodes:**

| Workflow | pacote |
|---|---|
| POSTAR AGENDADOS | `@blotato/n8n-nodes-blotato` |
| RELATÓRIO SEMANAL | `@apify/n8n-nodes-apify` |
| Automação de Noticia no Grupo | `n8n-nodes-evolution-api` |

Não consegui listar os pacotes instalados no destino pela API (exige sessão de
dono). **Confira em Configurações → Nós da comunidade.** Se não estiverem lá,
esses três importam mas não executam — o n8n mostra "Unrecognized node type".

---

## 7 · Fila de trabalho

| # | Item | Quem |
|---|---|---|
| 1 | Criar as 13 credenciais no n8n novo, com os nomes do §3 | Owner |
| 2 | Religar as referências nos 268 nós | eu, por script |
| 3 | Conferir os 3 community nodes | Owner |
| 4 | Rotacionar o token da kie.ai e virar credencial | Owner |
| 5 | Atualizar os apontamentos de webhook (CRM, uazapi, site) | eu |
| 6 | **Desligar na origem → religar no destino**, um por um | eu, com aval |
| 7 | Decidir o destino do `AGENTE SDR Doce Llium - V1` | Owner |

**Nada do item 6 acontece sem aval explícito por workflow.** É o passo que toca
cliente real.

---

## 8 · Chaves de API usadas

| Instância | Estado da chave |
|---|---|
| `petalas-n8n.yt7ol2.easypanel.host` | válida, emitida 08/09 22:05 UTC, **sem expiração** |
| `auto.devnetlife.com` | válida, emitida 08/09 22:21 UTC, **sem expiração** |
| `bonyalbatross-n8n.cloudfy.live` | 🔴 **EXPIRADA em 05/09 04:00 UTC** — HTTP 401 |

A instância do Boni Albatroz (referência dos fluxos da CarBoss e da OCR) **não
pôde ser lida**. Como os fluxos de referência da CarBoss e da OCR também existem
em `auto.devnetlife.com` (`MV · Disparo Máquina de Vendas (CARBOSS)`,
`MV · Entrada WhatsApp (CARBOSS)`, `Disparo Wpp (LUIZA) - OP CAIXA RAPIDO`), a
migração não ficou bloqueada por isso — mas se houver algo só lá, preciso de uma
chave nova.

⚠️ As três chaves foram coladas em conversa. Duas não expiram. **Rotacionar as
duas válidas** depois que a migração estabilizar.
