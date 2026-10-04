/**
 * O CHÃO COMUM DOS SCRIPTS OPERACIONAIS DA MÁQUINA (porte de `scripts/*` da CarBoss).
 *
 * Três regras que a CarBoss repetia em cada arquivo e aqui moram uma vez só:
 *
 *   1. DRY-RUN POR PADRÃO. Nada grava sem `--apply` explícito.
 *   2. O BANCO APARECE NA PRIMEIRA LINHA, mascarado. Rodar contra produção
 *      achando que era o banco de prova é o erro que mais custa.
 *   3. A CAMPANHA DATADA É INTOCÁVEL. Todo script que mexe em fila filtra
 *      `campanha_*` por padrão (`FORA_DA_CAMPANHA`) — a decisão sobre o drop
 *      10.10 é do Owner, e um reencaixe "da fila inteira" passaria por cima dela.
 */

import prisma from '../../src/lib/prisma'
import { GATILHOS_INTOCAVEIS } from '../../src/lib/maquina-vendas/cadencias-seed'

export { prisma }

export const ARGS = process.argv.slice(2)
export const APLICAR = ARGS.includes('--apply')

export function opcao(nome: string): string | undefined {
  const i = ARGS.indexOf(nome)
  return i >= 0 ? ARGS[i + 1] : undefined
}

export function tem(nome: string): boolean {
  return ARGS.includes(nome)
}

/** Os argumentos que não são flag nem valor de flag. */
export function posicionais(flagsComValor: string[] = []): string[] {
  const out: string[] = []
  for (let i = 0; i < ARGS.length; i++) {
    const a = ARGS[i]
    if (flagsComValor.includes(a)) {
      i++
      continue
    }
    if (!a.startsWith('--')) out.push(a)
  }
  return out
}

export function bancoMascarado(): string {
  const url = process.env.DATABASE_URL ?? ''
  if (!url) return '(DATABASE_URL ausente)'
  return url.replace(/:\/\/[^@]*@/, '://***@').replace(/\?.*$/, '')
}

export function cabecalho(titulo: string, escreve = true): void {
  console.log(`\n${titulo}`)
  console.log(`banco: ${bancoMascarado()}`)
  if (escreve) console.log(APLICAR ? 'modo: --apply (GRAVA)' : 'modo: dry-run (nada é gravado; --apply para valer)')
  console.log()
}

/** Data/hora na parede de São Paulo. */
export function brt(d: Date | string | null | undefined): string {
  if (!d) return '—'
  const x = typeof d === 'string' ? new Date(d) : d
  return x.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Log nunca carrega telefone inteiro. */
export function mascarar(tel: string | null | undefined): string {
  const d = String(tel ?? '').replace(/\D/g, '')
  return d.length < 6 ? '••••' : `${d.slice(0, 4)}•••••${d.slice(-3)}`
}

/** Filtro Prisma de inscrição: nada de campanha datada. */
export const FORA_DA_CAMPANHA = {
  cadencia: { NOT: { gatilho: { startsWith: 'campanha_' } } },
} as const

export const GATILHOS_PROTEGIDOS = [...GATILHOS_INTOCAVEIS]

/** Registro do que um script gravou — a mesma trilha da aba Ritmo. */
export async function registrarAjuste(titulo: string, dados: unknown): Promise<void> {
  await prisma.logEvento.create({
    data: {
      origem: 'maquina-vendas',
      nivel: 'INFO',
      tipo: 'mv_ajustes',
      titulo: titulo.slice(0, 200),
      dados: JSON.stringify({ via: 'script', ...((dados as object) ?? {}) }).slice(0, 4000),
    },
  })
}

/** Corpo padrão: erro vira código de saída 1, e a conexão sempre fecha. */
export function rodar(main: () => Promise<void>): void {
  main()
    .catch((e) => {
      console.error('\n✗', e instanceof Error ? e.message : e)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
