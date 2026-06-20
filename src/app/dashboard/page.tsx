'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/AppLayout'
import * as crmActions from '@/app/actions/crm'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, DollarSign, Users, Target, Calendar, BarChart3,
  ArrowUpRight, ArrowDownRight, Plus, Clock,
  CheckCircle2, Zap, Star, Activity, Flame, ChevronRight,
  Kanban, MessageSquare, Trophy
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid
} from 'recharts'
import { toast, Toaster } from 'sonner'

// ─── Formatters ───────────────────────────────────────────────────────────────
const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v)
const BRLk = (v: number) => v >= 1000 ? `R$ ${(v / 1000).toFixed(0)}k` : BRL(v)

const CHART_COLORS = ['#00E676', '#60A5FA', '#FFB300', '#a855f7', '#FF5722']
const TOOLTIP_STYLE = { background: '#0a0a0a', border: '1px solid #1a2e1a', borderRadius: 12 }

// Priority labels (inverted semantic: ALTA = ruim, BAIXA = bom)
const PRIORITY_LABEL: Record<string, { label: string; color: string }> = {
  BAIXA: { label: 'LEAD AP', color: 'text-emerald-400' },
  MEDIA: { label: 'ZONA CINZA', color: 'text-amber-400' },
  ALTA: { label: 'DESQUALIFICADA', color: 'text-rose-400' },
  NAO_RESPONDEU: { label: 'NÃO RESPONDEU', color: 'text-neutral-400' },
}

type DashboardDeal = { id: string; titulo: string; status: string; valorEstimado: number; prioridade?: string; pipelineId?: string; stageId?: string; contactId?: string; ownerUserId?: string; origem?: string | null; createdAt: string }
type DashboardContact = { id: string; nome: string; sobrenome?: string }
type DashboardActivity = { id: string; titulo: string; tipo: string; status: string; dueAt?: string | Date }
type DashboardCampaign = { campanha: string; leads: number; conversao?: number }
type DashboardStageCount = { name: string; value: number }
type DashboardPipeline = { id: string; nome: string; cor?: string }

const ACTIVITY_TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  call: Clock,
  meeting: Calendar,
  task: CheckCircle2,
  note: MessageSquare,
  whatsapp: Zap,
  email: Activity,
}

// ─── Seller mock data ─────────────────────────────────────────────────────────
const SELLERS = [
  { id: 'usr-admin-123', nome: 'Diretor Comercial', initial: 'DC' },
  { id: 'usr-seller-1', nome: 'Aline Ferreira', initial: 'AF' },
  { id: 'usr-seller-2', nome: 'Bruno Gomes', initial: 'BG' },
]

