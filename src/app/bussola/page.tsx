'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/AppLayout'
import * as crmActions from '@/app/actions/crm'
import {
  useReportOverview,
  useReportStageFunnel,
  useReportSellerPerformance,
  useReportTimeline,
  useReportAssignmentByPipeline
} from '@/hooks/useReports'
import { exportReportToPDF } from '@/lib/report-pdf'
import {
  Compass, TrendingUp, DollarSign, Users, Target, Sparkles, BarChart3,
  FileText, Calendar, ChevronDown, Check, CheckCircle2, XCircle, Clock,
  AlertCircle, Bot, Send, X, Activity, Globe,
  MessageCircle, Star, Megaphone, Search
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip,
  CartesianGrid, BarChart, Bar, Cell
} from 'recharts'

// ─── Formatters ───────────────────────────────────────────────────────────────
const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const PCT = (v: number) => `${v.toFixed(1)}%`
const formatHours = (h: number) => h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)}h`

const PALETTE = ['#00E676', '#39FF88', '#60A5FA', '#FFB300', '#FF5722', '#a855f7']
const CHART_GRID = 'hsl(150 25% 13%)'
const TOOLTIP_STYLE = { background: '#0a0a0a', border: '1px solid #1a2e1a', borderRadius: 12 }

type Tab = 'fontes' | 'insights' | 'relatorios'

type BussolaPipeline = { id: string; nome: string; isDefault?: boolean }
type BussolaAiDeal = {
  id: string
  titulo: string
  contactId?: string
  aiScore: number
  qualificationStatus?: string
  aiRecommendedAction?: string
  aiAnalysis?: string
}
type BussolaContact = { id: string; nome: string; sobrenome?: string }
type BussolaChatLog = { id?: string; role: string; content: string; createdAt: string }
type BussolaKpi = { topCampaigns?: Array<{ campanha: string; leads: number }> }

// ─── Period preset helper ─────────────────────────────────────────────────────
function getPresetRange(preset: string, customStart?: string, customEnd?: string) {
  const now = new Date()
  const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
  const eod = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  switch (preset) {
    case 'hoje': return { start: sod, end: eod }
    case 'ontem': {
      const s = new Date(sod); s.setDate(s.getDate() - 1)
      const e = new Date(eod); e.setDate(e.getDate() - 1)
      return { start: s, end: e }
    }
    case '7d': { const s = new Date(sod); s.setDate(s.getDate() - 7); return { start: s, end: eod } }
    case '15d': { const s = new Date(sod); s.setDate(s.getDate() - 15); return { start: s, end: eod } }
    case 'este_mes': return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: eod }
    case 'mes_passado': return {
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    }
    case 'customizado': return {
      start: customStart ? new Date(customStart + 'T00:00:00') : null,
      end: customEnd ? new Date(customEnd + 'T23:59:59') : null
    }
    default: { const s = new Date(sod); s.setDate(s.getDate() - 30); return { start: s, end: eod } }
  }
}

// ─── Icon Map for dynamic icons ────────────────────────────────────────────────
const IconMap: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  Megaphone,
  Search,
  MessageCircle,
  Star,
  Globe,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle2
}

// ─────────────────────────────────────────────────────────────────────────────
export default function BussolaPage() {
  const [activeTab, setActiveTab] = useState<Tab>('fontes')

  // ── Relatórios state ────────────────────────────────────────────────────────
  const [pipelines, setPipelines] = useState<BussolaPipeline[]>([])
  const [activePipelineId, setActivePipelineId] = useState<string | null>(null)
  const [preset, setPreset] = useState('30d')
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
  })
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().split('T')[0])
  const [ownerIds, setOwnerIds] = useState<string[]>([])
  const [showPeriodDD, setShowPeriodDD] = useState(false)
  const [showSellersDD, setShowSellersDD] = useState(false)
  const [showPipelineDD, setShowPipelineDD] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  // ── IA state ────────────────────────────────────────────────────────────────
  const [deals, setDeals] = useState<BussolaAiDeal[]>([])
  const [contacts, setContacts] = useState<BussolaContact[]>([])
  const [selectedDeal, setSelectedDeal] = useState<BussolaAiDeal | null>(null)
  const [session, setSession] = useState<{ sessionId: string; logs: BussolaChatLog[] } | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [qualifying, setQualifying] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [aiLoading, setAiLoading] = useState(true)

  // ── UTM state ───────────────────────────────────────────────────────────────
  const [kpis, setKpis] = useState<BussolaKpi>({})
  const [utmLoading, setUtmLoading] = useState(true)
  const [utmSources, setUtmSources] = useState<Array<{ id: string; label: string; iconName: string; color: string; leads: number; deals: number; receita: number; custo: number }>>([])
  const [aiAlerts, setAiAlerts] = useState<Array<{ id: number | string; type: string; iconName: string; msg: string; action: string | null }>>([])

  useEffect(() => {
    crmActions.getDashboardKpis('30d').then(k => { 
      setKpis(k || { newLeads: 0, wonDeals: 0, totalRevenue: 0, winRate: 0, activePipelines: 0 }) 
    })
    crmActions.getPipelines().then(pipes => {
      setPipelines(pipes as BussolaPipeline[])
      const def = (pipes as BussolaPipeline[]).find(p => p.isDefault) || (pipes as BussolaPipeline[])[0]
      if (def) setActivePipelineId(def.id)
    })
    Promise.all([crmActions.getAiDealsOrdered(), crmActions.getContacts()]).then(([ds, cs]) => {
      setDeals(ds as BussolaAiDeal[]); setContacts(cs as BussolaContact[]); setAiLoading(false)
    })
    crmActions.getBussolaFontes().then(fontes => {
      setUtmSources(fontes)
      setUtmLoading(false)
    })
    crmActions.getBussolaAlerts().then(alerts => {
      setAiAlerts(alerts)
    })
  }, [])

  const range = useMemo(() => getPresetRange(preset, customStart, customEnd), [preset, customStart, customEnd])

  const { data: overviewData, loading: overviewLoading } = useReportOverview(activePipelineId, range, ownerIds)
  const { data: funnelData, loading: funnelLoading } = useReportStageFunnel(activePipelineId, range, ownerIds)
  const { data: sellersData, loading: sellersLoading } = useReportSellerPerformance(activePipelineId, range, ownerIds)
  const { data: timelineData, loading: timelineLoading } = useReportTimeline(activePipelineId, range, ownerIds)
  const { data: assignmentData, loading: assignmentLoading } = useReportAssignmentByPipeline(range)

  const isAnyLoading = overviewLoading || funnelLoading || sellersLoading || timelineLoading || assignmentLoading

  const sellersList = [
    { id: 'usr-admin-123', name: 'Diretor Comercial' },
    { id: 'usr-seller-1', name: 'Aline Ferreira' },
    { id: 'usr-seller-2', name: 'Bruno Gomes' }
  ]

  const activePipelineName = useMemo(() =>
    pipelines.find(p => p.id === activePipelineId)?.nome || 'Sem Pipeline', [pipelines, activePipelineId])

  const toggleSeller = (id: string) =>
    setOwnerIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const handleDownloadPDF = async () => {
    if (!overviewData || !funnelData || !sellersData || !assignmentData) {
      toast.error('Aguarde o carregamento completo dos dados.')
      return
    }
    try {
      setPdfLoading(true)
      const toastId = toast.loading('Gerando PDF comercial...')
      const presetLabels: Record<string, string> = {
        hoje: 'Hoje', ontem: 'Ontem', '7d': 'Últimos 7 dias', '15d': 'Últimos 15 dias',
        '30d': 'Últimos 30 dias', este_mes: 'Este mês', mes_passado: 'Mês passado',
        customizado: `Personalizado (${customStart} a ${customEnd})`
      }
      await exportReportToPDF({
        overview: overviewData,
        stages: funnelData,
        sellers: sellersData,
        pipelines: assignmentData,
        filters: {
          pipelineName: activePipelineName,
          periodLabel: presetLabels[preset] || 'Últimos 30 dias',
          sellersLabel: ownerIds.length === 0 ? 'Todos' : ownerIds.map(id => sellersList.find(s => s.id === id)?.name || id).join(', ')
        }
      })
      toast.dismiss(toastId)
      toast.success('PDF baixado com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao gerar PDF: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setPdfLoading(false)
    }
  }

  const handleStartQualification = async (deal: BussolaAiDeal) => {
    setSelectedDeal(deal); setSession(null); setQualifying(true)
    try {
      toast.success('IA iniciada!')
      setSession({ sessionId: 'sim-session', logs: [] })
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)) }
    setQualifying(false)
  }

  const handleSendReply = async () => {
    if (!chatInput.trim() || !session) return
    const userMsg = chatInput.trim(); setChatInput(''); setChatLoading(true)
    setSession(prev => prev ? { ...prev, logs: [...prev.logs, { id: 'tmp', role: 'user', content: userMsg, createdAt: new Date().toISOString() }] } : prev)
    setTimeout(() => {
      toast.success('Resposta recebida')
      setChatLoading(false)
    }, 1000)
  }

  const scoreColor = (s: number) => s >= 80 ? 'text-primary' : s >= 50 ? 'text-yellow-400' : 'text-destructive'
  const scoreBg = (s: number) => s >= 80 ? 'bg-primary/10 border-primary/20' : s >= 50 ? 'bg-yellow-400/10 border-yellow-400/20' : 'bg-destructive/10 border-destructive/20'

  const totalUTMLeads = utmSources.reduce((s, u) => s + u.leads, 0)
  const totalUTMReceita = utmSources.reduce((s, u) => s + u.receita, 0)
  const campaigns = kpis?.topCampaigns || []

  // ── PERIOD LABEL ─────────────────────────────────────────────────────────────
  const periodLabel = useMemo(() => {
    const m: Record<string, string> = {
      hoje: 'Hoje', ontem: 'Ontem', '7d': 'Últimos 7 dias', '15d': 'Últimos 15 dias',
      '30d': 'Últimos 30 dias', este_mes: 'Este mês', mes_passado: 'Mês passado',
      customizado: `${customStart} → ${customEnd}`
    }
    return m[preset] || 'Últimos 30 dias'
  }, [preset, customStart, customEnd])

  // ─── TAB CONFIG ───────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'fontes', label: 'Fontes & UTM', icon: TrendingUp },
    { id: 'relatorios', label: 'Relatórios', icon: BarChart3 },
  ]

  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <div className="flex flex-col h-full min-h-screen bg-secondary text-foreground select-none">

        {/* ── HEADER ──────────────────────────────────────────────────────────── */}
        <div className="px-4 sm:px-6 lg:px-8 pt-5 pb-4 border-b border-primary/20 bg-secondary backdrop-blur-md sticky top-0 z-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl font-bold tracking-tight text-primary-foreground">Bússola</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">Atribuição de fontes · Insights IA · Relatórios precisos</p>
              </div>
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                LIVE
              </span>
            </div>

            {/* Global KPIs — desktop only */}
            {!utmLoading && (
              <div className="hidden lg:flex items-center gap-4">
                {[
                  { label: 'Total Leads', value: totalUTMLeads, color: 'text-blue-400' },
                  { label: 'Receita', value: BRL(totalUTMReceita), color: 'text-primary' },
                  { label: 'Conv. Média', value: PCT(utmSources.length > 0 ? utmSources.reduce((s, u) => s + (u.leads > 0 ? (u.deals / u.leads * 100) : 0), 0) / utmSources.length : 0), color: 'text-yellow-400' },
                ].map(kpi => (
                  <div key={kpi.label} className="text-center">
                    <p className={`text-base font-bold ${kpi.color}`}>{kpi.value}</p>
                    <p className="text-[10px] text-muted-foreground">{kpi.label}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Tab switcher — scrollable on mobile */}
          <div className="overflow-x-auto scrollbar-none -mx-1 px-1">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-primary/20 w-max min-w-full sm:w-fit sm:min-w-0">
              {TABS.map(tab => {
                const Icon = tab.icon
                const active = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── TAB CONTENT ─────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto scrollbar-thin">

          {/* ══════════════════════════════════════════════════════════════════
              ABA 1 — FONTES & UTM
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'fontes' && (
            <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">

              {/* Source cards */}
              <div>
                <h2 className="text-sm font-bold text-primary-foreground mb-3 flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" /> Origem dos Leads
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
                  {utmSources.map(src => {
                    const Icon = IconMap[src.iconName] || Globe
                    const conv = src.leads > 0 ? (src.deals / src.leads * 100) : 0
                    const pct = totalUTMLeads > 0 ? (src.leads / totalUTMLeads * 100) : 0
                    const cpl = src.custo > 0 && src.leads > 0 ? src.custo / src.leads : null
                    return (
                      <div key={src.id} className="ocr-card card-padding relative overflow-hidden group hover:border-primary/30 transition-all">
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: `radial-gradient(ellipse at top left, ${src.color}08, transparent 70%)` }} />
                        <div className="flex items-center justify-between mb-3">
                          <div className="p-2 rounded-lg border" style={{ background: `${src.color}15`, borderColor: `${src.color}30` }}>
                            <Icon className="w-4 h-4" style={{ color: src.color }} />
                          </div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${src.color}15`, color: src.color }}>
                            {pct.toFixed(0)}% do total
                          </span>
                        </div>
                        <p className="text-xs font-semibold text-foreground mb-0.5">{src.label}</p>
                        <p className="text-2xl font-bold" style={{ color: src.color }}>{src.leads}</p>
                        <p className="text-[10px] text-muted-foreground mb-2">leads captados</p>
                        <div className="w-full bg-muted rounded-full h-1 mb-3">
                          <div className="h-1 rounded-full transition-all" style={{ width: `${pct}%`, background: src.color }} />
                        </div>
                        <div className="flex justify-between text-[10px] text-muted-foreground">
                          <span>{src.deals} deals</span>
                          <span className="font-semibold" style={{ color: src.color }}>{conv.toFixed(1)}% conv.</span>
                        </div>
                        {cpl !== null && (
                          <p className="text-[10px] text-muted-foreground mt-1">CPL: {BRL(cpl)}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Receita por canal + area leads */}
              {utmLoading ? (
                <div className="flex justify-center py-12">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Receita por fonte */}
                  <div className="ocr-card card-padding">
                    <h3 className="font-semibold mb-1">Receita por Fonte</h3>
                    <p className="text-xs text-muted-foreground mb-5">Valor total de deals ganhos por origem de tráfego</p>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={utmSources} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                        <XAxis dataKey="label" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={v => `R$${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [BRL(Number(v ?? 0)), 'Receita']} />
                        <Bar dataKey="receita" radius={[6, 6, 0, 0]}>
                          {utmSources.map((src, i) => <Cell key={i} fill={src.color} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Conversion table */}
                  <div className="ocr-card card-padding">
                    <h3 className="font-semibold mb-4">Tabela de Atribuição</h3>
                    <div className="space-y-1">
                      <div className="grid grid-cols-6 gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="col-span-2">Fonte</span>
                        <span className="text-right">Leads</span>
                        <span className="text-right">Deals</span>
                        <span className="text-right">Conv.</span>
                        <span className="text-right">Receita</span>
                      </div>
                      {utmSources.map(src => (
                        <div key={src.id} className="grid grid-cols-6 gap-1 px-2 py-2.5 rounded-xl hover:bg-secondary transition-colors">
                          <div className="col-span-2 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: src.color }} />
                            <span className="text-xs font-medium text-foreground truncate">{src.label}</span>
                          </div>
                          <span className="text-xs text-right text-muted-foreground">{src.leads}</span>
                          <span className="text-xs text-right font-semibold text-primary">{src.deals}</span>
                          <span className="text-xs text-right font-bold text-primary">{PCT(src.leads > 0 ? (src.deals / src.leads * 100) : 0)}</span>
                          <span className="text-xs text-right text-muted-foreground">{BRL(src.receita)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* UTM Campaign breakdown from KPIs */}
              {!utmLoading && campaigns.length > 0 && (
                <div className="ocr-card card-padding">
                  <h3 className="font-semibold mb-1">Performance por Campanha UTM</h3>
                  <p className="text-xs text-muted-foreground mb-5">Breakdown detalhado por parâmetro utm_campaign</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={[
                      { semana: 'S1', ...Object.fromEntries(campaigns.map(c => [c.campanha, Math.round(c.leads * 0.2)])) },
                      { semana: 'S2', ...Object.fromEntries(campaigns.map(c => [c.campanha, Math.round(c.leads * 0.35)])) },
                      { semana: 'S3', ...Object.fromEntries(campaigns.map(c => [c.campanha, Math.round(c.leads * 0.25)])) },
                      { semana: 'S4', ...Object.fromEntries(campaigns.map(c => [c.campanha, Math.round(c.leads * 0.2)])) },
                    ]}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="semana" tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      {campaigns.map((c, i: number) => (
                        <Area key={c.campanha} type="monotone" dataKey={c.campanha}
                          stroke={PALETTE[i % PALETTE.length]}
                          fill={PALETTE[i % PALETTE.length] + '20'}
                          strokeWidth={2} />
                      ))}
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* Tab removed: Insights de IA */}

          {/* ══════════════════════════════════════════════════════════════════
              ABA 3 — RELATÓRIOS
          ══════════════════════════════════════════════════════════════════ */}
          {activeTab === 'relatorios' && (
            <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in">

              {/* Filters Row */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Pipeline */}
                <div className="relative">
                  <button onClick={() => setShowPipelineDD(!showPipelineDD)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/20 bg-secondary text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                    <Target className="w-4 h-4 text-muted-foreground" />
                    <span>Pipeline: {activePipelineName}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {showPipelineDD && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowPipelineDD(false)} />
                      <div className="absolute left-0 mt-2 w-56 rounded-xl border border-primary/20 bg-secondary p-2 shadow-xl z-40 animate-scale-in">
                        {pipelines.map(p => (
                          <button key={p.id} onClick={() => { setActivePipelineId(p.id); setShowPipelineDD(false) }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${activePipelineId === p.id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-primary-foreground'}`}>
                            {p.nome}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Period */}
                <div className="relative">
                  <button onClick={() => setShowPeriodDD(!showPeriodDD)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/20 bg-secondary text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span>Período: {periodLabel}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {showPeriodDD && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowPeriodDD(false)} />
                      <div className="absolute left-0 mt-2 w-64 rounded-xl border border-primary/20 bg-secondary p-2 shadow-xl z-40 animate-scale-in">
                        {[
                          ['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', 'Últimos 7 dias'],
                          ['15d', 'Últimos 15 dias'], ['30d', 'Últimos 30 dias'],
                          ['este_mes', 'Este mês'], ['mes_passado', 'Mês passado'], ['customizado', 'Personalizado']
                        ].map(([value, label]) => (
                          <button key={value} onClick={() => { setPreset(value); setShowPeriodDD(false) }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${preset === value ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-primary-foreground'}`}>
                            {label}
                            {preset === value && <Check className="w-3.5 h-3.5" />}
                          </button>
                        ))}
                        {preset === 'customizado' && (
                          <div className="flex gap-2 mt-2 px-2">
                            <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                              className="flex-1 bg-secondary border border-primary/20 rounded-lg px-2 py-1 text-xs text-foreground" />
                            <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                              className="flex-1 bg-secondary border border-primary/20 rounded-lg px-2 py-1 text-xs text-foreground" />
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Sellers */}
                <div className="relative">
                  <button onClick={() => setShowSellersDD(!showSellersDD)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/20 bg-secondary text-xs font-semibold text-foreground hover:bg-muted transition-colors">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    <span>Vendedores: {ownerIds.length === 0 ? 'Todos' : ownerIds.length + ' sel.'}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  {showSellersDD && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowSellersDD(false)} />
                      <div className="absolute left-0 mt-2 w-52 rounded-xl border border-primary/20 bg-secondary p-2 shadow-xl z-40 animate-scale-in">
                        <button onClick={() => setOwnerIds([])} className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-primary-foreground flex items-center justify-between">
                          Todos os vendedores {ownerIds.length === 0 && <Check className="w-3.5 h-3.5 text-primary" />}
                        </button>
                        {sellersList.map(s => (
                          <button key={s.id} onClick={() => toggleSeller(s.id)}
                            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-primary-foreground flex items-center justify-between">
                            {s.name}
                            {ownerIds.includes(s.id) && <Check className="w-3.5 h-3.5 text-primary" />}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                <button onClick={handleDownloadPDF} disabled={isAnyLoading || pdfLoading}
                  className="ml-auto flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-50">
                  <FileText className="w-4 h-4" />
                  {pdfLoading ? 'Gerando...' : 'Baixar PDF'}
                </button>
              </div>

              {/* Overview KPIs */}
              {overviewLoading ? (
                <div className="flex justify-center py-8"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : overviewData && (
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                  {[
                    { label: 'Criados', value: overviewData.created, icon: Target, color: 'text-blue-400' },
                    { label: 'Ganhos', value: overviewData.won, icon: CheckCircle2, color: 'text-primary' },
                    { label: 'Perdidos', value: overviewData.lost, icon: XCircle, color: 'text-destructive' },
                    { label: 'Conversão', value: PCT(overviewData.taxaConversao), icon: TrendingUp, color: 'text-yellow-400' },
                    { label: 'Ticket Médio', value: BRL(overviewData.ticketMedio), icon: DollarSign, color: 'text-primary' },
                    { label: 'Em Aberto', value: BRL(overviewData.receitaEmAberto), icon: Activity, color: 'text-blue-400' },
                    { label: 'Tempo Atrib.', value: formatHours(overviewData.avgAssignmentHours), icon: Clock, color: 'text-orange-400' },
                    { label: 'Pipeline', value: activePipelineName, icon: BarChart3, color: 'text-purple-400' },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="ocr-card card-padding">
                      <div className={`p-2 rounded-xl bg-secondary border border-primary/20 ${color} w-fit mb-2`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-0.5">{label}</p>
                      <p className={`text-xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Timeline chart */}
              {!timelineLoading && timelineData.length > 0 && (
                <div className="ocr-card card-padding">
                  <h3 className="font-semibold mb-1">Timeline de Deals</h3>
                  <p className="text-xs text-muted-foreground mb-5">Deals criados, ganhos e perdidos por dia no período</p>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={timelineData}>
                      <defs>
                        <linearGradient id="gc" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#00E676" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#00E676" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#60A5FA" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#60A5FA" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gp" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} />
                      <XAxis dataKey="data" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="criados" name="Criados" stroke="#00E676" fill="url(#gc)" strokeWidth={2} />
                      <Area type="monotone" dataKey="ganhos" name="Ganhos" stroke="#60A5FA" fill="url(#gg)" strokeWidth={2} />
                      <Area type="monotone" dataKey="perdidos" name="Perdidos" stroke="#ef4444" fill="url(#gp)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Funnel + Sellers */}
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {/* Funnel */}
                {!funnelLoading && funnelData.length > 0 && (
                  <div className="ocr-card card-padding">
                    <h3 className="font-semibold mb-4">Funil de Conversão por Etapa</h3>
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="col-span-2">Etapa</span>
                        <span className="text-right">Ativos</span>
                        <span className="text-right">Entradas</span>
                        <span className="text-right">Tempo Méd.</span>
                      </div>
                      {funnelData.map(s => (
                        <div key={s.stageId} className="grid grid-cols-5 gap-1 px-2 py-2.5 rounded-xl hover:bg-secondary transition-colors">
                          <div className="col-span-2 flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.cor || '#00E676' }} />
                            <span className="text-xs font-medium text-foreground truncate">{s.stageNome}</span>
                          </div>
                          <span className="text-xs text-right font-semibold text-primary">{s.countCurrent}</span>
                          <span className="text-xs text-right text-muted-foreground">{s.entradas}</span>
                          <span className="text-xs text-right text-muted-foreground">{formatHours(s.permanenciaMediaHoras)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sellers */}
                {!sellersLoading && sellersData.length > 0 && (
                  <div className="ocr-card card-padding">
                    <h3 className="font-semibold mb-4">Performance por Vendedor</h3>
                    <div className="space-y-2">
                      <div className="grid grid-cols-5 gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                        <span className="col-span-2">Vendedor</span>
                        <span className="text-right">Leads</span>
                        <span className="text-right">Ganhos</span>
                        <span className="text-right">Conv.</span>
                      </div>
                      {sellersData.map(s => (
                        <div key={s.sellerId} className="grid grid-cols-5 gap-1 px-2 py-2.5 rounded-xl hover:bg-secondary transition-colors">
                          <div className="col-span-2 flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-[9px] flex items-center justify-center font-bold shrink-0">
                              {s.sellerNome.split(' ').map((w: string) => w[0]).join('').slice(0, 2)}
                            </div>
                            <span className="text-xs font-medium text-foreground truncate">{s.sellerNome}</span>
                          </div>
                          <span className="text-xs text-right text-muted-foreground">{s.leadsAtribuidos}</span>
                          <span className="text-xs text-right font-semibold text-primary">{s.dealsGanhos}</span>
                          <span className={`text-xs text-right font-bold ${s.conversao >= 30 ? 'text-primary' : s.conversao >= 15 ? 'text-yellow-400' : 'text-destructive'}`}>
                            {PCT(s.conversao)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Pipeline comparison */}
              {!assignmentLoading && assignmentData.length > 0 && (
                <div className="ocr-card card-padding">
                  <h3 className="font-semibold mb-4">Comparativo entre Pipelines</h3>
                  <div className="space-y-2">
                    <div className="grid grid-cols-4 gap-1 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      <span className="col-span-2">Pipeline</span>
                      <span className="text-right">Deals</span>
                      <span className="text-right">Tempo Atrib.</span>
                    </div>
                    {assignmentData.map((p, i) => (
                      <div key={p.pipelineId} className="grid grid-cols-4 gap-1 px-2 py-2.5 rounded-xl hover:bg-secondary transition-colors">
                        <div className="col-span-2 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PALETTE[i % PALETTE.length] }} />
                          <span className="text-xs font-medium text-foreground">{p.pipelineNome}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-xs font-semibold text-foreground">{p.totalDeals}</span>
                          <span className="text-[10px] text-muted-foreground ml-1">({p.distribuicaoPercent.toFixed(0)}%)</span>
                        </div>
                        <span className="text-xs text-right text-muted-foreground">{formatHours(p.avgAssignmentHours)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
