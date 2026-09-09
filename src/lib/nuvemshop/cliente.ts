/**
 * CLIENTE DA NUVEMSHOP — as três armadilhas, resolvidas uma vez.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 1. `User-Agent` é OBRIGATÓRIO. Sem ele a API devolve `400 Bad Request` sem
 *    dizer o porquê. Quem cai nessa passa horas conferindo o token, que está
 *    certo.
 *
 * 2. O header do token mudou de nome. A documentação antiga manda
 *    `Authentication: bearer` (sem o "or"), a atual manda `Authorization:
 *    Bearer`. Exemplos de blog na internet ainda usam o antigo. Mandamos o
 *    novo e, se vier 401, repetimos UMA vez com o antigo — porque uma loja em
 *    versão antiga é um fato do mundo, não um bug nosso.
 *
 * 3. O limite é BALDE FURADO (leaky bucket), não janela fixa: balde de 40,
 *    vazando 2 por segundo (×10 nos planos Next/Evolution). Isso muda a
 *    estratégia: rajada curta é permitida, ritmo sustentado acima de 2/s não
 *    é. Um cliente que só trata o 429 depois que ele acontece já perdeu a
 *    requisição — então respeitamos o `x-rate-limit-remaining` ANTES.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { obterCredenciais, urlBase, type CredenciaisNuvemshop } from './config'

export class ErroNuvemshop extends Error {
  constructor(
    readonly status: number,
    readonly corpo: string,
    readonly caminho: string,
  ) {
    super(`Nuvemshop ${status} em ${caminho}: ${corpo.slice(0, 300)}`)
    this.name = 'ErroNuvemshop'
  }
}

// ── Freio de ritmo ────────────────────────────────────────────────────────
// Estado de processo, de propósito: o limite é POR LOJA, e uma instância do
// CRM fala com uma loja. Em duas instâncias cada uma freia a sua metade, o que
// é conservador na direção segura.

const VAZAO_POR_SEGUNDO = 2
let proximoPermitidoEm = 0
/** Quanto o servidor disse que ainda cabe. `null` = ainda não sabemos. */
let restanteConhecido: number | null = null

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function esperarAVez(): Promise<void> {
  const agora = Date.now()
  if (agora < proximoPermitidoEm) await dormir(proximoPermitidoEm - agora)
  proximoPermitidoEm = Math.max(Date.now(), proximoPermitidoEm) + 1000 / VAZAO_POR_SEGUNDO
}

/**
 * Quando o balde está quase cheio, desacelera antes de levar 429.
 * O limiar é 5 e não 0 porque entre ler o header e mandar a próxima existe
 * concorrência: outro caminho do CRM pode ter gasto o que sobrava.
 */
async function respeitarFolga(resposta: Response): Promise<void> {
  const restante = Number(resposta.headers.get('x-rate-limit-remaining'))
  restanteConhecido = Number.isFinite(restante) ? restante : null
  if (restanteConhecido !== null && restanteConhecido <= 5) {
    const reset = Number(resposta.headers.get('x-rate-limit-reset'))
    await dormir(Number.isFinite(reset) ? Math.min(reset, 10_000) : 2_000)
  }
}

export function folgaAtual(): number | null {
  return restanteConhecido
}

// ── A requisição ──────────────────────────────────────────────────────────

type Opcoes = {
  metodo?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  corpo?: unknown
  busca?: Record<string, string | number | undefined>
  /** Injeta credenciais já resolvidas — evita uma ida ao banco por página. */
  credenciais?: CredenciaisNuvemshop
}

function montarUrl(base: string, caminho: string, busca?: Opcoes['busca']): string {
  const url = new URL(`${base}/${caminho.replace(/^\//, '')}`)
  for (const [chave, valor] of Object.entries(busca ?? {})) {
    if (valor !== undefined && valor !== '') url.searchParams.set(chave, String(valor))
  }
  return url.toString()
}