// ─────────────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()

  const [pipelines, setPipelines] = useState<DashboardPipeline[]>([])
  const [allDealsRaw, setAllDealsRaw] = useState<DashboardDeal[]>([])
  const [contacts, setContacts] = useState<DashboardContact[]>([])
  const [todayActivities, setTodayActivities] = useState<DashboardActivity[]>([])
  const [topCampaigns, setTopCampaigns] = useState<DashboardCampaign[]>([])
  const [stageCounts, setStageCounts] = useState<DashboardStageCount[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('all')
  // Timeline filters
  const [timelineMonth, setTimelineMonth] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [timelineDay, setTimelineDay] = useState<string>('')

  useEffect(() => {
    const fetchData = () => {
      Promise.all([
        crmActions.getPipelines(),
        crmActions.getAllDeals(),
        crmActions.getContacts(),
        crmActions.getDashboardKpis('30d'),
        crmActions.getActivities(),
        crmActions.getAllStages(),
      ]).then(([pipes, allDeals, allContacts, kpis, acts, allStages]) => {
        setPipelines((pipes || []) as DashboardPipeline[])
        setAllDealsRaw((allDeals || []) as unknown as DashboardDeal[])
        setContacts((allContacts || []) as DashboardContact[])
        setTopCampaigns((kpis?.topCampaigns || []) as DashboardCampaign[])
        setStageCounts((kpis?.stageCounts || []) as DashboardStageCount[])
        setStages((allStages || []) as any[])
        const todayStr = new Date().toISOString().split('T')[0]
        const todayActs = ((acts || []) as DashboardActivity[]).filter(a => {
          if (a.status !== 'OPEN') return false
          if (!a.dueAt) return false
          const dueAtStr = typeof a.dueAt === 'string' ? a.dueAt : (a.dueAt as Date).toISOString()
          return dueAtStr.split('T')[0] === todayStr
        })
        setTodayActivities(todayActs)
      }).catch(() => {
        toast.error('Erro ao carregar dashboard')
      }).finally(() => {
        setLoading(false)
      })
    }

    fetchData()
    const interval = setInterval(fetchData, 20000)
    return () => clearInterval(interval)
  }, [])

  // ── Filtered deals by selected pipeline ────────────────────────────────────
  const deals = useMemo(() => {
    if (!allDealsRaw.length) return []
    if (selectedPipelineId === 'all') return allDealsRaw
    return allDealsRaw.filter(d => d.pipelineId === selectedPipelineId)
  }, [allDealsRaw, selectedPipelineId])

  // ── KPI calculations (from spec invariants) ────────────────────────────────
  const openDeals = useMemo(() => deals.filter(d => d.status === 'OPEN'), [deals])
  const wonDeals = useMemo(() => deals.filter(d => d.status === 'WON'), [deals])
  const lostDeals = useMemo(() => deals.filter(d => d.status === 'LOST'), [deals])

  const totalRevenue = useMemo(() =>
    wonDeals.reduce((s, d) => s + (d.valorEstimado ?? 0), 0), [wonDeals])

  const forecastRevenue = useMemo(() =>
    openDeals.reduce((s, d) => s + (d.valorEstimado ?? 0), 0), [openDeals])

  const conversionRate = useMemo(() => {
    const closed = wonDeals.length + lostDeals.length
    return closed > 0 ? Math.round((wonDeals.length / closed) * 100) : 0
  }, [wonDeals, lostDeals])

  // ── Pipeline breakdown (always all pipelines, ignores filter) ─────────────
  const pipelineBreakdown = useMemo(() => {
    return pipelines.map(pipe => {
      const pDeals = allDealsRaw.filter(d => d.pipelineId === pipe.id)
      const pOpen = pDeals.filter(d => d.status === 'OPEN')
      const pWon = pDeals.filter(d => d.status === 'WON')
      const pLost = pDeals.filter(d => d.status === 'LOST')
      const revenue = pWon.reduce((s, d) => s + (d.valorEstimado ?? 0), 0)
      const forecast = pOpen.reduce((s, d) => s + (d.valorEstimado ?? 0), 0)
      const closed = pWon.length + pLost.length
      return {
        id: pipe.id,
        nome: pipe.nome,
        cor: pipe.cor || '#00E676',
        open: pOpen.length,
        won: pWon.length,
        lost: pLost.length,
        revenue,
        forecast,
        conversion: closed > 0 ? Math.round((pWon.length / closed) * 100) : 0
      }
    })
  }, [pipelines, allDealsRaw])

  // ── Stage counts breakdown ────────────────────────────────────────────────────
  const computedStageCounts = useMemo(() => {
    if (!stages.length) return [];
    
    const counts: Record<string, number> = {};
    stages.forEach(s => { counts[s.id] = 0 });
    openDeals.forEach(d => {
      if (d.stageId && counts[d.stageId] !== undefined) {
        counts[d.stageId]++;
      }
    });

    return stages
      .filter(s => selectedPipelineId === 'all' || s.pipelineId === selectedPipelineId)
      .map(s => ({
        name: s.nome,
        value: counts[s.id] || 0
      }))
      .filter(s => s.value > 0);
  }, [openDeals, stages, selectedPipelineId]);

  // ── Timeline chart data ───────────────────────────────────────────────────────
  const timelineChartData = useMemo(() => {
    const [year, month] = timelineMonth.split('-').map(Number);
    const filtered = deals.filter(d => {
      const dt = new Date(d.createdAt);
      return dt.getFullYear() === year && (dt.getMonth() + 1) === month;
    });
    
    const daysInMonth = new Date(year, month, 0).getDate();
    const data = Array.from({ length: daysInMonth }, (_, i) => ({
      dia: String(i + 1).padStart(2, '0'),
      total: 0,
      ganhos: 0,
      perdidos: 0,
      abertos: 0
    }));
    
    filtered.forEach(d => {
      const dt = new Date(d.createdAt);
      const dayIndex = dt.getDate() - 1;
      data[dayIndex].total++;
      if (d.status === 'WON') data[dayIndex].ganhos++;
      else if (d.status === 'LOST') data[dayIndex].perdidos++;
      else data[dayIndex].abertos++;
    });
    
    return data;
  }, [deals, timelineMonth]);

  // ── Top sellers ranking ────────────────────────────────────────────────────
  const topSellers = useMemo(() => {
    return SELLERS.map(s => {
      const sWon = allDealsRaw.filter(d => d.ownerUserId === s.id && d.status === 'WON')
      return {
        ...s,
        dealsGanhos: sWon.length,
        receita: sWon.reduce((sum, d) => sum + (d.valorEstimado ?? 0), 0)
      }
    }).sort((a, b) => b.receita - a.receita)
  }, [allDealsRaw])

  // ─── LOADING ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <AppLayout>
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="h-7 w-52 rounded-xl bg-neutral-800/50 animate-pulse" />
              <div className="h-4 w-72 rounded-lg bg-neutral-800/40 animate-pulse" />
            </div>
            <div className="h-9 w-36 rounded-xl bg-neutral-800/40 animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-border/30 bg-neutral-900/30 p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="h-9 w-9 rounded-xl bg-neutral-800/60 animate-pulse" />
                  <div className="h-4 w-10 rounded-lg bg-neutral-800/40 animate-pulse" />
                </div>
                <div className="h-3 w-24 rounded bg-neutral-800/40 animate-pulse" />
                <div className="h-8 w-20 rounded-lg bg-neutral-800/50 animate-pulse" />
                <div className="h-3 w-32 rounded bg-neutral-800/30 animate-pulse" />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`rounded-2xl border border-border/30 bg-neutral-900/30 p-5 h-48 animate-pulse ${i === 0 ? '' : 'lg:col-span-1'}`} />
            ))}
          </div>
        </div>
      </AppLayout>
    )
  }

  // ─── RENDER ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" />
      <div className="p-4 sm:p-6 lg:p-8 space-y-6 animate-fade-in select-none">

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Dashboard Comercial</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Visão executiva consolidada da sua operação de vendas
            </p>
          </div>
          <div className="flex items-center gap-3">
            {/* Pipeline filter */}
            <select
              value={selectedPipelineId}
              onChange={e => setSelectedPipelineId(e.target.value)}
              className="text-xs bg-neutral-900/60 border border-border/40 rounded-xl px-3 py-2 text-foreground focus:outline-none focus:border-primary/50 hover:border-border/60 transition-colors"
            >
              <option value="all">Todos os produtos</option>
              {pipelines.map(p => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/50 bg-neutral-900/40 text-xs text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Ao vivo
            </div>
          </div>
        </div>

        {/* ── KPI CARDS ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

          {/* Total Contatos */}
          <div className="ocr-card card-padding group hover:border-primary/30 transition-all cursor-default relative overflow-hidden">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(ellipse at top left, rgba(0,230,118,0.04), transparent 70%)' }} />
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary/15 transition-colors">
                <Users className="w-5 h-5" />
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <ArrowUpRight className="w-3.5 h-3.5" />+12%
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Total de Contatos</p>
            <p className="text-3xl font-bold text-primary">{contacts.length}</p>
            <p className="text-xs text-muted-foreground mt-1">+12% vs mês anterior</p>
          </div>

          {/* Deals Abertos */}
          <div className="ocr-card card-padding group hover:border-primary/30 transition-all cursor-default relative overflow-hidden">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(ellipse at top left, rgba(0,230,118,0.04), transparent 70%)' }} />
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary group-hover:bg-primary/15 transition-colors">
                <Target className="w-5 h-5" />
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-primary">
                <ArrowUpRight className="w-3.5 h-3.5" />{openDeals.length}
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Deals Abertos</p>
            <p className="text-3xl font-bold text-primary">{openDeals.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{BRLk(forecastRevenue)} em pipeline</p>
          </div>

          {/* Taxa de Conversão */}
          <div className="ocr-card card-padding group hover:border-yellow-500/30 transition-all cursor-default relative overflow-hidden">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(ellipse at top left, rgba(251,191,36,0.04), transparent 70%)' }} />
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 group-hover:bg-yellow-500/15 transition-colors">
                <TrendingUp className="w-5 h-5" />
              </div>
              <span className={`flex items-center gap-1 text-xs font-semibold ${conversionRate >= 20 ? 'text-primary' : 'text-yellow-400'}`}>
                {conversionRate >= 20 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {conversionRate}%
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Taxa de Conversão</p>
            <p className="text-3xl font-bold text-yellow-400">{conversionRate}%</p>
            <p className="text-xs text-muted-foreground mt-1">{wonDeals.length} ganhos / {lostDeals.length} perdidos</p>
          </div>

          {/* Receita Fechada */}
          <div className="ocr-card card-padding group hover:border-emerald-500/30 transition-all cursor-default relative overflow-hidden">
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: 'radial-gradient(ellipse at top left, rgba(16,185,129,0.04), transparent 70%)' }} />
            <div className="flex items-start justify-between mb-4">
              <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500/15 transition-colors">
                <DollarSign className="w-5 h-5" />
              </div>
              <span className="flex items-center gap-1 text-xs font-semibold text-emerald-400">
                <ArrowUpRight className="w-3.5 h-3.5" />+8%
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">Receita Fechada</p>
            <p className="text-3xl font-bold text-emerald-400">{BRLk(totalRevenue)}</p>
            <p className="text-xs text-muted-foreground mt-1">+8% vs mês anterior</p>
          </div>
        </div>

        {/* ── MID ROW: Funil + Atividades de Hoje + Deals Recentes ───────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Funil do Pipeline - Leads por Etapa */}
          <div className="lg:col-span-1 ocr-card card-padding flex flex-col h-[320px]">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div>
                <h3 className="font-semibold text-foreground">Funil do Pipeline</h3>
                <p className="text-xs text-muted-foreground">Deals abertos por etapa</p>
              </div>
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Kanban className="w-4 h-4" />
              </div>
            </div>
            {computedStageCounts.length > 0 ? (
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={computedStageCounts} barSize={16} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(150 25% 13%)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={80} tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [v ?? 0, 'Deals']} />
                    <Bar dataKey="value" fill="#00E676" radius={[0, 6, 6, 0]}>
                      {computedStageCounts.map((_entry, i: number) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground opacity-30">
                <BarChart3 className="w-10 h-10 mb-2" />
                <p className="text-xs">Nenhum deal no funil</p>
              </div>
            )}
            <button
              onClick={() => router.push('/pipeline')}
              className="shrink-0 mt-3 flex items-center justify-center gap-1.5 text-xs text-primary hover:underline font-semibold py-1"
            >
              Ver Pipeline Completo <ChevronRight className="w-3 h-3" />
            </button>
          </div>

          {/* Atividades de Hoje */}
          <div className="ocr-card card-padding flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Calendar className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Atividades de Hoje</h3>
                  <p className="text-[10px] text-muted-foreground">{todayActivities.length} pendentes</p>
                </div>
              </div>
              <button
                onClick={() => router.push('/activities?new=1')}
                className="p-1.5 rounded-lg border border-border/40 hover:border-primary/50 hover:bg-primary/10 hover:text-primary text-muted-foreground transition-all"
                title="Nova atividade"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 space-y-2">
              {todayActivities.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Calendar className="w-10 h-10 text-muted-foreground opacity-20 mb-2" />
                  <p className="text-xs text-muted-foreground">Sem atividades para hoje</p>
                  <button
                    onClick={() => router.push('/activities?new=1')}
                    className="mt-3 text-xs text-primary font-semibold hover:underline"
                  >
                    + Adicionar atividade
                  </button>
                </div>
              ) : (
                todayActivities.slice(0, 4).map((act) => {
                  const Icon = ACTIVITY_TYPE_ICON[act.tipo] || Clock
                  const isPast = act.dueAt && new Date(act.dueAt) < new Date()
                  return (
                    <div key={act.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${isPast ? 'bg-destructive' : 'bg-primary'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{act.titulo}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Icon className="w-3 h-3 text-muted-foreground" />
                          <span className="text-[10px] text-muted-foreground capitalize">{act.tipo}</span>
                          {act.dueAt && (
                            <span className={`text-[10px] font-mono ${isPast ? 'text-destructive' : 'text-muted-foreground'}`}>
                              {new Date(act.dueAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {todayActivities.length > 4 && (
              <button onClick={() => router.push('/activities')} className="mt-3 text-xs text-primary font-semibold hover:underline shrink-0">
                Ver todas ({todayActivities.length}) →
              </button>
            )}
          </div>

          {/* Deals Recentes */}
          <div className="ocr-card card-padding flex flex-col">
            <div className="flex items-center justify-between mb-4 shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground text-sm">Deals Recentes</h3>
                  <p className="text-[10px] text-muted-foreground">{openDeals.length} em aberto</p>
                </div>
              </div>
              <button onClick={() => router.push('/pipeline')} className="text-xs text-primary hover:underline font-semibold">
                Ver todos
              </button>
            </div>

            <div className="flex-1 space-y-2">
              {openDeals.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <Target className="w-10 h-10 text-muted-foreground opacity-20 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum deal aberto</p>
                </div>
              ) : (
                [...openDeals]
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .slice(0, 4)
                  .map((deal) => {
                    const contact = contacts.find(c => c.id === deal.contactId)
                    const prio = PRIORITY_LABEL[deal.prioridade ?? 'MEDIA'] || PRIORITY_LABEL.MEDIA
                    return (
                      <div key={deal.id} className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-border/30 hover:border-primary/30 hover:bg-primary/5 transition-all group cursor-pointer" onClick={() => router.push(`/pipeline?dealId=${deal.id}`)}>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{deal.titulo}</p>
                          <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                            {contact?.nome} {contact?.sobrenome || ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 ml-3 shrink-0">
                          <span className="text-xs font-bold text-primary">{BRLk(deal.valorEstimado)}</span>
                          <span className={`text-[9px] font-bold ${prio.color}`}>{prio.label}</span>
                        </div>
                      </div>
                    )
                  })
              )}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW: Canais UTM + Top Vendedores ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Timeline de Deals */}
          <div className="lg:col-span-2 ocr-card card-padding overflow-hidden flex flex-col h-[320px]">
            <div className="flex items-center justify-between mb-3 shrink-0">
              <div>
                <h3 className="font-semibold text-foreground">Timeline de Negócios</h3>
                <p className="text-xs text-muted-foreground">Histórico de deals por data de criação</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={timelineMonth}
                  onChange={e => { setTimelineMonth(e.target.value); setTimelineDay('') }}
                  className="px-2 py-1 rounded-lg border border-border bg-neutral-900 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 mt-4">
              {timelineChartData.reduce((sum, d) => sum + d.total, 0) > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(150 25% 13%)" vertical={false} />
                    <XAxis dataKey="dia" tick={{ fill: '#6B7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#9CA3AF', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="abertos" name="Abertos" fill="#3B82F6" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="ganhos" name="Ganhos" fill="#10B981" radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="perdidos" name="Perdidos" fill="#F43F5E" radius={[4, 4, 0, 0]} stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <Activity className="w-8 h-8 text-muted-foreground opacity-20 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum negócio neste período.</p>
                </div>
              )}
            </div>
          </div>

          {/* Top Vendedores */}
          <div className="ocr-card card-padding">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="font-semibold text-foreground">Top Vendedores</h3>
                <p className="text-xs text-muted-foreground">Ranking por receita fechada</p>
              </div>
              <div className="p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400">
                <Trophy className="w-4 h-4" />
              </div>
            </div>

            <div className="space-y-3">
              {topSellers.map((s, i) => (
                <div key={s.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-neutral-900/40 transition-colors">
                  {/* Rank */}
                  <span className={`text-xs font-bold w-4 shrink-0 ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-neutral-300' : 'text-amber-700'}`}>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}
                  </span>
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                    {s.initial}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground truncate">{s.nome}</p>
                    <p className="text-[10px] text-muted-foreground">{s.dealsGanhos} deals fechados</p>
                  </div>
                  {/* Revenue */}
                  <span className="text-xs font-bold text-primary shrink-0">{BRLk(s.receita)}</span>
                </div>
              ))}

              {topSellers.every(s => s.receita === 0) && (
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <Star className="w-8 h-8 text-muted-foreground opacity-20 mb-2" />
                  <p className="text-xs text-muted-foreground">Nenhum deal ganho ainda</p>
                </div>
              )}
            </div>
          </div>
        </div>


      </div>
    </AppLayout>
  )
}
