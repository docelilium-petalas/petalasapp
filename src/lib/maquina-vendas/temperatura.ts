/**
 * A TEMPERATURA DE UMA CLIENTE — com quem a equipe deve falar HOJE.
 *
 * Porta de `temperatura.ts` da CarBoss (04/10/2026). O desenho é o mesmo —
 * função PURA, nota que só ordena, motivo em frase curta e veto antes da nota
 * —; o que muda é o que a loja chama de intenção:
 *
 *  · SINAIS: lá eram "pediu reunião" e "perguntou preço do plano". Aqui são
 *    "quero comprar / me manda o link", "tem no meu tamanho?", "quanto fica o
 *    frete?" e "chega até quando?" — as quatro perguntas que separam quem está
 *    olhando de quem está com o cartão na mão.
 *  · VETO: lá "já tem reunião". Aqui "já fez o pedido" — o desfecho que a
 *    Máquina existe para produzir. E o opt-out usa `pediuParaSair` da loja
 *    (`opt-out.ts`), não a lista da origem.
 *  · COLUNAS: as etapas dos funis da loja (`funis-crm.ts`): carrinho, pós-venda.
 *  · "A EQUIPE já está na conversa" no lugar de "a SDR".
 *
 * ── As três coisas que a nota mede, e por que nessa ordem ─────────────────
 *   1. QUANDO ela falou — recência é o sinal mais forte e o único que decai
 *      sozinho.
 *   2. O QUE ela disse — tamanho, frete, prazo e "quero" com objeto.
 *   3. ONDE o card está — pesa MENOS de propósito: carrinho parado há um mês é
 *      etapa avançada e cliente fria.
 */

import { pediuParaSair } from './opt-out'

export type Temperatura = 'QUENTE' | 'MORNO' | 'FRIO'

export interface SinaisDaCliente {
  agora: Date
  /** Última fala DELA, ou null se nunca escreveu. */
  ultimaFalaEm: Date | null
  /** As falas dela, mais recente primeiro. Só as da cliente — eco fica fora. */
  falasDaCliente: readonly string[]
  quantasFalas: number
  /** Quando alguém da equipe escreveu por nós. Null = só robô até aqui. */
  equipeFalouEm: Date | null
  /** A etapa do funil onde o card está AGORA. */
  coluna: string | null
  /** Já fez pedido depois da régua — o desfecho que a Máquina persegue. */
  temPedido: boolean
}

/** Nome da origem, mantido para quem lê a matriz de paridade. */
export type SinaisDoLead = SinaisDaCliente

export interface Leitura {
  temperatura: Temperatura
  /** Só serve para ordenar — não tem unidade nem significado absoluto. */
  pontos: number
  motivos: string[]
  /** A fala dela que mais pesou. Vai citada, entre aspas. */
  frase: string | null
  /** Motivo do veto, ou null. Preenchido = fora da fila. */
  naoLigar: string | null
}

const achatar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const HORA = 3_600_000
const DIA = 24 * HORA

/**
 * ⚠️ Lista curta e literal: falso positivo custa uma abordagem para quem não
 *    pediu nada. Nada de "quero" solto — "quero pensar" é o contrário de
 *    intenção. A primeira regra que casa dá a frase citada; a ordem é de peso.
 */
const SINAIS: ReadonlyArray<{ nome: string; peso: number; re: RegExp }> = [
  {
    nome: 'quer comprar',
    peso: 30,
    re: /\b(quero\s+(comprar|levar|essa|esse|a\s+pe[çc]a|fechar)|vou\s+(levar|querer|comprar)|me\s+(manda|envia|passa)\s+(o\s+)?link|como\s+(fa[çc]o\s+p(ra|ara)\s+)?(compr|pag)|aceita(m)?\s+pix|parcela|cart[ãa]o)\w*/i,
  },
  {
    nome: 'perguntou tamanho',
    peso: 25,
    re: /\b(tem\s+(no\s+)?(tamanho|n[uú]mero)|tamanho\s+(p|pp|m|g|gg|\d{2})\b|qual\s+tamanho|veste\s+(bem|grande|pequeno)|medidas?|tabela\s+de\s+medidas|serve\s+em\s+mim|ainda\s+tem)\b/i,
  },
  {
    nome: 'perguntou frete ou prazo',
    peso: 20,
    re: /\b(frete|entrega|chega\s+(at[ée]|quando|em)|prazo|retirar|retirada|correios|motoboy|quanto\s+(custa|fica|sai))\b/i,
  },
  {
    nome: 'demonstrou interesse',
    peso: 12,
    re: /\b(amei|apaixonad|lind[ao]|que\s+perfeit|tenho\s+interesse|me\s+interessa|outras?\s+cor(es)?|tem\s+(em\s+)?outra\s+cor)\w*/i,
  },
  {
    nome: 'adiou',
    peso: -12,
    re: /\b(mais\s+tarde|semana\s+que\s+vem|m[êe]s\s+que\s+vem|quando\s+(o\s+)?sal[áa]rio|agora\s+n[ãa]o|depois\s+eu\s+(vejo|compro|te\s+chamo)|vou\s+pensar)\b/i,
  },
]

