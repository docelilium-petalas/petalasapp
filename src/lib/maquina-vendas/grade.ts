/**
 * A GRADE DE VAGAS — onde cabe a próxima mensagem, e o que já está ocupado.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Uma vaga é livre quando: nada está a menos de `minimoMs` dela, o dia não
 * estourou o teto, e a MESMA inscrição ainda não tem mensagem naquele dia.
 *
 * ── Por que existe (14/08/2026) ───────────────────────────────────────────
 * A regra "uma mensagem por lead por dia" era testada e funcionava — mas vivia
 * só no caminho da semeadura. O caminho que desliza mensagem vencida para a
 * próxima abertura da janela não a conhecia, e empilhou etapas no mesmo
 * instante: o lead Fabricio recebeu a etapa 1 às 15:35Z e a etapa 2 às 15:50Z,
 * as duas agendadas para 10:30:00.000Z cravadas. A medição do estrago: 74
 * inscrições com duas ou mais mensagens no mesmo dia, 150 mensagens.
 *
 * O guard anti-rajada do despachante não segurava porque o escopo dele é o
 * TIQUE ("nunca duas da mesma cadência no mesmo tick"); em tiques diferentes
 * passa.
 *
 * O desenho veio do módulo homônimo do projeto Marcos Jr, onde a mesma lógica
 * tinha sido escrita quatro vezes e divergido — 719 mensagens abaixo do
 * intervalo mínimo, duas no mesmo minuto. A lição portada é a de lugar único:
 * quem semeia e quem reencaixa perguntam AQUI, senão as cópias divergem de
 * novo e o sintoma volta com outra cara.
 *
 * Não há Prisma nem relógio aqui: recebe horários, devolve horários. É o que
 * deixa `scripts/test-mv/grade.ts` exercitar cada regra sem tocar em banco.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { aberturaDoDiaSeguinte, ajustarParaJanela, paraParedeSP, type JanelaEnvio } from './janela'

export type OpcoesDaGrade = {
  /** Silêncio mínimo entre duas mensagens quaisquer, em milissegundos. */
  minimoMs: number
  /** Passo de varredura ao procurar vaga. O intervalo médio. */
  passoMs: number
  janela: JanelaEnvio
}

export type Ocupacao = { quando: number; inscricaoId?: string }

export type PedidoDeVaga = {
  /** Sem isto a grade não consegue aplicar "uma por cliente por dia". */
  inscricaoId?: string
  /** Um dia com este número de mensagens está cheio. */
  tetoPorDia?: number
  /** Nada depois disto; devolve null. */
  teto?: Date | null
}

/** `YYYY-MM-DD` na parede de São Paulo — a chave dos tetos por dia. */
export function diaDaGrade(t: Date): string {
  const p = paraParedeSP(t)
  return `${p.ano}-${String(p.mes).padStart(2, '0')}-${String(p.dia).padStart(2, '0')}`
}

export class GradeDeVagas {
  /** Sempre crescente — é o que permite a busca binária. */
  private readonly ocupados: number[] = []
  private readonly porDia = new Map<string, number>()
  /**
   * inscrição → dia → quantas mensagens dela caem nesse dia.
   *
   * Contagem, e não um Set de dias, por causa do `liberar`: remarcar UMA de
   * duas mensagens da mesma inscrição no mesmo dia não pode abrir o dia para
   * uma terceira. Com Set, o primeiro `liberar` apagaria o dia inteiro.
   */
  private readonly porInscricaoDia = new Map<string, Map<string, number>>()

  constructor(ocupacoes: Iterable<Ocupacao>, private readonly opcoes: OpcoesDaGrade) {
    for (const o of ocupacoes) this.ocupar(o)
  }

  get tamanho(): number {
    return this.ocupados.length
  }

  ocupadasNoDia(dia: string): number {
    return this.porDia.get(dia) ?? 0
  }

  /** A inscrição já tem mensagem neste dia? É a regra "uma por cliente por dia". */
  inscricaoOcupadaNoDia(inscricaoId: string, dia: string): boolean {
    return (this.porInscricaoDia.get(inscricaoId)?.get(dia) ?? 0) > 0
  }

  /** O primeiro índice cujo valor é >= `alvo`. */
  private indiceDe(alvo: number): number {
    let lo = 0
    let hi = this.ocupados.length
    while (lo < hi) {
      const meio = (lo + hi) >> 1
      if (this.ocupados[meio] < alvo) lo = meio + 1
      else hi = meio
    }
    return lo
  }

