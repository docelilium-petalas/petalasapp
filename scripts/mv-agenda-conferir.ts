/**
 * A RÉGUA AGUENTA UM CARRINHO VELHO? — conferência da agenda, sem banco.
 *
 *   npx tsx scripts/mv-agenda-conferir.ts
 *
 * Simula a semeadura de um carrinho com a idade que a Nuvemshop realmente
 * entrega e imprime quando cada etapa sairia, nos dois modelos:
 *
 *   ANTES  todas as etapas contando do abandono
 *   AGORA  a primeira do abandono, as seguintes da entrega da anterior
 *
 * Se o "ANTES" mostrar duas ou três etapas no mesmo minuto, é a rajada — o
 * defeito que `agenda.ts` existe para impedir. Este script é a prova de que
 * ela não volta.
 */

import { agendarEtapas } from '../src/lib/maquina-vendas/agenda'
import { dentroDaJanela, proximaAbertura, type Ajustes } from '../src/lib/maquina-vendas/config'

const AJUSTES: Ajustes = {
  tetoDiario: 40,
  intervaloMinMinutos: 3,
  intervaloMaxMinutos: 12,
  janelaInicio: '09:00',
  janelaFim: '20:00',
  envioPausado: true,
  cupomCarrinho: null,
  descontoCarrinho: null,
}

const REGUA = [
  { ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho' },
  { ordem: 2, delayMinutos: 24 * 60, ancoradaEm: 'entrega' },
  { ordem: 3, delayMinutos: 48 * 60, ancoradaEm: 'entrega' },
]

/** O modelo antigo, reproduzido aqui só para a comparação ter um lado. */
function modeloAntigo(ancora: Date, delays: number[]): Date[] {
  return delays.map((d) => {
    const alvo = new Date(ancora.getTime() + d * 60_000)
    const agora = new Date()
    const base = alvo < agora ? agora : alvo
    return dentroDaJanela(AJUSTES, base) ? base : proximaAbertura(AJUSTES, base)
  })
}

const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function intervalos(datas: Date[]): string {
  const gaps: string[] = []
  for (let i = 1; i < datas.length; i++) {
    const h = (datas[i].getTime() - datas[i - 1].getTime()) / 3_600_000
    gaps.push(h < 0.02 ? 'MESMO INSTANTE' : `+${h.toFixed(1)}h`)
  }
  return gaps.join('   ')
}

for (const idadeHoras of [1, 6, 27, 71]) {
  const ancora = new Date(Date.now() - idadeHoras * 3_600_000)
  console.log(`\n${'═'.repeat(72)}\nCARRINHO COM ${idadeHoras}h QUANDO A VARREDURA O ENCONTRA\n${'═'.repeat(72)}`)

  const antes = modeloAntigo(ancora, REGUA.map((e) => e.delayMinutos))
  const agora = agendarEtapas({ ancora, etapas: REGUA, ajustes: AJUSTES })

  console.log(`  ANTES  ${antes.map(fmt).join('   ')}`)
  console.log(`         ${intervalos(antes)}`)
  console.log(`  AGORA  ${agora.map(fmt).join('   ')}`)
  console.log(`         ${intervalos(agora)}`)

  const colapsou = agora.some((d, i) => i > 0 && d.getTime() - agora[i - 1].getTime() < 60 * 60_000)
  console.log(`  ${colapsou ? '✗ AINDA COLAPSA' : '✓ sem rajada'}`)
}
console.log()
