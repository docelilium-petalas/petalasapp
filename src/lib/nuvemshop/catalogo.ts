/**
 * O CATÁLOGO — a vitrine da loja, do jeito que o atendimento precisa.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A fonte é a Nuvemshop, sempre. O CRM não guarda cópia de produto: preço,
 * foto e estoque mudam na loja, e uma cópia velha é a IA dizendo "tem M" de
 * um vestido que esgotou ontem. Por isso aqui só existe um cache curto em
 * memória (10 min), para uma conversa não bater na API a cada pergunta.
 *
 * Medido em 13/09/2026: 20 produtos publicados, 6 fotos cada, 7 categorias
 * (Saias, Vestidos, Todas, Partes de cima, Sale, Acessório, Collab DL by Lari).
 *
 * ── Estoque ───────────────────────────────────────────────────────────────
 * `stock_management: false` = a loja não controla estoque daquela variante,
 * então ela está à venda. Com controle, `stock > 0`. O campo `disponivel` é
 * a única resposta que a IA pode dar sobre "tem?" — ela não calcula nada.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { listarTudo } from './cliente'

type Traduzivel = { pt?: string; es?: string } | string | null | undefined

type VarianteLoja = {
  id: number
  price?: string | null
  promotional_price?: string | null
  stock_management?: boolean
  stock?: number | null
  values?: Traduzivel[]
}

type ProdutoLoja = {
  id: number
  name?: Traduzivel
  description?: Traduzivel
  canonical_url?: string
  published?: boolean
  images?: { src: string; position?: number }[]
  variants?: VarianteLoja[]
  attributes?: Traduzivel[]
  categories?: { name?: Traduzivel }[]
  tags?: string
  created_at?: string
}

export type TamanhoCatalogo = { nome: string; disponivel: boolean }

export type ProdutoCatalogo = {
  id: number
  nome: string
  categorias: string[]
  /** Menor preço vigente entre as variantes (promocional quando houver). */
  preco: number | null
  /** Preço cheio, só quando há promoção — para a IA dizer "de/por". */
  precoCheio: number | null
  tamanhos: TamanhoCatalogo[]
  disponivel: boolean
  fotos: string[]
  link: string
  /** Descrição sem HTML, cortada. Fonte de tecido, caimento e medidas. */
  resumo: string
  tags: string[]
  criadoEm: string | null
}

function pt(v: Traduzivel): string {
  if (!v) return ''
  if (typeof v === 'string') return v
  return v.pt ?? v.es ?? ''
}

function numero(v?: string | null): number | null {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function semHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
}

function varianteDisponivel(v: VarianteLoja): boolean {
  if (v.stock_management === false) return true
  return (v.stock ?? 0) > 0
}

