/**
 * JANELA DE ENVIO — calcula na parede de America/Sao_Paulo, grava em UTC.
 *
 * Portado da CarBoss (`src/lib/maquina-vendas/janela.ts`) com UMA diferença de
 * regra: aqui TODO dia da semana envia. Moda feminina vende no sábado e no
 * domingo, e é quando a cliente está olhando o carrinho — a mesma decisão já
 * tomada em `config.ts → dentroDaJanela`. Na origem o domingo era bloqueado
 * porque estética automotiva não lê o zap no domingo.
 *
 * Offset FIXO de -3h: o Brasil não tem horário de verão desde o decreto
 * 9.772/2019. Se um dia voltar, este é o único lugar a mudar.
 *
 * Este arquivo é puro (sem banco): é o miolo que a bateria `janela` exercita.
 */

const OFFSET_SP_MS = -3 * 60 * 60 * 1000

export type JanelaEnvio = { inicioMin: number; fimMin: number }
export type ParedeSP = {
  ano: number
  mes: number
  dia: number
  hora: number
  minuto: number
  diaSemana: number // 0 = domingo
}

export function paraParedeSP(instante: Date): ParedeSP {
  const d = new Date(instante.getTime() + OFFSET_SP_MS)
  return {
    ano: d.getUTCFullYear(),
    mes: d.getUTCMonth() + 1,
    dia: d.getUTCDate(),
    hora: d.getUTCHours(),
    minuto: d.getUTCMinutes(),
    diaSemana: d.getUTCDay(),
  }
}

export function deParedeSP(ano: number, mes: number, dia: number, hora: number, minuto: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia, hora, minuto) - OFFSET_SP_MS)
}

/**
 * Meia-noite só existe como FIM: "00:00" como início é o minuto 0; como fim é o
 * minuto 1440, o fecho do dia. A tradução acontece aqui, num lugar só.
 */
export const FIM_MEIA_NOITE = 24 * 60
const EH_MEIA_NOITE = (s: string) => {
  const t = String(s).trim()
  return t === '00:00' || t === '24:00' || t === '0:00'
}