/** Uma chamada, com freio, retentativa de 429 e o fallback do header antigo. */
export async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<{ dados: T; resposta: Response }> {
  const cred = opcoes.credenciais ?? (await obterCredenciais())
  const url = montarUrl(urlBase(cred.storeId), caminho, opcoes.busca)

  const cabecalhos = (moderno: boolean): Record<string, string> => ({
    ...(moderno
      ? { Authorization: `Bearer ${cred.accessToken}` }
      : { Authentication: `bearer ${cred.accessToken}` }),
    'User-Agent': cred.userAgent,
    'Content-Type': 'application/json; charset=utf-8',
    Accept: 'application/json',
  })

  const disparar = async (moderno: boolean): Promise<Response> => {
    await esperarAVez()
    return fetch(url, {
      method: opcoes.metodo ?? 'GET',
      headers: cabecalhos(moderno),
      body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
      cache: 'no-store',
    })
  }

  let resposta = await disparar(true)

  // 401 pode ser token ruim OU loja em versão antiga do header. Uma tentativa.
  if (resposta.status === 401) resposta = await disparar(false)

  // 429: o servidor manda quanto esperar. Até 3 tentativas — além disso o
  // problema é de volume, e insistir só empurra o estouro para frente.
  for (let tentativa = 0; resposta.status === 429 && tentativa < 3; tentativa++) {
    const reset = Number(resposta.headers.get('x-rate-limit-reset'))
    await dormir(Number.isFinite(reset) ? Math.min(reset, 30_000) : 2_000 * (tentativa + 1))
    resposta = await disparar(true)
  }

  await respeitarFolga(resposta)

  if (!resposta.ok) {
    throw new ErroNuvemshop(resposta.status, await resposta.text().catch(() => ''), caminho)
  }

  // 204 e afins não têm corpo. `as T` aqui é honesto: quem chama DELETE sabe.
  if (resposta.status === 204) return { dados: undefined as T, resposta }
  return { dados: (await resposta.json()) as T, resposta }
}

/**
 * Percorre TODAS as páginas de uma coleção.
 *
 * `per_page` vai no teto de 200 de propósito: cada página é uma requisição, e
 * requisição é a moeda do balde. 200 por vez gasta um quarto do que 50 gasta.
 *
 * O corte por `Link` e não por "veio menos que per_page": a Nuvemshop pode
 * devolver página cheia e ainda assim ser a última, e o `Link` é a única
 * fonte que sabe disso sem uma requisição a mais.
 */
export async function listarTudo<T>(
  caminho: string,
  busca: Opcoes['busca'] = {},
  tetoDePaginas = 50,
): Promise<T[]> {
  const cred = await obterCredenciais()
  const tudo: T[] = []

  for (let pagina = 1; pagina <= tetoDePaginas; pagina++) {
    const { dados, resposta } = await requisitar<T[]>(caminho, {
      busca: { ...busca, page: pagina, per_page: 200 },
      credenciais: cred,
    })
    if (!Array.isArray(dados) || dados.length === 0) break
    tudo.push(...dados)

    const link = resposta.headers.get('link') ?? ''
    if (!link.includes('rel="next"')) break
  }
  return tudo
}

/**
 * A loja responde? Usada pela tela de integrações e pelo script de conferência.
 * Bate em `/store`, que é o endpoint mais barato que exige token válido.
 */
export async function conferirConexao(): Promise<{
  ok: true
  storeId: string
  nome: string
  dominio: string
  versaoApi: string
}> {
  const cred = await obterCredenciais()
  const { dados } = await requisitar<{ id: number; name?: Record<string, string>; original_domain?: string }>(
    'store',
    { credenciais: cred },
  )
  const nome = dados.name ? (Object.values(dados.name)[0] ?? '(sem nome)') : '(sem nome)'
  return {
    ok: true,
    storeId: String(dados.id ?? cred.storeId),
    nome,
    dominio: dados.original_domain ?? '(sem domínio)',
    versaoApi: (await import('./config')).VERSAO_API,
  }
}

// ── Verificação do webhook ────────────────────────────────────────────────

/**
 * Confere o HMAC-SHA256 do webhook.
 *
 * ⚠️ O header é `x-linkedstore-hmac-sha256` — nome herdado do nome antigo da
 * empresa, e por isso impossível de adivinhar.
 *
 * A comparação é em tempo constante. Comparar assinatura com `===` vaza,
 * pelo tempo de resposta, quantos bytes iniciais bateram — e isso é suficiente
 * para forjar assinatura byte a byte.
 *
 * Recebe o corpo CRU. Se alguém passar o objeto já parseado e re-serializado,
 * a assinatura nunca fecha: um espaço a mais muda o hash.
 */
export async function assinaturaValida(corpoCru: string, assinatura: string | null, appSecret: string): Promise<boolean> {
  if (!assinatura) return false

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpoCru))
  const esperado = Buffer.from(new Uint8Array(mac)).toString('hex')

  const a = Buffer.from(esperado, 'utf8')
  const b = Buffer.from(assinatura.trim().toLowerCase(), 'utf8')
  if (a.length !== b.length) return false

  let diferenca = 0
  for (let i = 0; i < a.length; i++) diferenca |= a[i] ^ b[i]
  return diferenca === 0
}
