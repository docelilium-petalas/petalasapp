'use client'

/**
 * O PERÍODO DO PAINEL — um filtro só para a tela inteira (cartões e tabela).
 *
 * Nasceu em 08/10/2026: o painel só sabia "hoje", e no dia seguinte a um
 * disparo não havia como ver o disparo. Atalhos para o caso comum (hoje,
 * ontem, 7 e 30 dias, tudo), setas para andar um dia e duas datas para
 * qualquer intervalo. Dias são da parede de São Paulo, inclusivos.
 *
 * Sem dependência de servidor: datas aqui são texto 'YYYY-MM-DD' e a conta de
 * dias é feita ao meio-dia UTC, onde nenhum fuso vira o dia.
 */

import { ChevronLeft, ChevronRight, CalendarRange } from 'lucide-react'

export type PeriodoDias = { de: string; ate: string } | null

const FMT_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })

/** O dia de hoje em São Paulo, 'YYYY-MM-DD'. */
export function hojeSP(): string {
  return FMT_SP.format(new Date())
}

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`

/** Lê `?de=&ate=` ou `?periodo=tudo` da URL. Sem nada = hoje. */
export function periodoDaUrl(hoje: string): PeriodoDias {
  const q = new URLSearchParams(window.location.search)
  if (q.get('periodo') === 'tudo') return null
  const ok = (v: string | null) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v)
  const de = q.get('de')
  const ate = q.get('ate') ?? de
  if (ok(de) && ok(ate)) return de! <= ate! ? { de: de!, ate: ate! } : { de: ate!, ate: de! }
  return { de: hoje, ate: hoje }
}

/** Grava o período na URL sem recarregar — recarregar a página mantém o recorte. */
export function periodoParaUrl(p: PeriodoDias, hoje: string) {
  const u = new URL(window.location.href)
  u.searchParams.delete('de')
  u.searchParams.delete('ate')
  u.searchParams.delete('periodo')
  if (p === null) u.searchParams.set('periodo', 'tudo')
  else if (!(p.de === hoje && p.ate === hoje)) {
    u.searchParams.set('de', p.de)
    if (p.ate !== p.de) u.searchParams.set('ate', p.ate)
  }
  window.history.replaceState(null, '', u.toString())
}

export function rotuloDoPeriodo(p: PeriodoDias, hoje: string): string {
  if (!p) return 'todo o período'
  if (p.de === p.ate) {
    if (p.de === hoje) return `hoje · ${br(p.de)}`
    if (p.de === somarDias(hoje, -1)) return `ontem · ${br(p.de)}`
    if (p.de === somarDias(hoje, 1)) return `amanhã · ${br(p.de)}`
    return br(p.de)
  }
  return `${br(p.de)} a ${br(p.ate)}`
}

const ATALHO = 'inline-flex items-center justify-center min-h-9 px-3 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap'
const SETA = 'inline-flex items-center justify-center min-h-9 min-w-9 rounded-lg border border-border bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed'
const DATA = 'min-h-9 px-2 rounded-lg border border-border bg-card text-xs text-foreground tabular focus:outline-none focus:ring-1 focus:ring-ring'

export function FiltroDePeriodo({ periodo, hoje, onChange, carregando }: {
  periodo: PeriodoDias
  hoje: string
  onChange: (p: PeriodoDias) => void
  carregando?: boolean
}) {
  const atalhos: { id: string; nome: string; p: PeriodoDias }[] = [
    { id: 'hoje', nome: 'Hoje', p: { de: hoje, ate: hoje } },
    { id: 'ontem', nome: 'Ontem', p: { de: somarDias(hoje, -1), ate: somarDias(hoje, -1) } },
    { id: '7', nome: '7 dias', p: { de: somarDias(hoje, -6), ate: hoje } },
    { id: '30', nome: '30 dias', p: { de: somarDias(hoje, -29), ate: hoje } },
    { id: 'tudo', nome: 'Tudo', p: null },
  ]
  const igual = (a: PeriodoDias, b: PeriodoDias) => (a === null || b === null ? a === b : a.de === b.de && a.ate === b.ate)
  const umDia = periodo !== null && periodo.de === periodo.ate

  const andar = (n: number) => {
    if (!periodo) return onChange({ de: hoje, ate: hoje })
    // Um dia anda um dia; um intervalo anda o tamanho dele inteiro.
    const tam = Math.round((Date.parse(`${periodo.ate}T12:00:00Z`) - Date.parse(`${periodo.de}T12:00:00Z`)) / 86_400_000) + 1
    onChange({ de: somarDias(periodo.de, n * tam), ate: somarDias(periodo.ate, n * tam) })
  }

  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 shrink-0">
        <CalendarRange className="w-4 h-4 text-muted-foreground" aria-hidden />
        <span className="ocr-label !text-foreground">Período</span>
        <span className={`text-xs text-muted-foreground tabular ${carregando ? 'animate-pulse' : ''}`} aria-live="polite">
          {rotuloDoPeriodo(periodo, hoje)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1 lg:ml-auto" role="group" aria-label="Atalhos de período">
        {atalhos.map((a) => {
          const ativo = igual(a.p, periodo)
          return (
            <button key={a.id} type="button" onClick={() => onChange(a.p)} aria-pressed={ativo}
              className={`${ATALHO} ${ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-accent'}`}>
              {a.nome}
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={SETA} onClick={() => andar(-1)} disabled={!periodo}
          title={umDia ? 'Dia anterior' : 'Período anterior'} aria-label={umDia ? 'Dia anterior' : 'Período anterior'}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <label className="sr-only" htmlFor="mv-periodo-de">De</label>
        <input id="mv-periodo-de" type="date" className={DATA} value={periodo?.de ?? ''}
          onChange={(e) => {
            const de = e.target.value
            if (!de) return
            const ate = periodo && periodo.ate >= de ? periodo.ate : de
            onChange({ de, ate })
          }} />
        <span className="text-xs text-muted-foreground">até</span>
        <label className="sr-only" htmlFor="mv-periodo-ate">Até</label>
        <input id="mv-periodo-ate" type="date" className={DATA} value={periodo?.ate ?? ''} min={periodo?.de}
          onChange={(e) => {
            const ate = e.target.value
            if (!ate) return
            const de = periodo && periodo.de <= ate ? periodo.de : ate
            onChange({ de, ate })
          }} />
        <button type="button" className={SETA} onClick={() => andar(1)} disabled={!periodo}
          title={umDia ? 'Próximo dia' : 'Próximo período'} aria-label={umDia ? 'Próximo dia' : 'Próximo período'}>
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
