/**
 * OS CUPONS DA LOJA — lidos ao vivo, nunca copiados.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Mesma decisão do catálogo (`catalogo.ts`): o CRM NÃO guarda cópia de cupom.
 * Quem cria e apaga cupom é a Marília, na Nuvemshop, quando quiser. Uma cópia
 * no banco teria de ser sincronizada, e o dia em que a sincronia atrasasse a
 * IA ofereceria um código que a loja recusa no checkout — o pior desfecho
 * possível, porque acontece com a cliente já decidida a comprar.
 *
 * Então lê-se a loja, com cache curto. O TTL é maior que o do catálogo (10 min
 * contra 5) porque cupom muda muito menos que estoque.
 *
 * ── DUAS COISAS DIFERENTES: CONHECER E OFERECER ───────────────────────────
 * Este módulo existe para a IA CONHECER os cupons — responder certo quando a
 * cliente chega dizendo "tenho o código X, ainda vale?". Isso é atendimento.
 *
 * OFERECER é outra história e NÃO sai daqui. Se a IA pudesse oferecer todo
 * cupom que encontra, bastaria a Marília criar um cupom de campanha de 10%
 * para a IA passar a dar 10% a quem pedir desconto — inclusive a quem ia
 * pagar o preço cheio. O único cupom que a IA oferece é o de recuperação de
 * carrinho, escolhido a dedo em Ajustes da Máquina de Vendas, e só no caso
 * autorizado pela dica.
 *
 * ── SEM ESCOPO, SEM ESTRAGO ───────────────────────────────────────────────
 * O app da loja hoje tem `read_products, read_customers, read_orders`. Sem
 * `read_coupons` a API responde 403, e este módulo devolve lista vazia com o
 * motivo em vez de estourar: atendimento não pode cair porque a leitura de
 * cupom falhou. Quando o escopo for concedido, passa a funcionar sozinho —
 * não há nada para religar.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { listarTudo } from './cliente'

/** O cupom como a loja o descreve, reduzido ao que o atendimento usa. */
export type Cupom = {
  codigo: string
  /** `percentage`, `absolute` ou `shipping`. */
  tipo: string
  /** 10 para 10%, ou o valor em reais no tipo `absolute`. */
  valor: number
  /** Ligado/desligado pela loja. Desligado não vale, mesmo dentro da validade. */
  ligado: boolean
  inicio: string | null
  fim: string | null
  /** Quantas vezes já foi usado e o teto, quando há. */
  usos: number
  maxUsos: number | null
  /** Valor mínimo do carrinho, quando a loja exige. */
  minimo: number | null
  incluiFrete: boolean
}

export type LeituraDeCupons = {
  cupons: Cupom[]
  /** Nulo quando deu certo. Preenchido quando a leitura não foi possível. */
  motivo: string | null
  lidoEm: string
}

type CupomCru = {
  code: string
  type: string
  value: string | number
  valid: boolean
  start_date: string | null
  end_date: string | null
  used: number
  max_uses: number | null
  min_price: string | number | null
  includes_shipping: boolean
}

const TTL_MS = 10 * 60_000
let cache: { em: number; leitura: LeituraDeCupons } | null = null

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
  return Number.isFinite(n) ? n : 0
}

/**
 * Está valendo HOJE?
 *
 * Três portas, e todas precisam estar abertas: o interruptor da loja, a
 * janela de datas e o teto de usos. A loja devolve `valid` mas não cruza com
 * a data — cupom vencido continua chegando com `valid: true`, e é por isso
 * que a conta é feita aqui.
 */
export function cupomVale(c: Cupom, agora = new Date()): boolean {
  if (!c.ligado) return false
  if (c.inicio && new Date(c.inicio) > agora) return false
  // A data de fim da loja é o último DIA válido, não o instante: soma-se o dia.
  if (c.fim && new Date(new Date(c.fim).getTime() + 86_400_000) < agora) return false
  if (c.maxUsos != null && c.usos >= c.maxUsos) return false
  return true
}

/** Todos os cupons da loja, com o cache curto. */
export async function lerCupons(forcar = false): Promise<LeituraDeCupons> {
  if (!forcar && cache && Date.now() - cache.em < TTL_MS) return cache.leitura

  let leitura: LeituraDeCupons
  try {
    const crus = await listarTudo<CupomCru>('/coupons')
    leitura = {
      cupons: crus.map((c) => ({
        codigo: c.code,
        tipo: c.type,
        valor: numero(c.value),
        ligado: Boolean(c.valid),
        inicio: c.start_date,
        fim: c.end_date,
        usos: numero(c.used),
        maxUsos: c.max_uses == null ? null : numero(c.max_uses),
        minimo: c.min_price == null ? null : numero(c.min_price),
        incluiFrete: Boolean(c.includes_shipping),
      })),
      motivo: null,
      lidoEm: new Date().toISOString(),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const semEscopo = /read_coupons|403/.test(msg)
    leitura = {
      cupons: [],
      motivo: semEscopo
        ? 'o app da loja ainda não tem permissão de ler cupons (read_coupons)'
        : `não deu para ler os cupons: ${msg.slice(0, 120)}`,
      lidoEm: new Date().toISOString(),
    }
  }

  // O cache guarda o fracasso também, e de propósito: sem escopo, TODA
  // conversa tentaria de novo e pagaria 403 do balde de requisições.
  cache = { em: Date.now(), leitura }
  return leitura
}

/** Só os que valem agora. */
export async function cuponsVigentes(): Promise<Cupom[]> {
  const { cupons } = await lerCupons()
  return cupons.filter((c) => cupomVale(c))
}

/**
 * Um código que a cliente digitou, conferido.
 *
 * Devolve `null` quando a loja não tem esse código, e o cupom quando tem —
 * valendo ou não. Quem chama decide o que dizer, porque "não existe" e
 * "existe mas venceu" merecem respostas diferentes.
 */
export async function acharCupom(codigo: string): Promise<Cupom | null> {
  const alvo = codigo.trim().toUpperCase()
  if (!alvo) return null
  const { cupons } = await lerCupons()
  return cupons.find((c) => c.codigo.trim().toUpperCase() === alvo) ?? null
}

/** Como se escreve o desconto na conversa. */
export function descreverDesconto(c: Cupom): string {
  if (c.tipo === 'shipping') return 'frete grátis'
  if (c.tipo === 'percentage') return `${c.valor.toString().replace('.', ',')}% de desconto`
  return `R$ ${c.valor.toFixed(2).replace('.', ',')} de desconto`
}

/** Uma linha por cupom, pronta para entrar na dica que a IA lê. */
export function descreverParaIA(cupons: Cupom[]): string {
  if (!cupons.length) return ''
  return cupons
    .map((c) => {
      const partes = [`${c.codigo}: ${descreverDesconto(c)}`]
      if (c.minimo) partes.push(`só acima de R$ ${c.minimo.toFixed(2).replace('.', ',')}`)
      if (c.fim) {
        const d = new Date(c.fim).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
        partes.push(`vale até ${d}`)
      }
      return partes.join(', ')
    })
    .join(' · ')
}
