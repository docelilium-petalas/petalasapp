# Templates da Meta — Doce Lilium

> Estado: **preparado, nada publicado.** 13 templates, 0 erros no validador
> (`validarCatalogo()` em [catalogo-templates.ts](../../src/lib/maquina-vendas/catalogo-templates.ts)).
> Última medição: 08/09/2026.

---

## 1 · Por que nada foi submetido ainda

Submeter template é **ato de conta, não de código**. Cada submissão fica presa
a uma WABA (WhatsApp Business Account) específica, e um template aprovado tem
nome imutável. Submeter na conta errada significa recomeçar na conta certa e
conviver com lixo aprovado na primeira.

Hoje a conta não está definida. O que está aberto:

| Item | Estado em 08/09/2026 |
|---|---|
| WABA ID | **ausente** — não localizado |
| Phone Number ID (Cloud API) | **ausente** — o `62999630120` informado é o número de telefone, não o ID |
| Token da Cloud API / Datafy | **ausente** |
| Segredo `whsec_…` informado | **não identificado** — ver §2 |

O catálogo existe justamente para que, no dia em que a conta existir, a
submissão seja um comando e não uma semana de redação.

---

## 2 · A contradição do canal — precisa ser resolvida antes da Fase 4

Dois sinais que **não podem ser verdade ao mesmo tempo**:

- **"Não conectei ainda pelo QR Code"** → QR Code é assinatura de canal
  **não-oficial** (Evolution, uazapi, Z-API, WPPConnect). A Cloud API oficial
  da Meta **nunca** usa QR Code: ela usa verificação de número por SMS/ligação
  e devolve um `phone_number_id`.
- **"Templates da Meta"** → templates só existem no canal **oficial**. No canal
  por QR Code não há template, não há categoria MARKETING × UTILITY, não há
  janela de 24h e não há `wamid` para confirmar entrega.

E o segredo `whsec_…` não bate com nenhum dos formatos conhecidos:

| Origem | Formato esperado |
|---|---|
| Meta Cloud API | `EAAB…` (token de acesso) |
| Datafy (proxy da Cloud API) | `sk_live_…` |
| Nuvemshop | segredo do app, verificado no header `x-linkedstore-hmac-sha256` |
| `whsec_…` | padrão de **Svix / Stripe** — webhook signing secret |

**Consequência prática:** metade da Máquina de Vendas muda conforme a resposta.

- **Canal oficial** → todo o aparato da OCR entra: `datafy.ts`, `janela-24h.ts`,
  `aprovados.ts`, `tier.ts`, `entrega-meta.ts`, este catálogo. Custo por
  conversa, mas entrega confirmada (`entregueEm`, `lidaEm`) e sem risco de ban
  por termos de uso.
- **Canal por QR Code** → este catálogo vira apenas *biblioteca de copy*
  (continua útil), some a categoria, some a confirmação de entrega, e o
  anti-ban passa a depender inteiramente de ritmo e volume — que é onde
  `grade.ts` e `ritmo.ts` viram obrigatórios em vez de desejáveis.

**Recomendação:** canal oficial. Uma loja que já tem 103 conversas e 54 pedidos
não deve apoiar a operação inteira num número que o WhatsApp pode desconectar
sem aviso e sem recurso.

---

## 3 · A jornada, e por que ela tem esta forma

Vocês vendem **roupa**, não assinatura. Isso muda o desenho em dois pontos que
não são detalhe:

1. **Não existe "renovação".** O ciclo é compra → entrega → uso → nova compra.
   O que substitui a renovação é a **reativação por coleção** — e coleção tem
   data, o que dá âncora honesta para falar de novo.
2. **A dúvida é de tamanho e caimento, não de preço.** Por isso o 2º toque do
   carrinho abandonado **pergunta** em vez de descontar. Descontar no 2º toque
   ensina a base a esperar desconto.

### As 5 trilhas

| Trilha | Templates | Categoria | Gatilho |
|---|---|---|---|
| **Carrinho abandonado** | 3 | MARKETING | `GET /checkouts` da Nuvemshop (§4) |
| **Pedido** | 3 | UTILITY | `order/created`, `order/fulfilled`, entrega |
| **Pagamento** | 2 | UTILITY | `order/paid`, PIX pendente |
| **Pós-venda** | 2 | UTILITY* | entrega + 3d · pedido de troca |
| **Reativação** | 3 | MARKETING | 60d sem compra · lançamento · volta ao estoque |

