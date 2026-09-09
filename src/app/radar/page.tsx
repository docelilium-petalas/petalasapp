'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { AppLayout } from '@/components/AppLayout'
import * as radarActions from '@/app/actions/radar'
import { geoMercator, geoPath, type GeoProjection } from 'd3-geo'
import type { Feature, FeatureCollection, Geometry } from 'geojson'
import { ESTADOS, DDD_INFO, REGIOES, type Regiao } from '@/lib/ddd'
import { flagBands, flagDetail, type FlagEmblem } from '@/lib/estado-flags'
import {
  Radar as RadarIcon, ArrowLeft, Search, Download, Users, X,
  ChevronRight, MapPinOff, Filter, Calendar, MessageCircle, Map as MapIcon,
  Trophy, Ban, GitBranch, Loader2,
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { InlineError } from '@/components/ui/InlineError'

// ─── Geometria do mapa (SVG viewBox fixo — escala responsiva via width:100%) ──
const W = 900
const H = 720
const PAD = 36

type UfFeature = Feature<Geometry, { sigla: string; name: string }>
type UfFeatureCollection = FeatureCollection<Geometry, { sigla: string; name: string }>

type Level = 'brasil' | 'estado' | 'ddd'

const fmtCount = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`.replace('.0k', 'k')
  return String(n)
}

const PERIODO_OPTIONS: { label: string; value: number | null }[] = [
  { label: 'Todo o período', value: null },
  { label: 'Últimos 30 dias', value: 30 },
  { label: 'Últimos 60 dias', value: 60 },
  { label: 'Últimos 90 dias', value: 90 },
]

// Rampa sequencial monocromática (cinza-escuro → branco), replicando o padrão
// visual de referência (mapa eleitoral: escuro = poucos, branco = muitos).
// O piso (22%) fica acima do fundo do SVG (14%) para que a forma nunca "suma"
// mesmo com 0 contatos — o traçado da fronteira reforça isso.
const MAP_BG = '#141414'
function sequentialLightness(value: number, max: number): number {
  if (max <= 0 || value <= 0) return 22
  const t = Math.sqrt(value / max)
  return Math.round(22 + t * 70)
}
function sequentialFill(value: number, max: number): string {
  return `hsl(0 0% ${sequentialLightness(value, max)}%)`
}
function labelInkFor(value: number, max: number): string {
  return sequentialLightness(value, max) > 62 ? '#0b0b0b' : '#ffffff'
}

// ─── Símbolo central da bandeira (versão "detalhada", preview) ────────────
function starPoints(cx: number, cy: number, rOuter: number, rInner: number, points = 5): string {
  const step = Math.PI / points
  const coords: string[] = []
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner
    const angle = i * step - Math.PI / 2
    coords.push(`${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`)
  }
  return coords.join(' ')
}

function FlagEmblem({ emblem, cx, cy, size, color, opacity }: { emblem: FlagEmblem; cx: number; cy: number; size: number; color: string; opacity: number }) {
  if (emblem === 'none') return null
  if (emblem === 'star') {
    return <polygon points={starPoints(cx, cy, size, size * 0.42)} fill={color} opacity={opacity} className="pointer-events-none" />
  }
  if (emblem === 'diamond') {
    return <rect x={cx - size * 0.62} y={cy - size * 0.62} width={size * 1.24} height={size * 1.24} transform={`rotate(45 ${cx} ${cy})`} fill={color} opacity={opacity} className="pointer-events-none" />
  }
  if (emblem === 'circle') {
    return <circle cx={cx} cy={cy} r={size * 0.62} fill="none" stroke={color} strokeWidth={size * 0.12} opacity={opacity} className="pointer-events-none" />
  }
  if (emblem === 'cross') {
    return (
      <g opacity={opacity} className="pointer-events-none">
        <rect x={cx - size * 0.16} y={cy - size * 0.72} width={size * 0.32} height={size * 1.44} fill={color} />
        <rect x={cx - size * 0.72} y={cy - size * 0.16} width={size * 1.44} height={size * 0.32} fill={color} />
      </g>
    )
  }
  // sun: círculo central com raios
  const rays = Array.from({ length: 8 }, (_, i) => (
    <rect key={i} x={cx - size * 0.07} y={cy - size * 1.05} width={size * 0.14} height={size * 0.42}
      fill={color} transform={`rotate(${(i * 360) / 8} ${cx} ${cy})`} />
  ))
  return <g opacity={opacity} className="pointer-events-none">{rays}<circle cx={cx} cy={cy} r={size * 0.4} fill={color} /></g>
}

function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers.map(esc).join(';'), ...rows.map((r) => r.map(esc).join(';'))].join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

interface HoverInfo {
  x: number
  y: number
  containerWidth: number
  uf: string | null
  titulo: string
  total: number
  pct: number
  rank: string
}

// Monta o link do WhatsApp a partir do telefone já normalizado (prefixo 55).
function waLink(telefone: string): string | null {
  const digits = (telefone || '').replace(/\D/g, '')
  if (digits.length < 10) return null
  const withCc = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${withCc}`
}

const SITUACAO_META: Record<string, { label: string; cls: string }> = {
  pipeline: { label: 'Na pipeline', cls: 'text-primary bg-primary/10 border-primary/25' },
  ganho: { label: 'Ganho', cls: 'text-success bg-success/10 border-success/25' },
  perdido: { label: 'Perdido', cls: 'text-destructive bg-destructive/10 border-destructive/25' },
  sem_negocio: { label: 'Sem negócio', cls: 'text-muted-foreground bg-muted/10 border-border/20' },
}

export default function RadarPage() {
  const [geo, setGeo] = useState<UfFeatureCollection | null>(null)
  const [level, setLevel] = useState<Level>('brasil')
  const [selectedUf, setSelectedUf] = useState<string | null>(null)
  const [selectedDdd, setSelectedDdd] = useState<string | null>(null)

  const [overview, setOverview] = useState<radarActions.RadarOverview | null>(null)
  const [estadoDetalhe, setEstadoDetalhe] = useState<radarActions.RadarEstadoDetalhe | null>(null)
  const [dddDetalhe, setDddDetalhe] = useState<radarActions.RadarDddDetalhe | null>(null)
  const [origens, setOrigens] = useState<string[]>([])

  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [overviewError, setOverviewError] = useState(false)
  const [geoError, setGeoError] = useState(false)

  const [regiaoFilter, setRegiaoFilter] = useState<Regiao | 'all'>('all')
  const [origemFilter, setOrigemFilter] = useState<string>('all')
  const [periodoFilter, setPeriodoFilter] = useState<number | null>(null)

  const [hover, setHover] = useState<HoverInfo | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)

  // Modal com a lista de contatos de um estado (situação + WhatsApp)
  const [modalUf, setModalUf] = useState<string | null>(null)
  const [modalDdd, setModalDdd] = useState<string | null>(null)
  const [modalData, setModalData] = useState<radarActions.RadarEstadoContatos | null>(null)
  const [modalLoading, setModalLoading] = useState(false)

  const filters = useMemo(
    () => ({
      regiao: regiaoFilter === 'all' ? null : regiaoFilter,
      origem: origemFilter === 'all' ? null : origemFilter,
      periodoDias: periodoFilter,
    }),
    [regiaoFilter, origemFilter, periodoFilter]
  )

  // Carrega a malha geográfica (uma vez) + lista de origens para o filtro
  const loadGeo = useCallback(() => {
    setGeoError(false)
    fetch('/geo/brasil-estados.json')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setGeoError(true))
    radarActions.getRadarOrigens().then(setOrigens).catch(() => {})
  }, [])

  useEffect(() => { loadGeo() }, [loadGeo])

  // Carrega a visão nacional quando os filtros mudam
  const loadOverview = useCallback(async (isRefetch: boolean) => {
    if (isRefetch) setRefetching(true)
    else setLoading(true)
    setOverviewError(false)
    try {
      const data = await radarActions.getRadarOverview(filters)
      setOverview(data)
    } catch {
      setOverviewError(true)
    } finally {
      setLoading(false)
      setRefetching(false)
    }
  }, [filters])

  useEffect(() => {
    // Busca de dados reagindo à mudança de filtros (setState ocorre após o await,
    // não sincronamente no corpo do efeito) — o padrão recomendado pelo próprio
    // React para sincronizar com uma fonte externa a partir de uma dependência.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOverview(overview !== null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  // Reseta o drill-down quando um filtro muda (a visão detalhada pode não fazer mais
  // sentido no novo recorte) — disparado a partir dos próprios handlers de filtro,
  // não de um efeito, para não empilhar renders reagindo a uma mudança de estado.
  const resetDrilldown = () => {
    setLevel('brasil')
    setSelectedUf(null)
    setSelectedDdd(null)
    setEstadoDetalhe(null)
    setDddDetalhe(null)
  }
  const handleRegiaoFilterChange = (v: Regiao | 'all') => { setRegiaoFilter(v); resetDrilldown() }
  const handleOrigemFilterChange = (v: string) => { setOrigemFilter(v); resetDrilldown() }
  const handlePeriodoFilterChange = (v: number | null) => { setPeriodoFilter(v); resetDrilldown() }

  // Abre a janela de contatos (lista com situação comercial + WhatsApp).
  // Sem `ddd`, mostra todos os contatos do estado; com `ddd`, filtra para
  // aquela localidade específica (usado a partir da visão de DDD já zoomada).
  const openContatos = useCallback(async (uf: string, ddd?: string) => {
    setModalUf(uf)
    setModalDdd(ddd ?? null)
    setModalData(null)
    setModalLoading(true)
    try {
      const data = await radarActions.getRadarEstadoContatos(uf, filters)
      setModalData(data)
    } catch {
      toast.error('Erro ao carregar contatos do estado.')
    } finally {
      setModalLoading(false)
    }
  }, [filters])
  const closeContatos = useCallback(() => { setModalUf(null); setModalDdd(null); setModalData(null) }, [])

  // Contatos exibidos no modal: todos do estado, ou só os da localidade (DDD) escolhida
  const modalContatos = useMemo(() => {
    const all = modalData?.contatos ?? []
    return modalDdd ? all.filter((c) => c.ddd === modalDdd) : all
  }, [modalData, modalDdd])

  const enterEstado = useCallback(async (uf: string) => {
    setRefetching(true)
    try {
      const data = await radarActions.getRadarEstadoDetalhe(uf, filters)
      setEstadoDetalhe(data)
      setSelectedUf(uf)
      setSelectedDdd(null)
      setDddDetalhe(null)
      setLevel('estado')
    } catch {
      toast.error('Erro ao carregar detalhe do estado.')
    } finally {
      setRefetching(false)
    }
  }, [filters])

  const enterDdd = useCallback(async (ddd: string) => {
    setRefetching(true)
    try {
      const data = await radarActions.getRadarDddDetalhe(ddd, filters)
      setDddDetalhe(data)
      setSelectedDdd(ddd)
      setLevel('ddd')
    } catch {
      toast.error('Erro ao carregar detalhe do DDD.')
    } finally {
      setRefetching(false)
    }
  }, [filters])

  const goBack = useCallback(() => {
    setHover(null)
    if (level === 'ddd') {
      setLevel('estado')
      setSelectedDdd(null)
      setDddDetalhe(null)
    } else if (level === 'estado') {
      setLevel('brasil')
      setSelectedUf(null)
      setEstadoDetalhe(null)
    }
  }, [level])

  // Esc: fecha o modal de contatos se aberto; senão volta um nível
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (modalUf) closeContatos()
      else if (level !== 'brasil') goBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [level, goBack, modalUf, closeContatos])

  // ─── Projeções (recalculadas por nível de zoom) ──────────────────────────
  const projectionBrasil = useMemo<GeoProjection | null>(() => {
    if (!geo) return null
    return geoMercator().fitExtent([[PAD, PAD], [W - PAD, H - PAD]], geo)
  }, [geo])

  const estadoFeature = useMemo<UfFeature | null>(() => {
    if (!geo || !selectedUf) return null
    return geo.features.find((f) => f.properties.sigla === selectedUf) || null
  }, [geo, selectedUf])

  const projectionEstado = useMemo<GeoProjection | null>(() => {
    if (!estadoFeature) return null
    return geoMercator().fitExtent([[PAD * 2, PAD * 2], [W - PAD * 2, H - PAD * 2]], estadoFeature)
  }, [estadoFeature])

  // Ao focar um DDD específico, reenquadra em torno do seu ponto de referência
  const projectionDdd = useMemo<GeoProjection | null>(() => {
    if (!projectionEstado || !selectedDdd) return null
    const info = DDD_INFO[selectedDdd]
    if (!info) return null
    const baseScale = projectionEstado.scale()
    return geoMercator()
      .center([info.lng, info.lat])
      .scale(baseScale * 1.7)
      .translate([W / 2, H / 2])
  }, [projectionEstado, selectedDdd])

  const activeProjection = level === 'ddd' && projectionDdd ? projectionDdd : level === 'brasil' ? projectionBrasil : projectionEstado
  const pathGen = useMemo(() => (activeProjection ? geoPath(activeProjection) : null), [activeProjection])

  // ─── Painel (título, total, top, ranking) ────────────────────────────────
  const filtroLabel = useMemo(() => {
    const parts: string[] = []
    parts.push(regiaoFilter === 'all' ? 'Todos os contatos' : `Região ${regiaoFilter}`)
    if (origemFilter !== 'all') parts.push(origemFilter)
    if (periodoFilter) parts.push(`${periodoFilter}d`)
    return parts.join(' · ')
  }, [regiaoFilter, origemFilter, periodoFilter])

  const panel = useMemo(() => {
    if (level === 'brasil' && overview) {
      return {
        titulo: 'Radar de Contatos',
        total: overview.totalIdentificados,
        top: overview.top ? { label: `${overview.top.estado}`, total: overview.top.total, pct: overview.top.pct } : null,
        max: overview.porEstado[0]?.total ?? 0,
        minPositivo: [...overview.porEstado].reverse().find((e) => e.total > 0)?.total ?? 0,
        rankTotal: overview.porEstado.filter((e) => e.total > 0).length,
      }
    }
    if (level !== 'brasil' && estadoDetalhe) {
      const positivos = estadoDetalhe.porDdd.filter((d) => d.total > 0)
      return {
        titulo: `${estadoDetalhe.estado}`,
        total: estadoDetalhe.total,
        top: estadoDetalhe.top ? { label: `DDD ${estadoDetalhe.top.ddd} · ${estadoDetalhe.top.cidadeRef}`, total: estadoDetalhe.top.total, pct: estadoDetalhe.top.pct } : null,
        max: estadoDetalhe.porDdd[0]?.total ?? 0,
        minPositivo: [...positivos].reverse()[0]?.total ?? 0,
        rankTotal: positivos.length,
      }
    }
    return null
  }, [level, overview, estadoDetalhe])

  // Top 5 estados com mais contatos (para o ranking flutuante no mapa)
  const topEstados = useMemo(
    () => (overview?.porEstado ?? []).filter((e) => e.total > 0).slice(0, 5),
    [overview]
  )

  // ─── Handlers de hover (estado / ddd) ─────────────────────────────────────
  const handleHoverEstado = (e: React.MouseEvent<SVGGraphicsElement>, sigla: string) => {
    if (!overview) return
    const idx = overview.porEstado.findIndex((x) => x.uf === sigla)
    if (idx === -1) return
    const item = overview.porEstado[idx]
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width,
      uf: sigla,
      titulo: item.estado,
      total: item.total,
      pct: item.pct,
      rank: `#${idx + 1} de ${overview.porEstado.length}`,
    })
  }

  const handleHoverDdd = (e: React.MouseEvent<SVGCircleElement>, ddd: string) => {
    if (!estadoDetalhe) return
    const idx = estadoDetalhe.porDdd.findIndex((x) => x.ddd === ddd)
    if (idx === -1) return
    const item = estadoDetalhe.porDdd[idx]
    const rect = e.currentTarget.ownerSVGElement!.getBoundingClientRect()
    setHover({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      containerWidth: rect.width,
      uf: selectedUf,
      titulo: `DDD ${item.ddd} · ${item.cidadeRef}`,
      total: item.total,
      pct: item.pct,
      rank: `#${idx + 1} de ${estadoDetalhe.porDdd.length}`,
    })
  }

  // ─── Busca rápida ─────────────────────────────────────────────────────────
  const searchIndex = useMemo(() => {
    const items: { label: string; sub: string; onSelect: () => void }[] = []
    Object.entries(ESTADOS).forEach(([uf, info]) => {
      items.push({ label: info.nome, sub: `Estado · ${uf}`, onSelect: () => enterEstado(uf) })
    })
    Object.values(DDD_INFO).forEach((d) => {
      items.push({
        label: `DDD ${d.ddd} — ${d.cidadeRef}`,
        sub: `${d.estado}`,
        onSelect: async () => { await enterEstado(d.uf); await enterDdd(d.ddd) },
      })
    })
    return items
  }, [enterEstado, enterDdd])

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return searchIndex.filter((i) => i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)).slice(0, 8)
  }, [searchQuery, searchIndex])

  // ─── Exportação CSV ────────────────────────────────────────────────────────
  const handleExport = () => {
    if (level === 'brasil' && overview) {
      downloadCsv('radar-estados.csv', ['UF', 'Estado', 'Regiao', 'Total', 'Percentual'],
        overview.porEstado.map((e) => [e.uf, e.estado, e.regiao, e.total, `${e.pct}%`]))
    } else if (level !== 'brasil' && estadoDetalhe) {
      downloadCsv(`radar-${estadoDetalhe.uf}.csv`, ['DDD', 'Cidade de referencia', 'Total', 'Percentual'],
        estadoDetalhe.porDdd.map((d) => [d.ddd, d.cidadeRef, d.total, `${d.pct}%`]))
    }
    toast.success('Exportação gerada.')
  }

  const breadcrumb = (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground select-none">
      <button onClick={() => { setLevel('brasil'); setSelectedUf(null); setSelectedDdd(null) }} className={`hover:text-foreground transition-colors ${level === 'brasil' ? 'text-foreground font-bold' : ''}`}>
        Brasil
      </button>
      {selectedUf && (
        <>
          <ChevronRight className="w-3 h-3" />
          <button onClick={() => { setLevel('estado'); setSelectedDdd(null) }} className={`hover:text-foreground transition-colors ${level === 'estado' ? 'text-foreground font-bold' : ''}`}>
            {ESTADOS[selectedUf]?.nome ?? selectedUf}
          </button>
        </>
      )}
      {selectedDdd && (
        <>
          <ChevronRight className="w-3 h-3" />
          <span className="text-foreground font-bold">DDD {selectedDdd}</span>
        </>
      )}
    </div>
  )

  // Chave de transição: muda a cada navegação de nível (não em refetch por filtro
  // no mesmo nível), disparando o "zoom" de entrada só quando faz sentido navegacional.
  const transitionKey = `${level}-${selectedUf ?? ''}-${selectedDdd ?? ''}`

  if (loading) {
    return (
      <AppLayout>
        <div className="p-4 sm:p-6 md:p-8 space-y-4 animate-fade-in">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-2">
              <div className="h-7 w-40 rounded-lg bg-card/50 animate-pulse" />
              <div className="h-4 w-72 rounded-lg bg-card/40 animate-pulse" />
            </div>
            <div className="h-9 w-full md:w-72 rounded-xl bg-card/40 animate-pulse" />
          </div>
          <div className="h-14 rounded-2xl bg-card/30 border border-border/30 animate-pulse" />
          <div className="h-[600px] rounded-3xl bg-card/60 border border-border/30 animate-pulse" />
        </div>
      </AppLayout>
    )
  }

  // Falha no carregamento inicial (dados ou malha geográfica) — estado de erro
  // inline com "tentar novamente", em vez de uma tela vazia após o toast sumir.
  if ((overviewError && !overview) || (geoError && !geo)) {
    return (
      <AppLayout>
        <div className="p-4 sm:p-6 md:p-8">
          <InlineError
            title="Não foi possível carregar o Radar"
            message={geoError ? 'Falha ao carregar o mapa do Brasil. Verifique sua conexão e tente novamente.' : 'Falha ao carregar a distribuição de contatos. Verifique sua conexão e tente novamente.'}
            onRetry={() => { loadGeo(); loadOverview(false) }}
            retrying={loading || refetching}
            className="min-h-[60vh]"
          />
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" />
      <div className="flex flex-col h-full bg-black text-foreground overflow-y-auto scrollbar-thin p-4 sm:p-6 md:p-8 animate-fade-in">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent flex items-center gap-2">
              <RadarIcon className="w-6 h-6 text-primary" /> Radar
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Distribuição geográfica da sua base de contatos, por DDD.</p>
          </div>

          {/* Busca rápida */}
          <div className="relative w-full md:w-72">
            <div className="flex items-center gap-2 bg-card/50 border border-border/50 rounded-xl px-3 py-2">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true) }}
                onFocus={() => setSearchOpen(true)}
                placeholder="Buscar cidade, estado ou DDD..."
                className="bg-transparent text-sm outline-none flex-1 min-w-0"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(''); setSearchOpen(false) }} className="text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute z-30 mt-1.5 w-full rounded-xl border border-border/50 bg-card shadow-2xl overflow-hidden animate-scale-in origin-top">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { r.onSelect(); setSearchQuery(''); setSearchOpen(false) }}
                    className="w-full px-3 py-2.5 text-left hover:bg-card transition-colors"
                  >
                    <p className="text-sm font-medium text-foreground">{r.label}</p>
                    <p className="text-[11px] text-muted-foreground">{r.sub}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filtros — uma linha, acima do conteúdo, escopando tudo abaixo */}
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-card/30 p-3 rounded-2xl border border-border/30 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
              <Filter className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={regiaoFilter} onChange={(e) => handleRegiaoFilterChange(e.target.value as Regiao | 'all')} className="bg-black py-1.5 text-sm outline-none cursor-pointer">
                <option value="all">Todas as regiões</option>
                {REGIOES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
              <select value={periodoFilter ?? ''} onChange={(e) => handlePeriodoFilterChange(e.target.value ? Number(e.target.value) : null)} className="bg-black py-1.5 text-sm outline-none cursor-pointer">
                {PERIODO_OPTIONS.map((p) => <option key={p.label} value={p.value ?? ''}>{p.label}</option>)}
              </select>
            </div>
            {origens.length > 0 && (
              <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                <select value={origemFilter} onChange={(e) => handleOrigemFilterChange(e.target.value)} className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[180px]">
                  <option value="all">Todas as origens</option>
                  {origens.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {breadcrumb}
            {level !== 'brasil' && (
              <button onClick={goBack} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-xs font-semibold hover:bg-card transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" /> Voltar (Esc)
              </button>
            )}
            <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-xs font-semibold hover:bg-primary/20 transition-colors">
              <Download className="w-3.5 h-3.5" /> Exportar CSV
            </button>
          </div>
        </div>

        {/* Card "Não identificados" */}
        {overview && overview.naoIdentificados > 0 && level === 'brasil' && (
          <div className="flex items-center gap-3 p-3.5 rounded-2xl border border-warning/25 bg-warning/5 mb-4 w-fit animate-fade-in">
            <div className="w-9 h-9 rounded-xl bg-warning/10 border border-warning/20 flex items-center justify-center text-warning shrink-0">
              <MapPinOff className="w-4.5 h-4.5" />
            </div>
            <div>
              <p className="text-sm font-bold text-foreground">{overview.naoIdentificados} contato(s) — Outros / não identificados</p>
              <p className="text-[11px] text-muted-foreground">Telefone sem DDD válido reconhecido (número estrangeiro, incompleto ou fora do padrão).</p>
            </div>
          </div>
        )}

        {/* Mapa */}
        <div className="relative shrink-0 bg-card/60 rounded-3xl border border-border/30 overflow-hidden">
          {/* Dim contínuo durante refetch (sem animação própria, evita conflitar com o fill-mode do zoom abaixo) */}
          <div className={`relative transition-opacity duration-300 ${refetching ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
          {/* Remonta e reproduz o "zoom" apenas em navegação de nível (chave muda) */}
          <div key={transitionKey} className="relative animate-performance-zoom">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" style={{ background: MAP_BG }} onMouseLeave={() => setHover(null)}>
              {/* Nível Brasil: bandeira (marca d'água) + total de contatos por estado */}
              {level === 'brasil' && geo && pathGen && overview && (
                geo.features.map((f) => {
                  const sigla = f.properties.sigla
                  const item = overview.porEstado.find((e) => e.uf === sigla)
                  const total = item?.total ?? 0
                  const isHovered = hover?.uf === sigla
                  const d = pathGen(f) || ''
                  const [cx, cy] = pathGen.centroid(f)
                  const [[x0, y0], [x1, y1]] = pathGen.bounds(f)
                  const bands = flagBands(sigla)
                  const bandH = (y1 - y0) / bands.length
                  const nome = ESTADOS[sigla]?.nome ?? sigla
                  const detail = flagDetail(sigla)
                  const emblemSize = Math.min(x1 - x0, y1 - y0) * 0.24
                  const watermarkOpacity = isHovered ? 0.6 : 0.42
                  return (
                    <g key={sigla} className="cursor-pointer" onMouseMove={(e) => handleHoverEstado(e, sigla)} onClick={() => enterEstado(sigla)}>
                      <clipPath id={`flag-clip-${sigla}`}><path d={d} /></clipPath>
                      {/* Base escura para legibilidade do número */}
                      <path d={d} fill="#191919" />
                      {/* Marca d'água da bandeira (faixas + símbolo central), recortada no contorno do estado */}
                      <g clipPath={`url(#flag-clip-${sigla})`} opacity={watermarkOpacity} className="transition-opacity duration-200 pointer-events-none">
                        {bands.map((c, i) => (
                          <rect key={i} x={x0 - 1} y={y0 + i * bandH} width={x1 - x0 + 2} height={bandH + 0.6} fill={c} />
                        ))}
                      </g>
                      <g clipPath={`url(#flag-clip-${sigla})`}>
                        <FlagEmblem emblem={detail.emblem} cx={cx} cy={cy} size={emblemSize} color={detail.color} opacity={watermarkOpacity} />
                      </g>
                      {/* Contorno (realça no hover) */}
                      <path
                        d={d}
                        fill="transparent"
                        stroke={isHovered ? 'var(--primary, #00E676)' : 'rgba(255,255,255,0.3)'}
                        strokeWidth={isHovered ? 2 : 1}
                        className="transition-all duration-200"
                      />
                      {/* Número total de contatos */}
                      {total > 0 && (
                        <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="central"
                          fontSize={isHovered ? 20 : 16} fontWeight={800}
                          fill="#ffffff" className="pointer-events-none select-none transition-all duration-200"
                          style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.88)', strokeWidth: 3.5 }}>
                          {fmtCount(total)}
                        </text>
                      )}
                      {/* Nome do estado — sigla por padrão, nome completo (maior) no hover */}
                      <text x={cx} y={cy + (total > 0 ? 12 : 0)} textAnchor="middle" dominantBaseline="central"
                        fontSize={isHovered ? 13 : 8.5} fontWeight={700}
                        fill={isHovered ? 'var(--primary, #00E676)' : 'rgba(255,255,255,0.85)'}
                        className="pointer-events-none select-none transition-all duration-200"
                        style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.85)', strokeWidth: 3 }}>
                        {isHovered ? nome : sigla}
                      </text>
                    </g>
                  )
                })
              )}

              {/* Nível Estado/DDD: contorno do estado + bolhas por DDD */}
              {level !== 'brasil' && estadoFeature && pathGen && estadoDetalhe && (
                <>
                  <path d={pathGen(estadoFeature) || ''} fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.25)" strokeWidth={1} />
                  {estadoDetalhe.porDdd.map((d) => {
                    const proj = activeProjection!
                    const [cx, cy] = proj([d.lng, d.lat]) ?? [0, 0]
                    const max = estadoDetalhe.porDdd[0]?.total ?? 0
                    const r = 16 + Math.sqrt((d.total || 0.4) / (max || 1)) * 54
                    const isFocused = level === 'ddd' && selectedDdd === d.ddd
                    const isDimmed = level === 'ddd' && selectedDdd !== d.ddd
                    const isHovered = hover?.titulo?.includes(`DDD ${d.ddd} `)
                    return (
                      <g key={d.ddd} opacity={isDimmed ? 0.25 : 1} className="transition-opacity duration-300">
                        <circle
                          cx={cx} cy={cy} r={r}
                          fill={sequentialFill(d.total, max)}
                          stroke={isHovered || isFocused ? 'var(--primary, #00E676)' : 'rgba(255,255,255,0.35)'}
                          strokeWidth={isHovered || isFocused ? 2 : 1}
                          className="transition-all duration-200 cursor-pointer"
                          onMouseMove={(e) => handleHoverDdd(e, d.ddd)}
                          onClick={() => enterDdd(d.ddd)}
                        />
                        {r > 24 && (
                          <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}
                            fill={labelInkFor(d.total, max)} className="pointer-events-none select-none">
                            {d.ddd}
                          </text>
                        )}
                      </g>
                    )
                  })}
                </>
              )}
            </svg>

            {/* Tooltip */}
            {hover && (
              <div
                className="absolute z-10 pointer-events-none bg-card/95 border border-border/60 rounded-xl px-3 py-2 shadow-2xl animate-scale-in"
                style={{ left: Math.min(hover.x + 14, hover.containerWidth - 180), top: Math.max(hover.y - 46, 8) }}
              >
                <p className="text-sm font-bold text-foreground whitespace-nowrap">{hover.titulo}</p>
                <p className="text-xs text-muted-foreground whitespace-nowrap">{hover.total} contato(s)</p>
              </div>
            )}

            {/* Top 5 estados com mais contatos (canto superior esquerdo, nível Brasil) */}
            {level === 'brasil' && overview && topEstados.length > 0 && (
              <div className="relative w-full mt-3 md:mt-0 md:absolute md:left-4 md:top-4 md:w-52 z-10 bg-card/90 backdrop-blur-md border border-border/50 rounded-2xl p-3 shadow-2xl">
                <div className="flex items-center gap-1.5 mb-2">
                  <Trophy className="w-3.5 h-3.5 text-warning shrink-0" />
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top 5 estados</p>
                </div>
                <div className="space-y-1.5">
                  {topEstados.map((e, i) => {
                    const rankColor = i === 0 ? 'text-warning' : i === 1 ? 'text-foreground' : i === 2 ? 'text-warning' : 'text-muted-foreground'
                    const barPct = topEstados[0].total > 0 ? (e.total / topEstados[0].total) * 100 : 0
                    return (
                      <button key={e.uf} onClick={() => enterEstado(e.uf)}
                        onMouseEnter={() => setHover({ x: 0, y: 0, containerWidth: 0, uf: e.uf, titulo: e.estado, total: e.total, pct: e.pct, rank: `#${i + 1}` })}
                        onMouseLeave={() => setHover(null)}
                        className="w-full group text-left">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[11px] font-black w-3 shrink-0 ${rankColor}`}>{i + 1}</span>
                          <span className="text-[11px] font-bold text-foreground truncate flex-1 group-hover:text-primary transition-colors">{e.estado}</span>
                          <span className="text-[11px] font-bold text-foreground shrink-0">{fmtCount(e.total)}</span>
                        </div>
                        <div className="ml-[18px] mt-0.5 h-1 rounded-full bg-card overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-primary to-success" style={{ width: `${Math.max(barPct, 4)}%` }} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Painel flutuante (canto inferior esquerdo) */}
            {panel && (
              <div className="relative w-full mt-3 md:mt-0 md:absolute md:left-4 md:bottom-4 md:w-72 z-10 bg-card/90 backdrop-blur-md border border-border/50 rounded-2xl p-4 shadow-2xl">
                <p className="text-sm font-extrabold text-foreground truncate">{panel.titulo}</p>
                <p className="text-xs text-muted-foreground">{fmtCount(panel.total)} contatos totais</p>
                {(regiaoFilter !== 'all' || origemFilter !== 'all' || periodoFilter) && (
                  <p className="text-[10px] text-primary/80 font-semibold mt-0.5 truncate">{filtroLabel}</p>
                )}

                <div className="h-px bg-border/40 my-3" />

                {panel.top ? (
                  <>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Top 1</p>
                    <p className="text-sm font-bold text-foreground truncate">{panel.top.label} — {fmtCount(panel.top.total)} ({panel.top.pct}%)</p>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum contato identificado neste recorte.</p>
                )}

                {hover && (
                  <>
                    <div className="h-px bg-border/40 my-3" />
                    <p className="text-sm font-bold text-foreground truncate">{hover.titulo}</p>
                    <p className="text-xs text-muted-foreground">{hover.rank}</p>
                  </>
                )}

                {panel.max > 0 && (
                  <div className="mt-3">
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'linear-gradient(to right, hsl(0 0% 22%), hsl(0 0% 92%))' }} />
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-muted-foreground font-mono">{panel.minPositivo}</span>
                      <span className="text-[9px] text-muted-foreground uppercase tracking-wide">contatos</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{panel.max}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Contador de posição total (canto superior direito, nível estado) */}
            {level !== 'brasil' && estadoDetalhe && (
              <div className="relative w-full mt-3 md:mt-0 md:absolute md:right-4 md:top-4 md:w-auto z-10 bg-card/90 border border-border/50 rounded-xl px-3 py-2 text-right">
                <p className="text-sm font-bold text-foreground">{fmtCount(estadoDetalhe.total)} contatos</p>
                <p className="text-[10px] text-muted-foreground mb-2">{estadoDetalhe.porDdd.filter(d => d.total > 0).length} DDD(s) com contatos</p>
                <button onClick={() => selectedUf && openContatos(selectedUf)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold hover:bg-primary/20 transition-colors ml-auto">
                  <Users className="w-3.5 h-3.5" /> Ver contatos
                </button>
              </div>
            )}

            {/* Dica no nível Brasil */}
            {level === 'brasil' && (
              <div className="hidden md:block absolute right-4 top-4 z-10 bg-card/80 border border-border/40 rounded-xl px-3 py-2 max-w-[220px]">
                <p className="text-[11px] text-muted-foreground">Clique em um estado para dar zoom nos DDDs. De lá, veja a lista de contatos e a situação de cada um.</p>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Nível DDD: breakdown por cidade (quando houver dado de cidade informado) */}
        {level === 'ddd' && dddDetalhe && (
          <div key={selectedDdd} className="bg-card/20 rounded-3xl p-6 border border-border/30 mt-4 animate-fade-in">
            <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-1">
              <Users className="text-primary w-5 h-5" /> DDD {dddDetalhe.ddd} · {dddDetalhe.cidadeRef}
            </h3>
            <div className="flex items-center justify-between gap-3 mb-6">
              <p className="text-xs text-muted-foreground">{dddDetalhe.total} contato(s) neste DDD, no recorte de filtros atual.</p>
              <button onClick={() => selectedUf && selectedDdd && openContatos(selectedUf, selectedDdd)}
                className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 text-[11px] font-semibold hover:bg-primary/20 transition-colors">
                <Users className="w-3.5 h-3.5" /> Ver contatos
              </button>
            </div>

            {!dddDetalhe.temDadosDeCidade ? (
              <div className="text-center py-8">
                <MapPinOff className="w-9 h-9 text-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum contato deste DDD tem a cidade informada no cadastro.</p>
              </div>
            ) : (
              <div className="space-y-2.5 max-w-2xl">
                {dddDetalhe.porCidade.map((c) => {
                  const max = dddDetalhe.porCidade[0]?.total ?? 1
                  return (
                    <div key={c.cidade} className="flex items-center gap-3">
                      <div className="w-40 shrink-0"><p className="text-xs font-bold truncate">{c.cidade}</p></div>
                      <div className="flex-1 h-7 bg-card/60 rounded-lg overflow-hidden relative">
                        <div className="h-full rounded-lg bg-gradient-to-r from-primary/40 to-primary/10 transition-all duration-500" style={{ width: `${Math.max((c.total / max) * 100, 4)}%` }} />
                        <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-bold text-foreground">{c.total} · {c.pct}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Modal: contatos do estado ──────────────────────────────────────── */}
      {modalUf && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in" onClick={closeContatos}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative w-full sm:max-w-2xl max-h-[88vh] sm:max-h-[82vh] flex flex-col bg-card border border-border/60 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-scale-in origin-bottom sm:origin-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-border/50 shrink-0">
              <div className="min-w-0">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2 truncate">
                  <MapIcon className="w-5 h-5 text-primary shrink-0" />
                  {modalDdd ? `DDD ${modalDdd} · ${DDD_INFO[modalDdd]?.cidadeRef ?? ''}` : (ESTADOS[modalUf]?.nome ?? modalUf)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {modalLoading ? 'Carregando contatos…' : `${modalContatos.length} contato(s) identificado(s)${modalDdd ? ' nesta localidade' : ' neste estado'}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {modalDdd && (
                  <button onClick={() => setModalDdd(null)}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-xs font-semibold hover:bg-card transition-colors">
                    <Users className="w-3.5 h-3.5" /> Ver todo o estado
                  </button>
                )}
                {!modalDdd && (
                  <button onClick={() => { const uf = modalUf; closeContatos(); if (uf) enterEstado(uf) }}
                    className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card text-xs font-semibold hover:bg-card transition-colors">
                    <MapIcon className="w-3.5 h-3.5" /> Explorar DDDs
                  </button>
                )}
                <button onClick={closeContatos} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto scrollbar-thin p-3 sm:p-4">
              {modalLoading ? (
                <div className="flex items-center justify-center py-16 text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : modalContatos.length === 0 ? (
                <div className="text-center py-16">
                  <MapPinOff className="w-9 h-9 text-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">Nenhum contato identificado {modalDdd ? 'nesta localidade' : 'neste estado'} no recorte de filtros atual.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {modalContatos.map((c) => {
                    const meta = SITUACAO_META[c.situacao] ?? SITUACAO_META.sem_negocio
                    const wa = waLink(c.telefone)
                    const SitIcon = c.situacao === 'ganho' ? Trophy : c.situacao === 'perdido' ? Ban : c.situacao === 'pipeline' ? GitBranch : Users
                    return (
                      <div key={c.id} className="flex items-center gap-3 p-3 rounded-2xl bg-card/40 border border-border/30 hover:border-border/60 transition-colors">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-foreground truncate">{c.nome}</p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.cls}`}>
                              <SitIcon className="w-3 h-3" /> {meta.label}
                            </span>
                            {c.situacao === 'pipeline' && c.stageNome && (
                              <span className="text-[10px] text-muted-foreground">
                                {c.stageNome}{c.pipelineNome ? ` · ${c.pipelineNome}` : ''}
                              </span>
                            )}
                            {c.situacao === 'perdido' && c.motivoPerda && (
                              <span className="text-[10px] text-muted-foreground truncate">motivo: {c.motivoPerda}</span>
                            )}
                            {c.ddd && <span className="text-[10px] text-muted-foreground">DDD {c.ddd}{c.cidadeRef ? ` · ${c.cidadeRef}` : ''}</span>}
                          </div>
                        </div>
                        {wa ? (
                          <a href={wa} target="_blank" rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-success/10 text-success border border-success/25 text-xs font-semibold hover:bg-success/20 transition-colors shrink-0">
                            <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground shrink-0">sem telefone</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
