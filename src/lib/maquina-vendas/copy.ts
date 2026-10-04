/**
 * A COPY — do esqueleto ao texto que sai, sem LLM no caminho.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A regra central do módulo: a tabela mostra EXATAMENTE o texto que a pessoa
 * vai receber. Por isso a copy é congelada em `mensagem_final` no momento da
 * inscrição, e nada a reescreve depois.
 *
 * Nos dois projetos de origem havia um nó de IA no fluxo de disparo que
 * "parafraseava o final". Foi desligado nos dois, pela mesma razão duas vezes:
 * a tela passava a prometer um texto e o WhatsApp entregava outro, e o
 * vocabulário da marca deixava de ser verificável.
 *
 * ── A VARIAÇÃO, que não é enfeite ─────────────────────────────────────────
 * Os blocos `[[a|b|c]]` são obrigatórios. Sem eles todo lead recebe o mesmo
 * texto, e o WhatsApp lê remetente único + muitos destinatários + corpo
 * idêntico como disparo em massa — por mais espaçado que o envio esteja.
 *
 * A escolha da variante é DETERMINÍSTICA, derivada do id da inscrição. Um
 * `Math.random()` seria errado aqui: a tela mostra a mensagem antes de ela
 * sair, e o texto não pode mudar entre a exibição e o disparo.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { PALAVRAS_PROIBIDAS, SAUDACOES_RETORICAS, SIGLAS_PERMITIDAS, ANUNCIOS_DE_ULTIMA } from './vocabulario'

/** FNV-1a de 32 bits: hash pequeno, sem dependência, boa dispersão. */
function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Contexto = {
  primeiro_nome?: string | null
  peca?: string | null
  pedido?: string | null
  cupom?: string | null
  desconto?: string | null
  rastreio?: string | null
  colecao?: string | null
  prazo?: string | null
  link?: string | null
}

/** Escolhe uma variante de `[[a|b|c]]`, estável para a mesma semente. */
function resolverVariacoes(texto: string, semente: string): string {
  let i = 0
  return texto.replace(/\[\[([^\]]+)\]\]/g, (_, bloco: string) => {
    const opcoes = bloco.split('|').map((o) => o.trim()).filter(Boolean)
    if (opcoes.length === 0) return ''
    const escolhida = opcoes[hash(`${semente}:${i++}`) % opcoes.length]
    return escolhida
  })
}

/** Quantos textos distintos um esqueleto consegue produzir. */
export function variantesPossiveis(template: string): number {
  const blocos = template.match(/\[\[([^\]]+)\]\]/g) ?? []
  return blocos.reduce((acc, b) => acc * b.slice(2, -2).split('|').filter((o) => o.trim()).length, 1)
}

export class CopyIncompleta extends Error {
  constructor(readonly faltando: string[]) {
    super(`A copy exige ${faltando.join(', ')} e o contexto não tem`)
    this.name = 'CopyIncompleta'
  }
}

/**
 * O texto final.
 *
 * ⚠️ Placeholder sem valor no contexto é ERRO, não string vazia. Uma mensagem
 * dizendo "Oi, ! Vi que você deixou  no carrinho" é pior do que mensagem
 * nenhuma — e sai para cliente real. Quem chama trata o erro pulando a
 * inscrição, não enviando um texto pela metade.
 */
export function montarCopy(template: string, contexto: Contexto, semente: string): string {
  const comVariacao = resolverVariacoes(template, semente)

  const faltando: string[] = []
  const texto = comVariacao.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => {
    const valor = (contexto as Record<string, unknown>)[chave]
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      faltando.push(chave)
      return ''
    }
    return String(valor)
  })

  if (faltando.length) throw new CopyIncompleta([...new Set(faltando)])
  return texto.replace(/[ \t]+\n/g, '\n').trim()
}

/**
 * Confere um esqueleto ANTES de ele virar cadência — o validador da tela.
 *
 * As regras vêm do que as duas operações aprenderam: mensagem longa com lista
 * de produtos lê como spam, mais de uma pergunta dilui a única que importa, e
 * texto sem variação forma padrão de disparo em massa.
 */
