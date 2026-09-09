"use client";
'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search, X } from 'lucide-react'

interface Option {
  value: string
  label: string
  sublabel?: string
}

interface SearchableSelectProps {
  value: string
  onChange: (value: string) => void
  options: Option[]
  placeholder?: string
  searchPlaceholder?: string
  emptyLabel?: string
  className?: string
  disabled?: boolean
}

/**
 * Select com busca embutida. Filtra por label + sublabel (ex.: nome + telefone).
 * Funciona em desktop e mobile como um dropdown com campo de pesquisa.
 */
export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  searchPlaceholder = 'Buscar...',
  emptyLabel = 'Nenhum resultado encontrado',
  className = '',
  disabled = false,
}) => {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) =>
      `${o.label} ${o.sublabel || ''}`.toLowerCase().includes(q)
    )
  }, [options, query])

  const closeDropdown = () => { setOpen(false); setQuery('') }

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  // Foca o campo de busca ao abrir
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 40)
  }, [open])

  return (
    <div ref={rootRef} className={`relative w-full ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-sm text-foreground text-left flex items-center justify-between gap-2 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={`truncate ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden animate-scale-in origin-top">
          <div className="p-2 border-b border-border/30">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full pl-8 pr-7 py-2 rounded-lg border border-border/30 bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => { setQuery(''); inputRef.current?.focus() }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto scrollbar-thin py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-4 text-xs text-muted-foreground text-center">{emptyLabel}</p>
            ) : (
              filtered.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { onChange(opt.value); closeDropdown() }}
                    className={`w-full px-3 py-2.5 text-left flex items-center justify-between gap-2 transition-colors ${
                      isSelected ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-card'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium truncate">{opt.label}</span>
                      {opt.sublabel && (
                        <span className="block text-[11px] text-muted-foreground truncate">{opt.sublabel}</span>
                      )}
                    </span>
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

