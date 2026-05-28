'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Zap, Plus, Calendar, Filter, FileText, History,
  TrendingUp, CheckCircle, Clock, Play,
  AlertCircle, ChevronRight, Settings, MessageSquare,
  AlertTriangle, X, Trash2, Edit3, Workflow,
  Users, CheckCircle2, ArrowLeft, ChevronDown,
  Search, Tag, Target, GitBranch, UserX, BarChart3,
  Pause, RefreshCw, Eye, ArrowRight, ExternalLink,
  Sparkles, Check
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import * as crmActions from '@/app/actions/crm'
import type { SegmentoRegra, SegmentoItem, DealPreview } from '@/app/actions/crm'
import { toast, Toaster } from 'sonner'

// ─── Types ───────────────────────────────────────────────────────────────────

type TabType = 'listas' | 'wizard' | 'segmentos' | 'cadencias' | 'templates' | 'historico'

interface StepInput {
  ordem: number
  prazoValor: number
  prazoUnidade: string
  mensagem: string
  templateId: string | null
  pararAoResponder: boolean
}

interface Cadence {
  id: string
  nome: string
  tipo: string
  webhookUrl: string | null
  pipelineId: string | null
  status: string
  createdAt: Date | string
  etapas: StepInput[]
  leads: { id: string; status: string; etapaAtual: number }[]
}

// ─── Utils ───────────────────────────────────────────────────────────────────

const gradientText: React.CSSProperties = {
  background: 'var(--ocr-gradient-text)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
  backgroundClip: 'text',
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus-visible:outline-none ${checked ? 'bg-primary' : 'bg-neutral-700'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

const RULE_TYPES = [
  { tipo: 'sem_resposta', label: 'Leads sem resposta', icon: MessageSquare, desc: 'Deals ABERTOS sem atividade há X horas' },
  { tipo: 'negocios_perdidos', label: 'Negócios perdidos', icon: X, desc: 'Deals com status PERDIDO' },
  { tipo: 'etapa_especifica', label: 'Etapa específica', icon: GitBranch, desc: 'Deals em determinada etapa do funil' },
  { tipo: 'leads_frios', label: 'Leads frios', icon: Clock, desc: 'Deals sem atualização há X dias' },
  { tipo: 'prioridade', label: 'Por prioridade', icon: BarChart3, desc: 'Filtrar por classificação do deal' },
  { tipo: 'origem', label: 'Por origem', icon: Tag, desc: 'Leads de canal específico (WhatsApp, Google, etc.)' },
  { tipo: 'sem_responsavel', label: 'Sem responsável', icon: UserX, desc: 'Deals sem vendedor atribuído' },
] as const

const TABS = [
  { id: 'listas',     label: 'Ações Ativas',  icon: Play      },
  { id: 'wizard',     label: 'Nova Ação',      icon: Plus      },
  { id: 'segmentos',  label: 'Segmentos',      icon: Filter    },
  { id: 'cadencias',  label: 'Cadências',      icon: Workflow  },
  { id: 'templates',  label: 'Templates',      icon: FileText  },
  { id: 'historico',  label: 'Histórico',      icon: History   },
]

function LoadingSkeleton() {
  return (
    <AppLayout>
      <div className="p-6 md:p-8 space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-4 w-72 bg-neutral-800 rounded-lg animate-pulse" />
          <div className="h-9 w-40 bg-neutral-800 rounded-xl animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 bg-neutral-900/60 rounded-2xl border border-border/30 animate-pulse" />
          ))}
        </div>
        <div className="flex gap-2 p-1.5 bg-neutral-900/50 rounded-2xl border border-border/30 w-fit">
          {[80, 96, 88, 104, 88, 80].map((w, i) => (
            <div key={i} style={{ width: w }} className="h-9 bg-neutral-800 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-44 bg-neutral-900/60 rounded-2xl border border-border/30 animate-pulse" />
          ))}
        </div>
      </div>
    </AppLayout>
  )
}

// ─── Priority helpers ─────────────────────────────────────────────────────────