export function validarTemplate(template: string): string[] {
  const erros: string[] = []
  const limpo = template.trim()

  if (!limpo) return ['A mensagem está vazia.']
  if (limpo.length > 700) erros.push('Passa de 700 caracteres — mensagem longa lê como spam.')

  const linhas = limpo.split('\n').filter((l) => l.trim()).length
  if (linhas > 6) erros.push(`Tem ${linhas} linhas. O teto é 6 — acima disso ninguém lê.`)

  const perguntas = (limpo.match(/\?/g) ?? []).length
  if (perguntas > 1) erros.push(`Tem ${perguntas} perguntas. Mais de uma dilui a que importa.`)

  if (variantesPossiveis(limpo) < 4) {
    erros.push('Sem variação suficiente: use blocos [[a|b|c]]. Corpo idêntico para muitos destinatários é o que o WhatsApp lê como disparo em massa.')
  }

  const placeholders = [...limpo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
  const conhecidos = ['primeiro_nome', 'peca', 'pedido', 'cupom', 'desconto', 'rastreio', 'colecao', 'prazo', 'link']
  for (const p of new Set(placeholders)) {
    if (!conhecidos.includes(p)) erros.push(`{{${p}}} não existe. Disponíveis: ${conhecidos.join(', ')}.`)
  }
  if (!placeholders.includes('primeiro_nome')) {
    erros.push('Sem {{primeiro_nome}} — mensagem sem nome lê como automação.')
  }

  return erros
}

// ════════════════════════════════════════════════════════════════════════════
// PORTADO DA CARBOSS (04/10/2026) — vocativo, expansão e o validador da copy
// FINAL. `validarTemplate` acima confere o esqueleto; `validarCopy` confere o
// texto que a cliente lê, contra o vocabulário da loja.
// ════════════════════════════════════════════════════════════════════════════

export type ResultadoValidacao = { ok: boolean; erros: string[] }

const normalizarTexto = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Tokens que não servem como vocativo — medidos na CarBoss + os da loja. */
const TOKENS_NAO_SAUDAVEIS = new Set([
  'dr', 'dra', 'sr', 'sra', 'dona', 'seu', 'de', 'da', 'do', 'das', 'dos', 'e',
  'desconhecido', 'sistema', 'contato', 'cliente', 'nome', 'teste', 'test', 'loja',
  'boutique', 'moda', 'store', 'whatsapp', 'zap', 'lead', 'ltda', 'me', 'mei', 'eireli',
])

function pareceNomeDeGente(token: string): boolean {
  const so = normalizarTexto(token)
  return /^[a-z]{2,}$/.test(so) && /[aeiou]/.test(so)
}

/**
 * Primeiro nome utilizável, em Title Case. **Vazio quando não há nome de gente**
 * — devolver '' em vez de chutar é o que impede "Oi Loja, ..." de sair.
 */
export function primeiroNomeDeGente(nomeCompleto: string | null | undefined): string {
  const bruto = String(nomeCompleto ?? '').trim()
  if (!bruto) return ''
  const tokens = bruto
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}]+/u, '').replace(/[^\p{L}\p{M}]+$/u, ''))
    .filter((t) => t.length > 0)
  const util = tokens.find((t) => pareceNomeDeGente(t) && !TOKENS_NAO_SAUDAVEIS.has(normalizarTexto(t)))
  if (!util) return ''
  return util.charAt(0).toUpperCase() + util.slice(1).toLowerCase()
}

/** Tira o vocativo do esqueleto quando não há nome de gente para chamar. */
export function removerVocativo(template: string): string {
  return template
    .replace(/Oi,? \{\{primeiro_nome\}\}([,!])/g, 'Oi$1')
    .replace(/Olá,? \{\{primeiro_nome\}\}([,!])/g, 'Olá$1')
    .replace(/\{\{primeiro_nome\}\}, (\p{Ll})/gu, (_m, letra: string) => letra.toUpperCase())
}

/**
 * Última cerca contra vocativo errado — roda no ENVIO, sobre o texto pronto.
 * Só mexe quando o snapshot NÃO é nome de gente E a palavra do vocativo está
 * dentro dele (prova de que foi o gerador que a pôs ali).
 */
export function sanearVocativoResolvido(texto: string, nomeSnapshot: string): string {
  if (primeiroNomeDeGente(nomeSnapshot)) return texto
  const doNome = new Set(String(nomeSnapshot ?? '').split(/\s+/).map(normalizarTexto).filter(Boolean))
  if (doNome.size === 0) return texto
  const comOi = texto.match(/^(Oi|Olá),? ([\p{L}]+)([,!]) /u)
  if (comOi && doNome.has(normalizarTexto(comOi[2]))) return `${comOi[1]}${comOi[3]} ${texto.slice(comOi[0].length)}`
  const semOi = texto.match(/^([\p{L}]+), (\p{Ll})/u)
  if (semOi && doNome.has(normalizarTexto(semOi[1]))) return semOi[2].toUpperCase() + texto.slice(semOi[0].length)
  return texto
}

