/**
 * OS CARTÕES DE INDICADOR — porte de `components/painel/cartoes.tsx` da
 * CarBoss, com a pele da Doce Lilium (só tokens de `globals.css`).
 *
 * O comportamento é o da origem, e cada regra tem motivo:
 *  · o TOM só pinta quando o número não é zero — "Bloqueadas pela Meta: 0"
 *    vermelho para sempre é o jeito mais silencioso de um alarme morrer;
 *  · a barra de proporção só aparece se a parte couber no total — senão a
 *    tela mostraria 140% em vez de admitir que não sabe;
 *  · vira `<button>` quando filtra a tabela (foco por teclado, aria-pressed).
 */

import type { TomIndicador } from '@/lib/maquina-vendas/grupos'

const COLUNAS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 md:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-6',
  7: 'grid-cols-2 md:grid-cols-4 lg:grid-cols-7',
}

export function colunasPara(n: number): string {
  return COLUNAS[n] ?? 'grid-cols-2 md:grid-cols-4'
}

export function TituloDoBloco({ titulo, legenda }: { titulo: string; legenda?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <h2 className="ocr-label shrink-0 !text-foreground">{titulo}</h2>
      {legenda && <span className="text-[11px] text-muted-foreground shrink-0 hidden sm:inline">{legenda}</span>}
      <span className="flex-1 h-px bg-border" />
    </div>
  )
}

const COR_DO_TOM: Record<TomIndicador, string> = {
  neutro: 'text-foreground',
  bom: 'text-success',
  alerta: 'text-warning',
  ruim: 'text-destructive',
}

const BARRA_DO_TOM: Record<TomIndicador, string> = {
  neutro: 'bg-primary',
  bom: 'bg-success',
  alerta: 'bg-warning',
  ruim: 'bg-destructive',
}

export interface Proporcao {
  parte: number
  total: number
  rotuloBase: string
}

export function CartaoIndicador({ rotulo, valor, tom = 'neutro', ativo = false, ajuda, proporcao, onClick }: {
  rotulo: string
  valor: number | string
  tom?: TomIndicador
  ativo?: boolean
  ajuda?: string
  proporcao?: Proporcao | null
  onClick?: () => void
}) {
  const numero = typeof valor === 'number' ? valor : Number(String(valor).split('/')[0])
  const aceso = Number.isFinite(numero) ? numero > 0 : true
  const tomAtivo: TomIndicador = aceso ? tom : 'neutro'

  const p = proporcao && proporcao.total > 0 && proporcao.parte >= 0 && proporcao.parte <= proporcao.total ? proporcao : null
  const pct = p ? Math.round((p.parte / p.total) * 100) : null
  const titulo = [ajuda, p ? `${p.parte} de ${p.total} ${p.rotuloBase}` : null].filter(Boolean).join(' · ')

  const classe = `relative overflow-hidden text-left rounded-xl border bg-card px-4 py-3 min-h-[66px] transition-colors ${
    ativo ? 'border-primary ring-1 ring-primary' : 'border-border'
  } ${onClick ? 'cursor-pointer hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring' : ''}`

  const conteudo = (
    <>
      <p className="ocr-label truncate" title={rotulo}>{rotulo}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular leading-none ${aceso ? COR_DO_TOM[tomAtivo] : 'text-muted-foreground'}`}>{valor}</p>
      {pct !== null && <p className="mt-1.5 text-[11px] leading-none text-muted-foreground tabular">{pct}% de {p!.rotuloBase}</p>}
      {pct !== null && (
        <span className="absolute left-0 bottom-0 h-0.5 w-full bg-muted" aria-hidden>
          <span className={`block h-full ${BARRA_DO_TOM[tomAtivo]}`} style={{ width: `${pct}%` }} />
        </span>
      )}
    </>
  )

  return onClick ? (
    <button type="button" onClick={onClick} aria-pressed={ativo} className={classe} title={titulo || undefined}>
      {conteudo}
    </button>
  ) : (
    <div className={classe} title={titulo || undefined}>{conteudo}</div>
  )
}

export function EsqueletoDeCartoes({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className={`grid gap-2 ${colunasPara(quantos)}`}>
      {Array.from({ length: quantos }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-muted/50 animate-pulse h-[66px]" aria-hidden />
      ))}
    </div>
  )
}
