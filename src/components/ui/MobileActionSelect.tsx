'use client'

import React, { useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface MobileActionSelectProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Option[]
  className?: string
  placeholder?: string
  disabled?: boolean
}

export const MobileActionSelect: React.FC<MobileActionSelectProps> = ({
  label,
  value,
  onChange,
  options,
  className = '',
  placeholder,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false)
  const selectedOption = options.find((o) => o.value === value)

  // Class names for styling
  const selectBaseClass =
    'w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground text-left flex items-center justify-between cursor-pointer'

  return (
    <>
      {/* Desktop View: Standard HTML Select */}
      <div className="hidden md:block w-full">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className={`w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Mobile View: Button that triggers Bottom Sheet */}
      <div className="block md:hidden w-full">
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(true)}
          className={`${selectBaseClass} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
        >
          <span className="truncate">
            {selectedOption ? selectedOption.label : placeholder || 'Selecione...'}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        </button>
      </div>

      {/* Bottom Sheet Modal */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-card backdrop-blur-sm animate-fade-in"
          onClick={() => setIsOpen(false)}
        >
          <div
            className="w-full max-h-[60vh] bg-card border-t border-border/40 rounded-t-3xl p-6 flex flex-col space-y-4 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="flex justify-center shrink-0 -mt-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-border/20 shrink-0">
              <span className="ocr-label text-[11px] font-bold text-muted-foreground">{label}</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs text-muted-foreground active:text-foreground font-semibold"
              >
                Cancelar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 py-2 scrollbar-thin">
              {placeholder && (
                <button
                  type="button"
                  onClick={() => {
                    onChange('')
                    setIsOpen(false)
                  }}
                  className={`w-full p-3.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between ${
                    value === ''
                      ? 'bg-primary/10 text-primary border border-primary/20'
                      : 'border border-transparent text-muted-foreground active:bg-secondary'
                  }`}
                >
                  <span>{placeholder}</span>
                  {value === '' && <Check className="w-4 h-4 text-primary" />}
                </button>
              )}

              {options.map((opt) => {
                const isSelected = opt.value === value
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      onChange(opt.value)
                      setIsOpen(false)
                    }}
                    className={`w-full p-3.5 text-left rounded-xl text-xs font-semibold flex items-center justify-between ${
                      isSelected
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'border border-transparent text-foreground active:bg-secondary'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
