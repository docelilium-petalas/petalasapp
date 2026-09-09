'use client'

import React, { useEffect, useState, useMemo, useCallback } from 'react'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { AppToaster } from '@/components/ui/AppToaster'
import { AppLayout } from '@/components/AppLayout'
import * as desafiosActions from '@/app/actions/desafios'
import {
  TrendingUp, TrendingDown, DollarSign, Settings,
  Calendar, CheckCircle, Flame, Trophy, Trash2, Plus, X, Target,
  Users, Filter, ArrowRight, Lightbulb, AlertTriangle, Zap, Minus,
  Award, Gift, Clock, Pencil, Medal, Activity, Timer, Crown
} from 'lucide-react'
import { toast } from 'sonner'
import { useCategories } from '@/lib/categories'
import { DateRangeFilter } from '@/components/ui/DateRangeFilter'
import { FunnelChart } from '@/components/FunnelChart'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(v)

// ─── Metric metadata ──────────────────────────────────────────────────────────
type MetricKey =
  | 'vendas' | 'agendamentos' | 'comparecimentos' | 'conversas' | 'respostas'
  | 'leadsAp' | 'zonaCinza' | 'desqualificadas'
  | 'taxaComparecimento' | 'taxaFechamento' | 'taxaResposta'
  | 'cpa' | 'cpl'

const METRIC_META: Record<MetricKey, { label: string; color: string; suffix?: string; money?: boolean; menor?: boolean }> = {
  vendas: { label: 'Vendas', color: '#00E676' },
  agendamentos: { label: 'Agendamentos', color: '#60A5FA' },
  comparecimentos: { label: 'Comparecimentos', color: '#a855f7' },
  conversas: { label: 'Conversas', color: '#e5e5e5' },
  respostas: { label: 'Respostas', color: '#38bdf8' },
  leadsAp: { label: 'Leads AP', color: '#00E676' },
  zonaCinza: { label: 'Zona Cinza', color: '#FFB300' },
  desqualificadas: { label: 'Desqualificadas', color: '#FF5722' },
  taxaComparecimento: { label: 'Taxa de Comparecimento', color: '#a855f7', suffix: '%' },
  taxaFechamento: { label: 'Taxa de Fechamento', color: '#00E676', suffix: '%' },
  taxaResposta: { label: 'Taxa de Resposta', color: '#38bdf8', suffix: '%' },
  cpa: { label: 'CPA (Custo/Venda)', color: '#00E676', money: true, menor: true },
  cpl: { label: 'CPL (Custo/Agend.)', color: '#FFB300', money: true, menor: true },
}

// Métricas oferecidas no editor de metas do mês
const METAS_METRICS: MetricKey[] = ['vendas', 'agendamentos', 'comparecimentos', 'conversas', 'taxaComparecimento', 'taxaFechamento', 'cpa']

const fmtMetric = (key: string, v: number) => {
  const meta = METRIC_META[key as MetricKey]
  if (!meta) return String(v)
  if (meta.money) return BRL(v)
  if (meta.suffix) return `${v}${meta.suffix}`
  return String(v)
}

