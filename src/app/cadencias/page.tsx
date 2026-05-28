'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { AppLayout } from '@/components/AppLayout'
import {
  Workflow, Plus, Trash2, Edit3, Play, Pause, Calendar, Users, CheckCircle2,
  MessageSquare, AlertCircle, ArrowLeft, ExternalLink, Clock, Sparkles, Check,
  ChevronRight, X, Settings, Search, RefreshCw, AlertTriangle, Eye, ArrowRight
} from 'lucide-react'
import {
  getCadencias,
  createCadence,
  updateCadence,
  deleteCadence,
  getCadenceDashboard,
  getPipelines,
  getTemplates,
  updateCadenceLeadStatus,
  removeLeadFromCadence
} from '@/app/actions/crm'
import { toast, Toaster } from 'sonner'

interface Template {
  id: string
  nome: string
  categoria: string
  corpo: string
}

interface Pipeline {
  id: string
  nome: string
}

interface StepInput {
  id?: string
  ordem: number
  prazoValor: number
  prazoUnidade: string
  mensagem: string
  templateId: string | null
  pararAoResponder: boolean
}

interface CadenceLead {
  id: string
  nome: string
  telefone: string
  etapaAtual: number
  status: string
  proximoEnvio: string | null
  updatedAt: string
}

interface Cadence {
  id: string
  nome: string
  tipo: string
  webhookUrl: string | null
  pipelineId: string | null
  status: string
  createdAt: Date | string
  etapas: {
    id: string
    ordem: number
    prazoValor: number
    prazoUnidade: string
    mensagem: string
    templateId: string | null
    pararAoResponder: boolean
  }[]
  leads: {
    id: string
    status: string
    etapaAtual: number
  }[]
}