export function normalizarProduto(p: ProdutoLoja): ProdutoCatalogo {
  const variantes = p.variants ?? []
  const atributos = (p.attributes ?? []).map(pt)
  const idxTamanho = atributos.findIndex((a) => /tamanho|size/i.test(a))

  const tamanhos: TamanhoCatalogo[] = []
  for (const v of variantes) {
    const valores = (v.values ?? []).map(pt)
    const nome = (idxTamanho >= 0 ? valores[idxTamanho] : valores.join(' / ')) || 'Único'
    const ja = tamanhos.find((t) => t.nome === nome)
    if (ja) ja.disponivel = ja.disponivel || varianteDisponivel(v)
    else tamanhos.push({ nome, disponivel: varianteDisponivel(v) })
  }

  const vigentes = variantes.map((v) => numero(v.promotional_price) ?? numero(v.price)).filter((n): n is number => n !== null)
  const cheios = variantes.map((v) => numero(v.price)).filter((n): n is number => n !== null)
  const preco = vigentes.length ? Math.min(...vigentes) : null
  const cheio = cheios.length ? Math.min(...cheios) : null

  return {
    id: p.id,
    nome: pt(p.name).trim(),
    categorias: (p.categories ?? []).map((c) => pt(c.name)).filter((c) => c && !/^todas$/i.test(c)),
    preco,
    precoCheio: cheio && preco && cheio > preco ? cheio : null,
    tamanhos,
    disponivel: tamanhos.some((t) => t.disponivel),
    fotos: [...(p.images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((i) => String(i.src ?? '').replace(/^\/\//, 'https://').replace(/^http:\/\//i, 'https://'))
      .filter(Boolean),
    link: p.canonical_url ?? '',
    resumo: semHtml(pt(p.description)).slice(0, 600),
    tags: (p.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    criadoEm: p.created_at ?? null,
  }
}

const TTL_MS = 10 * 60_000
let cache: { em: number; produtos: ProdutoCatalogo[] } | null = null

/** Todos os produtos publicados, do mais novo para o mais antigo. */
export async function catalogoDaLoja(forcar = false): Promise<ProdutoCatalogo[]> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.produtos
  const brutos = await listarTudo<ProdutoLoja>('products', { published: 'true' })
  const produtos = brutos
    .filter((p) => p.published !== false)
    .map(normalizarProduto)
    .filter((p) => p.nome)
    .sort((a, b) => (b.criadoEm ?? '').localeCompare(a.criadoEm ?? '') || b.id - a.id)
  cache = { em: Date.now(), produtos }
  return produtos
}

/** Sem acento e minúsculo — a cliente escreve "vestido azul", "Mônica", "monica". */
export function dobrar(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export type FiltroCatalogo = {
  busca?: string | null
  categoria?: string | null
  tamanho?: string | null
  precoMax?: number | null
  limite?: number
}

export type ResultadoCatalogo = {
  /** O que a IA pode oferecer. Só peça com estoque entra aqui. */
  pecas: ProdutoCatalogo[]
  /**
   * Bateram com a busca mas estão sem estoque. Não vão para a oferta — vão
   * para a IA saber a diferença entre "a loja não tem isso" e "tem, mas
   * esgotou". Dizer "não temos vestido" numa loja de vestidos é tão errado
   * quanto oferecer o que não dá para comprar.
   */
  esgotadas: ProdutoCatalogo[]
  /**
   * Batem com a busca, têm o tamanho pedido na grade, mas esse tamanho está
   * zerado (e outro tem). Até 08/10/2026 a peça simplesmente sumia do
   * resultado e a IA dizia "não temos" de uma peça que a loja tem.
   */
  semTamanho: ProdutoCatalogo[]
}

/** Palavras que não distinguem peça nenhuma e só sujam a pontuação. */
const VAZIAS = new Set(['de', 'da', 'do', 'para', 'pra', 'um', 'uma', 'com', 'e', 'o', 'a', 'tem', 'quero', 'algum', 'alguma', 'peca', 'roupa'])

/**
 * Plural simples: "saias" vira "saia". Só em palavra longa, para não comer
 * "mais" nem "sale".
 *
 * A IA escreve a categoria do jeito dela — "acessorios" quando a loja cadastrou
 * "Acessório". Em 25/09/2026 isso fez a cliente ouvir "não temos lenço no
 * catálogo" com o Lenço Ave Maria publicado e à venda: a busca pela palavra
 * achava a peça, o filtro de categoria a derrubava depois.
 */
function semPlural(p: string): string {
  return p.length > 4 && p.endsWith('s') ? p.slice(0, -1) : p
}

/**
 * A busca que a IA usa. Ordena por quantas palavras da busca aparecem no
 * nome/categoria/tags/descrição (nome vale mais); empate fica com o mais novo,
 * porque `produtos` já chega ordenado assim e o sort do JS é estável. Nunca
 * devolve item que não bate com NENHUMA palavra quando houve busca — "tem
 * blazer?" numa loja sem blazer tem de voltar vazio, senão a IA oferece
 * vestido como se fosse blazer.
 *
 * ── Esgotada não é oferta ─────────────────────────────────────────────────
 * Até 27/09/2026 esta função só empurrava a peça sem estoque para o fim da
 * fila: com `limite: 4` numa busca por "vestidos", peça esgotada entrava na
 * resposta, a IA a listava e mandava a foto. Medido na conversa do Owner.
 * A decisão saiu do modelo e virou regra: esgotada sai da lista de oferta e
 * volta em `esgotadas`, separada, só como contexto.
 */
export function filtrarCatalogo(produtos: ProdutoCatalogo[], f: FiltroCatalogo): ResultadoCatalogo {
  const limite = f.limite ?? 4
  const lista = pontuar(produtos, f)
  return {
    pecas: lista.filter((x) => x.classe === 'tem').map((x) => x.p).slice(0, limite),
    esgotadas: lista.filter((x) => x.classe === 'esgotada').map((x) => x.p).slice(0, limite),
    semTamanho: lista.filter((x) => x.classe === 'sem_tamanho').map((x) => x.p).slice(0, limite),
  }
}

type Classe = 'tem' | 'esgotada' | 'sem_tamanho'
type Pontuado = { p: ProdutoCatalogo; pontos: number; pontosNome: number; classe: Classe }

/**
 * Pontua e classifica. O tamanho NÃO filtra mais por estoque: filtra pela
 * GRADE (a peça tem esse tamanho, com ou sem estoque) e o estoque vira classe.
 * Peça que nem tem o tamanho na grade continua fora — saia 38/40 não é
 * "sem tamanho" para quem usa M, é outra peça.
 */
function pontuar(produtos: ProdutoCatalogo[], f: FiltroCatalogo): Pontuado[] {
  const palavras = dobrar(f.busca ?? '')
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !VAZIAS.has(p))
    .map(semPlural)
  const categoria = f.categoria ? semPlural(dobrar(f.categoria).trim()) : null
  const tamanho = f.tamanho ? dobrar(f.tamanho).trim() : null

  return produtos
    // Compara nos dois sentidos, já sem plural: "acessorios" tem de achar
    // "Acessório", e "vestido de festa" tem de achar "Vestidos".
    .filter(
      (p) =>
        !categoria ||
        p.categorias.some((c) => {
          const cat = semPlural(dobrar(c).trim())
          return cat.includes(categoria) || (cat.length >= 4 && categoria.includes(cat))
        }),
    )
    .filter((p) => !f.precoMax || (p.preco ?? Infinity) <= f.precoMax)
    .filter((p) => !tamanho || p.tamanhos.some((t) => dobrar(t.nome) === tamanho))
    .map((p): Pontuado => {
      const nome = dobrar(p.nome)
      const resto = dobrar([p.categorias.join(' '), p.tags.join(' '), p.resumo].join(' '))
      let pontos = 0
      let pontosNome = 0
      for (const w of palavras) {
        if (nome.includes(w)) {
          pontos += 3
          pontosNome += 3
        } else if (resto.includes(w)) pontos += 1
      }
      const classe: Classe = !p.disponivel
        ? 'esgotada'
        : tamanho && !p.tamanhos.some((t) => dobrar(t.nome) === tamanho && t.disponivel)
          ? 'sem_tamanho'
          : 'tem'
      return { p, pontos, pontosNome, classe }
    })
    .filter((x) => palavras.length === 0 || x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos)
}

/**
 * A DECISÃO DO ESTOQUE — o que a cliente pediu dá para vender?
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Reunião de 08/10/2026 (Luan, Gabriel, Marília). Na conversa revisada a
 * cliente pediu "vestido marrom"; o único era o Mônica Marrom, zerado. A dica
 * da busca mandava "oferecer avisar quando voltar" e "ver algo parecido" — em
 * Vestidos, categoria inteira esgotada. A IA cumpriu as duas ordens ao pé da
 * letra por três turnos. Decisão da dona: sem estoque, a IA não insiste —
 * passa a cliente para a Marília atender pessoalmente.
 *
 * Por isso a decisão mora aqui, com dado da Nuvemshop, e não no prompt.
 *
 *   tem          → há peça com estoque que atende ao pedido: segue vendendo
 *   esgotou E1   → ela NOMEOU uma peça e essa peça zerou (mesmo com outras
 *                  disponíveis: oferecer outra por cima é a repetição que a
 *                  reunião reprovou)
 *   esgotou E2   → nada disponível bateu, mas alguma esgotada bateu
 *   sem_tamanho  → a peça existe, o tamanho dela está zerado (E3)
 *   nao_existe   → a loja não tem nada parecido
 *
 * "Nomeou" = a esgotada ganha das disponíveis em pontos de NOME. "vestido"
 * sozinho dá 3 pontos de nome a todo vestido e por isso não decide nada; o
 * que decide é a palavra a mais — "Mônica", "marrom", "Luna".
 * ══════════════════════════════════════════════════════════════════════════
 */
export type SituacaoDoPedido =
  | { tipo: 'tem'; pecas: ProdutoCatalogo[] }
  | { tipo: 'esgotou'; queria: string[]; caso: 'E1' | 'E2' }
  | { tipo: 'sem_tamanho'; queria: string[]; tamanho: string }
  | { tipo: 'nao_existe' }

export function situacaoDoPedido(produtos: ProdutoCatalogo[], f: FiltroCatalogo): SituacaoDoPedido {
  const limite = f.limite ?? 4
  const lista = pontuar(produtos, f)
  if (!lista.length) return { tipo: 'nao_existe' }

  const disponiveis = lista.filter((x) => x.classe === 'tem')
  const faltam = lista.filter((x) => x.classe !== 'tem')
  const tamanho = (f.tamanho ?? '').trim()
  const nomes = (xs: Pontuado[]) => xs.map((x) => x.p.nome).slice(0, limite)

  // Nada disponível bateu: a peça existe sem o tamanho dela (E3) ou esgotou (E2).
  // `queria` leva só as de maior pontuação: "vestido marrom" é o Mônica Marrom,
  // não todo vestido zerado — é o resumo que a Marília lê.
  const doTopo = (xs: Pontuado[]) => {
    const max = Math.max(...xs.map((x) => x.pontos))
    return xs.filter((x) => x.pontos === max)
  }
  if (!disponiveis.length) {
    const semTamanho = faltam.filter((x) => x.classe === 'sem_tamanho')
    if (semTamanho.length) return { tipo: 'sem_tamanho', queria: nomes(doTopo(semTamanho)), tamanho }
    return { tipo: 'esgotou', queria: nomes(doTopo(faltam)), caso: 'E2' }
  }

  // E1 / E3 com outras disponíveis: a peça que ela NOMEOU é a que falta.
  const melhorDisponivel = Math.max(0, ...disponiveis.map((x) => x.pontosNome))
  const nomeadas = faltam.filter((x) => x.pontosNome >= 3 && x.pontosNome > melhorDisponivel)
  if (nomeadas.length) {
    const topo = Math.max(...nomeadas.map((x) => x.pontosNome))
    const alvo = nomeadas.filter((x) => x.pontosNome === topo)
    const esgotadas = alvo.filter((x) => x.classe === 'esgotada')
    if (esgotadas.length) return { tipo: 'esgotou', queria: nomes(esgotadas), caso: 'E1' }
    return { tipo: 'sem_tamanho', queria: nomes(alvo), tamanho }
  }

  return { tipo: 'tem', pecas: disponiveis.map((x) => x.p).slice(0, limite) }
}

/**
 * O tamanho que a CLIENTE escreveu ("no M", "tamanho 38", "uso G"), ou null.
 *
 * Medido no E2E de 08/10/2026: o prompt manda a primeira busca ir só com a
 * palavra, então "Tem a saia Aurora no M?" virou busca "Aurora" sem tamanho,
 * voltou "tem" (há G) e a IA ofereceu o G em vez de passar para a Marília.
 * O tamanho sai da fala dela, não do modelo. Exige a palavra de ligação: um
 * "M" solto no meio da frase não é tamanho.
 */
export function tamanhoNaFala(texto: string): string | null {
  const re = /(?:^|[\s,.;!?(])(?:tamanho|tam\.?|no|na|num|numero|número|n[º°o]\.?|uso|visto|veste|vestir)\s+(?:o\s+|a\s+|do\s+|da\s+)?(PP|P|M|G|GG|XG|EG|EXG|G[1-3]|3[4-9]|4[0-8])(?=$|[\s,.;!?)])/gi
  let ultimo: string | null = null
  for (const m of texto.matchAll(re)) ultimo = m[1].toUpperCase()
  return ultimo
}

export function formatarPreco(v: number | null): string {
  return v === null ? 'preço na loja' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
