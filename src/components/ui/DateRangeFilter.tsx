"use client";
'use client'

import React, { useState, useEffect } from 'react'
import { Calendar } from 'lucide-react'

export interface DateRange { start: string; end: string }
export type DatePreset = 'hoje' | '7d' | '30d' | 'este_mes' | 'mes_passado' | 'custom'

const toISO = (d: Date) => d.toISOString().split('T')[0]

/** Calcula o intervalo {start,end} de um preset relativo à data atual. */
export function computePresetRange(preset: Exclude<DatePreset, 'custom'>): DateRange {
  const end = new Date()
  let start = new Date()
  if (preset === 'hoje') start = new Date()
  else if (preset === '7d') start.setDate(end.getDate() - 7)
  else if (preset === '30d') start.setDate(end.getDate() - 30)
  else if (preset === 'este_mes') start = new Date(end.getFullYear(), end.getMonth(), 1)
  else if (preset === 'mes_passado') {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1)
    const lastDayPrevMonth = new Date(end.getFullYear(), end.getMonth(), 0)
    return { start: toISO(start), end: toISO(lastDayPrevMonth) }
  }
  return { start: toISO(start), end: toISO(end) }
}

const DEFAULT_PRESETS: [Exclude<DatePreset, 'custom'>, string][] = [
  ['hoje', 'Hoje'], ['7d', '7 Dias'], ['30d', '30 Dias'],
  ['este_mes', 'Este Mês'], ['mes_passado', 'Mês Passado'],
]

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange, preset: DatePreset) => void
  /** Preset ativo (modo controlado). Se omitido, o componente controla internamente. */
  preset?: DatePreset
  presets?: [Exclude<DatePreset, 'custom'>, string][]
  className?: string
}

/**
 * Filtro de período único e padronizado (presets + intervalo custom).
 * Um só controle visual para todas as telas, eliminando os quatro padrões
 * diferentes que existiam (dropdown, botões, select).
 */
export const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  value,
  onChange,
  preset,
  presets = DEFAULT_PRESETS,
  className = '',
}) => {
  const [internalPreset, setInternalPreset] = useState<DatePreset>(preset ?? 'custom')
  const active = preset ?? internalPreset

  const [customStart, setCustomStart] = useState(value.start)
  const [customEnd, setCustomEnd] = useState(value.end)

  useEffect(() => {
    setCustomStart(value.start)
    setCustomEnd(value.end)
  }, [value.start, value.end])

  const selectPreset = (p: Exclude<DatePreset, 'custom'>) => {
    setInternalPreset(p)
    onChange(computePresetRange(p), p)
  }

  const applyCustom = () => {
    setInternalPreset('custom')
    onChange({ start: customStart, end: customEnd }, 'custom')
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {presets.map(([val, label]) => (
        <button
          key={val}
          onClick={() => selectPreset(val)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            active === val
              ? 'bg-primary/15 text-primary border border-primary/30'
              : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700 hover:text-foreground'
          }`}
        >
          {label}
        </button>
      ))}
      <div className="flex items-center gap-2">
        <Calendar className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={customStart}
          onChange={e => setCustomStart(e.target.value)}
          className="bg-black border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary transition-colors"
        />
        <span className="text-muted-foreground text-xs">até</span>
        <input
          type="date"
          value={customEnd}
          onChange={e => setCustomEnd(e.target.value)}
          className="bg-black border border-border/50 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-primary transition-colors"
        />
        {(customStart !== value.start || customEnd !== value.end) && (
          <button
            onClick={applyCustom}
            className="px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-bold hover:shadow-lg hover:shadow-primary/20 transition-all ml-1"
          >
            Aplicar
          </button>
        )}
      </div>
    </div>
  )
}

export default DateRangeFilter

