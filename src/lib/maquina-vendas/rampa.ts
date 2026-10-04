/**
 * RAMPA — quantas conversas NOVAS o número pode abrir hoje.
 *
 * Portado da CarBoss (`rampa.ts`), que a herdou do Atende Base depois de um
 * número perdido em 17/08/2026 por uma curva de 12 → 91 aberturas em dois dias.
 *
 * O teto é de ABERTURA, não de mensagem: abrir conversa com quem nunca falou
 * gasta reputação; seguir uma conversa que já existe gera. Só a etapa 1 de cada
 * cadência é abertura.
 *
 * Na Doce Lilium a rampa só limita com `MV_RAMPA=on` (o número já tem
 * histórico de conversa da loja). Ligar é a recomendação antes do primeiro
 * drop grande; o estado aparece na aba Prontidão.
 */

import prisma from '@/lib/prisma'
import { inicioDoDiaSP } from './janela'
import { MENSAGEM_STATUS } from './config'

export const CURSOR_RAMPA_INICIO = 'mv:rampa_inicio'

/** Aberturas permitidas por dia de rampa. Nenhum degrau passa de 1,5× o anterior. */
export const RAMPA = [12, 18, 27, 36] as const
export const DIAS_DE_RAMPA = RAMPA.length
export const ETAPA_DE_ABERTURA = 1

export interface EstadoDaRampa {
  ativa: boolean
  dia: number | null
  degrau: number | null
  aberturasHoje: number
  restante: number | null
  motivo: string
}

/** Puro: em que degrau a rampa está, dado quantos dias de calendário SP se passaram. */
export function degrauDoDia(dias: number): number | null {
  if (dias < 0) return RAMPA[0]
  return dias < RAMPA.length ? RAMPA[dias] : null
}

/** Quantos dias de calendário SP separam duas datas. */
export function diasDeCalendarioSP(de: Date, ate: Date): number {
  return Math.round((inicioDoDiaSP(ate).getTime() - inicioDoDiaSP(de).getTime()) / 86_400_000)
}

/** Puro: o estado da rampa a partir das leituras. É o que a bateria exercita. */
export function calcularRampa(valorCursor: string | null, aberturasHoje: number, agora: Date): EstadoDaRampa {
  if (valorCursor === null) {
    return { ativa: false, dia: null, degrau: null, aberturasHoje, restante: null, motivo: 'rampa não iniciada — sem limite de abertura' }
  }
  const inicio = new Date(valorCursor)
  if (Number.isNaN(inicio.getTime())) {
    // Cursor ilegível NÃO libera: o custo de abrir demais é perder o número.
    return {
      ativa: true,
      dia: 1,
      degrau: RAMPA[0],
      aberturasHoje,
      restante: Math.max(0, RAMPA[0] - aberturasHoje),
      motivo: `rampa_inicio ilegível ("${valorCursor.slice(0, 30)}") — assumindo o primeiro degrau`,
    }
  }
  const dias = diasDeCalendarioSP(inicio, agora)
  const degrau = degrauDoDia(dias)
  if (degrau === null) {
    return {
      ativa: false,
      dia: dias + 1,
      degrau: null,
      aberturasHoje,
      restante: null,
      motivo: `rampa concluída (${DIAS_DE_RAMPA} dias) — quem limita agora é o teto diário`,
    }
  }
  const restante = Math.max(0, degrau - aberturasHoje)
  return {
    ativa: true,
    dia: dias + 1,
    degrau,
    aberturasHoje,
    restante,
    motivo:
      restante > 0
        ? `rampa dia ${dias + 1}/${DIAS_DE_RAMPA}: ${aberturasHoje}/${degrau} aberturas`
        : `rampa dia ${dias + 1}/${DIAS_DE_RAMPA}: teto de ${degrau} abertura(s) atingido`,
  }
}

export async function estadoDaRampa(agora: Date): Promise<EstadoDaRampa> {
  const [aberturasHoje, cursor] = await Promise.all([
    prisma.mvMensagem.count({
      where: { status: MENSAGEM_STATUS.ENVIADA, etapaOrdem: ETAPA_DE_ABERTURA, enviadaEm: { gte: inicioDoDiaSP(agora) } },
    }),
    prisma.mvCursor.findUnique({ where: { chave: CURSOR_RAMPA_INICIO } }),
  ])
  return calcularRampa(cursor?.valor ?? null, aberturasHoje, agora)
}

/** Marca hoje como o dia 1 da rampa, se ela ainda não tiver começado. */
export async function iniciarRampa(agora: Date, forcar = false): Promise<Date> {
  const existente = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_RAMPA_INICIO } })
  if (existente && !forcar) return new Date(existente.valor)
  const valor = agora.toISOString()
  await prisma.mvCursor.upsert({
    where: { chave: CURSOR_RAMPA_INICIO },
    create: { chave: CURSOR_RAMPA_INICIO, valor },
    update: { valor },
  })
  return agora
}