/** Casada por INCLUSÃO no nome achatado: etapa é texto que gente digita. */
const COLUNAS: ReadonlyArray<{ contem: string; peso: number; rotulo: string }> = [
  { contem: 'ultimo', peso: 14, rotulo: 'carrinho no último toque' },
  { contem: 'duvida', peso: 12, rotulo: 'carrinho, fase de dúvida' },
  { contem: 'carrinho', peso: 10, rotulo: 'carrinho abandonado' },
  { contem: 'respond', peso: 16, rotulo: 'respondeu à régua' },
  { contem: 'reativa', peso: 6, rotulo: 'cliente antiga em reativação' },
  { contem: 'pos-venda', peso: 4, rotulo: 'pós-venda' },
  { contem: 'pos venda', peso: 4, rotulo: 'pós-venda' },
]

export const CORTE_QUENTE = 60
export const CORTE_MORNO = 30

function pesoDaRecencia(desde: number): { peso: number; rotulo: string } {
  const emHoras = Math.max(1, Math.round(desde / HORA))
  const emDias = Math.max(1, Math.round(desde / DIA))
  if (desde <= 6 * HORA) return { peso: 45, rotulo: `falou há ${emHoras}h` }
  if (desde <= DIA) return { peso: 35, rotulo: `falou há ${emHoras}h` }
  if (desde <= 3 * DIA) return { peso: 22, rotulo: `falou há ${emDias} dias` }
  if (desde <= 7 * DIA) return { peso: 10, rotulo: `falou há ${emDias} dias` }
  return { peso: 3, rotulo: `falou há ${emDias} dias` }
}

const citar = (f: string) => f.trim().replace(/\s+/g, ' ').slice(0, 160)

/** NUNCA lança: uma cliente com dado torto não derruba o relatório do dia. */
export function lerTemperatura(s: SinaisDaCliente): Leitura {
  const motivos: string[] = []
  let pontos = 0
  const falas = (s.falasDaCliente ?? []).map((f) => String(f ?? '')).filter((f) => f.trim() !== '')

  // ── O veto vem antes da nota ────────────────────────────────────────────
  const parou = falas.find((f) => pediuParaSair(f).saiu)
  if (parou) {
    return { temperatura: 'FRIO', pontos: 0, motivos: ['pediu para parar'], frase: citar(parou), naoLigar: 'pediu para parar de receber mensagem' }
  }
  if (s.temPedido) {
    return {
      temperatura: 'QUENTE',
      pontos: 0,
      motivos: ['já fez o pedido'],
      frase: null,
      naoLigar: 'já comprou — aqui a conversa é de pós-venda, não de venda',
    }
  }

  // ── 1. Quando falou ─────────────────────────────────────────────────────
  if (s.ultimaFalaEm) {
    const r = pesoDaRecencia(Math.max(0, s.agora.getTime() - s.ultimaFalaEm.getTime()))
    pontos += r.peso
    motivos.push(r.rotulo)
    pontos += Math.min(Math.max(0, s.quantasFalas), 5) * 4
    if (s.quantasFalas >= 3) motivos.push(`${s.quantasFalas} falas na conversa`)
  } else {
    motivos.push('nunca respondeu')
  }

  // ── 2. O que disse (só as três falas mais recentes) ─────────────────────
  const recentes = falas.slice(0, 3)
  let frase: string | null = null
  for (const sinal of SINAIS) {
    const casou = recentes.find((f) => sinal.re.test(f))
    if (!casou) continue
    pontos += sinal.peso
    motivos.push(sinal.nome)
    if (!frase && sinal.peso > 0) frase = citar(casou)
  }
  if (!frase && recentes[0]) frase = citar(recentes[0])

  // ── 3. Onde o card está ─────────────────────────────────────────────────
  const coluna = s.coluna ? achatar(s.coluna) : ''
  const casa = coluna ? COLUNAS.find((c) => coluna.includes(c.contem)) : undefined
  if (casa) {
    pontos += casa.peso
    motivos.push(casa.rotulo)
  }

  // ⚠️ A equipe já estar na conversa DERRUBA a nota: a fila é de quem ela
  //    ainda NÃO atendeu.
  if (s.equipeFalouEm && s.agora.getTime() - s.equipeFalouEm.getTime() <= 2 * DIA) {
    pontos -= 30
    motivos.push('a equipe já está na conversa')
  }

  pontos = Math.max(0, pontos)
  const temperatura: Temperatura = pontos >= CORTE_QUENTE ? 'QUENTE' : pontos >= CORTE_MORNO ? 'MORNO' : 'FRIO'
  return { temperatura, pontos, motivos, frase, naoLigar: null }
}

export function seloDaTemperatura(t: Temperatura): string {
  return t === 'QUENTE' ? '🔥' : t === 'MORNO' ? '🌤️' : '❄️'
}
