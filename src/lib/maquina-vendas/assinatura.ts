/**
 * A ASSINATURA DO WEBHOOK — e as quatro formas de derivar a chave dela.
 *
 * Porta literal de `assinatura.ts` da CarBoss (04/10/2026). A rota da Doce
 * Lilium tinha o MESMO defeito de 18/08 da origem — `split('=').pop()` no
 * cabeçalho, que zera assinatura em base64 — e só funcionava porque a Datafy
 * manda hex hoje. Agora a rota usa este módulo, e a bateria de nível 1 o cobre.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Esta conferência já falhou DUAS vezes em silêncio, e as duas custaram caro:
 *
 *   18/08/2026 — `cabecalho.split('=').pop()` zerava assinatura em base64 (o
 *                `=` é padding). Resultado: 401 em toda entrega, um dia inteiro
 *                sem confirmação e sem a fala de nenhum lead.
 *   19/08/2026 — o botão "testar evento" do painel voltou a dar 401 mesmo com
 *                o segredo do ambiente IDÊNTICO ao do painel, byte a byte.
 *
 * O segundo caso é o motivo deste arquivo existir separado da rota: um pedaço
 * de código que erra em silêncio e derruba o canal inteiro merece teste próprio,
 * e teste exige que ele não more dentro de um handler HTTP.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Por que QUATRO chaves, e por que isso não afrouxa nada ─────────────────
 * O segredo vem como `whsec_<64 hex>`, e não está documentado o que vira chave
 * do HMAC. As convenções reais divergem:
 *
 *   · a string inteira, com o prefixo      (Stripe)
 *   · só o miolo, como TEXTO               (o que a gente fazia)
 *   · os BYTES do miolo, decodificados     (Svix — e o formato aqui grita isso:
 *                                           64 hex são exatamente 32 bytes)
 *   · os bytes do miolo em base64          (quando o miolo não é hex)
 *
 * Todas derivam do MESMO segredo, que só a Datafy e a gente temos. Aceitar as
 * quatro não abre porta para ninguém: quem não tem o segredo não produz nenhuma
 * delas. O que elas evitam é o oposto — rejeitar entrega legítima por ter
 * chutado a convenção errada, que é exatamente o que aconteceu.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Comparação em tempo constante. Tamanho diferente já é assinatura errada. */
export function confere(esperado: string, recebido: string): boolean {
  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(recebido, 'utf8')
  return a.length === b.length && timingSafeEqual(a, b)
}

const EH_HEX = /^[0-9a-f]+$/i

/**
 * As chaves que podem estar por trás de um `whsec_...`.
 *
 * Exportada porque o diagnóstico da rota mostra o cálculo de cada uma lado a
 * lado com o que a Datafy mandou — e sem a mesma lista os dois divergiriam.
 */
export function chavesCandidatas(segredo: string): Array<{ nome: string; chave: string | Buffer }> {
  const fora: Array<{ nome: string; chave: string | Buffer }> = [
    { nome: 'string inteira', chave: segredo },
  ]
  if (!segredo.startsWith('whsec_')) return fora

  const miolo = segredo.slice('whsec_'.length)
  fora.push({ nome: 'miolo como texto', chave: miolo })

  // 64 hex = 32 bytes, que é o tamanho natural de uma chave HMAC-SHA256. Quando
  // o miolo é hex par, os BYTES dele são o candidato mais provável de todos.
  if (EH_HEX.test(miolo) && miolo.length % 2 === 0) {
    fora.push({ nome: 'miolo em bytes (hex)', chave: Buffer.from(miolo, 'hex') })
  } else if (/^[A-Za-z0-9+/_-]+=*$/.test(miolo)) {
    // Só quando NÃO é hex: hex também passa no teste de base64, e adicionar um
    // candidato que nunca vai bater só faz o diagnóstico mentir sobre o que foi
    // tentado.
    fora.push({ nome: 'miolo em bytes (base64)', chave: Buffer.from(miolo, 'base64') })
  }
  return fora
}