export default function CadenciasPage() {
  const [cadences, setCadences] = useState<Cadence[]>([])
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'detail'>('list')
  
  // Selected Cadence details & dashboard
  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null)
  const [dashboardData, setDashboardData] = useState<{
    totalAtivos: number
    etapas: Record<number, number>
    totalConcluidos: number
    totalParados: number
    leads: CadenceLead[]
  } | null>(null)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [searchLeadQuery, setSearchLeadQuery] = useState('')

  // Modal State
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('Sondagem')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [status, setStatus] = useState('ATIVO')
  const [etapas, setEtapas] = useState<StepInput[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Load Initial Data
  const loadData = async () => {
    try {
      setLoading(true)
      const [cadList, pipeList, tmplList] = await Promise.all([
        getCadencias(),
        getPipelines(),
        getTemplates()
      ])
      // Format prisma return
      setCadences(cadList as unknown as Cadence[])
      setPipelines(pipeList)
      setTemplates(tmplList)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar os dados das cadências.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  // Load Dashboard Data for selected cadence
  const loadCadenceDashboard = async (cadenceId: string) => {
    try {
      setLoadingDashboard(true)
      const data = await getCadenceDashboard(cadenceId)
      setDashboardData(data)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao carregar o monitoramento da cadência.')
    } finally {
      setLoadingDashboard(false)
    }
  }

  // Handle Detail View click
  const handleViewDetail = (cadence: Cadence) => {
    setSelectedCadence(cadence)
    setView('detail')
    loadCadenceDashboard(cadence.id)
  }

  // Handle Create Modal Trigger
  const handleOpenCreateModal = () => {
    setEditingId(null)
    setNome('')
    setTipo('Sondagem')
    setWebhookUrl('')
    setPipelineId(pipelines[0]?.id || '')
    setStatus('ATIVO')
    setEtapas([
      {
        ordem: 1,
        prazoValor: 0,
        prazoUnidade: 'horas',
        mensagem: '',
        templateId: null,
        pararAoResponder: true
      }
    ])
    setModalOpen(true)
  }

  // Handle Edit Modal Trigger
  const handleOpenEditModal = (cadence: Cadence) => {
    setEditingId(cadence.id)
    setNome(cadence.nome)
    setTipo(cadence.tipo)
    setWebhookUrl(cadence.webhookUrl || '')
    setPipelineId(cadence.pipelineId || '')
    setStatus(cadence.status)
    setEtapas(cadence.etapas.map(e => ({
      id: e.id,
      ordem: e.ordem,
      prazoValor: e.prazoValor,
      prazoUnidade: e.prazoUnidade,
      mensagem: e.mensagem,
      templateId: e.templateId,
      pararAoResponder: e.pararAoResponder
    })).sort((a, b) => a.ordem - b.ordem))
    setModalOpen(true)
  }

  // Handle Add Step to Form
  const handleAddStep = () => {
    const nextOrdem = etapas.length + 1
    setEtapas([
      ...etapas,
      {
        ordem: nextOrdem,
        prazoValor: 1,
        prazoUnidade: 'dias',
        mensagem: '',
        templateId: null,
        pararAoResponder: true
      }
    ])
  }

  // Handle Remove Step from Form
  const handleRemoveStep = (index: number) => {
    if (etapas.length <= 1) {
      toast.warning('A cadência precisa de pelo menos 1 etapa.')
      return
    }
    const updated = etapas.filter((_, idx) => idx !== index)
    // Recalculate ordens
    const reordered = updated.map((step, idx) => ({
      ...step,
      ordem: idx + 1
    }))
    setEtapas(reordered)
  }

  // Handle Update Step Field
  const handleUpdateStepField = (index: number, field: keyof StepInput, value: any) => {
    const updated = etapas.map((step, idx) => {
      if (idx === index) {
        const uStep = { ...step, [field]: value }
        if (field === 'templateId') {
          if (value) {
            const tmpl = templates.find(t => t.id === value)
            if (tmpl) {
              uStep.mensagem = tmpl.corpo
            }
          } else {
            uStep.mensagem = ''
          }
        }
        return uStep
      }
      return step
    })
    setEtapas(updated)
  }

  // Handle Save / Submit Cadence
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) {
      toast.error('O nome da cadência é obrigatório.')
      return
    }

    // Verify steps messages
    const invalidStep = etapas.some(e => !e.mensagem.trim())
    if (invalidStep) {
      toast.error('Todas as etapas precisam ter uma mensagem definida.')
      return
    }

    try {
      setSubmitting(true)
      const dataPayload = {
        nome: nome.trim(),
        tipo,
        webhookUrl: webhookUrl.trim() || undefined,
        pipelineId: pipelineId || undefined,
        status,
        etapas: etapas.map(e => ({
          ordem: e.ordem,
          prazoValor: Number(e.prazoValor),
          prazoUnidade: e.prazoUnidade,
          mensagem: e.mensagem.trim(),
          templateId: e.templateId || undefined,
          pararAoResponder: e.pararAoResponder
        }))
      }

      if (editingId) {
        await updateCadence(editingId, dataPayload)
        toast.success('Cadência atualizada com sucesso!')
      } else {
        await createCadence(dataPayload)
        toast.success('Cadência criada com sucesso!')
      }

      setModalOpen(false)
      loadData()
      
      // If we are editing the currently viewed cadence, refresh details
      if (selectedCadence && selectedCadence.id === editingId) {
        const updatedSelected = cadences.find(c => c.id === editingId)
        if (updatedSelected) {
          setSelectedCadence({ ...updatedSelected, ...dataPayload } as any)
          loadCadenceDashboard(editingId)
        }
      }
    } catch (error: any) {
      console.error(error)
      toast.error(error.message || 'Erro ao salvar cadência.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Delete Cadence
  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta cadência? Todos os leads na sequência serão removidos.')) return

    try {
      await deleteCadence(id)
      toast.success('Cadência excluída com sucesso!')
      if (selectedCadence && selectedCadence.id === id) {
        setView('list')
        setSelectedCadence(null)
      }
      loadData()
    } catch (error) {
      console.error(error)
      toast.error('Erro ao excluir cadência.')
    }
  }

  // Handle Pause/Resume status quick toggle
  const handleToggleStatus = async (cadence: Cadence) => {
    const newStatus = cadence.status === 'ATIVO' ? 'PAUSADO' : 'ATIVO'
    try {
      await updateCadence(cadence.id, { status: newStatus })
      toast.success(`Cadência ${newStatus === 'ATIVO' ? 'ativada' : 'pausada'} com sucesso!`)
      loadData()
      if (selectedCadence && selectedCadence.id === cadence.id) {
        setSelectedCadence(prev => prev ? { ...prev, status: newStatus } : null)
      }
    } catch (error) {
      console.error(error)
      toast.error('Erro ao alterar status da cadência.')
    }
  }

  // Handle Lead Status Change
  const handleUpdateLeadStatus = async (leadId: string, newStatus: string) => {
    try {
      await updateCadenceLeadStatus(leadId, newStatus)
      toast.success('Status do lead atualizado!')
      if (selectedCadence) loadCadenceDashboard(selectedCadence.id)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao atualizar status do lead.')
    }
  }

  // Handle Remove Lead
  const handleRemoveLead = async (leadId: string) => {
    if (!confirm('Remover este lead desta cadência?')) return
    try {
      await removeLeadFromCadence(leadId)
      toast.success('Lead removido da cadência.')
      if (selectedCadence) loadCadenceDashboard(selectedCadence.id)
    } catch (error) {
      console.error(error)
      toast.error('Erro ao remover lead.')
    }
  }

  // Statistics calculation across all cadences
  const globalStats = useMemo(() => {
    let totalLeads = 0
    let totalAtivos = 0
    let totalConcluidos = 0
    let totalParados = 0

    cadences.forEach(c => {
      c.leads?.forEach(l => {
        totalLeads++
        if (l.status === 'ATIVO') totalAtivos++
        else if (l.status === 'CONCLUIDA') totalConcluidos++
        else if (l.status === 'RESPONDIDA') totalParados++
      })
    })

    return { totalLeads, totalAtivos, totalConcluidos, totalParados }
  }, [cadences])

  // Filtered Leads in Dashboard Detail View
  const filteredLeads = useMemo(() => {
    if (!dashboardData?.leads) return []
    if (!searchLeadQuery.trim()) return dashboardData.leads
    const q = searchLeadQuery.toLowerCase()
    return dashboardData.leads.filter(l => 
      l.nome.toLowerCase().includes(q) || 
      l.telefone.includes(q)
    )
  }, [dashboardData, searchLeadQuery])

  return (
    <AppLayout>
      <div className="min-h-screen bg-black text-foreground p-6 max-md:p-4 pb-24 font-sans select-text">
      <Toaster theme="dark" position="top-right" closeButton />

      {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-semibold mb-1">
            <Workflow className="w-3.5 h-3.5" />
            <span>Automação Comercial</span>
          </div>
          <h1 className="text-2xl font-extrabold tracking-tight md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-foreground via-neutral-100 to-neutral-500">
            Cadências de Mensagens
          </h1>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Crie fluxos sequenciais de mensagens com prazos específicos, condições de parada ao receber respostas e acompanhe o progresso de cada lead.
          </p>
        </div>
        <div>
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs shadow-lg shadow-primary/20 hover:shadow-primary/40 transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ocr-glow-soft"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Cadência</span>
          </button>
        </div>
      </div>

      {/* KPI GLOBAL STATS */}
      {view === 'list' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/30">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Total Cadências</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black">{cadences.length}</span>
              <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded font-bold">Fluxos</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/30">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Leads Ativos</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-primary">{globalStats.totalAtivos}</span>
              <span className="text-[10px] text-muted-foreground">aguardando envio</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/30">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Saídas por Resposta</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-amber-400">{globalStats.totalParados}</span>
              <span className="text-[10px] text-muted-foreground">interagiram</span>
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/30">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block mb-1">Concluídas com Sucesso</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-emerald-400">{globalStats.totalConcluidos}</span>
              <span className="text-[10px] text-muted-foreground">toda sequência</span>
            </div>
          </div>
        </div>
      )}

      {/* LOADING STATE */}
      {loading && view === 'list' && (
        <div className="flex flex-col items-center justify-center py-20 border border-border/20 rounded-2xl bg-neutral-950/20">
          <RefreshCw className="w-8 h-8 text-primary animate-spin mb-3" />
          <span className="text-xs text-muted-foreground font-medium">Carregando cadências...</span>
        </div>
      )}

      {/* EMPTY STATE */}
      {!loading && cadences.length === 0 && view === 'list' && (
        <div className="flex flex-col items-center justify-center text-center py-20 px-4 border border-border/20 rounded-2xl bg-neutral-950/20">
          <div className="w-12 h-12 rounded-2xl bg-neutral-900 border border-border/40 flex items-center justify-center text-muted-foreground mb-4">
            <Workflow className="w-6 h-6 text-neutral-500" />
          </div>
          <h3 className="text-sm font-bold text-neutral-200">Nenhuma cadência configurada</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            Crie sua primeira sequência de mensagens para disparar mensagens do WhatsApp de forma automática e estratégica.
          </p>
          <button
            onClick={handleOpenCreateModal}
            className="mt-4 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 border border-border hover:border-primary/50 text-xs font-semibold text-neutral-300 transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-primary" />
            <span>Criar primeira cadência</span>
          </button>
        </div>
      )}

      {/* GRID OF CADENCES (LIST VIEW) */}
      {!loading && cadences.length > 0 && view === 'list' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {cadences.map(cadence => {
            const activeLeads = cadence.leads?.filter(l => l.status === 'ATIVO').length || 0
            const respondedLeads = cadence.leads?.filter(l => l.status === 'RESPONDIDA').length || 0
            const completedLeads = cadence.leads?.filter(l => l.status === 'CONCLUIDA').length || 0
            const pipe = pipelines.find(p => p.id === cadence.pipelineId)

            return (
              <div
                key={cadence.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-border/30 bg-neutral-900/20 hover:border-primary/30 transition-all duration-300 overflow-hidden shadow-sm"
              >
                {/* Accent status light */}
                <div className={`absolute top-0 left-0 right-0 h-0.5 ${cadence.status === 'ATIVO' ? 'bg-primary/60' : 'bg-neutral-600'}`} />

                <div className="p-5 flex-1">
                  {/* Card Title & Type */}
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-bold text-sm text-neutral-100 group-hover:text-primary transition-colors truncate max-w-[200px]" title={cadence.nome}>
                        {cadence.nome}
                      </h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider">
                          {cadence.tipo}
                        </span>
                        {pipe && (
                          <>
                            <span className="text-[9px] text-muted-foreground">•</span>
                            <span className="text-[9px] text-primary/80 font-medium truncate max-w-[100px]">
                              {pipe.nome}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status Badge Toggle */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        handleToggleStatus(cadence)
                      }}
                      className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase transition-all shrink-0 flex items-center gap-1 border ${
                        cadence.status === 'ATIVO'
                          ? 'bg-primary/10 text-primary border-primary/20'
                          : 'bg-neutral-800 text-muted-foreground border-border/30'
                      }`}
                      title={cadence.status === 'ATIVO' ? 'Pausar cadência' : 'Ativar cadência'}
                    >
                      {cadence.status === 'ATIVO' ? (
                        <>
                          <Play className="w-2.5 h-2.5 fill-primary" />
                          <span>Ativa</span>
                        </>
                      ) : (
                        <>
                          <Pause className="w-2.5 h-2.5 fill-muted-foreground" />
                          <span>Pausada</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Summary of Steps */}
                  <div className="bg-neutral-950/40 rounded-xl p-3 border border-border/10 mb-4 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground font-medium">Etapas da régua</span>
                    <span className="font-bold text-neutral-200 bg-neutral-900 border border-border/30 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>{cadence.etapas?.length || 0} etapas</span>
                    </span>
                  </div>

                  {/* Inline Stats */}
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                    <div className="py-2 rounded-lg bg-neutral-950/20 border border-border/15">
                      <span className="block font-black text-sm text-primary">{activeLeads}</span>
                      <span className="text-muted-foreground uppercase font-bold text-[8px] tracking-wider">Ativos</span>
                    </div>
                    <div className="py-2 rounded-lg bg-neutral-950/20 border border-border/15">
                      <span className="block font-black text-sm text-amber-400">{respondedLeads}</span>
                      <span className="text-muted-foreground uppercase font-bold text-[8px] tracking-wider">Respostas</span>
                    </div>
                    <div className="py-2 rounded-lg bg-neutral-950/20 border border-border/15">
                      <span className="block font-black text-sm text-emerald-400">{completedLeads}</span>
                      <span className="text-muted-foreground uppercase font-bold text-[8px] tracking-wider">Concluídas</span>
                    </div>
                  </div>
                </div>

                {/* Card Actions Footer */}
                <div className="px-5 py-3 bg-neutral-950/50 border-t border-border/20 flex items-center justify-between">
                  <button
                    onClick={() => handleViewDetail(cadence)}
                    className="flex items-center gap-1 text-[11px] font-bold text-primary hover:text-primary-glow transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Acompanhamento</span>
                  </button>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(cadence)}
                      className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
                      title="Editar cadência"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(cadence.id)}
                      className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-rose-400 transition-all cursor-pointer"
                      title="Excluir cadência"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DETAIL & MONITORING VIEW */}
      {view === 'detail' && selectedCadence && (
        <div className="space-y-6">
          {/* Detail Header & Return button */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/20 pb-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setView('list')
                  setSelectedCadence(null)
                  setDashboardData(null)
                }}
                className="p-2 rounded-xl border border-border/40 bg-neutral-900/20 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                title="Voltar para a lista"
              >
                <ArrowLeft className="w-4.5 h-4.5" />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold text-neutral-100">{selectedCadence.nome}</h2>
                  <span className="text-[9px] uppercase font-bold px-2 py-0.5 rounded border bg-neutral-900 text-muted-foreground border-border/30">
                    {selectedCadence.tipo}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Painel de monitoramento e controle dos leads na sequência de mensagens.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => handleToggleStatus(selectedCadence)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                  selectedCadence.status === 'ATIVO'
                    ? 'bg-primary/10 text-primary border-primary/20'
                    : 'bg-neutral-800 text-muted-foreground border-border/30'
                }`}
              >
                {selectedCadence.status === 'ATIVO' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-primary" />
                    <span>Pausar Régua</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-muted-foreground" />
                    <span>Ativar Régua</span>
                  </>
                )}
              </button>
              <button
                onClick={() => handleOpenEditModal(selectedCadence)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border/40 hover:border-primary/50 text-xs font-bold text-neutral-300 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-primary" />
                <span>Editar Fluxo</span>
              </button>
            </div>
          </div>

          {/* DETAIL SPECIFIC KPIS */}
          <div className="grid grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/10">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Ativos</span>
              <div className="text-xl font-black text-primary">{dashboardData?.totalAtivos ?? 0}</div>
            </div>
            <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/10">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Saídas por Resposta</span>
              <div className="text-xl font-black text-amber-400">{dashboardData?.totalParados ?? 0}</div>
            </div>
            <div className="p-4 rounded-2xl border border-border/30 bg-neutral-900/10">
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground block mb-0.5">Concluídas</span>
              <div className="text-xl font-black text-emerald-400">{dashboardData?.totalConcluidos ?? 0}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* TIMELINE OF STEPS */}
            <div className="lg:col-span-1 border border-border/30 rounded-2xl p-5 bg-neutral-900/20 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>Régua e Conversões</span>
              </h3>

              <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border/40">
                {selectedCadence.etapas.sort((a, b) => a.ordem - b.ordem).map((etapa, idx) => {
                  const leadCount = dashboardData?.etapas[etapa.ordem] ?? 0
                  return (
                    <div key={etapa.id} className="relative text-xs">
                      {/* Timeline dot */}
                      <span className="absolute -left-[22px] top-1.5 flex h-3.5 w-3.5 rounded-full bg-black border border-primary text-primary flex-items justify-center shrink-0">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      </span>

                      <div className="p-3.5 rounded-xl border border-border/20 bg-neutral-950/40 relative">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="font-bold text-neutral-200">Etapa {etapa.ordem}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded bg-primary/10 text-primary font-bold">
                            +{etapa.prazoValor} {etapa.prazoUnidade}
                          </span>
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-2 italic" title={etapa.mensagem}>
                          &ldquo;{etapa.mensagem}&rdquo;
                        </p>
                        <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border/10">
                          <span className="text-[10px] text-muted-foreground">Condição de parada</span>
                          <span className="text-[10px] font-semibold text-neutral-300">
                            {etapa.pararAoResponder ? 'Resposta Lead' : 'Nenhuma'}
                          </span>
                        </div>

                        {/* Active Leads Badge on this step */}
                        <div className="absolute -top-2 -right-2 bg-neutral-900 border border-border px-2 py-0.5 rounded-lg text-[9px] font-bold text-primary">
                          {leadCount} lead{leadCount !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* LEADS LIST / MONITORING TABLE */}
            <div className="lg:col-span-2 border border-border/30 rounded-2xl p-5 bg-neutral-900/20 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-300 flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  <span>Acompanhamento dos Leads</span>
                </h3>

                {/* Lead Search Input */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-border bg-black/40 w-full sm:w-60 focus-within:border-primary transition-all">
                  <Search className="w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchLeadQuery}
                    onChange={e => setSearchLeadQuery(e.target.value)}
                    placeholder="Filtrar lead por nome/tel..."
                    className="flex-1 bg-transparent text-xs focus:outline-none placeholder:text-muted-foreground"
                  />
                  {searchLeadQuery && (
                    <button onClick={() => setSearchLeadQuery('')} className="p-0.5 text-muted-foreground hover:text-foreground">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* TABLE CONTAINER */}
              {loadingDashboard ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <RefreshCw className="w-6 h-6 text-primary animate-spin mb-2" />
                  <span className="text-xs text-muted-foreground">Carregando leads...</span>
                </div>
              ) : filteredLeads.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 text-muted-foreground">
                  <AlertCircle className="w-8 h-8 text-neutral-500 mb-2" />
                  <span className="text-xs font-medium">Nenhum lead encontrado</span>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border/10">
                  <table className="w-full text-left border-collapse text-xs select-text">
                    <thead>
                      <tr className="border-b border-border/20 bg-neutral-950/40 text-muted-foreground uppercase font-bold text-[9px] tracking-wider">
                        <th className="p-3">Nome / Telefone</th>
                        <th className="p-3">Etapa Atual</th>
                        <th className="p-3">Próximo Envio</th>
                        <th className="p-3 text-center">Status</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/10">
                      {filteredLeads.map((lead: CadenceLead) => {
                        const statusColors: Record<string, string> = {
                          ATIVO: 'bg-primary/10 text-primary border-primary/20',
                          CONCLUIDA: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20',
                          RESPONDIDA: 'bg-amber-400/10 text-amber-400 border-amber-400/20'
                        }
                        
                        return (
                          <tr key={lead.id} className="hover:bg-neutral-900/30 transition-colors">
                            <td className="p-3">
                              <span className="font-bold text-neutral-200 block">{lead.nome}</span>
                              <span className="text-[10px] text-muted-foreground">{lead.telefone}</span>
                            </td>
                            <td className="p-3 font-semibold text-neutral-300">
                              Etapa {lead.etapaAtual} / {selectedCadence.etapas.length}
                            </td>
                            <td className="p-3 text-muted-foreground font-mono text-[10px]">
                              {lead.status === 'ATIVO' && lead.proximoEnvio ? (
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-primary shrink-0" />
                                  <span>{new Date(lead.proximoEnvio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                </div>
                              ) : (
                                <span>-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${statusColors[lead.status] || 'bg-neutral-800 text-neutral-300 border-border/20'}`}>
                                {lead.status === 'RESPONDIDA' ? 'RESPONDIDA (PARADO)' : lead.status}
                              </span>
                            </td>
                            <td className="p-3 text-right space-x-1 whitespace-nowrap">
                              {lead.status === 'ATIVO' ? (
                                <button
                                  onClick={() => handleUpdateLeadStatus(lead.id, 'RESPONDIDA')}
                                  className="px-2 py-1 rounded bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/25 text-[10px] font-bold text-amber-400 transition-colors cursor-pointer"
                                  title="Parar envio de mensagens"
                                >
                                  Parar
                                </button>
                              ) : lead.status === 'RESPONDIDA' ? (
                                <button
                                  onClick={() => handleUpdateLeadStatus(lead.id, 'ATIVO')}
                                  className="px-2 py-1 rounded bg-primary/10 hover:bg-primary/20 border border-primary/25 text-[10px] font-bold text-primary transition-colors cursor-pointer"
                                  title="Retomar a sequência"
                                >
                                  Retomar
                                </button>
                              ) : null}

                              <button
                                onClick={() => handleRemoveLead(lead.id)}
                                className="p-1 rounded bg-neutral-900 border border-border hover:border-rose-500 text-muted-foreground hover:text-rose-500 transition-all cursor-pointer inline-flex items-center justify-center"
                                title="Remover da cadência"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CADENCE BUILDER / EDITOR MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 max-md:p-2">
          {/* Backdrop */}
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md" onClick={() => setModalOpen(false)} />

          {/* Modal Content */}
          <div className="w-full max-w-3xl rounded-2xl border border-border/80 bg-neutral-950 p-5 shadow-2xl z-10 flex flex-col max-h-[90vh] ocr-glass-strong animate-scale-in">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-border/20 shrink-0">
              <h3 className="text-base font-extrabold text-foreground uppercase tracking-wider flex items-center gap-2">
                <Workflow className="w-5 h-5 text-primary" />
                <span>{editingId ? 'Editar Cadência' : 'Nova Régua de Cadência'}</span>
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-900 text-muted-foreground hover:text-foreground transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form Scrollable */}
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto py-4 space-y-5 scrollbar-thin pr-1 text-xs select-text">
              {/* Row 1: Name and Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Nome da Cadência</label>
                  <input
                    type="text"
                    required
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Ex: Reativação Clientes Frios 2026"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/60"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Tipo de Campanha</label>
                  <select
                    value={tipo}
                    onChange={e => setTipo(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all"
                  >
                    <option value="Sondagem">Sondagem de Faturamento</option>
                    <option value="Follow-up">Acompanhamento (Follow-up)</option>
                    <option value="Recuperação">Recuperação de Leads Perdidos</option>
                    <option value="Reativação">Reativação de Base Fria</option>
                    <option value="Outros">Personalizado</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Pipeline and Webhook */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Pipeline do Funil Vinculado</label>
                  <select
                    value={pipelineId}
                    onChange={e => setPipelineId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all"
                  >
                    <option value="">Nenhum pipeline vinculado</option>
                    {pipelines.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  <span className="text-[9px] text-muted-foreground block">
                    (Opcional) Associa a cadência a uma esteira específica do CRM.
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Webhook de Envio (Opcional)</label>
                  <input
                    type="url"
                    value={webhookUrl}
                    onChange={e => setWebhookUrl(e.target.value)}
                    placeholder="https://n8n.exemplo.com/webhook/enviar"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all placeholder:text-muted-foreground/60"
                  />
                  <span className="text-[9px] text-muted-foreground block">
                    (Opcional) Webhook disparado a cada etapa para integração com n8n/Evo.
                  </span>
                </div>
              </div>

              {/* Row 3: Status selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Status da Cadência</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="ATIVO"
                      checked={status === 'ATIVO'}
                      onChange={() => setStatus('ATIVO')}
                      className="accent-primary"
                    />
                    <span className="text-neutral-200">Ativa (Leads progridem e disparam normalmente)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="status"
                      value="PAUSADO"
                      checked={status === 'PAUSADO'}
                      onChange={() => setStatus('PAUSADO')}
                      className="accent-primary"
                    />
                    <span className="text-neutral-200">Pausada (Nenhum agendamento é enviado)</span>
                  </label>
                </div>
              </div>

              {/* DYNAMIC STEPS BUILDER */}
              <div className="space-y-4 pt-3 border-t border-border/20">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-300">
                      Régua de Envio e Etapas
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      Configure a ordem de mensagens e os tempos de espera entre cada disparo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-neutral-900 border border-border hover:border-primary/50 text-xs font-semibold text-neutral-300 transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-primary" />
                    <span>Adicionar Etapa</span>
                  </button>
                </div>

                {/* STEPS LIST CONTAINER */}
                <div className="space-y-4">
                  {etapas.map((etapa, index) => {
                    return (
                      <div
                        key={index}
                        className="p-4 rounded-xl border border-border/20 bg-neutral-950 relative flex flex-col gap-3 hover:border-border/40 transition-colors"
                      >
                        {/* Step Header Indicator */}
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-neutral-200 bg-neutral-900 px-2 py-0.5 rounded border border-border/30">
                            Etapa {index + 1}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleRemoveStep(index)}
                            className="p-1.5 rounded bg-neutral-900 text-muted-foreground hover:text-rose-500 border border-border/30 hover:border-rose-500/30 transition-all cursor-pointer"
                            title="Remover etapa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Step Inputs: Time delay */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 items-end">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground block">
                              {index === 0 ? 'Tempo inicial para iniciar' : 'Tempo de espera após etapa anterior'}
                            </label>
                            <div className="flex gap-2">
                              <input
                                type="number"
                                min="0"
                                required
                                value={etapa.prazoValor}
                                onChange={e => handleUpdateStepField(index, 'prazoValor', Number(e.target.value))}
                                className="w-20 px-3 py-1.5 rounded-lg border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all text-center font-bold"
                              />
                              <select
                                value={etapa.prazoUnidade}
                                onChange={e => handleUpdateStepField(index, 'prazoUnidade', e.target.value)}
                                className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all"
                              >
                                <option value="horas">Horas</option>
                                <option value="dias">Dias</option>
                                <option value="semanas">Semanas</option>
                              </select>
                            </div>
                          </div>

                          {/* Template Picker */}
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-muted-foreground block">Modelo de Mensagem (Opcional)</label>
                            <select
                              value={etapa.templateId || ''}
                              onChange={e => handleUpdateStepField(index, 'templateId', e.target.value || null)}
                              className="w-full px-3 py-1.5 rounded-lg border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all"
                            >
                              <option value="">-- Usar Texto Personalizado --</option>
                              {templates.map(t => (
                                <option key={t.id} value={t.id}>{t.nome} ({t.categoria})</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Step Text Area */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] font-bold text-muted-foreground block">Corpo da Mensagem</label>
                            {/* Template injection tags helper */}
                            <div className="flex gap-1">
                              {['nome', 'empresa', 'produto', 'vendedor'].map(tag => (
                                <button
                                  key={tag}
                                  type="button"
                                  onClick={() => {
                                    const text = etapa.mensagem
                                    handleUpdateStepField(index, 'mensagem', text + ` {{${tag}}}`)
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-neutral-900 hover:bg-neutral-800 border border-border text-[9px] font-semibold text-primary transition-colors cursor-pointer"
                                >
                                  +{tag}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            required
                            value={etapa.mensagem}
                            onChange={e => handleUpdateStepField(index, 'mensagem', e.target.value)}
                            placeholder="Olá {{nome}}, tudo bem? Gostaria de saber mais sobre..."
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-border bg-neutral-900/40 text-foreground text-xs focus:outline-none focus:border-primary transition-all resize-y placeholder:text-muted-foreground/50"
                          />
                        </div>

                        {/* Conditions */}
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id={`stop-${index}`}
                            checked={etapa.pararAoResponder}
                            onChange={e => handleUpdateStepField(index, 'pararAoResponder', e.target.checked)}
                            className="accent-primary cursor-pointer h-3.5 w-3.5"
                          />
                          <label htmlFor={`stop-${index}`} className="text-[10px] font-medium text-neutral-300 cursor-pointer select-none">
                            Remover lead deste fluxo automaticamente caso ele responda no WhatsApp
                          </label>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </form>

            {/* Modal Actions Footer */}
            <div className="pt-4 border-t border-border/20 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-border hover:bg-neutral-900 text-xs font-bold text-neutral-300 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{editingId ? 'Salvar Alterações' : 'Criar Régua'}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      </div>
    </AppLayout>
  )
}

// Support template parameters rendering
CadenciasPage.getLayout = function getLayout(page: React.ReactNode) {
  return <AppLayout>{page}</AppLayout>
}
