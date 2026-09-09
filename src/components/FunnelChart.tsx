'use client'

import React from 'react'

export interface FunnelStage {
  key: string
  label: string
  value: number
  color: string
}

interface FunnelChartProps {
  stages: FunnelStage[]
  /** key da etapa que é o gargalo — destacada em vermelho */
  bottleneckKey?: string | null
  /** altura de cada faixa (px) */
  bandHeight?: number
  /** conteúdo do rodapé (ex.: taxas de conversão em destaque) */
  footer?: React.ReactNode
}

/**
 * Funil invertido no estilo "trapézio" (referência do usuário): a forma afunila
 * por passos FIXOS — cada faixa é um pouco mais estreita que a anterior,
 * independentemente do valor — então os rótulos nunca ficam espremidos/truncados
 * mesmo quando o topo é muito maior que a base. Os números reais aparecem dentro
 * de cada faixa e o % de avanço de uma etapa para a outra fica anotado ao lado.
 */
export function FunnelChart({ stages, bottleneckKey, bandHeight = 66, footer }: FunnelChartProps) {
  const n = stages.length
  if (n === 0) return null

  // Largura das arestas (em % da caixa): do topo (100%) até a base (~46%),
  // em passos iguais — é o que dá o formato limpo de funil, sem depender do dado.
  const MAX_W = 100
  const MIN_W = 46
  const edgeW = (k: number) => (n <= 1 ? MAX_W : MAX_W - (MAX_W - MIN_W) * (k / n))
  const top0 = stages[0].value

  return (
    <div className="w-full max-w-2xl mx-auto">
      {stages.map((st, i) => {
        const wTop = edgeW(i)
        const wBot = edgeW(i + 1)
        const prev = i > 0 ? stages[i - 1].value : null
        const stepPct = prev && prev > 0 ? Math.round((st.value / prev) * 1000) / 10 : null
        const totalPct = top0 > 0 ? Math.round((st.value / top0) * 100) : 0
        const drop = prev !== null ? prev - st.value : 0
        const isBottleneck = bottleneckKey === st.key
        const col = isBottleneck ? '#f43f5e' : st.color
        const clip = `polygon(${50 - wTop / 2}% 0, ${50 + wTop / 2}% 0, ${50 + wBot / 2}% 100%, ${50 - wBot / 2}% 100%)`
        return (
          <div key={st.key} className="grid grid-cols-[1fr_auto] items-center gap-x-3">
            {/* Faixa do funil (trapézio) — a forma é recortada, o texto fica sobreposto (nunca corta) */}
            <div className="relative" style={{ height: bandHeight }}>
              <div
                className="absolute inset-0 transition-all duration-500"
                style={{
                  clipPath: clip,
                  background: `linear-gradient(180deg, ${col}, ${col}c0)`,
                  boxShadow: isBottleneck ? `0 0 26px ${col}55` : undefined,
                }}
              />
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
                <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-white/95" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.55)' }}>
                  {st.label}
                </span>
                <span className="text-xl sm:text-2xl font-black text-white leading-none mt-0.5" style={{ textShadow: '0 1px 5px rgba(0,0,0,0.6)' }}>
                  {st.value}
                </span>
              </div>
            </div>

            {/* Anotação lateral: % de avanço da etapa anterior (ou "topo" na primeira) */}
            <div className="w-16 sm:w-24 pl-1">
              {i === 0 ? (
                <span className="text-[10px] text-muted-foreground">{totalPct}% · topo</span>
              ) : (
                <div className="flex flex-col leading-tight">
                  <span className={`text-sm font-black ${isBottleneck ? 'text-rose-400' : 'text-foreground'}`}>
                    {stepPct}%
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {drop > 0 ? `−${drop}` : drop < 0 ? `+${-drop}` : '—'}
                    {isBottleneck ? ' · gargalo' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        )
      })}

      {footer && <div className="mt-6 pt-5 border-t border-border/40">{footer}</div>}
    </div>
  )
}
