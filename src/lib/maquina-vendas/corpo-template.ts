/**
 * O TEXTO QUE A CLIENTE REALMENTE RECEBEU.
 *
 * Porta de `corpo-template.ts` da CarBoss. Quando o envio sai por template,
 * `mensagemFinal` NÃO é o que foi entregue — o entregue é o corpo aprovado pela
 * Meta com os nossos parâmetros dentro. E o eco que a Datafy espelha no
 * Chatwoot só traz o NOME do template, não o texto.
 *
 * Diferença da origem: aqui o catálogo (`catalogo-templates.ts`) é a fonte do
 * corpo, porque a regra da loja é nunca editar template aprovado (cria-se
 * `_v2`). O corpo da Meta é buscado só para DETECTAR divergência — se alguém
 * editou no painel, a Prontidão acusa, em vez de a tela mentir calada.
 *
 * O texto é CARIMBADO no envio (`MvMensagem.textoEntregue`). Renderizar ao
 * abrir a tela reescreveria o passado com o template de hoje.
 */

import { CATALOGO } from './catalogo-templates'
import { obterCredenciaisCanal } from './canal'

export interface CorpoAprovado {
  nome: string
  corpo: string
  status: string
  categoria: string
  botoes: string[]
}

const VALIDADE_MS = 60 * 60 * 1000
let cache: { em: number; mapa: Map<string, CorpoAprovado> } | null = null

export function limparCacheDeCorpos(): void {
  cache = null
}

interface ComponenteMeta {
  type?: string
  text?: string
  buttons?: Array<{ text?: string }>
}

function extrair(t: { name?: string; status?: string; category?: string; components?: ComponenteMeta[] }): CorpoAprovado | null {
  if (!t?.name) return null
  const comps = Array.isArray(t.components) ? t.components : []
  const corpo = comps.find((c) => c?.type === 'BODY')?.text
  if (typeof corpo !== 'string') return null
  const botoes = (comps.find((c) => c?.type === 'BUTTONS')?.buttons ?? [])
    .map((b) => b?.text)
    .filter((x): x is string => typeof x === 'string' && x.length > 0)
  return { nome: t.name, corpo, status: t.status ?? 'DESCONHECIDO', categoria: t.category ?? 'DESCONHECIDA', botoes }
}

/** Corpo do CATÁLOGO, no mesmo formato. Síncrono, sem rede — o caminho do envio. */
export function corpoDoCatalogo(nome: string): CorpoAprovado | null {
  const t = CATALOGO.find((x) => x.nome === nome)
  if (!t) return null
  return {
    nome: t.nome,
    corpo: t.corpo,
    status: 'CATALOGO',
    categoria: t.categoria,
    botoes: (t.botoes ?? []).map((b) => b.texto),
  }
}

/**
 * Os corpos que a Meta guarda para a nossa WABA. Nunca lança: degrada para
 * mapa vazio, e quem chama trata como "não sei".
 */
export async function buscarCorposAprovados(agora: number = Date.now()): Promise<Map<string, CorpoAprovado>> {
  if (cache && agora - cache.em < VALIDADE_MS) return cache.mapa
  const mapa = new Map<string, CorpoAprovado>()
  const waba = process.env.DATAFY_WABA_ID
  if (!waba) return mapa
  try {
    const cred = await obterCredenciaisCanal()
    const r = await fetch(`${cred.baseUrl}/${waba}/message_templates?limit=200`, {
      headers: { Authorization: `Bearer ${cred.token}` },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) {
      console.error(`[corpo-template] Meta respondeu HTTP ${r.status} — sigo sem os corpos.`)
      return mapa
    }
    const json = (await r.json()) as { data?: unknown[] }
    for (const t of json.data ?? []) {
      const c = extrair(t as Parameters<typeof extrair>[0])
      if (c) mapa.set(c.nome, c)
    }
    cache = { em: agora, mapa }
    return mapa
  } catch (e) {
    console.error('[corpo-template] não consegui buscar os corpos:', e instanceof Error ? e.message : e)
    return mapa
  }
}

const espacos = (t: string) => t.replace(/\s+/g, ' ').trim()

/** Templates do catálogo cujo corpo na Meta é DIFERENTE (ou que lá não existem). */
export async function divergenciasDoCatalogo(): Promise<Array<{ nome: string; motivo: string }>> {
  const meta = await buscarCorposAprovados()
  if (meta.size === 0) return [{ nome: '*', motivo: 'não deu para ler os templates da Meta (WABA ou canal fora)' }]
  const fora: Array<{ nome: string; motivo: string }> = []
  for (const t of CATALOGO) {
    const m = meta.get(t.nome)
    if (!m) fora.push({ nome: t.nome, motivo: 'não existe na WABA' })
    else if (m.status !== 'APPROVED') fora.push({ nome: t.nome, motivo: `status ${m.status}` })
    else if (espacos(m.corpo) !== espacos(t.corpo)) fora.push({ nome: t.nome, motivo: 'corpo na Meta difere do catálogo' })
  }
  return fora
}

/**
 * Troca os marcadores pelo que foi mandado. Marcador sem parâmetro fica COMO
 * ESTÁ — frase quebrada em silêncio é pior que `{{1}}` visível na tela.
 */
export function renderizarCorpo(corpo: string, parametros: Record<string, string> | string[]): string {
  const mapa: Record<string, string> = Array.isArray(parametros)
    ? Object.fromEntries(parametros.map((v, i) => [String(i + 1), v]))
    : parametros
  const posicionais = Object.values(mapa)
  return corpo.replace(/\{\{\s*([\w]+)\s*\}\}/g, (inteiro, chave: string) => {
    if (Object.prototype.hasOwnProperty.call(mapa, chave)) return mapa[chave] === '' ? inteiro : mapa[chave]
    if (/^\d+$/.test(chave)) {
      const v = posicionais[Number(chave) - 1]
      return v === undefined || v === '' ? inteiro : v
    }
    return inteiro
  })
}

/** De onde vem o texto que a tela mostra — quatro estados, nunca três. */
export type OrigemDoTexto = 'planejado' | 'entregue' | 'livre' | 'desconhecido'

export interface TextoDaLinha {
  corpo: string
  origem: OrigemDoTexto
  template: string | null
  aviso: string | null
}

export function textoDaLinha(m: {
  status: string
  mensagemFinal: string
  textoEntregue: string | null
  templateNome: string | null
}): TextoDaLinha {
  if (m.textoEntregue) return { corpo: m.textoEntregue, origem: 'entregue', template: m.templateNome, aviso: null }
  if (m.templateNome && m.status === 'ENVIADA') {
    return {
      corpo: m.mensagemFinal,
      origem: 'desconhecido',
      template: m.templateNome,
      aviso: `Saiu pelo template "${m.templateNome}" antes do carimbo existir. O texto abaixo é a prévia, não o corpo exato recebido.`,
    }
  }
  if (m.status !== 'ENVIADA') return { corpo: m.mensagemFinal, origem: 'planejado', template: m.templateNome, aviso: null }
  return { corpo: m.mensagemFinal, origem: 'livre', template: null, aviso: null }
}

/** O texto entregue, pronto para guardar: corpo renderizado mais os botões. */
export function textoEntregueDoTemplate(aprovado: CorpoAprovado, parametros: Record<string, string> | string[]): string {
  const corpo = renderizarCorpo(aprovado.corpo, parametros)
  if (aprovado.botoes.length === 0) return corpo
  return `${corpo}\n\n${aprovado.botoes.map((b) => `[botão: ${b}]`).join(' ')}`
}