/** TODAS as saídas possíveis de um esqueleto — o seed valida todas, não uma. */
export function expandirVariantes(texto: string): string[] {
  const bloco = /\[\[([^\]]+)\]\]/.exec(texto)
  if (!bloco) return [texto]
  const opcoes = bloco[1].split('|').map((o) => o.trim()).filter((o) => o.length > 0)
  if (opcoes.length === 0) throw new Error('bloco de variação vazio')
  return opcoes.flatMap((o) => expandirVariantes(texto.slice(0, bloco.index) + o + texto.slice(bloco.index + bloco[0].length)))
}

/** Escolha de variante da origem; aqui delega à mesma função de `montarCopy`. */
export function resolverVariantes(texto: string, semente: string): string {
  return resolverVariacoes(texto, semente)
}

/**
 * Tetos da loja. A CarBoss usa 5 linhas e 2 emojis; a Doce Lilium escreve com
 * laço e coração (🎀 💖 🤍) e quebra linha para respirar — medido contra os 16
 * aprovados: o maior tem 7 linhas, e o `dl_drop_1010_chegou_v1` leva 5 emojis
 * (🎀🎀🎀 é a assinatura do drop). O teto descreve o que a Meta já aprovou.
 */
const MAX_LINHAS = 7
const MAX_EMOJIS = 5

function ehSoSaudacao(linha: string): boolean {
  const norm = normalizarTexto(linha)
  return SAUDACOES_RETORICAS.some((s) => norm.includes(normalizarTexto(s)))
}

/** No máximo UM pedido. Na loja a mensagem transacional pode não ter pedido. */
function errosDePedido(linhas: string[], exigirPedido: boolean): string[] {
  const pedidos = linhas
    .map((l, i) => (l.includes('?') ? i : -1))
    .filter((i) => i >= 0)
    .filter((i) => i !== 0 || linhas.length === 1 || !ehSoSaudacao(linhas[0]))
  if (pedidos.length === 0) return exigirPedido ? ['nenhum pedido — a mensagem de marketing fecha com uma pergunta'] : []
  if (pedidos.length > 1) return [`${pedidos.length} pedidos (no máximo 1) — nas linhas ${pedidos.map((i) => i + 1).join(', ')}`]
  return []
}

/** Checklist do texto FINAL contra o vocabulário e o formato da loja. */
export function validarCopy(texto: string, opts: { ehUltima: boolean; exigirPedido?: boolean }): ResultadoValidacao {
  const erros: string[] = []
  const norm = normalizarTexto(texto)

  for (const { termo, motivo } of PALAVRAS_PROIBIDAS) {
    const t = normalizarTexto(termo)
    // Palavra inteira: "lead" não pode reprovar "leadership" nem "funil" "funileiro".
    if (new RegExp(`(^|[^a-z])${t.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}([^a-z]|$)`).test(norm)) {
      erros.push(`palavra proibida "${termo}" (${motivo})`)
    }
  }

  const linhas = texto.split('\n').filter((l) => l.trim().length > 0)
  if (linhas.length > MAX_LINHAS) erros.push(`${linhas.length} linhas (máx. ${MAX_LINHAS})`)

  const emojis = texto.match(/\p{Extended_Pictographic}/gu) ?? []
  if (emojis.length > MAX_EMOJIS) erros.push(`${emojis.length} emojis (máx. ${MAX_EMOJIS} por mensagem)`)

  erros.push(...errosDePedido(linhas, opts.exigirPedido ?? false))

  if (texto.includes('!!')) erros.push('usa "!!"')
  for (const caps of texto.match(/\p{Lu}{3,}/gu) ?? []) {
    if (!SIGLAS_PERMITIDAS.has(caps)) erros.push(`CAPS em palavra comum: "${caps}"`)
  }
  if (/^\s*([-•]|\d+\.)\s/m.test(texto)) erros.push('usa bullet — parece disparo em massa')
  if (/\*\*/.test(texto)) erros.push('usa negrito markdown (no WhatsApp é *um asterisco*)')
  if (/\{\{\w+\}\}/.test(texto)) erros.push('sobrou placeholder no texto')
  if (/\[\[|\]\]/.test(texto)) erros.push('sobrou bloco de variação no texto')
  if (opts.ehUltima && !ANUNCIOS_DE_ULTIMA.some((a) => norm.includes(normalizarTexto(a)))) {
    erros.push('última mensagem não se anuncia como última')
  }
  return { ok: erros.length === 0, erros }
}

/** Dinheiro como a loja escreve: R$ 189,90. */
export function formatarDinheiro(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ')
}