const PRIORITY_META: Record<string, { label: string; dot: string; badge: string }> = {
  maxima: { label: 'Máxima',  dot: 'bg-red-400',    badge: 'bg-red-500/10 text-red-400 border-red-500/20' },
  media:  { label: 'Média',   dot: 'bg-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/20' },
  baixa:  { label: 'Baixa',   dot: 'bg-yellow-400', badge: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20' },
}

function PriorityBadge({ prioridade }: { prioridade?: string }) {
  if (!prioridade) return null
  const meta = PRIORITY_META[prioridade]
  if (!meta) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border ${meta.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

// ─── SEGMENTOS TAB ───────────────────────────────────────────────────────────

function SegmentosTab({ pipelines, stages }: { pipelines: any[]; stages: any[] }) {
  const [segmentos, setSegmentos] = useState<SegmentoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showBuilder, setShowBuilder] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const [form, setForm] = useState({
    nome: '',
    descricao: '',
    pipelineId: '',
    regras: [] as SegmentoRegra[],
  })

  const [evalCounts, setEvalCounts] = useState<Record<string, number>>({})
  const [evaluating, setEvaluating] = useState<string | null>(null)

  const loadSegmentos = useCallback(async () => {
    setLoading(true)
    try {
      const data = await crmActions.getSegmentos()
      setSegmentos(data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadSegmentos() }, [loadSegmentos])

  const resetForm = () => {
    setForm({ nome: '', descricao: '', pipelineId: '', regras: [] })
    setEditingId(null)
    setShowBuilder(false)
  }

  const addRegra = (tipo: string) => {
    let regra: SegmentoRegra
    if (tipo === 'sem_resposta') regra = { tipo: 'sem_resposta', horasMin: 72 }
    else if (tipo === 'negocios_perdidos') regra = { tipo: 'negocios_perdidos' }
    else if (tipo === 'etapa_especifica') regra = { tipo: 'etapa_especifica', stageId: stages[0]?.id || '' }
    else if (tipo === 'leads_frios') regra = { tipo: 'leads_frios', diasSemAtividade: 7 }
    else if (tipo === 'prioridade') regra = { tipo: 'prioridade', prioridade: 'MEDIA' }
    else if (tipo === 'origem') regra = { tipo: 'origem', origem: 'whatsapp' }
    else regra = { tipo: 'sem_responsavel' }
    setForm(f => ({ ...f, regras: [...f.regras, regra] }))
  }

  const updateRegra = (idx: number, updates: Partial<SegmentoRegra>) => {
    setForm(f => {
      const regras = [...f.regras]
      regras[idx] = { ...regras[idx], ...updates } as SegmentoRegra
      return { ...f, regras }
    })
  }

  const removeRegra = (idx: number) => {
    setForm(f => ({ ...f, regras: f.regras.filter((_, i) => i !== idx) }))
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Dê um nome ao segmento.'); return }
    if (form.regras.length === 0) { toast.error('Adicione pelo menos uma regra.'); return }
    try {
      if (editingId) {
        await crmActions.updateSegmento(editingId, form)
        toast.success('Segmento atualizado!')
      } else {
        await crmActions.createSegmento(form)
        toast.success('Segmento criado!')
      }
      await loadSegmentos()
      resetForm()
    } catch (e: any) { toast.error(e.message || 'Erro ao salvar segmento.') }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este segmento?')) return
    try {
      await crmActions.deleteSegmento(id)
      await loadSegmentos()
      toast.success('Segmento removido.')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleEvaluate = async (id: string) => {
    setEvaluating(id)
    try {
      const result = await crmActions.evaluateSegmento(id)
      setEvalCounts(prev => ({ ...prev, [id]: result.count }))
      toast.success(`${result.count} leads encontrados com estas regras.`)
    } catch (e: any) { toast.error(e.message) }
    finally { setEvaluating(null) }
  }

  const startEdit = (seg: SegmentoItem) => {
    setForm({ nome: seg.nome, descricao: seg.descricao || '', pipelineId: '', regras: seg.regras })
    setEditingId(seg.id)
    setShowBuilder(true)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-foreground">Segmentos de Público</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Crie grupos dinâmicos de leads com regras baseadas no pipeline</p>
        </div>
        {!showBuilder && (
          <button
            onClick={() => setShowBuilder(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" /> Novo Segmento
          </button>
        )}
      </div>

      {/* Builder */}
      {showBuilder && (
        <div className="ocr-card p-6 rounded-2xl space-y-5 border border-primary/20">
          <div className="flex items-center justify-between">
            <h4 className="font-bold text-foreground flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" />
              {editingId ? 'Editar Segmento' : 'Criar Novo Segmento'}
            </h4>
            <button onClick={resetForm} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nome do Segmento *</label>
              <input
                value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 focus:border-primary outline-none text-sm"
                placeholder="Ex: Leads sem resposta 72h"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Pipeline (opcional)</label>
              <select
                value={form.pipelineId}
                onChange={e => setForm(f => ({ ...f, pipelineId: e.target.value }))}
                className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 focus:border-primary outline-none text-sm text-foreground"
              >
                <option value="">Todos os pipelines</option>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Descrição</label>
              <input
                value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 focus:border-primary outline-none text-sm"
                placeholder="Descreva o propósito deste segmento..."
              />
            </div>
          </div>

          {/* Rule Type Picker */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Adicionar Regra</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {RULE_TYPES.map(rt => {
                const Icon = rt.icon
                return (
                  <button
                    key={rt.tipo}
                    type="button"
                    onClick={() => addRegra(rt.tipo)}
                    className="flex flex-col items-start gap-1 p-3 rounded-xl border border-border/50 bg-neutral-900/50 hover:border-primary/50 hover:bg-primary/5 text-left transition-all group"
                  >
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-[11px] font-bold text-foreground group-hover:text-primary transition-colors leading-tight">{rt.label}</span>
                    <span className="text-[9px] text-muted-foreground leading-tight">{rt.desc}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Configured Rules */}
          {form.regras.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground block">Regras Configuradas ({form.regras.length})</label>
              {form.regras.map((regra, idx) => (
                <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-neutral-900/60 border border-border/40">
                  <div className="flex-1 space-y-2">
                    <p className="text-xs font-bold text-primary">
                      {RULE_TYPES.find(r => r.tipo === regra.tipo)?.label || regra.tipo}
                    </p>

                    {regra.tipo === 'sem_resposta' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Sem resposta há mais de</span>
                        <input
                          type="number"
                          min={1}
                          value={regra.horasMin}
                          onChange={e => updateRegra(idx, { horasMin: Number(e.target.value) })}
                          className="w-20 bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        />
                        <span className="text-xs text-muted-foreground">horas</span>
                      </div>
                    )}

                    {regra.tipo === 'leads_frios' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Sem atividade há</span>
                        <input
                          type="number"
                          min={1}
                          value={regra.diasSemAtividade}
                          onChange={e => updateRegra(idx, { diasSemAtividade: Number(e.target.value) })}
                          className="w-20 bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        />
                        <span className="text-xs text-muted-foreground">dias</span>
                      </div>
                    )}

                    {regra.tipo === 'etapa_especifica' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">Etapa:</span>
                        <select
                          value={regra.stageId}
                          onChange={e => updateRegra(idx, { stageId: e.target.value })}
                          className="bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        >
                          {stages.length === 0 && <option value="">Selecione um pipeline acima</option>}
                          {stages.map(s => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                        <span className="text-xs text-muted-foreground">há mais de</span>
                        <input
                          type="number"
                          min={0}
                          value={regra.horasMin || 0}
                          onChange={e => updateRegra(idx, { horasMin: Number(e.target.value) || undefined })}
                          className="w-16 bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                          placeholder="0"
                        />
                        <span className="text-xs text-muted-foreground">horas (0 = qualquer)</span>
                      </div>
                    )}

                    {regra.tipo === 'prioridade' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Prioridade:</span>
                        <select
                          value={regra.prioridade}
                          onChange={e => updateRegra(idx, { prioridade: e.target.value })}
                          className="bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        >
                          <option value="BAIXA">Lead AP (Baixa)</option>
                          <option value="MEDIA">Zona Cinza (Média)</option>
                          <option value="ALTA">Desqualificada (Alta)</option>
                          <option value="NAO_RESPONDEU">Não Respondeu</option>
                        </select>
                      </div>
                    )}

                    {regra.tipo === 'origem' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Origem:</span>
                        <select
                          value={regra.origem}
                          onChange={e => updateRegra(idx, { origem: e.target.value })}
                          className="bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                        >
                          <option value="whatsapp">WhatsApp</option>
                          <option value="facebook">Facebook</option>
                          <option value="google">Google</option>
                          <option value="instagram">Instagram</option>
                          <option value="site">Site</option>
                          <option value="indicacao">Indicação</option>
                          <option value="manual">Manual</option>
                        </select>
                      </div>
                    )}

                    {regra.tipo === 'negocios_perdidos' && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Motivo (opcional):</span>
                        <input
                          value={(regra as any).motivoPerda || ''}
                          onChange={e => updateRegra(idx, { motivoPerda: e.target.value || undefined } as any)}
                          className="flex-1 bg-black border border-border rounded-lg px-2 py-1 text-xs text-foreground focus:border-primary outline-none"
                          placeholder="Todos os motivos"
                        />
                      </div>
                    )}

                    {regra.tipo === 'sem_responsavel' && (
                      <p className="text-xs text-muted-foreground">Todos os deals sem vendedor atribuído</p>
                    )}
                  </div>
                  <button onClick={() => removeRegra(idx)} className="text-muted-foreground hover:text-destructive transition-colors shrink-0 mt-0.5">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-border/40">
            <button onClick={resetForm} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-neutral-800 transition-all">
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="flex-1 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all"
            >
              {editingId ? 'Salvar Alterações' : 'Criar Segmento'}
            </button>
          </div>
        </div>
      )}

      {/* Segment Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="h-36 bg-neutral-900/60 rounded-2xl animate-pulse" />)}
        </div>
      ) : segmentos.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl bg-neutral-950/30">
          <Filter className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-bold text-foreground mb-2">Nenhum segmento criado</h3>
          <p className="text-sm text-muted-foreground max-w-xs mx-auto">Crie segmentos de público com regras baseadas no comportamento dos leads no pipeline.</p>
        </div>
      ) : (
        (() => {
          const templateSegs = segmentos.filter(s => s.tipo === 'template')
          const customSegs = segmentos.filter(s => s.tipo !== 'template')
          const groups = [
            { label: 'Prioridade Máxima', items: templateSegs.filter(s => s.prioridade === 'maxima') },
            { label: 'Prioridade Média',  items: templateSegs.filter(s => s.prioridade === 'media') },
            { label: 'Baixa Prioridade',  items: templateSegs.filter(s => s.prioridade === 'baixa') },
            { label: 'Meus Segmentos',    items: customSegs },
          ].filter(g => g.items.length > 0)

          return (
            <div className="space-y-6">
              {groups.map(group => (
                <div key={group.label}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">{group.label}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {group.items.map(seg => (
                      <div key={seg.id} className="ocr-card p-5 rounded-2xl flex flex-col gap-3 group hover:border-primary/30 transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <PriorityBadge prioridade={seg.prioridade} />
                              {seg.tipo === 'template' && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 bg-neutral-800 text-muted-foreground rounded border border-border/50 uppercase tracking-wider">Template</span>
                              )}
                            </div>
                            <h3 className="font-bold text-primary text-sm leading-snug">{seg.nome}</h3>
                            {seg.descricao && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{seg.descricao}</p>}
                          </div>
                          {seg.tipo !== 'template' && (
                            <div className="flex gap-1 shrink-0">
                              <button onClick={() => startEdit(seg)} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-primary transition-colors">
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => handleDelete(seg.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1.5">
                          {seg.regras.map((r, i) => (
                            <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] bg-primary/10 text-primary border border-primary/20 rounded-md font-medium">
                              {RULE_TYPES.find(rt => rt.tipo === r.tipo)?.label || r.tipo}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center justify-between mt-auto pt-2 border-t border-border/30">
                          <span className="text-[10px] text-muted-foreground">
                            {evalCounts[seg.id] !== undefined
                              ? <span className="text-primary font-bold">{evalCounts[seg.id]} leads</span>
                              : `${seg.regras.length} regra${seg.regras.length !== 1 ? 's' : ''}`}
                          </span>
                          <button
                            onClick={() => handleEvaluate(seg.id)}
                            disabled={evaluating === seg.id}
                            className="flex items-center gap-1 px-2.5 py-1 bg-neutral-800 hover:bg-primary/10 hover:text-primary text-xs font-semibold rounded-lg transition-colors border border-border/50 hover:border-primary/30 disabled:opacity-50"
                          >
                            {evaluating === seg.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <BarChart3 className="w-3 h-3" />}
                            Avaliar
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )
        })()
      )}
    </div>
  )
}

// ─── TEMPLATES TAB ───────────────────────────────────────────────────────────

function TemplatesTab() {
  const [templates, setTemplates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [form, setForm] = useState({ nome: '', categoria: 'GERAL', corpo: '' })
  const [searchQ, setSearchQ] = useState('')

  const CATEGORIES = ['GERAL', 'REATIVACAO', 'FOLLOWUP', 'PROPOSTA', 'FECHAMENTO', 'OUTRO']

  const getPreview = (text: string) =>
    text.replace(/{nome}/g, 'João Silva').replace(/{primeiro_nome}/g, 'João').replace(/{ramo}/g, 'Alimentos').replace(/{faturamento}/g, 'R$ 50.000,00')

  const loadTemplates = useCallback(async () => {
    setLoading(true)
    try { setTemplates(await crmActions.getTemplates()) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])

  const openNew = () => {
    setForm({ nome: '', categoria: 'GERAL', corpo: '' })
    setEditingTemplate(null)
    setShowModal(true)
  }

  const openEdit = (tpl: any) => {
    setForm({ nome: tpl.nome, categoria: tpl.categoria, corpo: tpl.corpo })
    setEditingTemplate(tpl)
    setShowModal(true)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório.'); return }
    if (!form.corpo.trim()) { toast.error('Corpo do template obrigatório.'); return }
    try {
      if (editingTemplate) {
        await crmActions.updateTemplate(editingTemplate.id, form)
        toast.success('Template atualizado!')
      } else {
        await crmActions.createTemplate(form)
        toast.success('Template criado!')
      }
      await loadTemplates()
      setShowModal(false)
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este template?')) return
    try {
      await crmActions.deleteTemplate(id)
      await loadTemplates()
      toast.success('Template removido.')
    } catch (e: any) { toast.error(e.message) }
  }

  const filtered = templates.filter(t =>
    t.nome.toLowerCase().includes(searchQ.toLowerCase()) ||
    t.categoria.toLowerCase().includes(searchQ.toLowerCase())
  )

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-foreground">Templates de Mensagem</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Mensagens reutilizáveis para suas ações de disparo</p>
        </div>
        <button
          onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 shrink-0"
        >
          <Plus className="w-4 h-4" /> Novo Template
        </button>
      </div>

      <div className="relative w-full max-w-xs">
        <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Buscar templates..."
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-border/30 bg-neutral-900/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="h-40 bg-neutral-900/60 rounded-2xl animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl bg-neutral-950/30">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground/40 mb-3" />
          <h3 className="font-bold text-foreground mb-2">
            {searchQ ? 'Nenhum template encontrado' : 'Nenhum template criado'}
          </h3>
          {!searchQ && (
            <button onClick={openNew} className="mt-4 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-bold hover:bg-primary hover:text-black transition-all">
              Criar primeiro template
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(tpl => (
            <div key={tpl.id} className="ocr-card p-5 rounded-2xl flex flex-col gap-3 group hover:border-primary/30 transition-all">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-primary text-sm truncate">{tpl.nome}</h3>
                  <span className="text-[10px] px-1.5 py-0.5 bg-neutral-800 rounded text-muted-foreground font-semibold mt-0.5 inline-block">
                    {tpl.categoria}
                  </span>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(tpl)} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-primary transition-colors">
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(tpl.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-black/40 p-3 rounded-lg border border-border/30 flex-1">
                <p className="text-xs text-muted-foreground font-mono whitespace-pre-wrap line-clamp-4">{tpl.corpo}</p>
              </div>

              <div className="pt-1 border-t border-border/30">
                <p className="text-[9px] text-muted-foreground font-bold uppercase mb-1">Preview</p>
                <p className="text-xs text-foreground/80 line-clamp-2">{getPreview(tpl.corpo)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Template Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-xl bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold tracking-tight">{editingTemplate ? 'Editar Template' : 'Novo Template'}</h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Nome *</label>
                  <input
                    value={form.nome}
                    onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                    className="w-full bg-neutral-900 border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none"
                    placeholder="Ex: Reativação Leads Frios"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Categoria</label>
                  <select
                    value={form.categoria}
                    onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}
                    className="w-full bg-neutral-900 border border-border rounded-xl px-3 py-2 text-sm text-foreground focus:border-primary outline-none"
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Variáveis disponíveis</label>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {['{nome}', '{primeiro_nome}', '{ramo}', '{faturamento}'].map(v => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, corpo: f.corpo + v }))}
                      className="px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 text-xs font-mono hover:bg-primary hover:text-black transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Corpo da Mensagem *</label>
                <textarea
                  value={form.corpo}
                  onChange={e => setForm(f => ({ ...f, corpo: e.target.value }))}
                  rows={6}
                  className="w-full bg-neutral-900 border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none font-mono resize-none"
                  placeholder="Olá {primeiro_nome}, tudo bem?&#10;&#10;Vi que você demonstrou interesse em..."
                />
              </div>

              {form.corpo && (
                <div className="p-3 rounded-xl bg-neutral-900/50 border border-border/20">
                  <p className="text-[10px] font-bold uppercase text-primary mb-1">Preview</p>
                  <p className="text-xs text-foreground whitespace-pre-wrap">{getPreview(form.corpo)}</p>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-neutral-800">
                Cancelar
              </button>
              <button onClick={handleSave} className="flex-1 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg transition-all">
                {editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── CADÊNCIAS TAB (inline) ──────────────────────────────────────────────────

function CadenciasTab() {
  const [cadences, setCadences] = useState<Cadence[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [pipelines, setPipelines] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'list' | 'builder' | 'monitor'>('list')
  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null)
  const [isEditing, setIsEditing] = useState(false)

  const [form, setForm] = useState({
    nome: '',
    tipo: 'REATIVACAO',
    webhookUrl: '',
    pipelineId: '',
    status: 'ATIVO',
  })
  const [steps, setSteps] = useState<StepInput[]>([
    { ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: '', templateId: null, pararAoResponder: true }
  ])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [c, t, p] = await Promise.all([
        crmActions.getCadencias(),
        crmActions.getTemplates(),
        crmActions.getPipelines()
      ])
      setCadences(c as Cadence[])
      setTemplates(t)
      setPipelines(p)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const resetBuilder = () => {
    setForm({ nome: '', tipo: 'REATIVACAO', webhookUrl: '', pipelineId: '', status: 'ATIVO' })
    setSteps([{ ordem: 1, prazoValor: 0, prazoUnidade: 'horas', mensagem: '', templateId: null, pararAoResponder: true }])
    setSelectedCadence(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (!form.nome.trim()) { toast.error('Nome obrigatório.'); return }
    if (steps.length === 0) { toast.error('Adicione pelo menos uma etapa.'); return }
    try {
      const sanitizedEtapas = steps.map(s => ({
        ordem: s.ordem,
        prazoValor: s.prazoValor,
        prazoUnidade: s.prazoUnidade,
        mensagem: s.mensagem,
        templateId: s.templateId || undefined,
        pararAoResponder: s.pararAoResponder
      }))
      if (isEditing && selectedCadence) {
        await crmActions.updateCadence(selectedCadence.id, { ...form, etapas: sanitizedEtapas })
        toast.success('Cadência atualizada!')
      } else {
        await crmActions.createCadence({ ...form, etapas: sanitizedEtapas })
        toast.success('Cadência criada!')
      }
      await load()
      resetBuilder()
      setView('list')
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir esta cadência?')) return
    try {
      await crmActions.deleteCadence(id)
      await load()
      toast.success('Cadência excluída.')
    } catch (e: any) { toast.error(e.message) }
  }

  const addStep = () => {
    setSteps(prev => [...prev, {
      ordem: prev.length + 1,
      prazoValor: 1,
      prazoUnidade: 'dias',
      mensagem: '',
      templateId: null,
      pararAoResponder: true
    }])
  }

  const removeStep = (idx: number) => {
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, ordem: i + 1 })))
  }

  const updateStep = (idx: number, updates: Partial<StepInput>) => {
    setSteps(prev => prev.map((s, i) => i === idx ? { ...s, ...updates } : s))
  }

  const openEdit = (cad: Cadence) => {
    setForm({
      nome: cad.nome,
      tipo: cad.tipo,
      webhookUrl: cad.webhookUrl || '',
      pipelineId: cad.pipelineId || '',
      status: cad.status
    })
    setSteps(cad.etapas.map(e => ({
      ordem: e.ordem,
      prazoValor: e.prazoValor,
      prazoUnidade: e.prazoUnidade,
      mensagem: e.mensagem,
      templateId: e.templateId || null,
      pararAoResponder: e.pararAoResponder
    })))
    setSelectedCadence(cad)
    setIsEditing(true)
    setView('builder')
  }

  if (loading) return (
    <div className="space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-32 bg-neutral-900/60 rounded-2xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="space-y-4 animate-fade-in">
      {view === 'list' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-foreground">Cadências de Mensagens</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Sequências automáticas de follow-up para seus leads</p>
            </div>
            <button
              onClick={() => { resetBuilder(); setView('builder') }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nova Cadência
            </button>
          </div>

          {cadences.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-border/50 rounded-2xl bg-neutral-950/30">
              <Workflow className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
              <h3 className="font-bold text-foreground mb-2">Nenhuma cadência criada</h3>
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">Cadências enviam sequências de mensagens automaticamente para nutrir seus leads.</p>
              <button onClick={() => setView('builder')} className="mt-4 px-4 py-2 bg-primary/10 text-primary border border-primary/20 rounded-xl text-sm font-bold hover:bg-primary hover:text-black transition-all">
                Criar primeira cadência
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {cadences.map(cad => {
                const activeLeads = cad.leads.filter(l => l.status === 'ATIVO').length
                const totalLeads = cad.leads.length
                return (
                  <div key={cad.id} className="ocr-card p-5 rounded-2xl flex flex-col sm:flex-row sm:items-center gap-4 group hover:border-primary/30 transition-all">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-foreground text-sm truncate">{cad.nome}</h3>
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${cad.status === 'ATIVO' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-neutral-800 text-muted-foreground border-border'}`}>
                          {cad.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1"><Workflow className="w-3 h-3" />{cad.etapas.length} etapas</span>
                        <span className="flex items-center gap-1"><Users className="w-3 h-3" />{activeLeads} ativos / {totalLeads} total</span>
                        <span className="capitalize">{cad.tipo.replace(/_/g, ' ').toLowerCase()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => { setSelectedCadence(cad); setView('monitor') }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold rounded-xl transition-colors border border-border/50"
                      >
                        <Eye className="w-3.5 h-3.5" /> Monitor
                      </button>
                      <button onClick={() => openEdit(cad)} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-primary transition-colors">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(cad.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {view === 'builder' && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button onClick={() => { resetBuilder(); setView('list') }} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h3 className="font-bold text-foreground">{isEditing ? 'Editar Cadência' : 'Nova Cadência'}</h3>
              <p className="text-xs text-muted-foreground">Configure as etapas da sequência de mensagens</p>
            </div>
          </div>

          <div className="ocr-card p-5 rounded-2xl space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Nome da Cadência *</label>
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
                  className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 text-sm focus:border-primary outline-none"
                  placeholder="Ex: Follow-up pós-proposta" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Tipo</label>
                <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                  className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary outline-none">
                  <option value="REATIVACAO">Reativação</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="NUTRICAO">Nutrição</option>
                  <option value="POS_VENDA">Pós-venda</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Pipeline (opcional)</label>
                <select value={form.pipelineId} onChange={e => setForm(f => ({ ...f, pipelineId: e.target.value }))}
                  className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 text-sm text-foreground focus:border-primary outline-none">
                  <option value="">Todos os pipelines</option>
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Webhook URL (opcional)</label>
                <input value={form.webhookUrl} onChange={e => setForm(f => ({ ...f, webhookUrl: e.target.value }))}
                  className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 text-sm focus:border-primary outline-none font-mono text-primary"
                  placeholder="https://n8n.empresa.com/webhook/..." />
              </div>
            </div>
          </div>

          {/* Steps Timeline */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground">Etapas da Cadência</h4>
              <button onClick={addStep} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-xl text-xs font-bold hover:bg-primary hover:text-black transition-all">
                <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
              </button>
            </div>

            {steps.map((step, idx) => (
              <div key={idx} className="flex gap-3">
                <div className="flex flex-col items-center gap-0 shrink-0">
                  <div className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                    {idx + 1}
                  </div>
                  {idx < steps.length - 1 && <div className="w-px flex-1 bg-border/30 my-1" />}
                </div>
                <div className="flex-1 ocr-card p-4 rounded-xl mb-2 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-primary">Etapa {idx + 1}</p>
                    {steps.length > 1 && (
                      <button onClick={() => removeStep(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Aguardar</label>
                      <div className="flex gap-1">
                        <input type="number" min={0} value={step.prazoValor}
                          onChange={e => updateStep(idx, { prazoValor: Number(e.target.value) })}
                          className="w-16 bg-neutral-900 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none" />
                        <select value={step.prazoUnidade} onChange={e => updateStep(idx, { prazoUnidade: e.target.value })}
                          className="flex-1 bg-neutral-900 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none">
                          <option value="horas">horas</option>
                          <option value="dias">dias</option>
                          <option value="semanas">semanas</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Template (opcional)</label>
                      <select value={step.templateId || ''} onChange={e => updateStep(idx, {
                        templateId: e.target.value || null,
                        mensagem: e.target.value ? (templates.find(t => t.id === e.target.value)?.corpo || step.mensagem) : step.mensagem
                      })}
                        className="w-full bg-neutral-900 border border-border rounded-lg px-2 py-1.5 text-xs text-foreground focus:border-primary outline-none">
                        <option value="">Mensagem personalizada</option>
                        {templates.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                      </select>
                    </div>
                    <div className="flex items-end">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <Toggle checked={step.pararAoResponder} onChange={v => updateStep(idx, { pararAoResponder: v })} />
                        <span className="text-[10px] text-muted-foreground">Parar ao responder</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-muted-foreground mb-1 block">Mensagem *</label>
                    <textarea value={step.mensagem} onChange={e => updateStep(idx, { mensagem: e.target.value })}
                      rows={3}
                      className="w-full bg-neutral-900 border border-border rounded-xl px-3 py-2 text-xs focus:border-primary outline-none font-mono resize-none"
                      placeholder="Olá {nome}, ainda posso ajudá-lo?" />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={() => { resetBuilder(); setView('list') }}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-neutral-800 transition-all">
              Cancelar
            </button>
            <button onClick={handleSave}
              className="flex-1 py-2.5 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all">
              {isEditing ? 'Salvar Alterações' : 'Criar Cadência'}
            </button>
          </div>
        </div>
      )}

      {view === 'monitor' && selectedCadence && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setView('list')} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h3 className="font-bold text-foreground">{selectedCadence.nome}</h3>
              <p className="text-xs text-muted-foreground">{selectedCadence.etapas.length} etapas • {selectedCadence.leads.length} leads</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Ativos', value: selectedCadence.leads.filter(l => l.status === 'ATIVO').length, color: 'text-emerald-400' },
              { label: 'Concluídos', value: selectedCadence.leads.filter(l => l.status === 'CONCLUIDA').length, color: 'text-primary' },
              { label: 'Parados', value: selectedCadence.leads.filter(l => l.status === 'RESPONDIDA').length, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="ocr-card p-4 rounded-xl text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground uppercase font-bold mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {selectedCadence.etapas.sort((a, b) => a.ordem - b.ordem).map(etapa => {
              const count = selectedCadence.leads.filter(l => l.status === 'ATIVO' && l.etapaAtual === etapa.ordem).length
              return (
                <div key={etapa.ordem} className="flex flex-col items-center gap-1 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary">
                    {etapa.ordem}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{count} leads</p>
                  {etapa.ordem < selectedCadence.etapas.length && (
                    <ArrowRight className="w-3 h-3 text-border absolute translate-x-8" />
                  )}
                </div>
              )
            })}
          </div>

          {selectedCadence.leads.length === 0 && (
            <div className="text-center py-10 border border-dashed border-border/40 rounded-2xl">
              <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="text-sm text-muted-foreground">Nenhum lead adicionado ainda.</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione leads pela Pipeline usando seleção em lote.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function CaixaRapidoPage() {
  const [activeTab, setActiveTab] = useState<TabType>('listas')
  const [listas, setListas] = useState<any[]>([])
  const [templates, setTemplates] = useState<any[]>([])
  const [historico, setHistorico] = useState<any[]>([])
  const [pipelines, setPipelines] = useState<any[]>([])
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [wizardError, setWizardError] = useState<string | null>(null)
  const [segmentos, setSegmentos] = useState<SegmentoItem[]>([])

  const [wizardStep, setWizardStep] = useState(1)
  const [novaLista, setNovaLista] = useState<any>({
    nomeLista: '',
    descricao: '',
    configEnvio: { horarioComercial: true, intervaloSegundos: 30, webhookMethod: 'POST' },
    segmentosAplicados: [],
    selectedCadenceId: null as string | null,
    selectedDealIds: [] as string[],
  })
  const [dealsPreview, setDealsPreview] = useState<DealPreview[]>([])
  const [loadingDeals, setLoadingDeals] = useState(false)
  const [cadences, setCadences] = useState<any[]>([])

  const [editingListTemplate, setEditingListTemplate] = useState<any | null>(null)
  const [tempTemplateText, setTempTemplateText] = useState('')

  async function loadData() {
    setLoading(true)
    try {
      const [allListas, allTemplates, allPipelines, allSegmentos, allCadences] = await Promise.all([
        crmActions.getListasDisparo(),
        crmActions.getTemplates(),
        crmActions.getPipelines(),
        crmActions.getSegmentos(),
        crmActions.getCadencias()
      ])
      setListas(allListas)
      setTemplates(allTemplates)
      setPipelines(allPipelines)
      setSegmentos(allSegmentos)
      setCadences(allCadences)
      setHistorico([])

      // Load stages for the first pipeline
      if (allPipelines.length > 0) {
        const stgs = await crmActions.getStages(allPipelines[0].id)
        setStages(stgs)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openEditTemplateModal = (lista: any) => {
    setEditingListTemplate(lista)
    setTempTemplateText(lista.mensagemTemplate)
  }

  const handleSaveTemplateText = async () => {
    if (!editingListTemplate) return
    try {
      await crmActions.updateListaDisparo(editingListTemplate.id, { mensagemTemplate: tempTemplateText })
      toast.success('Template da lista atualizado com sucesso!')
      setEditingListTemplate(null)
      loadData()
    } catch (e) { toast.error('Erro ao salvar template.') }
  }

  const getPreviewText = (text: string) =>
    text.replace(/{nome}/g, 'João Silva').replace(/{primeiro_nome}/g, 'João').replace(/{ramo}/g, 'Alimentos').replace(/{faturamento}/g, 'R$ 50.000,00')

  const handleWizardNext = async () => {
    setWizardError(null)
    // Step 1 → 2: validate segment and load deals preview
    if (wizardStep === 1) {
      if (!novaLista.nomeLista?.trim()) { setWizardError('Defina um nome para a ação.'); return }
      if (!novaLista.segmentosAplicados?.length) { setWizardError('Selecione ao menos um segmento.'); return }
      setLoadingDeals(true)
      try {
        const segId = novaLista.segmentosAplicados[0]
        const deals = await crmActions.getSegmentoDealsPreview(segId)
        setDealsPreview(deals)
        setNovaLista((prev: any) => ({ ...prev, selectedDealIds: deals.map(d => d.id) }))
      } catch (e) { console.warn('Deals preview failed', e) }
      finally { setLoadingDeals(false) }
    }
    setWizardStep(s => s + 1)
  }

  const handleWizardBack = () => {
    setWizardError(null)
    if (wizardStep > 1) setWizardStep(s => s - 1)
    else setActiveTab('listas')
  }

  const handleCreateList = async () => {
    if (!novaLista.nomeLista?.trim()) { setWizardError('Defina um nome para a ação.'); return }
    if (!novaLista.segmentosAplicados?.length) { setWizardError('Selecione ao menos um segmento.'); return }

    const dealIds: string[] = novaLista.selectedDealIds?.length
      ? novaLista.selectedDealIds
      : dealsPreview.map(d => d.id)

    setWizardError(null)
    try {
      let actionsDone = 0

      // Enroll in cadence if selected
      if (novaLista.selectedCadenceId && dealIds.length > 0) {
        const count = await crmActions.addLeadsToCadence(novaLista.selectedCadenceId, dealIds, 'deal')
        actionsDone += count
        toast.success(`${count} leads adicionados à cadência!`)
      }

      // Also create a ListaDisparo for single-shot webhook dispatch if template chosen
      if (novaLista.mensagemTemplateId || !novaLista.selectedCadenceId) {
        const selectedTpl = templates.find((t: any) => t.id === novaLista.mensagemTemplateId)
        const tplBody = selectedTpl ? selectedTpl.corpo : 'Olá {nome}!'
        const configObj = {
          horarioComercial: novaLista.configEnvio?.horarioComercial ?? true,
          intervaloSegundos: novaLista.configEnvio?.intervaloSegundos ?? 30,
          webhookUrl: novaLista.configEnvio?.webhookUrl ?? '',
          webhookMethod: novaLista.configEnvio?.webhookMethod ?? 'POST',
          agendamento: novaLista.agendamento ?? null
        }
        const created = await crmActions.createListaDisparo({
          nomeLista: novaLista.nomeLista.trim(),
          descricao: novaLista.descricao || '',
          mensagemTemplate: tplBody,
          configEnvio: JSON.stringify(configObj)
        })
        if (dealIds.length > 0) {
          await crmActions.addLeadsToListaDisparo(created.id, dealIds, 'deal')
        }
        actionsDone++
        if (!novaLista.selectedCadenceId) toast.success('Lista de disparo criada com sucesso!')
      }

      if (actionsDone === 0) {
        toast.info('Nenhum lead encontrado para este segmento.')
      }

      loadData()
      setNovaLista({
        nomeLista: '', descricao: '',
        configEnvio: { horarioComercial: true, intervaloSegundos: 30, webhookMethod: 'POST' },
        segmentosAplicados: [], selectedCadenceId: null, selectedDealIds: []
      })
      setDealsPreview([])
      setWizardStep(1)
      setActiveTab('listas')
    } catch (e: any) { setWizardError(e.message || 'Erro ao criar ação.') }
  }

  if (loading) return <LoadingSkeleton />

  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <div className="flex flex-col h-full bg-black text-foreground overflow-y-auto scrollbar-thin">
        <div className="p-6 md:p-8 space-y-6">

          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <p className="text-sm text-muted-foreground">Máquina de reativação de leads e outbound automático.</p>
            <button
              onClick={() => { setActiveTab('wizard'); setWizardStep(1); setWizardError(null) }}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nova Ação (Disparo)
            </button>
          </div>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Listas Ativas', value: listas.filter(l => l.status === 'ATIVA').length, icon: Play, color: 'text-primary', bg: 'bg-primary/10' },
              { label: 'Segmentos', value: segmentos.length, icon: Filter, color: 'text-blue-400', bg: 'bg-blue-500/10' },
              { label: 'Templates', value: templates.length, icon: FileText, color: 'text-amber-400', bg: 'bg-amber-500/10' },
              { label: 'Total Disparado', value: listas.reduce((a, l) => a + (l.enviados || 0), 0), icon: Zap, color: 'text-primary', bg: 'bg-primary/10' },
            ].map(stat => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="ocr-card p-4 rounded-2xl flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} border border-border/30 flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide truncate">{stat.label}</p>
                    <h3 className={`text-xl font-black ${stat.color}`} style={gradientText}>{stat.value}</h3>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Tabs */}
          <div
            className="flex gap-1.5 p-1.5 bg-neutral-900/50 rounded-2xl border border-border/30 overflow-x-auto"
            style={{ scrollbarWidth: 'none' } as React.CSSProperties}
          >
            {TABS.map(tab => {
              const Icon = tab.icon
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as TabType)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold whitespace-nowrap rounded-xl transition-all duration-200 ${
                    active ? 'bg-primary text-black shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-neutral-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              )
            })}
          </div>

          {/* Tab Content */}
          <div className="min-h-[400px]">

            {/* TAB: LISTAS */}
            {activeTab === 'listas' && (
              <div className="space-y-4 animate-fade-in">
                {listas.length === 0 ? (
                  <div className="text-center py-16 ocr-card rounded-2xl border border-dashed border-border/60">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                      <Zap className="w-7 h-7 text-primary opacity-60" />
                    </div>
                    <h3 className="text-lg font-bold text-foreground">Nenhuma Ação Ativa</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mx-auto mt-2">Crie sua primeira máquina de disparos para recuperar leads perdidos ou contatos da base.</p>
                    <button
                      onClick={() => { setActiveTab('wizard'); setWizardStep(1) }}
                      className="mt-6 px-5 py-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl font-bold text-sm hover:bg-primary hover:text-black transition-all"
                    >
                      Criar Primeira Ação
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {listas.map(lista => (
                      <div key={lista.id} className="ocr-card p-5 rounded-2xl flex flex-col justify-between group">
                        <div>
                          <div className="flex justify-between items-start mb-3">
                            <h3 className="font-bold text-foreground text-lg group-hover:text-primary transition-colors">{lista.nomeLista}</h3>
                            <span className={`px-2 py-1 text-[10px] font-bold uppercase rounded-md shrink-0 ml-2 ${
                              lista.status === 'EM_ANDAMENTO' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                              lista.status === 'CONCLUIDA' ? 'bg-primary/20 text-primary border border-primary/30' :
                              'bg-neutral-800 text-muted-foreground border border-border'
                            }`}>
                              {lista.status.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-4 line-clamp-2">{lista.descricao || 'Sem descrição'}</p>
                          <div className="grid grid-cols-3 gap-2 mb-4">
                            {[
                              { label: 'Alvos', value: lista.totalLeads, color: 'text-foreground' },
                              { label: 'Enviados', value: lista.enviados, color: 'text-primary' },
                              { label: 'Erros', value: lista.erros, color: 'text-destructive' },
                            ].map(stat => (
                              <div key={stat.label} className="bg-neutral-900/50 p-2 rounded-lg border border-border/50 text-center">
                                <p className="text-[10px] text-muted-foreground uppercase">{stat.label}</p>
                                <p className={`font-bold ${stat.color}`}>{stat.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 border-t border-border/50 pt-4 mt-auto">
                          {lista.status === 'ATIVA' && (
                            <button onClick={() => openEditTemplateModal(lista)}
                              className="flex-1 py-1.5 bg-primary text-black text-xs font-semibold rounded-lg hover:opacity-90 transition-colors">
                              Editar Template
                            </button>
                          )}
                          <button className="flex-1 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold rounded-lg transition-colors border border-border/50">
                            Pausar
                          </button>
                          <button className="flex-1 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 transition-colors">
                            Ver Relatório
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* TAB: WIZARD */}
            {activeTab === 'wizard' && (
              <div className="ocr-card p-6 rounded-2xl animate-fade-in" style={{ borderColor: 'hsl(var(--primary) / 0.2)' }}>
                {/* Stepper */}
                <div className="relative flex items-start justify-between mb-8">
                  <div className="absolute left-0 right-0 top-4 h-px bg-border/50" />
                  {[
                    {step:1,label:'Segmento'},
                    {step:2,label:'Leads'},
                    {step:3,label:'Cadência'},
                    {step:4,label:'Config'},
                    {step:5,label:'Revisão'}
                  ].map(s => (
                    <div key={s.step} className="relative flex flex-col items-center gap-2 z-10 bg-neutral-950 px-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                        wizardStep === s.step ? 'bg-primary text-black shadow-[0_0_16px_hsl(var(--primary)/0.5)]' :
                        wizardStep > s.step ? 'bg-primary/20 text-primary border border-primary/50' :
                        'bg-neutral-800 text-muted-foreground border border-border'
                      }`}>
                        {wizardStep > s.step ? <CheckCircle className="w-4 h-4" /> : s.step}
                      </div>
                      <span className={`text-[10px] font-bold uppercase ${wizardStep >= s.step ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</span>
                    </div>
                  ))}
                </div>

                {/* Step 1: Segmento */}
                {wizardStep === 1 && (
                  <div className="space-y-6">
                    <div className="space-y-4">
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Nome da Ação</label>
                        <input type="text" value={novaLista.nomeLista} onChange={e => setNovaLista({ ...novaLista, nomeLista: e.target.value })}
                          className="w-full bg-neutral-900 border border-border rounded-xl px-4 py-2.5 focus:border-primary outline-none text-sm"
                          placeholder="Ex: Recuperação Leads Frios — Maio" />
                      </div>
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1.5 block">Segmento de Público</label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[420px] overflow-y-auto pr-1">
                          {segmentos.map((seg: SegmentoItem) => {
                            const selected = novaLista.segmentosAplicados?.includes(seg.id)
                            return (
                              <div key={seg.id} onClick={() => {
                                setNovaLista({ ...novaLista, segmentosAplicados: [seg.id] })
                              }}
                                className={`p-4 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-primary/10 border-primary' : 'bg-neutral-900 border-border hover:border-primary/50'}`}>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                      <PriorityBadge prioridade={seg.prioridade} />
                                    </div>
                                    <span className={`font-bold text-sm leading-snug block ${selected ? 'text-primary' : 'text-foreground'}`}>{seg.nome}</span>
                                  </div>
                                  {selected && <CheckCircle className="w-4 h-4 text-primary shrink-0 mt-0.5" />}
                                </div>
                                {seg.descricao && <p className="text-[10px] text-muted-foreground line-clamp-2">{seg.descricao}</p>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 2: Leads Preview */}
                {wizardStep === 2 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Leads Encontrados</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Selecione os leads que receberão a ação</p>
                      </div>
                      {dealsPreview.length > 0 && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setNovaLista((p: any) => ({ ...p, selectedDealIds: dealsPreview.map(d => d.id) }))}
                            className="text-xs text-primary underline font-semibold"
                          >Todos</button>
                          <span className="text-muted-foreground">·</span>
                          <button
                            type="button"
                            onClick={() => setNovaLista((p: any) => ({ ...p, selectedDealIds: [] }))}
                            className="text-xs text-muted-foreground underline"
                          >Nenhum</button>
                        </div>
                      )}
                    </div>

                    {loadingDeals ? (
                      <div className="space-y-2">
                        {[1,2,3].map(i => <div key={i} className="h-14 bg-neutral-900/60 rounded-xl animate-pulse" />)}
                      </div>
                    ) : dealsPreview.length === 0 ? (
                      <div className="text-center py-12 border border-dashed border-border/50 rounded-2xl bg-neutral-950/30">
                        <Users className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                        <p className="text-sm font-semibold text-foreground">Nenhum lead encontrado</p>
                        <p className="text-xs text-muted-foreground mt-1">O segmento selecionado não retornou deals abertos no momento.</p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        <div className="flex items-center justify-between px-1 mb-1">
                          <span className="text-xs text-muted-foreground">
                            <span className="text-primary font-bold">{novaLista.selectedDealIds?.length || 0}</span> de {dealsPreview.length} selecionados
                          </span>
                        </div>
                        {dealsPreview.map(deal => {
                          const selected = novaLista.selectedDealIds?.includes(deal.id)
                          return (
                            <div
                              key={deal.id}
                              onClick={() => {
                                const curr: string[] = novaLista.selectedDealIds || []
                                setNovaLista((p: any) => ({
                                  ...p,
                                  selectedDealIds: selected
                                    ? curr.filter((id: string) => id !== deal.id)
                                    : [...curr, deal.id]
                                }))
                              }}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-primary/5 border-primary/40' : 'bg-neutral-900/50 border-border/40 hover:border-primary/30'}`}
                            >
                              <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${selected ? 'bg-primary border-primary' : 'border-neutral-600'}`}>
                                {selected && <Check className="w-3 h-3 text-black" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-foreground truncate">{deal.contato}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{deal.titulo} · {deal.stage}</p>
                              </div>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                {new Date(deal.updatedAt).toLocaleDateString('pt-BR')}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 3: Cadência */}
                {wizardStep === 3 && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-bold text-foreground">Escolha a Cadência</h4>
                        <p className="text-xs text-muted-foreground mt-0.5">Sequência de mensagens que será enviada para os leads</p>
                      </div>
                      <button
                        onClick={() => setActiveTab('cadencias')}
                        className="text-xs text-primary underline font-semibold"
                      >+ Nova cadência</button>
                    </div>

                    {cadences.length === 0 ? (
                      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-sm font-semibold text-amber-300">Nenhuma cadência criada</p>
                          <button onClick={() => setActiveTab('cadencias')} className="mt-1 text-xs text-primary underline font-semibold">Criar cadência →</button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                        {/* Option: skip cadence */}
                        <div
                          onClick={() => setNovaLista((p: any) => ({ ...p, selectedCadenceId: null }))}
                          className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${!novaLista.selectedCadenceId ? 'bg-primary/5 border-primary/40' : 'bg-neutral-900/50 border-border/40 hover:border-primary/30'}`}
                        >
                          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${!novaLista.selectedCadenceId ? 'border-primary' : 'border-neutral-600'}`}>
                            {!novaLista.selectedCadenceId && <div className="w-2 h-2 rounded-full bg-primary" />}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-foreground">Disparo único (sem cadência)</p>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Apenas cria a lista de disparo com o template</p>
                          </div>
                        </div>

                        {cadences.map((cad: any) => {
                          const selected = novaLista.selectedCadenceId === cad.id
                          return (
                            <div
                              key={cad.id}
                              onClick={() => setNovaLista((p: any) => ({ ...p, selectedCadenceId: cad.id }))}
                              className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${selected ? 'bg-primary/5 border-primary/40' : 'bg-neutral-900/50 border-border/40 hover:border-primary/30'}`}
                            >
                              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${selected ? 'border-primary' : 'border-neutral-600'}`}>
                                {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-0.5">
                                  <p className="text-sm font-semibold text-foreground">{cad.nome}</p>
                                  {cad.tipoOrigem === 'template' && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 bg-neutral-800 text-muted-foreground rounded border border-border/50 uppercase">Template</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {cad.etapas?.length || 0} etapas · {cad.tipo.replace(/_/g, ' ').toLowerCase()}
                                </p>
                                {cad.etapas?.[0] && (
                                  <p className="text-[10px] text-muted-foreground/60 mt-1 line-clamp-1 italic">
                                    "{cad.etapas[0].mensagem}"
                                  </p>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Template selector only if no cadence (single-shot) */}
                    {!novaLista.selectedCadenceId && templates.length > 0 && (
                      <div>
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 block">Template de Mensagem (opcional)</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto">
                          {templates.map((tpl: any) => {
                            const sel = novaLista.mensagemTemplateId === tpl.id
                            return (
                              <div key={tpl.id} onClick={() => setNovaLista((p: any) => ({ ...p, mensagemTemplateId: tpl.id }))}
                                className={`p-3 rounded-xl border cursor-pointer transition-all ${sel ? 'bg-primary/10 border-primary' : 'bg-neutral-900 border-border hover:border-primary/50'}`}>
                                <div className="flex items-center justify-between mb-1">
                                  <span className="font-bold text-xs text-primary">{tpl.nome}</span>
                                  {sel && <CheckCircle className="w-3.5 h-3.5 text-primary" />}
                                </div>
                                <p className="text-[10px] text-muted-foreground line-clamp-2">{tpl.corpo}</p>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Step 4: Config */}
                {wizardStep === 4 && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2"><Clock className="w-4 h-4" /> Momento do Disparo</h4>
                        {[
                          {label:'Iniciar Imediatamente', desc:'O disparo começa assim que a ação for criada.', value: false},
                          {label:'Agendar para Depois', desc:'Define data e hora exata para o início.', value: true}
                        ].map(opt => {
                          const active = !!novaLista.agendamento === opt.value
                          return (
                            <div key={opt.label} onClick={() => setNovaLista({ ...novaLista, agendamento: opt.value ? { dataHoraInicio: new Date().toISOString() } : undefined })}
                              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${active ? 'bg-primary/10 border-primary' : 'bg-neutral-900 border-border hover:border-primary/50'}`}>
                              <div className={`mt-0.5 w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${active ? 'border-primary' : 'border-neutral-600'}`}>
                                {active && <div className="w-2 h-2 rounded-full bg-primary" />}
                              </div>
                              <div>
                                <p className={`text-sm font-semibold ${active ? 'text-primary' : 'text-foreground'}`}>{opt.label}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{opt.desc}</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-sm font-bold text-primary flex items-center gap-2"><Settings className="w-4 h-4" /> Configurações</h4>
                        <div className="p-4 rounded-xl border border-border bg-neutral-900 space-y-4">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold">Apenas Horário Comercial</p>
                              <p className="text-[10px] text-muted-foreground mt-0.5">Seg–Sex, 08h–18h</p>
                            </div>
                            <Toggle checked={!!novaLista.configEnvio?.horarioComercial} onChange={v => setNovaLista({ ...novaLista, configEnvio: { ...novaLista.configEnvio, horarioComercial: v } })} />
                          </div>
                          <div className="border-t border-border/40 pt-3">
                            <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Webhook URL (opcional)</label>
                            <input type="url" value={novaLista.configEnvio?.webhookUrl || ''}
                              onChange={e => setNovaLista({ ...novaLista, configEnvio: { ...novaLista.configEnvio, webhookUrl: e.target.value } })}
                              className="w-full bg-black border border-border rounded-xl px-3 py-2 text-xs focus:border-primary outline-none font-mono text-primary"
                              placeholder="https://n8n.empresa.com/webhook/..." />
                          </div>
                          <div className="border-t border-border/40 pt-3">
                            <label className="text-xs font-bold uppercase text-muted-foreground mb-1.5 block">Intervalo entre mensagens (seg)</label>
                            <input type="number" min="5" value={novaLista.configEnvio?.intervaloSegundos}
                              onChange={e => setNovaLista({ ...novaLista, configEnvio: { ...novaLista.configEnvio, intervaloSegundos: Number(e.target.value) } })}
                              className="w-full bg-black border border-border rounded-xl px-3 py-2 text-sm focus:border-primary outline-none" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Step 5: Revisão */}
                {wizardStep === 5 && (() => {
                  const selectedSeg = segmentos.find((s: SegmentoItem) => s.id === novaLista.segmentosAplicados?.[0])
                  const selectedCad = cadences.find((c: any) => c.id === novaLista.selectedCadenceId)
                  const leadCount = novaLista.selectedDealIds?.length || dealsPreview.length
                  return (
                    <div className="space-y-5">
                      <div className="p-6 bg-neutral-900/50 rounded-xl border border-primary/30 relative overflow-hidden">
                        <div className="absolute top-0 right-0 w-32 h-32 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none" style={{ background: 'hsl(var(--primary) / 0.1)' }} />
                        <h3 className="text-lg font-bold mb-5 flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-primary" /> Confirmar e Disparar
                        </h3>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Ação</p><p className="font-semibold text-primary">{novaLista.nomeLista || '—'}</p></div>
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Leads</p><p className="font-semibold text-primary">{leadCount}</p></div>
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Segmento</p><p className="font-semibold">{selectedSeg?.nome || '—'}</p></div>
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Cadência</p><p className="font-semibold">{selectedCad?.nome || 'Disparo único'}</p></div>
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Timing</p><p className="font-semibold">{novaLista.agendamento ? 'Agendado' : 'Imediato'}</p></div>
                          <div><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Horário Comercial</p><p className="font-semibold">{novaLista.configEnvio?.horarioComercial ? 'Sim' : 'Não'}</p></div>
                          {novaLista.configEnvio?.webhookUrl && (
                            <div className="col-span-2"><p className="text-[10px] uppercase font-bold text-muted-foreground mb-1">Webhook</p><p className="font-mono text-xs text-muted-foreground truncate">{novaLista.configEnvio.webhookUrl}</p></div>
                          )}
                        </div>
                      </div>
                      {selectedCad && (
                        <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                          <p className="text-xs font-bold text-primary mb-1">Sequência da cadência "{selectedCad.nome}"</p>
                          <p className="text-[10px] text-muted-foreground">
                            {selectedCad.etapas?.length || 0} etapas · Primeiro disparo imediato · Último em {
                              selectedCad.etapas?.reduce((acc: number, e: any) => acc + (e.prazoUnidade === 'dias' ? e.prazoValor : e.prazoUnidade === 'horas' ? Math.ceil(e.prazoValor/24) : e.prazoValor * 7), 0)
                            } dias
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })()}

                {/* Wizard Actions */}
                <div className="flex flex-col gap-3 mt-8 pt-6 border-t border-border/50">
                  {wizardError && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
                      <AlertTriangle className="w-4 h-4 shrink-0" />{wizardError}
                    </div>
                  )}
                  <div className="flex justify-between items-center">
                    <button onClick={handleWizardBack} className="px-6 py-2 rounded-xl font-semibold text-sm border border-border text-muted-foreground hover:bg-neutral-800 hover:text-foreground transition-all">
                      {wizardStep === 1 ? 'Cancelar' : 'Voltar'}
                    </button>
                    {wizardStep < 5 ? (
                      <button onClick={handleWizardNext} disabled={loadingDeals} className="flex items-center gap-2 px-6 py-2 bg-primary text-black rounded-xl font-bold text-sm hover:shadow-lg transition-all disabled:opacity-60">
                        {loadingDeals ? <RefreshCw className="w-4 h-4 animate-spin" /> : <>Próximo <ChevronRight className="w-4 h-4" /></>}
                      </button>
                    ) : (
                      <button onClick={handleCreateList} className="flex items-center gap-2 px-8 py-2.5 bg-primary text-black rounded-xl font-bold text-sm active:scale-95 transition-all hover:shadow-lg hover:shadow-primary/30">
                        <Zap className="w-4 h-4" />
                        Confirmar e Disparar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB: SEGMENTOS */}
            {activeTab === 'segmentos' && <SegmentosTab pipelines={pipelines} stages={stages} />}

            {/* TAB: CADÊNCIAS */}
            {activeTab === 'cadencias' && <CadenciasTab />}

            {/* TAB: TEMPLATES */}
            {activeTab === 'templates' && <TemplatesTab />}

            {/* TAB: HISTORICO */}
            {activeTab === 'historico' && (
              <div className="animate-fade-in ocr-card rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-border text-xs uppercase text-muted-foreground font-bold bg-neutral-900/50 flex gap-4">
                  <span className="flex-1">Data/Hora</span>
                  <span>Lista</span>
                  <span>Status</span>
                </div>
                <div className="px-6 py-12 text-center text-muted-foreground text-sm">
                  Nenhum histórico registrado.
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Editing template modal */}
      {editingListTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-lg bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-extrabold">Editar Template da Ação</h3>
              <button onClick={() => setEditingListTemplate(null)} className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Variáveis</label>
                <div className="flex flex-wrap gap-2">
                  {['{nome}', '{primeiro_nome}', '{ramo}', '{faturamento}'].map(v => (
                    <button key={v} onClick={() => setTempTemplateText(p => p + v)}
                      className="px-2 py-1 rounded bg-neutral-900 border border-border/20 text-xs text-primary hover:bg-neutral-800 transition-colors">
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs font-bold uppercase text-muted-foreground mb-1 block">Corpo</label>
                <textarea value={tempTemplateText} onChange={e => setTempTemplateText(e.target.value)} rows={6}
                  className="w-full px-3 py-2 bg-neutral-900 border border-border/30 rounded-xl text-xs focus:outline-none font-mono" />
              </div>
              <div className="p-3.5 rounded-xl bg-neutral-900/50 border border-border/20">
                <p className="text-[10px] font-bold uppercase text-primary mb-1">Preview</p>
                <p className="text-xs whitespace-pre-wrap">{getPreviewText(tempTemplateText) || 'Escreva algo...'}</p>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setEditingListTemplate(null)} className="flex-1 py-2 rounded-xl border border-border text-xs font-semibold text-neutral-400 hover:bg-neutral-800">Cancelar</button>
              <button onClick={handleSaveTemplateText} className="flex-1 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:shadow-lg transition-all">Salvar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