/** A janela como par de `TIME` do Postgres. Meia-noite inclusiva é 23:59:59. */
export function janelaParaSql(j: JanelaEnvio): { inicio: string; fim: string } {
  const hhmmss = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`
  return { inicio: hhmmss(j.inicioMin), fim: j.fimMin >= FIM_MEIA_NOITE ? '23:59:59' : hhmmss(j.fimMin) }
}

/** Minutos de parede → "HH:mm". 1440 volta como "00:00". */
export function hhMmDeMinutos(m: number): string {
  if (m === FIM_MEIA_NOITE) return '00:00'
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

export function parseJanela(inicio: string, fim: string): JanelaEnvio {
  const ler = (s: string, nome: string): number => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(s).trim())
    if (!m) throw new Error(`${nome} inválida: "${s}" (esperado HH:mm)`)
    const h = Number(m[1])
    const min = Number(m[2])
    if (h > 23 || min > 59) throw new Error(`${nome} inválida: "${s}"`)
    return h * 60 + min
  }
  const inicioMin = ler(inicio, 'janela início')
  const fimMin = EH_MEIA_NOITE(fim) ? FIM_MEIA_NOITE : ler(fim, 'janela fim')
  if (inicioMin >= fimMin) throw new Error(`janela inválida: início (${inicio}) >= fim (${fim})`)
  return { inicioMin, fimMin }
}

/** Todo dia envia (ver o cabeçalho). Só o horário decide. */
export function dentroDaJanela(instante: Date, j: JanelaEnvio): boolean {
  const p = paraParedeSP(instante)
  const min = p.hora * 60 + p.minuto
  return min >= j.inicioMin && min < j.fimMin
}

export function mesmoDiaSP(a: Date, b: Date): boolean {
  const pa = paraParedeSP(a)
  const pb = paraParedeSP(b)
  return pa.ano === pb.ano && pa.mes === pb.mes && pa.dia === pb.dia
}

/** Abertura da janela do dia seguinte ao instante dado (parede SP). */
export function aberturaDoDiaSeguinte(instante: Date, j: JanelaEnvio): Date {
  const p = paraParedeSP(instante)
  // Meio-dia como pivô: some 24h sem risco de cair no mesmo dia por borda.
  const amanha = new Date(deParedeSP(p.ano, p.mes, p.dia, 12, 0).getTime() + 24 * 3600 * 1000)
  const pa = paraParedeSP(amanha)
  return deParedeSP(pa.ano, pa.mes, pa.dia, Math.floor(j.inicioMin / 60), j.inicioMin % 60)
}

/** Desliza para a próxima abertura da janela. Dentro dela, devolve inalterado. */
export function ajustarParaJanela(instante: Date, j: JanelaEnvio): Date {
  let atual = instante
  for (let i = 0; i < 8; i++) {
    if (dentroDaJanela(atual, j)) return atual
    const p = paraParedeSP(atual)
    const min = p.hora * 60 + p.minuto
    atual =
      min < j.inicioMin
        ? deParedeSP(p.ano, p.mes, p.dia, Math.floor(j.inicioMin / 60), j.inicioMin % 60)
        : aberturaDoDiaSeguinte(atual, j)
  }
  return atual
}

/**
 * Próximo horário válido para a MESMA cliente, garantindo dia diferente da
 * mensagem anterior. Regra herdada: ninguém recebe dois toques de
 * acompanhamento no mesmo dia ("te ajudo com alguma dúvida?" e, duas horas
 * depois, "última chance").
 */
export function proximoDiaAposCliente(alvoDesejado: Date, anterior: Date | null, j: JanelaEnvio): Date {
  let alvo = ajustarParaJanela(alvoDesejado, j)
  if (!anterior) return alvo
  if (alvo <= anterior) alvo = ajustarParaJanela(aberturaDoDiaSeguinte(anterior, j), j)
  for (let i = 0; i < 10 && mesmoDiaSP(alvo, anterior); i++) {
    alvo = ajustarParaJanela(aberturaDoDiaSeguinte(alvo, j), j)
  }
  return alvo
}

/** Nome da origem, mantido para as baterias portadas. */
export const proximoDiaUtilAposLead = proximoDiaAposCliente

/**
 * Distribui N mensagens DA MESMA cliente a partir de um instante — uma por dia.
 * Reagendar em lote com o mesmo horário colapsaria a cadência em minutos.
 */
export function distribuirNaJanela(inicio: Date, quantidade: number, j: JanelaEnvio): Date[] {
  const saida: Date[] = []
  let anterior: Date | null = null
  for (let i = 0; i < quantidade; i++) {
    const alvo = proximoDiaAposCliente(anterior ? aberturaDoDiaSeguinte(anterior, j) : inicio, anterior, j)
    saida.push(alvo)
    anterior = alvo
  }
  return saida
}

/** 00:00 da parede SP como instante UTC — base do teto diário. */
export function inicioDoDiaSP(agora: Date): Date {
  const p = paraParedeSP(agora)
  return deParedeSP(p.ano, p.mes, p.dia, 0, 0)
}

const dois = (n: number) => String(n).padStart(2, '0')
export const formatarDataSP = (i: Date) => {
  const p = paraParedeSP(i)
  return `${dois(p.dia)}/${dois(p.mes)}`
}
export const formatarHoraSP = (i: Date) => {
  const p = paraParedeSP(i)
  return `${dois(p.hora)}:${dois(p.minuto)}`
}

/**
 * QUANTAS MENSAGENS CABEM NO DIA — o limite que o RELÓGIO impõe.
 *
 * O teto da tela é intenção; este é o limite físico. O portão só é reavaliado
 * quando o tique roda, então a espera efetiva é o sorteio médio arredondado
 * para cima no múltiplo do cron.
 */
export function capacidadeDoDia(opts: {
  janela: JanelaEnvio
  cronMinutos: number
  intervaloMinMinutos: number
  intervaloMaxMinutos: number
  mensagensPorTick: number
}): { tiques: number; passoMinutos: number; mensagens: number } {
  const minutos = Math.max(0, opts.janela.fimMin - opts.janela.inicioMin)
  const cron = Math.max(1, opts.cronMinutos)
  const media = (opts.intervaloMinMinutos + opts.intervaloMaxMinutos) / 2
  const passoMinutos = Math.max(cron, Math.ceil(media / cron) * cron)
  const tiques = Math.floor(minutos / passoMinutos)
  return { tiques, passoMinutos, mensagens: tiques * Math.max(1, opts.mensagensPorTick) }
}