  /**
   * O horário ocupado que impede `t`, ou null.
   *
   * Devolve o HORÁRIO, não um booleano, porque quem procura vaga precisa saber
   * para onde saltar — com true/false o laço andaria de um passo por vez e uma
   * região cheia viraria milhares de voltas.
   *
   * ⚠️ `- minimoMs + 1`, e não `- minimoMs`: distância EXATAMENTE igual ao
   * mínimo é aceita, dos dois lados. O mínimo é o silêncio exigido, não um
   * valor proibido — o despachante libera quando já passaram os N minutos, não
   * quando passou mais que N. Fechar esse limite faria a fila atual, cheia de
   * intervalos cravados, parecer conflitante consigo mesma no primeiro
   * reencaixe. (Detalhe herdado do módulo do Marcos Jr, onde as quatro cópias
   * usavam `Math.abs(...) < minimoMs` e a correção custou um incidente.)
   */
  conflito(t: number): number | null {
    const i = this.indiceDe(t - this.opcoes.minimoMs + 1)
    const c = this.ocupados[i]
    return c !== undefined && c < t + this.opcoes.minimoMs ? c : null
  }

  livre(t: number): boolean {
    return this.conflito(t) === null
  }

  ocupar(o: Ocupacao | Date | number): void {
    const oc: Ocupacao =
      typeof o === 'number' ? { quando: o } : o instanceof Date ? { quando: o.getTime() } : o
    this.ocupados.splice(this.indiceDe(oc.quando), 0, oc.quando)
    const d = diaDaGrade(new Date(oc.quando))
    this.porDia.set(d, (this.porDia.get(d) ?? 0) + 1)
    if (oc.inscricaoId) {
      const dias = this.porInscricaoDia.get(oc.inscricaoId) ?? new Map<string, number>()
      dias.set(d, (dias.get(d) ?? 0) + 1)
      this.porInscricaoDia.set(oc.inscricaoId, dias)
    }
  }

  /** Devolve o horário à grade — é o que permite remarcar uma mensagem. */
  liberar(o: Ocupacao | Date | number): boolean {
    const oc: Ocupacao =
      typeof o === 'number' ? { quando: o } : o instanceof Date ? { quando: o.getTime() } : o
    const i = this.indiceDe(oc.quando)
    if (this.ocupados[i] !== oc.quando) return false
    this.ocupados.splice(i, 1)
    const d = diaDaGrade(new Date(oc.quando))
    this.porDia.set(d, Math.max(0, (this.porDia.get(d) ?? 1) - 1))
    if (oc.inscricaoId) {
      const dias = this.porInscricaoDia.get(oc.inscricaoId)
      const restam = (dias?.get(d) ?? 1) - 1
      if (dias) {
        if (restam > 0) dias.set(d, restam)
        else dias.delete(d)
      }
    }
    return true
  }

  /**
   * A primeira vaga livre a partir de `desejado`, dentro da janela.
   *
   * Devolve `null` quando não cabe até o teto — nunca um horário fora das
   * regras. Quem chama decide o que fazer com o null; inventar horário aqui
   * seria o mesmo que não ter grade.
   */
  vaga(desejado: Date, pedido: PedidoDeVaga = {}): Date | null {
    const { inscricaoId, tetoPorDia, teto } = pedido
    let cand = ajustarParaJanela(desejado, this.opcoes.janela)

    // Cada volta salta para DEPOIS de um conflito, então o laço só anda para a
    // frente e termina. O teto de voltas é rede contra dado corrompido — uma
    // janela vazia, um horário absurdo na grade — não a regra.
    for (let i = 0; i < 200_000; i++) {
      if (teto && cand.getTime() > teto.getTime()) return null
      const dia = diaDaGrade(cand)

      if (inscricaoId && this.inscricaoOcupadaNoDia(inscricaoId, dia)) {
        cand = aberturaDoDiaSeguinte(cand, this.opcoes.janela)
        continue
      }
      if (tetoPorDia !== undefined && this.ocupadasNoDia(dia) >= tetoPorDia) {
        cand = aberturaDoDiaSeguinte(cand, this.opcoes.janela)
        continue
      }
      const c = this.conflito(cand.getTime())
      if (c === null) return cand
      cand = ajustarParaJanela(new Date(c + this.opcoes.passoMs), this.opcoes.janela)
    }
    return null
  }
}