// ─── Small UI pieces ──────────────────────────────────────────────────────────
function DeltaBadge({ value, invert = false }: { value: number; invert?: boolean }) {
  if (value === 0) return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-muted-foreground">
      <Minus className="w-3 h-3" /> 0%
    </span>
  )
  const good = invert ? value < 0 : value > 0
  const Icon = value > 0 ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold ${good ? 'text-success' : 'text-destructive'}`}>
      <Icon className="w-3 h-3" /> {value > 0 ? '+' : ''}{value}%
    </span>
  )
}

function MetaGauge({ pct, color, noRitmo }: { pct: number; color: string; noRitmo: boolean }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(pct, 100))
  const dash = (clamped / 100) * circ
  const ringColor = pct >= 100 ? '#00E676' : noRitmo ? color : '#FFB300'
  return (
    <div className="relative w-24 h-24">
      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#262626" strokeWidth="7" />
        <circle
          cx="40" cy="40" r={r} fill="none" stroke={ringColor} strokeWidth="7"
          strokeLinecap="round" strokeDasharray={`${dash} ${circ}`}
          style={{ transition: 'stroke-dasharray .6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-black" style={{ color: ringColor }}>{pct}%</span>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
type TabId = 'central' | 'metas' | 'funil' | 'ranking' | 'custos' | 'regras'

type RankMetric = 'vendas' | 'receita' | 'comparecimentos' | 'agendamentos' | 'conversas' | 'taxaFechamento'
const RANK_METRICS: { key: RankMetric; label: string }[] = [
  { key: 'vendas', label: 'Vendas' },
  { key: 'receita', label: 'Receita' },
  { key: 'comparecimentos', label: 'Comparecimentos' },
  { key: 'agendamentos', label: 'Agendamentos' },
  { key: 'conversas', label: 'Conversas' },
  { key: 'taxaFechamento', label: 'Taxa de Fechamento' },
]
const fmtRank = (key: RankMetric, v: number) => key === 'receita' ? BRL(v) : key === 'taxaFechamento' ? `${v}%` : String(v)

const fmtDur = (h: number | null): string => {
  if (h == null) return '—'
  if (h < 1) return `${Math.round(h * 60)}min`
  if (h < 24) return `${Math.round(h * 10) / 10}h`
  const d = Math.floor(h / 24)
  const rest = Math.round(h % 24)
  return rest > 0 ? `${d}d ${rest}h` : `${d}d`
}

export default function DesafiosPage() {
  const [activeTab, setActiveTab] = useState<TabId>('central')
  const categoriesStore = useCategories()

  // Base data
  const [vendedores, setVendedores] = useState<desafiosActions.Vendedor[]>([])
  const [pipelines, setPipelines] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [custos, setCustos] = useState<any[]>([])
  const [rules, setRules] = useState<any>({ agendamentoStages: [], comparecimentoStages: [], zonaCinzaStages: [], leadsApStages: [], desqualificadaStages: [] })

  // Dashboard data
  const [comparison, setComparison] = useState<any>(null)
  const [funnel, setFunnel] = useState<any>(null)
  const [insights, setInsights] = useState<desafiosActions.Insight[]>([])
  const [metasProgress, setMetasProgress] = useState<any>(null)

  // Funil tab data
  const [funilConv, setFunilConv] = useState<any>(null)
  const [funilTiming, setFunilTiming] = useState<desafiosActions.FunnelTiming | null>(null)
  const [funilLoading, setFunilLoading] = useState(false)

  // Ranking tab data
  const [ranking, setRanking] = useState<desafiosActions.RankingVendedor[]>([])
  const [rankingLoading, setRankingLoading] = useState(false)
  const [rankMetric, setRankMetric] = useState<RankMetric>('vendas')

  // ROI (Custos tab) data
  const [roiHist, setRoiHist] = useState<desafiosActions.RoiMes[]>([])
  const [roiOrigem, setRoiOrigem] = useState<desafiosActions.RoiOrigem[]>([])
  const [cpaTeto, setCpaTeto] = useState('')
  const [savingTeto, setSavingTeto] = useState(false)

  const [loading, setLoading] = useState(true)
  const [dashLoading, setDashLoading] = useState(false)

  // Filters
  const [dateRange, setDateRange] = useState({
    start: new Date(new Date().setDate(1)).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0],
  })
  const [ownerFilter, setOwnerFilter] = useState<string>('all')
  const [pipelineFilter, setPipelineFilter] = useState<string>('all')

  // Custos form
  const [custoMesAno, setCustoMesAno] = useState('')
  const [custoValor, setCustoValor] = useState('')

  // Metas modal (contexto: de onde foi aberto)
  const [metasModalOpen, setMetasModalOpen] = useState(false)
  const [metasDraft, setMetasDraft] = useState<Record<string, string>>({})
  const [savingMetas, setSavingMetas] = useState(false)
  const [metaCtx, setMetaCtx] = useState<{ periodo: string; owner: string | null; label: string; existing: any[] }>({ periodo: '', owner: null, label: '', existing: [] })

  // Metas tab (seletores próprios)
  const nowMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`
  const [metasPeriodo, setMetasPeriodo] = useState(nowMonth)
  const [metasOwner, setMetasOwner] = useState<string>('all')
  const [metasTab, setMetasTab] = useState<any>(null)
  const [streak, setStreak] = useState<desafiosActions.StreakResult | null>(null)
  const [challenges, setChallenges] = useState<any[]>([])
  const [metasTabLoading, setMetasTabLoading] = useState(false)

  // Challenge modal
  const [chModalOpen, setChModalOpen] = useState(false)
  const [chSaving, setChSaving] = useState(false)
  const emptyCh = { id: '', titulo: '', descricao: '', metrica: 'vendas', alvo: '', inicio: '', fim: '', recompensa: '', ownerUserId: 'all' }
  const [chDraft, setChDraft] = useState<any>(emptyCh)

  const periodo = dateRange.start.substring(0, 7)
  const filters = useMemo(() => ({
    ownerUserId: ownerFilter === 'all' ? null : ownerFilter,
    pipelineId: pipelineFilter === 'all' ? null : pipelineFilter,
  }), [ownerFilter, pipelineFilter])

  useEffect(() => { loadBase() }, [])

  useEffect(() => {
    if (activeTab === 'central') loadDashboard()
  }, [dateRange, ownerFilter, pipelineFilter, activeTab])

  useEffect(() => {
    if (activeTab === 'metas') loadMetasTab()
  }, [metasPeriodo, metasOwner, activeTab])

  useEffect(() => {
    if (activeTab === 'funil') loadFunil()
  }, [dateRange, ownerFilter, pipelineFilter, activeTab])

  useEffect(() => {
    if (activeTab === 'ranking') loadRanking()
  }, [dateRange, pipelineFilter, activeTab])

  useEffect(() => {
    if (activeTab === 'custos') loadCustosRoi()
  }, [activeTab])

  const loadBase = async () => {
    setLoading(true)
    try {
      const [vend, pipes, rls, csts] = await Promise.all([
        desafiosActions.getVendedores(),
        desafiosActions.getDesafiosStages(),
        desafiosActions.getDesafiosRules(),
        desafiosActions.getCustosOperacao(),
      ])
      setVendedores(vend)
      setPipelines(pipes as any[])
      const allStages: any[] = []
      ;(pipes as any[]).forEach(p => p.stages?.forEach((s: any) => allStages.push({ ...s, pipelineName: p.nome })))
      setStages(allStages)
      setRules(rls)
      setCustos(csts)
      await loadDashboard()
    } catch {
      toast.error('Erro ao carregar dados.')
    } finally {
      setLoading(false)
    }
  }

  const loadDashboard = useCallback(async () => {
    setDashLoading(true)
    try {
      const start = new Date(dateRange.start + 'T00:00:00.000Z')
      const end = new Date(dateRange.end + 'T23:59:59.999Z')
      const f = { ownerUserId: ownerFilter === 'all' ? null : ownerFilter, pipelineId: pipelineFilter === 'all' ? null : pipelineFilter }
      const [cmp, fnl, ins, mp] = await Promise.all([
        desafiosActions.getMetricsComparison(start, end, f),
        desafiosActions.getFunnelConversion(start, end, f),
        desafiosActions.getInsights(start, end, f),
        desafiosActions.getMetasProgress(dateRange.start.substring(0, 7), f),
      ])
      setComparison(cmp)
      setFunnel(fnl)
      setInsights(ins)
      setMetasProgress(mp)
    } catch {
      toast.error('Erro ao calcular métricas.')
    } finally {
      setDashLoading(false)
    }
  }, [dateRange, ownerFilter, pipelineFilter])

  const loadRanking = useCallback(async () => {
    setRankingLoading(true)
    try {
      const start = new Date(dateRange.start + 'T00:00:00.000Z')
      const end = new Date(dateRange.end + 'T23:59:59.999Z')
      const res = await desafiosActions.getRankingVendedores(start, end, pipelineFilter === 'all' ? null : pipelineFilter)
      setRanking(res)
    } catch {
      toast.error('Erro ao carregar ranking.')
    } finally {
      setRankingLoading(false)
    }
  }, [dateRange, pipelineFilter])

  const loadFunil = useCallback(async () => {
    setFunilLoading(true)
    try {
      const start = new Date(dateRange.start + 'T00:00:00.000Z')
      const end = new Date(dateRange.end + 'T23:59:59.999Z')
      const f = { ownerUserId: ownerFilter === 'all' ? null : ownerFilter, pipelineId: pipelineFilter === 'all' ? null : pipelineFilter }
      const [conv, timing] = await Promise.all([
        desafiosActions.getFunnelConversion(start, end, f),
        desafiosActions.getFunnelTiming(start, end, f),
      ])
      setFunilConv(conv)
      setFunilTiming(timing)
    } catch {
      toast.error('Erro ao calcular funil.')
    } finally {
      setFunilLoading(false)
    }
  }, [dateRange, ownerFilter, pipelineFilter])

  const loadMetasTab = useCallback(async () => {
    setMetasTabLoading(true)
    try {
      const owner = metasOwner === 'all' ? null : metasOwner
      const [mp, stk, chs] = await Promise.all([
        desafiosActions.getMetasProgress(metasPeriodo, { ownerUserId: owner }),
        desafiosActions.getStreak(owner),
        desafiosActions.getChallengesProgress(),
      ])
      setMetasTab(mp)
      setStreak(stk)
      setChallenges(chs)
    } catch {
      toast.error('Erro ao carregar metas.')
    } finally {
      setMetasTabLoading(false)
    }
  }, [metasPeriodo, metasOwner])

  // ── Metas (modal com contexto) ──
  const openMetasModal = (ctx: { periodo: string; owner: string | null; label: string; existing: any[] }) => {
    const draft: Record<string, string> = {}
    ;(ctx.existing || []).forEach((p: any) => { draft[p.metrica] = String(p.alvo) })
    setMetaCtx(ctx)
    setMetasDraft(draft)
    setMetasModalOpen(true)
  }

  const handleSaveMetas = async () => {
    setSavingMetas(true)
    try {
      const entries = Object.entries(metasDraft).filter(([, v]) => v !== '' && !isNaN(parseFloat(v.replace(',', '.'))))
      await Promise.all(entries.map(([metrica, v]) =>
        desafiosActions.saveMeta({ periodo: metaCtx.periodo, metrica, alvo: parseFloat(v.replace(',', '.')), ownerUserId: metaCtx.owner })
      ))
      const removed = (metaCtx.existing || []).filter((p: any) => !(p.metrica in metasDraft) || metasDraft[p.metrica] === '')
      await Promise.all(removed.map((p: any) => desafiosActions.deleteMeta(p.id)))
      toast.success('Metas atualizadas!')
      setMetasModalOpen(false)
      if (activeTab === 'central') loadDashboard()
      if (activeTab === 'metas') loadMetasTab()
    } catch {
      toast.error('Erro ao salvar metas.')
    } finally {
      setSavingMetas(false)
    }
  }

  // ── Challenges ──
  const openChModal = (ch?: any) => {
    if (ch) {
      setChDraft({
        id: ch.id, titulo: ch.titulo, descricao: ch.descricao || '', metrica: ch.metrica,
        alvo: String(ch.alvo), inicio: new Date(ch.inicio).toISOString().split('T')[0],
        fim: new Date(ch.fim).toISOString().split('T')[0], recompensa: ch.recompensa || '',
        ownerUserId: ch.ownerUserId || 'all',
      })
    } else {
      const today = new Date().toISOString().split('T')[0]
      const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
      setChDraft({ ...emptyCh, inicio: today, fim: in30, ownerUserId: metasOwner })
    }
    setChModalOpen(true)
  }

  const handleSaveChallenge = async () => {
    if (!chDraft.titulo || !chDraft.alvo || !chDraft.inicio || !chDraft.fim) {
      toast.error('Preencha título, alvo e datas.')
      return
    }
    setChSaving(true)
    try {
      await desafiosActions.saveChallenge({
        titulo: chDraft.titulo,
        descricao: chDraft.descricao || null,
        metrica: chDraft.metrica,
        alvo: parseFloat(chDraft.alvo),
        inicio: new Date(chDraft.inicio + 'T00:00:00'),
        fim: new Date(chDraft.fim + 'T23:59:59'),
        recompensa: chDraft.recompensa || null,
        ownerUserId: chDraft.ownerUserId === 'all' ? null : chDraft.ownerUserId,
      }, chDraft.id || undefined)
      toast.success(chDraft.id ? 'Desafio atualizado!' : 'Desafio criado!')
      setChModalOpen(false)
      loadMetasTab()
    } catch {
      toast.error('Erro ao salvar desafio.')
    } finally {
      setChSaving(false)
    }
  }

  const handleChStatus = async (id: string, status: 'CONCLUIDO' | 'FALHOU' | 'ATIVO') => {
    try {
      await desafiosActions.updateChallengeStatus(id, status)
      loadMetasTab()
    } catch {
      toast.error('Erro ao atualizar status.')
    }
  }

  const handleDeleteChallenge = async (id: string) => {
    const ok = await confirmar({ titulo: 'Excluir este desafio?', confirmar: 'Excluir desafio' })
    if (!ok) return
    try {
      await desafiosActions.deleteChallenge(id)
      setChallenges(challenges.filter(c => c.id !== id))
      toast.success('Desafio excluído.')
    } catch {
      toast.error('Erro ao excluir desafio.')
    }
  }

  // ── ROI (Custos tab) ──
  const loadCustosRoi = useCallback(async () => {
    try {
      const start = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const end = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59, 999)
      const [hist, origem, metas] = await Promise.all([
        desafiosActions.getRoiHistorico(6),
        desafiosActions.getRoiPorOrigem(start, end),
        desafiosActions.getMetas(nowMonth),
      ])
      setRoiHist(hist)
      setRoiOrigem(origem)
      const cpaMeta = (metas as any[]).find(mt => mt.metrica === 'cpa' && !mt.ownerUserId)
      setCpaTeto(cpaMeta ? String(cpaMeta.alvo) : '')
    } catch {
      toast.error('Erro ao carregar ROI.')
    }
  }, [nowMonth])

  const handleSaveCpaTeto = async () => {
    if (!cpaTeto || isNaN(parseFloat(cpaTeto))) return
    setSavingTeto(true)
    try {
      await desafiosActions.saveMeta({ periodo: nowMonth, metrica: 'cpa', alvo: parseFloat(cpaTeto), tipo: 'MENOR_MELHOR', ownerUserId: null })
      toast.success('Teto de CPA definido!')
      loadCustosRoi()
    } catch {
      toast.error('Erro ao salvar teto.')
    } finally {
      setSavingTeto(false)
    }
  }

  // ── Custos ──
  const handleSaveCusto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!custoMesAno || !custoValor) return
    try {
      await desafiosActions.saveCustoOperacao(custoMesAno, parseFloat(custoValor))
      toast.success('Custo adicionado.')
      setCustoMesAno(''); setCustoValor('')
      setCustos(await desafiosActions.getCustosOperacao())
      if (activeTab === 'central') loadDashboard()
      loadCustosRoi()
    } catch {
      toast.error('Erro ao salvar custo.')
    }
  }

  const handleDeleteCusto = async (id: string) => {
    const ok = await confirmar({ titulo: 'Excluir este custo?', confirmar: 'Excluir custo' })
    if (!ok) return
    try {
      await desafiosActions.deleteCustoOperacao(id)
      setCustos(custos.filter(c => c.id !== id))
      toast.success('Custo excluído.')
    } catch {
      toast.error('Erro ao excluir custo.')
    }
  }

  // ── Regras ──
  const handleSaveRules = async () => {
    try {
      await desafiosActions.saveDesafiosRules(rules)
      toast.success('Regras salvas com sucesso!')
      loadDashboard()
    } catch {
      toast.error('Erro ao salvar regras.')
    }
  }

  const m = comparison?.atual
  const deltas = comparison?.deltas || {}
  const ownerLabel = ownerFilter === 'all' ? 'Operação' : vendedores.find(v => v.id === ownerFilter)?.nome || ''
  const rankedList = useMemo(() => [...ranking].sort((a, b) => ((b as any)[rankMetric] ?? 0) - ((a as any)[rankMetric] ?? 0)), [ranking, rankMetric])
  const roiChart = useMemo(() => roiHist.map(r => { const [y, mo] = r.periodo.split('-'); return { mes: `${mo}/${y.slice(2)}`, CPA: r.cpa, CPL: r.cpl } }), [roiHist])
  const currentCpa = roiHist.length ? roiHist[roiHist.length - 1].cpa : 0
  const tetoExceeded = !!cpaTeto && currentCpa > 0 && currentCpa > parseFloat(cpaTeto)
  const maxOrigemLeads = Math.max(1, ...roiOrigem.map(o => o.leads))

  if (loading) return (
    <AppLayout>
      <div className="flex h-full items-center justify-center bg-black">
        <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      </div>
    </AppLayout>
  )

  return (
    <AppLayout>
      <AppToaster />
      <div className="flex flex-col h-full bg-black text-foreground overflow-y-auto scrollbar-thin p-4 sm:p-6 md:p-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold bg-gradient-to-r from-primary to-success bg-clip-text text-transparent flex items-center gap-2">
              <Trophy className="w-6 h-6 text-primary" /> Desafios
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              KPIs, metas e o caminho até elas — {ownerLabel}.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-card/50 p-1.5 rounded-xl border border-border/50">
            {[
              { id: 'central', label: 'Central', icon: TrendingUp },
              { id: 'metas', label: 'Metas', icon: Target },
              { id: 'funil', label: 'Funil', icon: Activity },
              { id: 'ranking', label: 'Ranking', icon: Crown },
              { id: 'custos', label: 'Custos', icon: DollarSign },
              { id: 'regras', label: 'Regras', icon: Settings },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as TabId)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === t.id
                    ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                    : 'text-muted-foreground hover:bg-card hover:text-foreground'
                }`}
              >
                <t.icon className="w-4 h-4" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* TAB: CENTRAL DE COMANDO */}
        {activeTab === 'central' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Filters bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-card/30 p-3 rounded-2xl border border-border/30">
              <DateRangeFilter
                value={dateRange}
                onChange={(range) => setDateRange(range)}
                presets={[['hoje', 'Hoje'], ['7d', '7 Dias'], ['30d', '30 Dias'], ['este_mes', 'Este Mês']]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
                    className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Toda a operação</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)}
                    className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Todos os funis</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Insights bar */}
            {insights.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {insights.slice(0, 3).map((ins, i) => {
                  const style = {
                    positivo: { icon: Zap, cls: 'border-success/30 bg-success/5', ic: 'text-success' },
                    alerta: { icon: AlertTriangle, cls: 'border-warning/30 bg-warning/5', ic: 'text-warning' },
                    critico: { icon: AlertTriangle, cls: 'border-destructive/30 bg-destructive/5', ic: 'text-destructive' },
                    info: { icon: Lightbulb, cls: 'border-border/40 bg-card/40', ic: 'text-muted-foreground' },
                  }[ins.tipo]
                  const Icon = style.icon
                  return (
                    <div key={i} className={`flex gap-3 p-4 rounded-2xl border ${style.cls}`}>
                      <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${style.ic}`} />
                      <div>
                        <p className="text-sm font-bold">{ins.titulo}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ins.descricao}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* KPI row with deltas */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {([
                { key: 'vendas', accent: 'primary' },
                { key: 'agendamentos', accent: 'blue' },
                { key: 'comparecimentos', accent: 'purple' },
                { key: 'conversas', accent: 'neutral' },
                { key: 'respostas', accent: 'sky' },
              ] as { key: MetricKey; accent: string }[]).map(({ key }) => (
                <div key={key} className="bg-card/40 p-5 rounded-2xl border border-border/30 hover:border-primary/30 transition-all flex flex-col items-center justify-center relative overflow-hidden group">
                  <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1 text-center">{METRIC_META[key].label}</span>
                  <span className="text-4xl font-black" style={{ color: METRIC_META[key].color }}>{m?.[key] ?? 0}</span>
                  <div className="mt-1"><DeltaBadge value={deltas[key] ?? 0} /></div>
                </div>
              ))}
            </div>

            {/* Derived rates + CPA/CPL */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {(['taxaResposta', 'taxaComparecimento', 'taxaFechamento'] as MetricKey[]).map(key => (
                <div key={key} className="bg-card/40 p-4 rounded-2xl border border-border/30 flex flex-col items-center justify-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-1 text-center">{METRIC_META[key].label}</span>
                  <span className="text-2xl font-black" style={{ color: METRIC_META[key].color }}>{m?.[key] ?? 0}%</span>
                  <div className="mt-1"><DeltaBadge value={deltas[key] ?? 0} /></div>
                </div>
              ))}
              <div className="bg-success/5 p-4 rounded-2xl border border-success/20 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-success/70 uppercase tracking-wide mb-1">CPA (Custo/Venda)</span>
                <span className="text-2xl font-black text-success">{BRL(metasProgress?.cpa ?? 0)}</span>
                {(metasProgress?.custoValor ?? 0) === 0 && <span className="text-[9px] text-muted-foreground mt-1">Sem custo no mês</span>}
              </div>
              <div className="bg-warning/5 p-4 rounded-2xl border border-warning/20 flex flex-col items-center justify-center">
                <span className="text-[10px] font-bold text-warning/70 uppercase tracking-wide mb-1">CPL (Custo/Agend.)</span>
                <span className="text-2xl font-black text-warning">{BRL(metasProgress?.cpl ?? 0)}</span>
                {(metasProgress?.custoValor ?? 0) === 0 && <span className="text-[9px] text-muted-foreground mt-1">Sem custo no mês</span>}
              </div>
            </div>

            {/* Metas do mês (gauges + projeção) */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <Target className="text-primary w-5 h-5" /> Metas de {periodo} · {ownerLabel}
                </h3>
                <button onClick={() => openMetasModal({ periodo, owner: ownerFilter === 'all' ? null : ownerFilter, label: ownerLabel, existing: metasProgress?.progresso || [] })} className="flex items-center gap-1.5 text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                  <Target className="w-3.5 h-3.5" /> Definir metas
                </button>
              </div>

              {(!metasProgress?.progresso || metasProgress.progresso.length === 0) ? (
                <div className="text-center py-10">
                  <Target className="w-10 h-10 text-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Nenhuma meta definida para {ownerLabel} em {periodo}.</p>
                  <button onClick={() => openMetasModal({ periodo, owner: ownerFilter === 'all' ? null : ownerFilter, label: ownerLabel, existing: metasProgress?.progresso || [] })} className="bg-primary text-black font-bold px-5 py-2 rounded-xl hover:brightness-110 transition-all inline-flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Definir metas do mês
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {metasProgress.progresso.map((p: any) => {
                    const meta = METRIC_META[p.metrica as MetricKey]
                    return (
                      <div key={p.id} className="flex items-center gap-4 bg-card/50 p-4 rounded-2xl border border-border/20">
                        <MetaGauge pct={p.pctAtingido} color={meta?.color || '#00E676'} noRitmo={p.noRitmo} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate">{meta?.label || p.metrica}</p>
                          <p className="text-xl font-black mt-0.5">
                            {fmtMetric(p.metrica, p.realizado)}
                            <span className="text-sm font-medium text-muted-foreground"> / {fmtMetric(p.metrica, p.alvo)}</span>
                          </p>
                          {p.tipo !== 'MENOR_MELHOR' && p.necessarioPorDia > 0 ? (
                            <p className="text-[11px] mt-1 text-warning/90 font-semibold">
                              faltam {fmtMetric(p.metrica, p.restante)} · {p.necessarioPorDia}/dia
                            </p>
                          ) : (
                            <p className={`text-[11px] mt-1 font-semibold ${p.noRitmo ? 'text-success' : 'text-warning'}`}>
                              {p.noRitmo ? '✓ no ritmo' : 'atenção ao ritmo'}
                              {p.tipo !== 'MENOR_MELHOR' && p.projecao != null ? ` · projeção ${fmtMetric(p.metrica, p.projecao)}` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Funil de conversão */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <Flame className="text-warning w-5 h-5" /> Funil de Conversão
                </h3>
                {funnel?.gargalo && (
                  <span className="text-[11px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-3 py-1 rounded-lg">
                    Gargalo: {funnel.gargalo.label} ({funnel.gargalo.taxaDaAnterior}%)
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {(funnel?.steps || []).map((step: any, idx: number) => {
                  const maxVal = funnel?.steps?.[0]?.valor || 1
                  const width = Math.max((step.valor / maxVal) * 100, 3)
                  const isGargalo = funnel?.gargalo?.key === step.key
                  return (
                    <div key={step.key} className="flex items-center gap-3">
                      <div className="w-32 shrink-0 text-right">
                        <span className="text-xs font-bold text-foreground">{step.label}</span>
                      </div>
                      <div className="flex-1 h-9 bg-card/60 rounded-lg overflow-hidden relative">
                        <div
                          className="h-full rounded-lg flex items-center px-3 transition-all duration-500"
                          style={{ width: `${width}%`, background: isGargalo ? 'linear-gradient(90deg,#f43f5e33,#f43f5e11)' : 'linear-gradient(90deg,#00E67633,#00E67611)', borderRight: `2px solid ${isGargalo ? '#f43f5e' : '#00E676'}` }}
                        >
                          <span className="text-sm font-black text-foreground">{step.valor}</span>
                        </div>
                      </div>
                      <div className="w-16 shrink-0">
                        {idx > 0 && (
                          <span className={`text-xs font-bold ${isGargalo ? 'text-destructive' : 'text-muted-foreground'}`}>
                            {step.taxaDaAnterior}%
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

          </div>
        )}

        {/* TAB: METAS & DESAFIOS */}
        {activeTab === 'metas' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Controls */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-card/30 p-3 rounded-2xl border border-border/30">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <input type="month" value={metasPeriodo} onChange={e => setMetasPeriodo(e.target.value)}
                  className="bg-black border border-border/50 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary transition-colors" />
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2 ml-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={metasOwner} onChange={e => setMetasOwner(e.target.value)}
                    className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Toda a operação</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={() => openMetasModal({ periodo: metasPeriodo, owner: metasOwner === 'all' ? null : metasOwner, label: metasOwner === 'all' ? 'Operação' : (vendedores.find(v => v.id === metasOwner)?.nome || ''), existing: metasTab?.progresso || [] })}
                className="flex items-center gap-1.5 text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                <Target className="w-3.5 h-3.5" /> Definir metas
              </button>
            </div>

            {/* Streak */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gradient-to-br from-warning/10 to-warning/5 p-5 rounded-2xl border border-warning/20 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-warning/15 flex items-center justify-center">
                  <Flame className="w-7 h-7 text-warning" />
                </div>
                <div>
                  <p className="text-3xl font-black text-warning">{streak?.atual ?? 0} <span className="text-sm font-bold text-muted-foreground">dias</span></p>
                  <p className="text-xs text-muted-foreground">Sequência atual de vendas {streak?.hojeTemVenda ? '· 🔥 hoje!' : ''}</p>
                </div>
              </div>
              <div className="bg-card/40 p-5 rounded-2xl border border-border/30 flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Award className="w-7 h-7 text-primary" />
                </div>
                <div>
                  <p className="text-3xl font-black text-primary">{streak?.recorde ?? 0} <span className="text-sm font-bold text-muted-foreground">dias</span></p>
                  <p className="text-xs text-muted-foreground">Recorde (últimos 90 dias)</p>
                </div>
              </div>
              <div className="bg-card/40 p-5 rounded-2xl border border-border/30 flex flex-col justify-center">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide mb-2">Últimos 30 dias</p>
                <div className="flex gap-0.5 flex-wrap">
                  {(streak?.ultimosDias || []).map((d, i) => (
                    <div key={i} title={`${d.data}: ${d.vendas} venda(s)`}
                      className={`w-2.5 h-5 rounded-sm ${d.vendas > 0 ? 'bg-warning' : 'bg-card'}`}
                      style={{ opacity: d.vendas > 0 ? Math.min(0.4 + d.vendas * 0.2, 1) : 1 }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Metas grid */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-6">
                <Target className="text-primary w-5 h-5" /> Metas de {metasPeriodo}
              </h3>
              {(!metasTab?.progresso || metasTab.progresso.length === 0) ? (
                <div className="text-center py-10">
                  <Target className="w-10 h-10 text-foreground mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground mb-4">Nenhuma meta definida neste período.</p>
                  <button onClick={() => openMetasModal({ periodo: metasPeriodo, owner: metasOwner === 'all' ? null : metasOwner, label: metasOwner === 'all' ? 'Operação' : (vendedores.find(v => v.id === metasOwner)?.nome || ''), existing: [] })}
                    className="bg-primary text-black font-bold px-5 py-2 rounded-xl hover:brightness-110 transition-all inline-flex items-center gap-2">
                    <Plus className="w-4 h-4" /> Definir metas
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {metasTab.progresso.map((p: any) => {
                    const meta = METRIC_META[p.metrica as MetricKey]
                    return (
                      <div key={p.id} className="flex items-center gap-4 bg-card/50 p-4 rounded-2xl border border-border/20">
                        <MetaGauge pct={p.pctAtingido} color={meta?.color || '#00E676'} noRitmo={p.noRitmo} />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground truncate">{meta?.label || p.metrica}</p>
                          <p className="text-xl font-black mt-0.5">
                            {fmtMetric(p.metrica, p.realizado)}
                            <span className="text-sm font-medium text-muted-foreground"> / {fmtMetric(p.metrica, p.alvo)}</span>
                          </p>
                          {p.tipo !== 'MENOR_MELHOR' && p.necessarioPorDia > 0 ? (
                            <p className="text-[11px] mt-1 text-warning/90 font-semibold">faltam {fmtMetric(p.metrica, p.restante)} · {p.necessarioPorDia}/dia</p>
                          ) : (
                            <p className={`text-[11px] mt-1 font-semibold ${p.noRitmo ? 'text-success' : 'text-warning'}`}>{p.noRitmo ? '✓ no ritmo' : 'atenção ao ritmo'}</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Desafios */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <Trophy className="text-warning w-5 h-5" /> Desafios
                </h3>
                <button onClick={() => openChModal()} className="flex items-center gap-1.5 text-xs font-bold bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> Novo desafio
                </button>
              </div>

              {challenges.filter(c => c.status === 'ATIVO').length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhum desafio ativo. Crie um para engajar a equipe rumo às metas.</p>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {challenges.filter(c => c.status === 'ATIVO').map(c => {
                  const meta = METRIC_META[c.metrica as MetricKey]
                  const pctClamp = Math.min(c.pctAtingido, 100)
                  const vendedor = c.ownerUserId ? vendedores.find(v => v.id === c.ownerUserId)?.nome : null
                  return (
                    <div key={c.id} className="bg-card/50 p-5 rounded-2xl border border-border/30">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <p className="font-bold text-base truncate">{c.titulo}</p>
                          {c.descricao && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.descricao}</p>}
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-card text-foreground">{meta?.label || c.metrica}</span>
                            {vendedor && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-info/10 text-info flex items-center gap-1"><Users className="w-2.5 h-2.5" />{vendedor}</span>}
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 ${c.diasRestantes <= 3 ? 'bg-destructive/10 text-destructive' : 'bg-card text-muted-foreground'}`}>
                              <Clock className="w-2.5 h-2.5" />{c.diasRestantes}d restantes
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => openChModal(c)} className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-card rounded-lg"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => handleDeleteChallenge(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-bold">{fmtMetric(c.metrica, c.realizado)} <span className="text-muted-foreground font-medium">/ {fmtMetric(c.metrica, c.alvo)}</span></span>
                        <span className={`font-black ${c.concluido ? 'text-success' : 'text-warning'}`}>{c.pctAtingido}%</span>
                      </div>
                      <div className="h-2.5 bg-card rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pctClamp}%`, background: c.concluido ? '#00E676' : '#FFB300' }} />
                      </div>
                      {c.recompensa && (
                        <p className="text-[11px] text-success/90 font-semibold mt-2 flex items-center gap-1"><Gift className="w-3 h-3" /> {c.recompensa}</p>
                      )}
                      <div className="flex gap-2 mt-3">
                        <button onClick={() => handleChStatus(c.id, 'CONCLUIDO')} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-success/10 text-success hover:bg-success/20 transition-colors flex items-center justify-center gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Concluir
                        </button>
                        <button onClick={() => handleChStatus(c.id, 'FALHOU')} className="flex-1 text-xs font-bold py-1.5 rounded-lg bg-card text-muted-foreground hover:text-destructive transition-colors">
                          Encerrar
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Mural de concluídos */}
              {challenges.filter(c => c.status !== 'ATIVO').length > 0 && (
                <div className="mt-8">
                  <h4 className="text-sm font-bold text-muted-foreground flex items-center gap-2 mb-3"><Medal className="w-4 h-4" /> Mural de conquistas</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {challenges.filter(c => c.status !== 'ATIVO').map(c => (
                      <div key={c.id} className={`p-4 rounded-2xl border flex items-center gap-3 ${c.status === 'CONCLUIDO' ? 'border-success/20 bg-success/5' : 'border-border/30 bg-card/40'}`}>
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${c.status === 'CONCLUIDO' ? 'bg-success/15 text-success' : 'bg-card text-muted-foreground'}`}>
                          {c.status === 'CONCLUIDO' ? <Trophy className="w-5 h-5" /> : <X className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold truncate">{c.titulo}</p>
                          <p className="text-[11px] text-muted-foreground">{c.status === 'CONCLUIDO' ? 'Concluído' : 'Encerrado'} · {c.recompensa || (METRIC_META[c.metrica as MetricKey]?.label || c.metrica)}</p>
                        </div>
                        <button onClick={() => handleDeleteChallenge(c.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded-lg shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB: FUNIL */}
        {activeTab === 'funil' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Filters bar (reaproveita filtros da Central) */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-card/30 p-3 rounded-2xl border border-border/30">
              <DateRangeFilter
                value={dateRange}
                onChange={(range) => setDateRange(range)}
                presets={[['hoje', 'Hoje'], ['7d', '7 Dias'], ['30d', '30 Dias'], ['este_mes', 'Este Mês']]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)} className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Toda a operação</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)} className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Todos os funis</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Gargalo banner */}
            {funilConv?.gargalo && (
              <div className="flex gap-3 p-4 rounded-2xl border border-destructive/30 bg-destructive/5">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold">Maior gargalo: entrada em <span className="text-destructive">{funilConv.gargalo.label}</span></p>
                  <p className="text-xs text-muted-foreground mt-0.5">Apenas {funilConv.gargalo.taxaDaAnterior}% avançam da etapa anterior para esta. É onde você mais perde oportunidades — priorize ações aqui.</p>
                </div>
              </div>
            )}

            {/* Funnel visualization */}
            {(() => {
              const steps: any[] = funilConv?.steps || []
              const topVal = steps[0]?.valor || 0
              const bottomVal = steps.length ? steps[steps.length - 1].valor : 0
              const convTotal = topVal > 0 ? Math.round((bottomVal / topVal) * 1000) / 10 : 0
              return (
                <div className="bg-gradient-to-b from-card/40 to-card/10 rounded-3xl p-6 border border-border/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-8">
                    <h3 className="text-lg font-bold flex items-center gap-2 text-foreground">
                      <Activity className="text-primary w-5 h-5" /> Funil de Conversão
                    </h3>
                    {topVal > 0 && (
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-muted" />
                          <span className="text-muted-foreground">{topVal} conversas</span>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-primary" />
                          <span className="text-muted-foreground">{bottomVal} vendas</span>
                        </div>
                        <span className="px-2.5 py-1 rounded-lg bg-primary/10 text-primary font-black border border-primary/20">{convTotal}%</span>
                      </div>
                    )}
                  </div>

                  {topVal === 0 ? (
                    <div className="text-center py-12">
                      <Activity className="w-10 h-10 text-foreground mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground">Nenhuma conversa iniciada no período selecionado.</p>
                    </div>
                  ) : (
                    <FunnelChart
                      bottleneckKey={funilConv?.gargalo?.key ?? null}
                      stages={steps.map((step: any) => ({
                        key: step.key,
                        label: step.label,
                        value: step.valor,
                        color: METRIC_META[step.key as MetricKey]?.color || '#00E676',
                      }))}
                      footer={
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <p className="text-2xl sm:text-3xl font-black text-foreground">{topVal}</p>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Conversas (topo)</p>
                          </div>
                          <div>
                            <p className="text-2xl sm:text-3xl font-black text-primary">{convTotal}%</p>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mt-1">Conversa → Venda</p>
                          </div>
                        </div>
                      }
                    />
                  )}
                </div>
              )
            })()}

            {/* Taxas derivadas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: 'taxaResposta', hint: 'Responderam / Conversas' },
                { key: 'taxaComparecimento', hint: 'Compareceram / Agendados' },
                { key: 'taxaFechamento', hint: 'Vendas / Comparecimentos' },
              ] as { key: MetricKey; hint: string }[]).map(({ key, hint }) => {
                const val = funilConv?.metrics?.[key] ?? 0
                return (
                  <div key={key} className="relative bg-card/40 p-5 rounded-2xl border border-border/30 overflow-hidden group">
                    <div className="absolute inset-x-0 bottom-0 h-1 transition-all" style={{ width: `${Math.min(val, 100)}%`, background: METRIC_META[key].color, opacity: 0.7 }} />
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{METRIC_META[key].label}</span>
                    <div className="flex items-end gap-1 mt-1">
                      <span className="text-3xl font-black leading-none" style={{ color: METRIC_META[key].color }}>{val}</span>
                      <span className="text-sm font-bold text-muted-foreground mb-0.5">%</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">{hint}</p>
                  </div>
                )
              })}
            </div>

            {/* Velocidade do funil */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-1">
                <Timer className="text-info w-5 h-5" /> Velocidade do Funil
              </h3>
              <p className="text-xs text-muted-foreground mb-6">Tempo médio de percurso dos leads criados no período.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Lead → Agendamento', val: funilTiming?.leadToAgendamento, n: funilTiming?.amostras.agendamento, color: '#60A5FA' },
                  { label: 'Agendamento → Comparecimento', val: funilTiming?.agendamentoToComparecimento, n: funilTiming?.amostras.comparecimento, color: '#a855f7' },
                  { label: 'Lead → Venda', val: funilTiming?.leadToVenda, n: funilTiming?.amostras.venda, color: '#00E676' },
                ].map(t => (
                  <div key={t.label} className="bg-card/50 p-5 rounded-2xl border border-border/20 flex flex-col items-center text-center">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-2 h-8 flex items-center">{t.label}</span>
                    <span className="text-3xl font-black" style={{ color: t.color }}>{fmtDur(t.val ?? null)}</span>
                    <span className="text-[10px] text-muted-foreground mt-1">{t.n || 0} amostra(s)</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {/* TAB: RANKING */}
        {activeTab === 'ranking' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Filters */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-card/30 p-3 rounded-2xl border border-border/30">
              <DateRangeFilter
                value={dateRange}
                onChange={(range) => setDateRange(range)}
                presets={[['hoje', 'Hoje'], ['7d', '7 Dias'], ['30d', '30 Dias'], ['este_mes', 'Este Mês']]}
              />
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Crown className="w-3.5 h-3.5 text-warning" />
                  <select value={rankMetric} onChange={e => setRankMetric(e.target.value as RankMetric)} className="bg-black py-1.5 text-sm outline-none cursor-pointer">
                    {RANK_METRICS.map(rm => <option key={rm.key} value={rm.key}>{rm.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-1.5 bg-black border border-border/50 rounded-lg px-2">
                  <Filter className="w-3.5 h-3.5 text-muted-foreground" />
                  <select value={pipelineFilter} onChange={e => setPipelineFilter(e.target.value)} className="bg-black py-1.5 text-sm outline-none cursor-pointer max-w-[160px]">
                    <option value="all">Todos os funis</option>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {rankedList.length === 0 ? (
              <div className="text-center py-16 bg-card/20 rounded-3xl border border-border/30">
                <Crown className="w-12 h-12 text-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">Nenhum dado de vendedores no período.</p>
              </div>
            ) : (
              <>
                {/* Pódio */}
                <div className="bg-gradient-to-b from-card/40 to-card/10 rounded-3xl p-6 border border-border/30">
                  <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-6 justify-center">
                    <Crown className="text-warning w-5 h-5" /> Pódio · {RANK_METRICS.find(r => r.key === rankMetric)?.label}
                  </h3>
                  <div className="flex items-end justify-center gap-3 sm:gap-6">
                    {[1, 0, 2].map(pos => {
                      const v = rankedList[pos]
                      if (!v) return <div key={pos} className="w-24" />
                      const isFirst = pos === 0
                      const medal = pos === 0 ? { c: '#FFD700', h: 'h-32', ring: 'ring-warning', bg: 'from-warning/20' } : pos === 1 ? { c: '#D1D5DB', h: 'h-24', ring: 'ring-border', bg: 'from-muted/20' } : { c: '#CD7F32', h: 'h-20', ring: 'ring-warning', bg: 'from-warning/20' }
                      return (
                        <div key={pos} className="flex flex-col items-center">
                          <div className={`relative w-16 h-16 rounded-full bg-card ring-2 ${medal.ring} flex items-center justify-center mb-2`}>
                            <span className="text-lg font-black text-foreground">{v.initial}</span>
                            {isFirst && <Crown className="w-6 h-6 text-warning absolute -top-4 left-1/2 -translate-x-1/2" fill="#FFD700" />}
                          </div>
                          <p className="text-xs font-bold text-center max-w-[90px] truncate">{v.nome}</p>
                          <p className="text-lg font-black" style={{ color: medal.c }}>{fmtRank(rankMetric, (v as any)[rankMetric] ?? 0)}</p>
                          <div className={`w-20 sm:w-28 ${medal.h} rounded-t-xl bg-gradient-to-t ${medal.bg} to-transparent border-t-2 mt-1 flex items-start justify-center pt-2`} style={{ borderColor: medal.c }}>
                            <span className="text-2xl font-black" style={{ color: medal.c }}>{pos + 1}º</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Lista completa */}
                <div className="bg-card/20 rounded-3xl p-4 sm:p-6 border border-border/30">
                  <div className="space-y-2">
                    {rankedList.map((v, idx) => {
                      const medalColor = idx === 0 ? '#FFD700' : idx === 1 ? '#D1D5DB' : idx === 2 ? '#CD7F32' : '#525252'
                      return (
                        <div key={v.id} className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl border transition-colors ${idx < 3 ? 'bg-card/50 border-border/40' : 'bg-card/30 border-border/20'}`}>
                          <div className="w-8 text-center shrink-0">
                            {idx < 3 ? <Medal className="w-5 h-5 mx-auto" style={{ color: medalColor }} /> : <span className="text-sm font-bold text-muted-foreground">{idx + 1}º</span>}
                          </div>
                          <div className="w-10 h-10 rounded-full bg-card flex items-center justify-center shrink-0">
                            <span className="text-sm font-black text-foreground">{v.initial}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold truncate">{v.nome}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                              <span className="text-[11px] text-muted-foreground">{v.vendas} vendas</span>
                              <span className="text-[11px] text-muted-foreground">{v.comparecimentos} compar.</span>
                              <span className="text-[11px] text-muted-foreground">{v.taxaFechamento}% fech.</span>
                              <span className="text-[11px] text-muted-foreground">{BRL(v.receita)}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xl font-black" style={{ color: idx < 3 ? medalColor : '#e5e5e5' }}>{fmtRank(rankMetric, (v as any)[rankMetric] ?? 0)}</p>
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{RANK_METRICS.find(r => r.key === rankMetric)?.label}</p>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}

          </div>
        )}

        {/* TAB: CUSTOS */}
        {activeTab === 'custos' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-card/40 p-6 rounded-2xl border border-border/50 max-w-xl">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-4"><DollarSign className="w-5 h-5 text-primary" /> Adicionar Custo Mensal</h2>
              <p className="text-sm text-muted-foreground mb-6">Insira o valor total investido na operação (tráfego, ferramentas, etc) para o mês. Ele será usado para calcular o CPA e CPL.</p>
              <form onSubmit={handleSaveCusto} className="flex flex-col sm:flex-row flex-wrap gap-3">
                <input type="month" required value={custoMesAno} onChange={e => setCustoMesAno(e.target.value)}
                  className="bg-black border border-border/50 rounded-lg px-4 py-2 flex-1 min-w-0 w-full sm:w-auto outline-none focus:border-primary transition-colors" />
                <input type="number" step="0.01" required placeholder="Valor ex: 5000.00" value={custoValor} onChange={e => setCustoValor(e.target.value)}
                  className="bg-black border border-border/50 rounded-lg px-4 py-2 flex-1 min-w-0 w-full sm:w-auto outline-none focus:border-primary transition-colors" />
                <button type="submit" className="bg-primary text-black font-bold px-6 py-2 rounded-lg hover:brightness-110 transition-all flex items-center justify-center gap-2 shrink-0">
                  <Plus className="w-4 h-4" /> Salvar
                </button>
              </form>
            </div>

            {/* Teto de CPA */}
            <div className="bg-card/40 p-6 rounded-2xl border border-border/50 max-w-xl">
              <h2 className="text-lg font-bold flex items-center gap-2 mb-2"><Target className="w-5 h-5 text-primary" /> Teto de CPA · {nowMonth}</h2>
              <p className="text-sm text-muted-foreground mb-4">Custo máximo aceitável por venda no mês. Você é alertado ao ultrapassar.</p>
              <div className="flex flex-col sm:flex-row flex-wrap gap-3">
                <div className="flex items-center gap-2 bg-black border border-border/50 rounded-lg px-3 flex-1 min-w-0 w-full sm:w-auto">
                  <span className="text-sm text-muted-foreground shrink-0">R$</span>
                  <input type="number" step="0.01" min="0" placeholder="Ex: 300.00" value={cpaTeto} onChange={e => setCpaTeto(e.target.value)}
                    className="bg-black py-2 flex-1 min-w-0 w-full outline-none text-sm" />
                </div>
                <button onClick={handleSaveCpaTeto} disabled={savingTeto} className="bg-primary text-black font-bold px-6 py-2 rounded-lg hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shrink-0">
                  {savingTeto ? <div className="w-4 h-4 rounded-full border-2 border-black/40 border-t-black animate-spin" /> : <CheckCircle className="w-4 h-4" />} Salvar teto
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 mt-4 pt-4 border-t border-border/30">
                <span className="text-sm text-muted-foreground">CPA atual do mês</span>
                <div className="flex items-center flex-wrap gap-2">
                  <span className={`text-xl font-black ${tetoExceeded ? 'text-destructive' : currentCpa > 0 ? 'text-success' : 'text-muted-foreground'}`}>{BRL(currentCpa)}</span>
                  {tetoExceeded && <span className="text-[10px] font-bold text-destructive bg-destructive/10 border border-destructive/20 px-2 py-1 rounded-md flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Acima do teto</span>}
                  {!tetoExceeded && cpaTeto && currentCpa > 0 && <span className="text-[10px] font-bold text-success bg-success/10 border border-success/20 px-2 py-1 rounded-md">Dentro do teto</span>}
                </div>
              </div>
            </div>

            {/* Tendência CPA/CPL */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-6"><TrendingUp className="text-primary w-5 h-5" /> Tendência de CPA e CPL · 6 meses</h3>
              {roiChart.every(r => r.CPA === 0 && r.CPL === 0) ? (
                <p className="text-sm text-muted-foreground text-center py-10">Cadastre custos mensais para visualizar a evolução do CPA e CPL.</p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={roiChart} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1f1f1f" />
                    <XAxis dataKey="mes" stroke="#666" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#666" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${v}`} width={60} />
                    <Tooltip contentStyle={{ background: '#0a0a0a', border: '1px solid #1a2e1a', borderRadius: 12 }} formatter={(v: any) => BRL(v)} />
                    <Line type="monotone" dataKey="CPA" stroke="#00E676" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="CPL" stroke="#FFB300" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* ROI por origem */}
            <div className="bg-card/20 rounded-3xl p-6 border border-border/30">
              <h3 className="text-lg font-bold flex items-center gap-2 text-foreground mb-6"><Zap className="text-warning w-5 h-5" /> Desempenho por Origem · mês atual</h3>
              {roiOrigem.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">Nenhum lead no mês atual.</p>
              ) : (
                <div className="space-y-3">
                  {roiOrigem.map(o => (
                    <div key={o.origem} className="flex items-center gap-4">
                      <div className="w-28 sm:w-40 shrink-0">
                        <p className="text-xs font-bold truncate">{o.origem}</p>
                        <p className="text-[10px] text-muted-foreground">{o.leads} leads · {o.vendas} vendas</p>
                      </div>
                      <div className="flex-1 h-7 bg-card/60 rounded-lg overflow-hidden relative">
                        <div className="h-full rounded-lg bg-gradient-to-r from-primary/40 to-primary/10 transition-all duration-500" style={{ width: `${Math.max((o.leads / maxOrigemLeads) * 100, 4)}%` }} />
                        <span className="absolute inset-y-0 left-3 flex items-center text-[11px] font-bold text-foreground">{o.taxaConversao}% conversão</span>
                      </div>
                      <div className="w-24 text-right shrink-0">
                        <span className="text-sm font-black text-success">{BRL(o.receita)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="max-w-xl">
              <h3 className="font-bold mb-4 text-muted-foreground">Histórico de Custos</h3>
              <div className="space-y-2">
                {custos.length === 0 && <p className="text-sm text-muted-foreground">Nenhum custo cadastrado.</p>}
                {custos.map(c => (
                  <div key={c.id} className="flex justify-between items-center bg-card/30 p-4 rounded-xl border border-border/30">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-success/10 text-success flex items-center justify-center">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm">{c.mesAno}</p>
                        <p className="text-xs text-muted-foreground">Adicionado em {new Date(c.createdAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-bold text-lg text-foreground">{BRL(c.valor)}</span>
                      <button onClick={() => handleDeleteCusto(c.id)} className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB: REGRAS */}
        {activeTab === 'regras' && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-card/40 p-5 rounded-2xl border border-border/50 gap-4">
              <div>
                <h2 className="text-lg font-bold flex items-center gap-2 text-foreground"><Settings className="w-5 h-5 text-primary" /> Regras dos Indicadores</h2>
                <p className="text-sm text-muted-foreground mt-1">Configure quais etapas do CRM correspondem a cada métrica do Dashboard.</p>
              </div>
              <button onClick={handleSaveRules} className="bg-primary text-black px-5 py-2 rounded-xl font-bold flex items-center justify-center w-full sm:w-auto gap-2 hover:scale-105 transition-all">
                <CheckCircle className="w-4 h-4" /> Salvar Configurações
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pb-20">
              {[
                { key: 'agendamentoStages', label: 'Agendamentos', desc: 'Etapas que indicam que a reunião foi agendada.', color: 'border-info/30 bg-info/5', titleColor: 'text-info', type: 'stage' },
                { key: 'comparecimentoStages', label: 'Comparecimentos', desc: 'Etapas que indicam que o lead compareceu.', color: 'border-brand-ink/30 bg-brand-ink/5', titleColor: 'text-brand-ink', type: 'stage' },
                { key: 'leadsApStages', label: 'Leads AP', desc: 'Tags de Alta Prioridade (AP).', color: 'border-success/30 bg-success/5', titleColor: 'text-success', type: 'tag' },
                { key: 'zonaCinzaStages', label: 'Zona Cinza', desc: 'Tags de leads indefinidos/médio interesse.', color: 'border-warning/30 bg-warning/5', titleColor: 'text-warning', type: 'tag' },
                { key: 'desqualificadaStages', label: 'Desqualificadas', desc: 'Tags de leads sem perfil.', color: 'border-destructive/30 bg-destructive/5', titleColor: 'text-destructive', type: 'tag' },
              ].map(group => (
                <div key={group.key} className={`p-5 rounded-2xl border ${group.color} transition-colors flex flex-col h-full`}>
                  <h3 className={`font-bold text-base mb-1 ${group.titleColor}`}>{group.label}</h3>
                  <p className="text-xs text-muted-foreground mb-4">{group.desc}</p>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {(rules[group.key] || []).map((itemId: string) => {
                      let itemLabel = itemId
                      let itemColor = '#333'
                      let itemContext = ''
                      if (group.type === 'stage') {
                        const stage = stages.find(s => s.id === itemId)
                        if (!stage) return null
                        itemLabel = stage.nome
                        itemColor = stage.cor || '#333'
                        itemContext = `${stage.pipelineName} - `
                      } else {
                        const tag = categoriesStore.categories.tags.find(t => t.label === itemId)
                        if (!tag && !itemId) return null
                        itemLabel = tag?.label || itemId
                        itemColor = tag?.color || '#999'
                      }
                      return (
                        <div key={itemId} className="flex items-center gap-2 bg-card border border-border/50 rounded-full px-3 py-1">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: itemColor }} />
                          <span className="text-xs font-semibold">{itemContext}{itemLabel}</span>
                          <button className="text-muted-foreground hover:text-destructive ml-1"
                            onClick={() => {
                              const newRules = { ...rules, [group.key]: (rules[group.key] || []).filter((id: string) => id !== itemId) }
                              setRules(newRules)
                              desafiosActions.saveDesafiosRules(newRules).then(() => toast.success('Regra removida')).catch(() => toast.error('Erro ao salvar'))
                            }}>
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )
                    })}
                    {!(rules[group.key]?.length > 0) && (
                      <span className="text-xs text-muted-foreground">Nenhum(a) {group.type === 'stage' ? 'etapa selecionada' : 'tag selecionada'}</span>
                    )}
                  </div>
                  <select className="w-full bg-black border border-border/50 rounded-xl px-4 py-3 appearance-none focus:border-primary transition-colors cursor-pointer text-sm font-medium mt-auto"
                    value="" onChange={e => {
                      const val = e.target.value
                      if (!val) return
                      const current = rules[group.key] || []
                      if (current.includes(val)) return
                      const newRules = { ...rules, [group.key]: [...current, val] }
                      setRules(newRules)
                      desafiosActions.saveDesafiosRules(newRules).then(() => toast.success('Regra adicionada')).catch(() => toast.error('Erro ao salvar'))
                    }}>
                    <option value="">+ Adicionar {group.type === 'stage' ? 'etapa...' : 'tag...'}</option>
                    {group.type === 'stage' && stages.filter(s => !(rules[group.key] || []).includes(s.id)).map(stage => (
                      <option key={stage.id} value={stage.id}>{stage.pipelineName} - {stage.nome}</option>
                    ))}
                    {group.type === 'tag' && categoriesStore.categories.tags.filter(t => !(rules[group.key] || []).includes(t.label)).map(tag => (
                      <option key={tag.label} value={tag.label}>{tag.label}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* MODAL: Definir metas */}
        {metasModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setMetasModalOpen(false)}>
            <div className="bg-card border border-border/60 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-lg font-bold flex items-center gap-2"><Target className="w-5 h-5 text-primary" /> Metas de {metaCtx.periodo}</h3>
                <button onClick={() => setMetasModalOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-card"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground mb-5">Alvo para <b className="text-foreground">{metaCtx.label}</b>. Deixe em branco para não acompanhar a métrica.</p>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto scrollbar-thin pr-1">
                {METAS_METRICS.map(key => (
                  <div key={key} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: METRIC_META[key].color }} />
                      <span className="text-sm font-medium">{METRIC_META[key].label}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {METRIC_META[key].money && <span className="text-xs text-muted-foreground">R$</span>}
                      <input type="number" step={METRIC_META[key].suffix ? '0.1' : '1'} min="0" placeholder="—"
                        value={metasDraft[key] ?? ''} onChange={e => setMetasDraft(prev => ({ ...prev, [key]: e.target.value }))}
                        className="bg-black border border-border/50 rounded-lg px-3 py-1.5 w-28 text-right text-sm outline-none focus:border-primary transition-colors" />
                      {METRIC_META[key].suffix && <span className="text-xs text-muted-foreground">{METRIC_META[key].suffix}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setMetasModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm font-bold hover:bg-card transition-colors">Cancelar</button>
                <button onClick={handleSaveMetas} disabled={savingMetas} className="flex-1 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {savingMetas ? <div className="w-4 h-4 rounded-full border-2 border-black/40 border-t-black animate-spin" /> : <CheckCircle className="w-4 h-4" />} Salvar metas
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: Desafio */}
        {chModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={() => setChModalOpen(false)}>
            <div className="bg-card border border-border/60 rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold flex items-center gap-2"><Trophy className="w-5 h-5 text-warning" /> {chDraft.id ? 'Editar desafio' : 'Novo desafio'}</h3>
                <button onClick={() => setChModalOpen(false)} className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-card"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Título</label>
                  <input value={chDraft.titulo} onChange={e => setChDraft({ ...chDraft, titulo: e.target.value })} placeholder="Ex: Maratona de vendas de julho"
                    className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Descrição (opcional)</label>
                  <input value={chDraft.descricao} onChange={e => setChDraft({ ...chDraft, descricao: e.target.value })} placeholder="Detalhes ou regra do desafio"
                    className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Métrica</label>
                    <select value={chDraft.metrica} onChange={e => setChDraft({ ...chDraft, metrica: e.target.value })}
                      className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors cursor-pointer">
                      {(['vendas', 'agendamentos', 'comparecimentos', 'conversas', 'respostas', 'leadsAp'] as MetricKey[]).map(k => (
                        <option key={k} value={k}>{METRIC_META[k].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Alvo</label>
                    <input type="number" min="1" value={chDraft.alvo} onChange={e => setChDraft({ ...chDraft, alvo: e.target.value })} placeholder="Ex: 20"
                      className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Início</label>
                    <input type="date" value={chDraft.inicio} onChange={e => setChDraft({ ...chDraft, inicio: e.target.value })}
                      className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-muted-foreground">Fim</label>
                    <input type="date" value={chDraft.fim} onChange={e => setChDraft({ ...chDraft, fim: e.target.value })}
                      className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Vendedor (opcional)</label>
                  <select value={chDraft.ownerUserId} onChange={e => setChDraft({ ...chDraft, ownerUserId: e.target.value })}
                    className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors cursor-pointer">
                    <option value="all">Toda a operação</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">Recompensa (opcional)</label>
                  <input value={chDraft.recompensa} onChange={e => setChDraft({ ...chDraft, recompensa: e.target.value })} placeholder="Ex: Bônus R$500 · day-off"
                    className="w-full mt-1 bg-black border border-border/50 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary transition-colors" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setChModalOpen(false)} className="flex-1 py-2.5 rounded-xl border border-border/50 text-sm font-bold hover:bg-card transition-colors">Cancelar</button>
                <button onClick={handleSaveChallenge} disabled={chSaving} className="flex-1 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                  {chSaving ? <div className="w-4 h-4 rounded-full border-2 border-black/40 border-t-black animate-spin" /> : <CheckCircle className="w-4 h-4" />} {chDraft.id ? 'Salvar' : 'Criar desafio'}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </AppLayout>
  )
}
