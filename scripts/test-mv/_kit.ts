/**
 * Kit mínimo da bateria da Máquina de Vendas — sem framework, como o resto de
 * `scripts/`. O nível 1 vem pronto de `bateria-pura.ts` e só é impresso aqui;
 * os níveis 2 e 3 chamam `grupo()` e `checa()` direto, e `fechar()` sai com 1
 * se algo falhou, para o `npm run test:mv` quebrar de verdade.
 */

import type { ResultadoDaBateria } from '../../src/lib/maquina-vendas/bateria-pura'

let passou = 0
let falhou = 0
const falhas: string[] = []
let grupoAtual = ''

export function grupo(titulo: string): void {
  grupoAtual = titulo
  console.log(`\n── ${titulo} ${'─'.repeat(Math.max(0, 66 - titulo.length))}`)
}

export function checa(condicao: boolean, oQue: string, detalhe?: unknown): void {
  if (condicao) {
    passou++
    console.log(`  ✓ ${oQue}`)
    return
  }
  falhou++
  falhas.push(`${grupoAtual} › ${oQue}`)
  console.log(`  ✗ ${oQue}${detalhe === undefined ? '' : `\n      ${typeof detalhe === 'string' ? detalhe : JSON.stringify(detalhe)}`}`)
}

export function igual<T>(obtido: T, esperado: T, oQue: string): void {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado)
  checa(ok, oQue, ok ? undefined : `esperado ${JSON.stringify(esperado)} · obtido ${JSON.stringify(obtido)}`)
}

export async function lanca(fn: () => unknown | Promise<unknown>, oQue: string, filtro?: (e: unknown) => boolean): Promise<void> {
  try {
    await fn()
    checa(false, oQue, 'não lançou')
  } catch (e) {
    checa(filtro ? filtro(e) : true, oQue, e instanceof Error ? e.message : e)
  }
}

export function placar(): { passou: number; falhou: number; falhas: string[] } {
  return { passou, falhou, falhas: [...falhas] }
}

export function fechar(nome: string): never {
  console.log('\n' + '─'.repeat(70))
  console.log(`${nome}: ${passou} passaram · ${falhou} falharam`)
  if (falhou) {
    console.log('\nFalhas:')
    for (const f of falhas) console.log(`  ✗ ${f}`)
    process.exit(1)
  }
  process.exit(0)
}

/** Imprime um resultado já coletado (o nível 1). Devolve `true` se tudo passou. */
export function imprimirBateria(nome: string, r: ResultadoDaBateria): boolean {
  for (const g of r.grupos) {
    const marca = g.falhou ? '✗' : '✓'
    console.log(`  ${marca} ${g.titulo.padEnd(58)} ${String(g.passou).padStart(3)} ok${g.falhou ? ` · ${g.falhou} falha(s)` : ''}`)
    for (const f of g.falhas) console.log(`      ✗ ${f.oQue}${f.detalhe ? `\n        ${f.detalhe}` : ''}`)
  }
  console.log('\n' + '─'.repeat(70))
  console.log(`${nome}: ${r.passou} passaram · ${r.falhou} falharam`)
  if (r.parouEm) console.log(`  ✗ parou em ${r.parouEm}`)
  return r.falhou === 0
}

/** Data na parede de São Paulo (UTC-3, sem horário de verão desde 2019). */
export function sp(iso: string): Date {
  return new Date(`${iso}-03:00`)
}