/**
 * OS NOMES DE CABEÇALHO EM QUE A ASSINATURA PODE CHEGAR.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * ⚠️ A Datafy é um PROXY TRANSPARENTE do Graph da Meta, e a Meta assina em
 *    `x-hub-signature-256`. Quando o proxy repassa o cabeçalho original em vez
 *    de criar o dele, procurar só por `x-datafy-signature-256` acha `null` — e
 *    a rota recusa TODA entrega por assinatura ausente, não por assinatura
 *    errada. Os dois sintomas são idênticos de fora, e o conserto é oposto.
 *
 * Foi exatamente isso em 19/08/2026: o diagnóstico de produção gravou
 * `recebido: ""` (tamanho 0) com o corpo de 426 bytes intacto. Não havia
 * assinatura *no nome que a gente lia*.
 *
 * Aceitar os três não afrouxa nada: o HMAC é conferido igual em qualquer um,
 * com o mesmo segredo. O que muda é parar de recusar por causa do nome do
 * envelope.
 * ══════════════════════════════════════════════════════════════════════════
 */
export const CABECALHOS_DE_ASSINATURA = [
  'x-datafy-signature-256',
  'x-hub-signature-256',
  'x-signature-256',
] as const

/** A assinatura e o nome do cabeçalho em que ela veio. */
export function lerAssinatura(cabecalhos: Headers): { valor: string | null; origem: string | null } {
  for (const nome of CABECALHOS_DE_ASSINATURA) {
    const v = cabecalhos.get(nome)
    if (v && v.trim()) return { valor: v, origem: nome }
  }
  return { valor: null, origem: null }
}

/**
 * O que mais chega junto da assinatura, e que pode entrar na string assinada.
 *
 * Medido em 19/08/2026, no diagnóstico da recusa: a Datafy manda
 * `x-datafy-timestamp` e `x-datafy-delivery-id` em toda entrega.
 */
export interface ContextoAssinatura {
  timestamps?: (string | null | undefined)[]
  ids?: (string | null | undefined)[]
}

/**
 * Descobre carimbo e id nos cabeçalhos por FORMA, não por nome.
 *
 * O nome varia com o provedor (e a Datafy já mostrou que repassa cabeçalho de
 * terceiro), então procurar `x-datafy-timestamp` literal falha calado no dia em
 * que ele vier como `x-hub-timestamp` ou `webhook-timestamp`. O que não varia é
 * o formato: 10 dígitos são segundos, 13 são milissegundos.
 */
export function contextoDeCabecalhos(cabecalhos: Headers): ContextoAssinatura {
  const timestamps: string[] = []
  const ids: string[] = []
  cabecalhos.forEach((valor, nome) => {
    const v = valor.trim()
    if (/^\d{10}$|^\d{13}$/.test(v)) timestamps.push(v)
    // `content-length` também é dígito, mas nunca de 10 ou 13 — não entra aqui.
    else if (/id$/i.test(nome) && v.length > 0 && v.length <= 80) ids.push(v)
  })
  // Limite para o produto cartesiano não explodir com cabeçalho de CDN: três
  // ids já cobrem qualquer convenção real, e cada um custa duas composições.
  return { timestamps, ids: ids.slice(0, 3) }
}

/**
 * AS COMPOSIÇÕES POSSÍVEIS DA STRING ASSINADA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Assinar o corpo sozinho é o caso simples, e era o único que a gente tentava.
 * Mas quem manda `timestamp` junto costuma assiná-lo — e por um bom motivo:
 * sem o timestamp dentro do HMAC, qualquer um que capture uma entrega válida
 * pode reenviá-la para sempre, e a assinatura continua conferindo.
 *
 * As convenções reais:
 *   Stripe → `${timestamp}.${corpo}`
 *   Svix   → `${id}.${timestamp}.${corpo}`
 *
 * Em 19/08 o diagnóstico mostrou que a Datafy manda os DOIS cabeçalhos e que
 * nenhuma das três chaves batia sobre o corpo puro. Sobra a composição.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ O que isto NÃO faz: conferir se o timestamp é recente. Uma janela apertada
 *    recusaria a RE-TENTATIVA legítima, que é justamente o que traz de volta a
 *    entrega represada por uma falha nossa — e foi assim que as confirmações
 *    voltaram depois deste conserto. Proteção contra repetição é endurecimento
 *    de outro dia, e precisa nascer junto de um registro de `delivery-id` já
 *    visto, não de um relógio.
 */
