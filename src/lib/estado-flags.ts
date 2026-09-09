/**
 * Marca d'água estilizada das bandeiras estaduais para o mapa do Radar.
 *
 * Não são as bandeiras oficiais: cada UF é representada pelas suas faixas/cores
 * características (topo → base) mais um símbolo central simplificado (estrela,
 * losango, círculo, sol...) inspirado no principal elemento da bandeira real,
 * renderizados em baixa opacidade atrás do número de contatos. O objetivo é dar
 * identidade visual ao estado sem depender de nenhum asset externo — segue sendo
 * uma aproximação estilizada, não uma reprodução fiel do brasão/bandeira oficial.
 */

export const ESTADO_FLAG_BANDS: Record<string, string[]> = {
  AC: ['#009c3b', '#f5f5f5', '#ffcc00'],
  AL: ['#e01e37', '#f5f5f5', '#0038a8'],
  AP: ['#009c3b', '#ffcc00', '#0033a0'],
  AM: ['#f5f5f5', '#da020e', '#0038a8'],
  BA: ['#c8102e', '#f5f5f5', '#0038a8'],
  CE: ['#009c3b', '#ffdf00', '#002776'],
  DF: ['#009639', '#f5f5f5', '#009639'],
  ES: ['#0038a8', '#f5f5f5', '#e75480'],
  GO: ['#009c3b', '#ffdf00', '#002776'],
  MA: ['#e01e37', '#f5f5f5', '#0038a8'],
  MT: ['#0038a8', '#ffdf00', '#009c3b'],
  MS: ['#0038a8', '#f5f5f5', '#ffdf00'],
  MG: ['#f5f5f5', '#e01e37', '#f5f5f5'],
  PA: ['#f5f5f5', '#e01e37', '#0038a8'],
  PB: ['#e01e37', '#111111', '#e01e37'],
  PR: ['#009c3b', '#f5f5f5', '#0038a8'],
  PE: ['#0038a8', '#f5f5f5', '#e01e37'],
  PI: ['#009c3b', '#ffdf00', '#002776'],
  RJ: ['#f5f5f5', '#0038a8', '#f5f5f5'],
  RN: ['#ffdf00', '#009c3b', '#f5f5f5'],
  RS: ['#009c3b', '#ffdf00', '#e01e37'],
  RO: ['#0038a8', '#f5f5f5', '#009c3b'],
  RR: ['#0038a8', '#ffdf00', '#009c3b'],
  SC: ['#e01e37', '#f5f5f5', '#009c3b'],
  SP: ['#111111', '#f5f5f5', '#e01e37'],
  SE: ['#009c3b', '#ffdf00', '#f5f5f5'],
  TO: ['#ffcc00', '#f5f5f5', '#0038a8'],
}

export function flagBands(uf: string): string[] {
  return ESTADO_FLAG_BANDS[uf] ?? ['#3a3a3a', '#2a2a2a']
}

// ─── Símbolo central (versão "detalhada") ──────────────────────────────────
export type FlagEmblem = 'star' | 'diamond' | 'circle' | 'cross' | 'sun' | 'none'

export interface FlagDetail {
  emblem: FlagEmblem
  color: string
}

export const ESTADO_FLAG_DETAIL: Record<string, FlagDetail> = {
  AC: { emblem: 'star', color: '#e01e37' },
  AL: { emblem: 'cross', color: '#e01e37' },
  AP: { emblem: 'star', color: '#ffcc00' },
  AM: { emblem: 'star', color: '#e01e37' },
  BA: { emblem: 'cross', color: '#f5f5f5' },
  CE: { emblem: 'star', color: '#f5f5f5' },
  DF: { emblem: 'diamond', color: '#ffcc00' },
  ES: { emblem: 'star', color: '#f5f5f5' },
  GO: { emblem: 'star', color: '#f5f5f5' },
  MA: { emblem: 'star', color: '#f5f5f5' },
  MT: { emblem: 'diamond', color: '#ffdf00' },
  MS: { emblem: 'star', color: '#f5f5f5' },
  MG: { emblem: 'diamond', color: '#009c3b' },
  PA: { emblem: 'circle', color: '#0038a8' },
  PB: { emblem: 'star', color: '#f5f5f5' },
  PR: { emblem: 'sun', color: '#ffcc00' },
  PE: { emblem: 'diamond', color: '#f5f5f5' },
  PI: { emblem: 'star', color: '#f5f5f5' },
  RJ: { emblem: 'circle', color: '#ffcc00' },
  RN: { emblem: 'star', color: '#0038a8' },
  RS: { emblem: 'diamond', color: '#f5f5f5' },
  RO: { emblem: 'star', color: '#ffcc00' },
  RR: { emblem: 'sun', color: '#ffcc00' },
  SC: { emblem: 'circle', color: '#f5f5f5' },
  SP: { emblem: 'cross', color: '#f5f5f5' },
  SE: { emblem: 'star', color: '#f5f5f5' },
  TO: { emblem: 'star', color: '#ffcc00' },
}

export function flagDetail(uf: string): FlagDetail {
  return ESTADO_FLAG_DETAIL[uf] ?? { emblem: 'none', color: '#f5f5f5' }
}
