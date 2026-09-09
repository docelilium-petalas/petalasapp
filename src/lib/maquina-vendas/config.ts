/**
 * OS NÚMEROS DA MÁQUINA — e a janela em que ela pode falar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Precedência, e o motivo de ser esta:
 *
 *     banco (maquina_vendas_ajustes)  →  env  →  default do código
 *
 * O banco ganha porque é o único lugar que a operação altera às 9h de um dia
 * de disparo, pela tela. A env é o valor de partida de um ambiente novo, e o
 * default do código é a rede de segurança de um banco vazio.
 *
 * Isso importa aqui mais do que na origem: o EasyPanel deste projeto não tem
 * `autoDeploy`, então TODO push exige Deploy manual. Um parâmetro que se muda
 * olhando o relógio não pode custar um deploy.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'

export type Ajustes = {
  tetoDiario: number
  intervaloMinMinutos: number
  intervaloMaxMinutos: number
  janelaInicio: string
  janelaFim: string
  envioPausado: boolean
}

const PADRAO: Ajustes = {
  tetoDiario: 40,
  intervaloMinMinutos: 3,
  intervaloMaxMinutos: 12,
  janelaInicio: '09:00',
  janelaFim: '20:00',
  // NASCE PAUSADO. A Máquina fala com cliente real; ela não deve começar a
  // falar por causa de um deploy, e sim porque alguém decidiu ligar.
  envioPausado: true,
}

function daEnv(): Partial<Ajustes> {
  const num = (v: string | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  return {
    tetoDiario: num(process.env.MV_TETO_DIARIO),
    intervaloMinMinutos: num(process.env.MV_INTERVALO_MIN_MINUTOS),
    intervaloMaxMinutos: num(process.env.MV_INTERVALO_MAX_MINUTOS),
    janelaInicio: process.env.MV_JANELA_INICIO || undefined,
    janelaFim: process.env.MV_JANELA_FIM || undefined,
  }
}

/**
 * Sem cache de propósito: os números são editáveis pela tela a qualquer
 * momento, e um cache de processo faria a Máquina seguir com o teto velho até
 * o próximo deploy — o defeito mais chato de diagnosticar, porque funciona em
 * todo lugar menos onde importa.
 */
export async function obterAjustes(): Promise<Ajustes> {
  let doBanco: Partial<Ajustes> = {}
  try {
    const linha = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
    if (linha) {
      doBanco = {
        tetoDiario: linha.tetoDiario,
        intervaloMinMinutos: linha.intervaloMinMinutos,
        intervaloMaxMinutos: linha.intervaloMaxMinutos,
        janelaInicio: linha.janelaInicio,
        janelaFim: linha.janelaFim,
        envioPausado: linha.envioPausado,
      }
    }
  } catch {
    // tabela ainda não migrada: cai para env/default em vez de derrubar a tela
  }
  const env = daEnv()
  return {
    tetoDiario: doBanco.tetoDiario ?? env.tetoDiario ?? PADRAO.tetoDiario,
    intervaloMinMinutos: doBanco.intervaloMinMinutos ?? env.intervaloMinMinutos ?? PADRAO.intervaloMinMinutos,
    intervaloMaxMinutos: doBanco.intervaloMaxMinutos ?? env.intervaloMaxMinutos ?? PADRAO.intervaloMaxMinutos,
    janelaInicio: doBanco.janelaInicio ?? env.janelaInicio ?? PADRAO.janelaInicio,
    janelaFim: doBanco.janelaFim ?? env.janelaFim ?? PADRAO.janelaFim,
    envioPausado: doBanco.envioPausado ?? PADRAO.envioPausado,
  }
}

// ── A JANELA ──────────────────────────────────────────────────────────────
// Tudo é calculado na parede de São Paulo e gravado em UTC. Misturar os dois
// é como uma cadência de "2h depois" vira "1h depois" no horário de verão.

const FUSO = 'America/Sao_Paulo'

/** {hora, minuto, diaDaSemana} de um instante, na parede de São Paulo. */
export function paredeSP(quando: Date): { hora: number; minuto: number; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const partes = Object.fromEntries(fmt.formatToParts(quando).map((p) => [p.type, p.value]))
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    diaSemana: dias[partes.weekday ?? 'Mon'] ?? 1,
  }
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0)
}

/**
 * A Máquina pode falar AGORA?
 *
 * Fim de semana entra na janela de propósito: quem compra roupa compra no
 * sábado, e recuperar carrinho abandonado no domingo é o oposto de incômodo —
 * é o momento em que a pessoa está olhando. Isso difere das origens B2B, onde
 * sábado era invasão.
 */
export function dentroDaJanela(ajustes: Ajustes, quando: Date = new Date()): boolean {
  const { hora, minuto } = paredeSP(quando)
  const agora = hora * 60 + minuto
  return agora >= emMinutos(ajustes.janelaInicio) && agora < emMinutos(ajustes.janelaFim)
}

/** O próximo instante em que a janela abre, a partir de `quando`. */
export function proximaAbertura(ajustes: Ajustes, quando: Date = new Date()): Date {
  const alvo = new Date(quando)
  for (let i = 0; i < 8 * 24 * 60; i += 5) {
    alvo.setTime(quando.getTime() + i * 60_000)
    if (dentroDaJanela(ajustes, alvo)) return alvo
  }
  return alvo
}

/** Chaves de cursor usadas pelo módulo. */
export const CURSOR_ULTIMO_ENVIO = 'mv:ultimo_envio'
export const CURSOR_VARREDURA_CARRINHO = 'mv:varredura_carrinho'