export function composicoes(bruto: string, ctx: ContextoAssinatura): Array<{ nome: string; texto: string }> {
  const fora = [{ nome: 'corpo', texto: bruto }]
  const ts = (ctx.timestamps ?? []).map((t) => t?.trim()).filter((t): t is string => !!t)
  const ids = (ctx.ids ?? []).map((i) => i?.trim()).filter((i): i is string => !!i)

  for (const t of ts) {
    fora.push({ nome: `${t}.corpo`, texto: `${t}.${bruto}` })
    // Sem separador: existe quem concatene direto.
    fora.push({ nome: `${t}+corpo`, texto: `${t}${bruto}` })
    for (const id of ids) {
      fora.push({ nome: `id.${t}.corpo`, texto: `${id}.${t}.${bruto}` })
      fora.push({ nome: `${t}.id.corpo`, texto: `${t}.${id}.${bruto}` })
    }
  }
  for (const id of ids) fora.push({ nome: 'id.corpo', texto: `${id}.${bruto}` })
  return fora
}

/**
 * Tira a embalagem e devolve só o digest.
 *
 * Exportada porque o diagnóstico precisa mostrar exatamente o que foi comparado
 * — mostrar o cabeçalho cru enquanto a conferência usa o miolo já mandou a
 * gente caçar diferença que não existia.
 */
export function desembrulha(cabecalho: string): string {
  return cabecalho.trim().replace(/^sha256=/i, '').replace(/^v1[,=]/i, '').trim()
}

/** Os três jeitos de escrever o MESMO digest. */
export function representacoes(bytes: Buffer): string[] {
  const b64 = bytes.toString('base64')
  return [
    bytes.toString('hex'),
    b64,
    b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  ]
}

/**
 * O `x-datafy-signature-256` confere com o corpo cru?
 *
 * ⚠️ `bruto` tem que ser o corpo CRU. Reserializar o objeto muda espaço e ordem
 *    de chave, e a assinatura nunca mais bate.
 */
export function assinaturaValida(
  bruto: string,
  cabecalho: string | null,
  segredo: string,
  ctx: ContextoAssinatura = {},
): boolean {
  return explicarAssinatura(bruto, cabecalho, segredo, ctx) !== null
}

/**
 * A mesma conferência, dizendo QUAL combinação bateu.
 *
 * Existe para o dia em que ela voltar a falhar: saber que passou não ajuda a
 * consertar nada, mas saber que passou por `timestamp.corpo` com a chave em
 * bytes diz exatamente qual convenção o outro lado usa — e é isso que permite,
 * mais tarde, apertar a lista em vez de carregar seis composições para sempre.
 */
export function explicarAssinatura(
  bruto: string,
  cabecalho: string | null,
  segredo: string,
  ctx: ContextoAssinatura = {},
): { chave: string; composicao: string } | null {
  if (!cabecalho) return null

  // ⚠️ Só um prefixo EXPLÍCITO é removido. A versão de 18/08 fazia
  //    `split('=').pop()`, que zera assinatura em base64 — o `=` é padding.
  //    `sha256=<hex>` e `v1,<base64>` são as duas embalagens comuns.
  const recebido = desembrulha(cabecalho)
  if (!recebido) return null

  for (const { nome: chave, chave: material } of chavesCandidatas(segredo)) {
    for (const { nome: composicao, texto } of composicoes(bruto, ctx)) {
      const bytes = createHmac('sha256', material).update(texto, 'utf8').digest()
      if (representacoes(bytes).some((r) => confere(r, recebido))) {
        return { chave, composicao }
      }
    }
  }
  return null
}