\* `dl_pos_entrega_avaliacao_v1` é declarado UTILITY por estar preso a um
pedido, mas a Meta reclassifica pedido de avaliação como MARKETING com
frequência. **Se vier reclassificado, aceite** — resubmeter como utility é
sinalizar à Meta que você está tentando burlar categoria, e isso pesa na conta.

### A escada do carrinho abandonado

Três toques, e o terceiro **se anuncia como último**:

```
 1h   dl_carrinho_lembrete_v1   devolve o link, não vende
24h   dl_carrinho_duvida_v1     pergunta tamanho/cor/prazo
48h   dl_carrinho_ultimo_v1     cupom + "esse é meu último toque"
```

Quem não responde a três não responde ao quarto. O quarto não converte — ele
gasta reputação do número. E anunciar o fim é o que torna o silêncio uma
resposta legítima em vez de um convite a insistir.

---

## 4 · 🔴 A Nuvemshop NÃO tem webhook de carrinho abandonado

Medido na documentação oficial em 08/09/2026. A tabela de eventos de webhook
tem `app`, `category`, `customer`, `order`, `product`, `product_variant`,
`domain`, `subscription`, `fulfillment`, `fulfillment_order`, `location` —
e **nenhum evento de cart ou checkout**.

O recurso *Abandoned Checkout* existe, mas **só por leitura**:
`GET /checkouts`, `GET /checkouts/{id}`, `POST /checkouts/{cart_id}/coupon`.

**Consequência de arquitetura:** o carrinho abandonado é o único fluxo que
**não pode ser orientado a evento**. Ele exige **polling**. Isso não é
preferência — é a única porta que existe.

Regras da Nuvemshop que definem o intervalo do polling:

- o carrinho só vira "abandonado" quando a cliente chega ao **2º passo do
  checkout** (bom: já temos `contact_name` e `contact_phone`);
- o registro pode demorar **até 6 horas** para ser criado após o abandono;
- fica acessível por **30 dias**, apagado de vez aos 90.

⚠️ **A janela de 6h mata a promessa de "1h após o abandono".** Se o carrinho só
aparece na API 6h depois, o primeiro toque não pode ser em 1h — ele é em
"assim que aparecer". O `quando` do template descreve a intenção; o
despachante vai ancorar no `created_at` do checkout, não no relógio da loja.
Isso precisa ser medido na loja real antes de calibrar: pode ser que na prática
apareça em minutos.

Os demais fluxos (pedido, pagamento, envio) **são** orientados a evento e
usam webhook normal, com HMAC-SHA256 no header `x-linkedstore-hmac-sha256`,
timeout de 3s e até 16 tentativas com backoff. **Idempotência é obrigação
nossa** — a Nuvemshop avisa que reentrega a mesma mensagem e não garante ordem.

---

## 5 · Fila de trabalho

| # | Item | Depende de |
|---|---|---|
| 1 | Definir canal: oficial ou QR Code | **decisão do Owner** |
| 2 | Obter WABA ID + Phone Number ID + token | canal definido |
| 3 | `scripts/mv-submeter-templates.ts` | catálogo (pronto) + credenciais |
| 4 | Submeter os 7 UTILITY primeiro | aprovam mais rápido e destravam a trilha de pedido |
| 5 | Submeter os 6 MARKETING | exigem política de opt-in publicada |
| 6 | App na Nuvemshop (OAuth) + polling de `/checkouts` | credenciais da loja |
| 7 | Calibrar o atraso real do carrinho abandonado | app instalado, loja com tráfego |

Aprovação da Meta leva de horas a dias, e um template `PENDING` devolve erro
`132001` no envio — que `entrega-meta.ts` classifica como `CONFIGURACAO` e
marca a inscrição como **bloqueada permanentemente**. Por isso a submissão
entra cedo e o disparo só depois de `aprovados.ts` confirmar `APPROVED`.

---

## Fontes

- [Webhook | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/webhook)
- [Abandoned Checkout | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources/abandoned-checkout)
- [API Resources | Nuvemshop API](https://tiendanube.github.io/api-documentation/resources)
