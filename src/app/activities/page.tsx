'use client'

import React, { useEffect, useState, useMemo, Suspense } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { toast, Toaster } from 'sonner'
import {
  Plus, X, Calendar, Clock, Check, Trash2, Edit3,
  ChevronLeft, ChevronRight, Filter, Phone, Mail,
  MessageSquare, Video, FileText, CheckCircle2, Sparkles
} from 'lucide-react'
import { crmService } from '@/lib/services'
import * as crmActions from '@/app/actions/crm'
import {
  useActivities,
  useCreateActivity,
  useUpdateActivity,
  useCompleteActivity,
  useDeleteActivity,
  EnrichedActivity
} from '@/hooks/useActivities'
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  startOfWeek,
  endOfWeek,
  isSameDay,
  isSameMonth,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  isBefore,
  startOfToday
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

type ActivityContact = { id: string; nome: string; sobrenome?: string; telefone: string }
type ActivityDeal = { id: string; titulo: string }
type ActivityFormValues = {
  titulo: string
  tipo: string
  dueAtDate: string
  dueAtTime: string
  descricao: string
  contactId: string
  dealId: string
}

const TIPO_CONFIG: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string; bg: string; border: string }> = {
  ligacao: { label: 'Ligação', icon: Phone, color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
  reuniao: { label: 'Reunião', icon: Video, color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
  tarefa: { label: 'Tarefa', icon: CheckCircle2, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
  nota: { label: 'Nota', icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', border: 'border-border' },
  whatsapp: { label: 'WhatsApp', icon: MessageSquare, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  email: { label: 'E-mail', icon: Mail, color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
}

function ActivitiesContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const { activities, loading, mutate } = useActivities()
  const { execute: createAct } = useCreateActivity()
  const { execute: updateAct } = useUpdateActivity()
  const { execute: completeAct } = useCompleteActivity()
  const { execute: deleteAct } = useDeleteActivity()

  const isMobile = useIsMobile()
  // State for view and filters
  const [view, setView] = useState<'lista' | 'calendario'>('lista')
  const effectiveView = isMobile ? 'lista' : view
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'done'>('open')
  const [typeFilter, setTypeFilter] = useState<string>('all')

  // Calendar state
  const [calendarDate, setCalendarDate] = useState<Date>(new Date())
  const [calendarMode, setCalendarMode] = useState<'mes' | 'semana'>('mes')

  // Form Dialog state
  const [showForm, setShowForm] = useState(false)
  const [editingActivity, setEditingActivity] = useState<EnrichedActivity | null>(null)

  // Contacts and Deals list for selectors
  const [contacts, setContacts] = useState<ActivityContact[]>([])
  const [deals, setDeals] = useState<ActivityDeal[]>([])

  // Load select options
  useEffect(() => {
    Promise.all([
      crmActions.getContacts(),
      crmActions.getAllDeals()
    ]).then(([cList, dList]) => {
      setContacts(cList as ActivityContact[])
      setDeals(dList as ActivityDeal[])
    }).catch((err: unknown) => {
      console.error('Erro ao buscar contatos/deals', err)
    })
  }, [])

  // React Hook Form
  const { register, handleSubmit, reset, setValue, control, formState: { errors } } = useForm({
    defaultValues: {
      titulo: '',
      tipo: 'tarefa',
      dueAtDate: '',
      dueAtTime: '09:00',
      descricao: '',
      contactId: '',
      dealId: ''
    }
  })

  // Popover date selector state for the form
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [formSelectedDate, setFormSelectedDate] = useState<Date | null>(null)
  const [formCalendarMonth, setFormCalendarMonth] = useState<Date>(new Date())

  // Process query params — defer setState calls out of the effect body
  useEffect(() => {
    const isNew = searchParams.get('new') === '1'
    const contactId = searchParams.get('contact_id')
    const dealId = searchParams.get('deal_id')

    if (!(isNew || contactId || dealId)) return

    Promise.resolve().then(() => {
      setEditingActivity(null)
      reset({
        titulo: '',
        tipo: 'tarefa',
        dueAtDate: format(new Date(), 'yyyy-MM-dd'),
        dueAtTime: format(new Date(), 'HH:mm'),
        descricao: '',
        contactId: contactId || '',
        dealId: dealId || ''
      })
      setFormSelectedDate(new Date())
      setShowForm(true)
      router.replace('/activities')
    })
  }, [searchParams, router, reset])

  // KPIs
  const kpis = useMemo(() => {
    const today = startOfToday()
    let atrasadas = 0
    let hoje = 0
    let pendentes = 0

    activities.forEach(a => {
      if (a.status === 'OPEN') {
        pendentes++
        if (a.dueAt) {
          const dt = new Date(a.dueAt)
          if (isBefore(dt, today)) {
            atrasadas++
          } else if (isSameDay(dt, new Date())) {
            hoje++
          }
        }
      }
    })

    return { atrasadas, hoje, pendentes }
  }, [activities])

  // Group and filter activities
  const groupedAndFilteredActivities = useMemo(() => {
    const today = startOfToday()
    const tomorrow = addDays(today, 1)

    // Filter
    const filtered = activities.filter(a => {
      const matchStatus = statusFilter === 'all' || 
                          (statusFilter === 'open' && a.status === 'OPEN') ||
                          (statusFilter === 'done' && a.status === 'DONE')
      const matchType = typeFilter === 'all' || a.tipo === typeFilter
      return matchStatus && matchType
    })

    if (effectiveView === 'calendario') {
      return filtered
    }

    // Grouping
    const groups: {
      atrasadas: EnrichedActivity[]
      hoje: EnrichedActivity[]
      amanha: EnrichedActivity[]
      proximas: EnrichedActivity[]
      semData: EnrichedActivity[]
      concluidas: EnrichedActivity[]
    } = {
      atrasadas: [],
      hoje: [],
      amanha: [],
      proximas: [],
      semData: [],
      concluidas: []
    }

    filtered.forEach(a => {
      if (a.status === 'DONE') {
        groups.concluidas.push(a)
      } else if (!a.dueAt) {
        groups.semData.push(a)
      } else {
        const dt = new Date(a.dueAt)
        if (isBefore(dt, today)) {
          groups.atrasadas.push(a)
        } else if (isSameDay(dt, today)) {
          groups.hoje.push(a)
        } else if (isSameDay(dt, tomorrow)) {
          groups.amanha.push(a)
        } else {
          groups.proximas.push(a)
        }
      }
    })

    // Sort concluidas by doneAt desc or dueAt desc
    groups.concluidas.sort((a, b) => {
      const dA = a.doneAt ? new Date(a.doneAt).getTime() : 0
      const dB = b.doneAt ? new Date(b.doneAt).getTime() : 0
      return dB - dA
    })

    return groups
  }, [activities, statusFilter, typeFilter, effectiveView])

  // Calendar day calculation helpers
  const calendarDays = useMemo(() => {
    if (calendarMode === 'mes') {
      const startMonth = startOfMonth(calendarDate)
      const endMonth = endOfMonth(calendarDate)
      const startCal = startOfWeek(startMonth, { weekStartsOn: 0 })
      const endCal = endOfWeek(endMonth, { weekStartsOn: 0 })
      return eachDayOfInterval({ start: startCal, end: endCal })
    } else {
      const startW = startOfWeek(calendarDate, { weekStartsOn: 0 })
      const endW = endOfWeek(calendarDate, { weekStartsOn: 0 })
      return eachDayOfInterval({ start: startW, end: endW })
    }
  }, [calendarDate, calendarMode])

  // Open Form for creating or editing
  const handleOpenForm = (act: EnrichedActivity | null = null, defaultDate: Date | null = null) => {
    if (act) {
      setEditingActivity(act)
      const datePart = act.dueAt ? format(new Date(act.dueAt), 'yyyy-MM-dd') : ''
      const timePart = act.dueAt ? format(new Date(act.dueAt), 'HH:mm') : '09:00'
      reset({
        titulo: act.titulo,
        tipo: act.tipo.toLowerCase(),
        dueAtDate: datePart,
        dueAtTime: timePart,
        descricao: act.descricao || '',
        contactId: act.contactId || '',
        dealId: act.dealId || ''
      })
      setFormSelectedDate(act.dueAt ? new Date(act.dueAt) : null)
    } else {
      setEditingActivity(null)
      const initialDate = defaultDate ? format(defaultDate, 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd')
      reset({
        titulo: '',
        tipo: 'tarefa',
        dueAtDate: initialDate,
        dueAtTime: '09:00',
        descricao: '',
        contactId: '',
        dealId: ''
      })
      setFormSelectedDate(defaultDate || new Date())
    }
    setShowForm(true)
  }

  // Handle Form submit
  const onSubmit = async (data: ActivityFormValues) => {
    try {
      let finalDueAt = ''
      if (data.dueAtDate) {
        const [year, month, day] = data.dueAtDate.split('-').map(Number)
        const [hour, minute] = (data.dueAtTime || '00:00').split(':').map(Number)
        finalDueAt = new Date(year, month - 1, day, hour, minute).toISOString()
      } else {
        toast.error('Data da atividade é obrigatória')
        return
      }

      const payload = {
        titulo: data.titulo,
        tipo: data.tipo,
        dueAt: finalDueAt,
        descricao: data.descricao || undefined,
        contactId: data.contactId || undefined,
        dealId: data.dealId || undefined
      }

      if (editingActivity) {
        await updateAct(editingActivity.id, payload)
        toast.success('Atividade atualizada com sucesso!')
      } else {
        await createAct(payload)
        toast.success('Atividade criada com sucesso!')
      }

      setShowForm(false)
      setEditingActivity(null)
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao salvar atividade: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleComplete = async (act: EnrichedActivity) => {
    if (act.status === 'DONE') return // Irreversible
    try {
      await completeAct(act.id)
      toast.success('Atividade marcada como concluída!')
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao concluir atividade: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir esta atividade?')) return
    try {
      await deleteAct(id)
      toast.success('Atividade excluída!')
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao excluir atividade: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Form popover calendar drawing helpers
  const popoverCalendarDays = useMemo(() => {
    const startM = startOfMonth(formCalendarMonth)
    const endM = endOfMonth(formCalendarMonth)
    const startCal = startOfWeek(startM, { weekStartsOn: 0 })
    const endCal = endOfWeek(endM, { weekStartsOn: 0 })
    return eachDayOfInterval({ start: startCal, end: endCal })
  }, [formCalendarMonth])

  return (
    <div className="flex flex-col h-full bg-card text-foreground select-none">
      
      {/* Topbar / KPIs */}
      <div className="px-4 sm:px-6 py-4 border-b border-border/30 bg-card backdrop-blur-xl shrink-0 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2 tracking-wide text-foreground">
              <Calendar className="w-5 h-5 text-primary" />
              Atividades
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">Gerenciamento e controle de compromissos operacionais</p>
          </div>

          <button
            onClick={() => handleOpenForm(null)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 shrink-0"
          >
            <Plus className="w-4 h-4" /> <span className="hidden xs:inline">Nova </span>Atividade
          </button>
        </div>

        {/* Counter cards + view switcher */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <div className="px-3 py-1.5 rounded-xl border border-rose-500/20 bg-rose-500/5 flex flex-col justify-center min-w-[62px]">
              <span className="text-[9px] uppercase font-bold text-rose-400">Atrasadas</span>
              <span className="text-sm font-bold text-rose-300">{kpis.atrasadas}</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 flex flex-col justify-center min-w-[62px]">
              <span className="text-[9px] uppercase font-bold text-amber-400">Hoje</span>
              <span className="text-sm font-bold text-amber-300">{kpis.hoje}</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 flex flex-col justify-center min-w-[62px]">
              <span className="text-[9px] uppercase font-bold text-primary">Pendentes</span>
              <span className="text-sm font-bold text-primary">{kpis.pendentes}</span>
            </div>
          </div>

          {/* View switcher — desktop only */}
          {!isMobile && (
            <div className="p-1 rounded-xl bg-secondary border border-border/40 flex items-center gap-1">
              <button
                onClick={() => setView('lista')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'lista' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Lista
              </button>
              <button
                onClick={() => setView('calendario')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${view === 'calendario' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Calendário
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Control bar (filters, date navigation for calendar) */}
      <div className="px-6 py-3 bg-card border-b border-border/20 flex flex-wrap items-center justify-between gap-4 shrink-0">
        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Filter className="w-3.5 h-3.5 text-muted-foreground mr-1.5" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'open' | 'done')}
              className="px-2.5 py-1.5 rounded-xl border border-border/40 bg-secondary text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="open">Abertas</option>
              <option value="done">Concluídas</option>
            </select>
          </div>

          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-border/40 bg-secondary text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 cursor-pointer"
          >
            <option value="all">Todos os Canais</option>
            {Object.entries(TIPO_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Date Navigation for Calendar */}
        {effectiveView === 'calendario' && (
          <div className="flex items-center gap-4 animate-fade-in">
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-secondary border border-border/40">
              <button
                onClick={() => setCalendarMode('mes')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${calendarMode === 'mes' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
              >
                Mês
              </button>
              <button
                onClick={() => setCalendarMode('semana')}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-all ${calendarMode === 'semana' ? 'bg-muted text-foreground' : 'text-muted-foreground'}`}
              >
                Semana
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCalendarDate(prev => calendarMode === 'mes' ? subMonths(prev, 1) : subWeeks(prev, 1))}
                className="p-1.5 rounded-lg border border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-bold min-w-[130px] text-center capitalize text-foreground">
                {calendarMode === 'mes'
                  ? format(calendarDate, 'MMMM yyyy', { locale: ptBR })
                  : `Semana de ${format(startOfWeek(calendarDate, { weekStartsOn: 0 }), 'dd/MM')} a ${format(endOfWeek(calendarDate, { weekStartsOn: 0 }), 'dd/MM')}`
                }
              </span>
              <button
                onClick={() => setCalendarDate(prev => calendarMode === 'mes' ? addMonths(prev, 1) : addWeeks(prev, 1))}
                className="p-1.5 rounded-lg border border-border/40 hover:bg-muted text-muted-foreground hover:text-foreground"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              onClick={() => setCalendarDate(new Date())}
              className="px-2.5 py-1.5 rounded-lg border border-border/40 text-[10px] font-bold text-primary hover:bg-primary/5 transition-all"
            >
              Hoje
            </button>
          </div>
        )}
      </div>

      {/* Main Workspace Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Carregando atividades...</p>
          </div>
        ) : (
          <>
            {/* VIEW: LIST */}
            {effectiveView === 'lista' && (
              <div className="space-y-8 max-w-3xl mx-auto">
                {/* Empty State check */}
                {Object.values(groupedAndFilteredActivities as Record<string, EnrichedActivity[]>).every(arr => arr.length === 0) ? (
                  <div className="text-center py-20 text-muted-foreground bg-secondary rounded-2xl border border-border/10">
                    <Calendar className="w-12 h-12 mx-auto mb-3 opacity-10" />
                    <p className="text-sm font-semibold">Nenhuma atividade encontrada</p>
                    <p className="text-xs text-muted-foreground mt-1">Experimente alterar os filtros ou crie uma nova atividade.</p>
                  </div>
                ) : (
                  <>
                    {/* Render Group Sections */}
                    {[
                      { key: 'atrasadas', label: 'Atrasadas', color: 'text-rose-400', border: 'border-rose-500/20' },
                      { key: 'hoje', label: 'Hoje', color: 'text-amber-400', border: 'border-amber-500/20' },
                      { key: 'amanha', label: 'Amanhã', color: 'text-blue-400', border: 'border-blue-500/20' },
                      { key: 'proximas', label: 'Próximas', color: 'text-primary', border: 'border-primary/20' },
                      { key: 'semData', label: 'Sem data', color: 'text-muted-foreground', border: 'border-border' },
                      { key: 'concluidas', label: 'Concluídas', color: 'text-muted-foreground', border: 'border-border' }
                    ].map(grp => {
                      const list = (groupedAndFilteredActivities as Record<string, EnrichedActivity[]>)[grp.key]
                      if (!list || list.length === 0) return null

                      return (
                        <div key={grp.key} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <span className={`text-[10px] font-extrabold uppercase tracking-widest ${grp.color}`}>
                              {grp.label}
                            </span>
                            <div className="flex-1 h-px bg-border/20" />
                            <span className="text-[10px] text-muted-foreground">{list.length}</span>
                          </div>

                          <div className="space-y-2">
                            {list.map(act => {
                              const config = TIPO_CONFIG[act.tipo.toLowerCase()] || TIPO_CONFIG.tarefa
                              const Icon = config.icon
                              const isPast = act.status === 'OPEN' && act.dueAt && isBefore(new Date(act.dueAt), startOfToday())
                              const isDone = act.status === 'DONE'

                              return (
                                <div
                                  key={act.id}
                                  className={`flex items-start gap-4 p-4 rounded-2xl border transition-all ${
                                    isDone
                                      ? 'opacity-40 border-border/10 bg-card'
                                      : isPast
                                      ? 'border-rose-500/30 bg-rose-500/5 hover:border-rose-500/40'
                                      : 'border-border/40 bg-secondary hover:border-primary/30 hover:bg-secondary'
                                  }`}
                                >
                                  {/* Checkbox: disabled if already completed */}
                                  <button
                                    onClick={() => handleToggleComplete(act)}
                                    disabled={isDone}
                                    className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                                      isDone
                                        ? 'border-emerald-500/80 bg-emerald-500/30 cursor-not-allowed'
                                        : 'border-border hover:border-primary cursor-pointer'
                                    }`}
                                  >
                                    {isDone && <Check className="w-3.5 h-3.5 text-emerald-300" />}
                                  </button>

                                  {/* Content */}
                                  <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${config.color} ${config.bg} border ${config.border}`}>
                                        <Icon className="w-2.5 h-2.5" />
                                        {config.label}
                                      </span>

                                      {/* Links */}
                                      {act.contact && (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border/20">
                                          Contato: <strong className="text-muted-foreground">{act.contact.nome} {act.contact.sobrenome || ''}</strong>
                                        </span>
                                      )}
                                      {act.deal && (
                                        <span className="text-[10px] text-muted-foreground bg-muted px-2 py-0.5 rounded-md border border-border/20">
                                          Negócio: <strong className="text-muted-foreground">{act.deal.titulo}</strong>
                                        </span>
                                      )}

                                      {isPast && (
                                        <span className="text-[9px] font-extrabold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded">
                                          Atrasada
                                        </span>
                                      )}
                                    </div>

                                    <h4 className={`text-sm font-semibold text-foreground ${isDone ? 'line-through text-muted-foreground' : ''}`}>
                                      {act.titulo}
                                    </h4>

                                    {act.descricao && (
                                      <p className={`text-xs text-muted-foreground mt-1 line-clamp-3 ${isDone ? 'text-muted-foreground' : ''}`}>
                                        {act.descricao}
                                      </p>
                                    )}

                                    <div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground">
                                      <Clock className="w-3 h-3" />
                                      <span>
                                        {act.dueAt ? format(new Date(act.dueAt), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR }) : 'Sem data'}
                                      </span>
                                      {act.doneAt && (
                                        <>
                                          <span className="mx-1">•</span>
                                          <span className="text-emerald-500">Concluída em {format(new Date(act.doneAt), 'dd/MM/yyyy')}</span>
                                        </>
                                      )}
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex items-center gap-1.5 shrink-0 self-center">
                                    {!isDone && (
                                      <button
                                        onClick={() => handleOpenForm(act)}
                                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                                        title="Editar"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDelete(act.id)}
                                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-colors"
                                      title="Excluir"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </>
                )}
              </div>
            )}

            {/* VIEW: CALENDAR */}
            {effectiveView === 'calendario' && (
              <div className="h-full flex flex-col gap-4 animate-fade-in">
                {calendarMode === 'mes' ? (
                  // Month View Grid
                  <div className="flex-1 min-h-[500px] border border-border/20 rounded-2xl overflow-hidden bg-card flex flex-col">
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 border-b border-border/20 bg-card py-2.5 text-center">
                      {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                        <span key={day} className="text-[10px] uppercase font-bold text-muted-foreground">
                          {day}
                        </span>
                      ))}
                    </div>

                    {/* Day grid */}
                    <div className="flex-1 grid grid-cols-7 grid-rows-6">
                      {calendarDays.map((day, idx) => {
                        const isCurrentMonth = isSameMonth(day, calendarDate)
                        const isTodayDay = isToday(day)
                        
                        // Filter events for this day
                        const dayEvents = (groupedAndFilteredActivities as EnrichedActivity[]).filter(a =>
                          a.dueAt && isSameDay(new Date(a.dueAt), day)
                        )

                        const displayedEvents = dayEvents.slice(0, 3)
                        const moreCount = dayEvents.length - 3

                        return (
                          <div
                            key={idx}
                            onClick={() => handleOpenForm(null, day)}
                            className={`border-r border-b border-border/10 p-2 flex flex-col min-h-[80px] transition-colors cursor-pointer group ${
                              isCurrentMonth ? 'bg-secondary' : 'bg-card text-muted-foreground/30'
                            } ${isTodayDay ? 'ring-1 ring-primary ring-inset bg-primary/[0.02]' : 'hover:bg-secondary'}`}
                          >
                            <span className={`text-xs font-bold self-start w-5 h-5 rounded-full flex items-center justify-center ${
                              isTodayDay ? 'bg-primary text-primary-foreground font-extrabold' : isCurrentMonth ? 'text-muted-foreground' : 'text-muted-foreground'
                            }`}>
                              {format(day, 'd')}
                            </span>

                            {/* Events list */}
                            <div className="flex-1 flex flex-col gap-1 mt-2 overflow-hidden" onClick={e => e.stopPropagation()}>
                              {displayedEvents.map(evt => {
                                const config = TIPO_CONFIG[evt.tipo.toLowerCase()] || TIPO_CONFIG.tarefa
                                const isDone = evt.status === 'DONE'
                                return (
                                  <div
                                    key={evt.id}
                                    onClick={() => handleOpenForm(evt)}
                                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold truncate border flex items-center gap-1 transition-all ${
                                      isDone
                                        ? 'bg-secondary text-muted-foreground/50 border-border line-through'
                                        : `${config.bg} ${config.color} ${config.border} hover:brightness-110`
                                    }`}
                                    title={`${evt.titulo} (${format(new Date(evt.dueAt), 'HH:mm')})`}
                                  >
                                    <span className="text-[9px] opacity-80">{format(new Date(evt.dueAt), 'HH:mm')}</span>
                                    <span className="truncate">{evt.titulo}</span>
                                  </div>
                                )
                              })}
                              {moreCount > 0 && (
                                <span className="text-[9px] text-primary font-bold pl-1.5 mt-0.5">
                                  + {moreCount} mais
                                </span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ) : (
                  // Week View Grid
                  <div className="flex-1 min-h-[400px] grid grid-cols-7 gap-4">
                    {calendarDays.map((day, idx) => {
                      const isTodayDay = isToday(day)
                      
                      // Filter events for this day
                      const dayEvents = (groupedAndFilteredActivities as EnrichedActivity[]).filter(a =>
                        a.dueAt && isSameDay(new Date(a.dueAt), day)
                      )

                      const displayedEvents = dayEvents.slice(0, 5)
                      const moreCount = dayEvents.length - 5

                      return (
                        <div
                          key={idx}
                          onClick={() => handleOpenForm(null, day)}
                          className={`flex-1 flex flex-col rounded-2xl border bg-card p-3 cursor-pointer transition-all ${
                            isTodayDay ? 'border-primary shadow-lg shadow-primary/5 bg-primary/[0.01]' : 'border-border/20 hover:border-border/40'
                          }`}
                        >
                          <div className="border-b border-border/20 pb-2 mb-3 flex items-center justify-between">
                            <span className="text-[10px] uppercase font-extrabold text-muted-foreground">
                              {format(day, 'eeeeee', { locale: ptBR })}
                            </span>
                            <span className={`text-sm font-extrabold w-6 h-6 rounded-full flex items-center justify-center ${
                              isTodayDay ? 'bg-primary text-primary-foreground' : 'text-foreground'
                            }`}>
                              {format(day, 'd')}
                            </span>
                          </div>

                          {/* Events */}
                          <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-1" onClick={e => e.stopPropagation()}>
                            {dayEvents.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground/30 italic text-center py-6">Vazio</span>
                            ) : (
                              <>
                                {displayedEvents.map(evt => {
                                  const config = TIPO_CONFIG[evt.tipo.toLowerCase()] || TIPO_CONFIG.tarefa
                                  const isDone = evt.status === 'DONE'
                                  return (
                                    <div
                                      key={evt.id}
                                      onClick={() => handleOpenForm(evt)}
                                      className={`p-2 rounded-xl border flex flex-col gap-1 transition-all ${
                                        isDone
                                          ? 'bg-secondary text-muted-foreground/45 border-border line-through opacity-60'
                                          : `${config.bg} ${config.color} ${config.border} hover:scale-[1.02]`
                                      }`}
                                    >
                                      <div className="flex items-center justify-between text-[8px] font-bold opacity-80">
                                        <span className="uppercase">{config.label}</span>
                                        <span>{format(new Date(evt.dueAt), 'HH:mm')}</span>
                                      </div>
                                      <span className="text-[11px] font-bold leading-tight truncate">{evt.titulo}</span>
                                      {evt.contact && (
                                        <span className="text-[9px] opacity-70 truncate">👤 {evt.contact.nome}</span>
                                      )}
                                    </div>
                                  )
                                })}
                                {moreCount > 0 && (
                                  <span className="text-[10px] text-primary font-extrabold text-center mt-1">
                                    + {moreCount} atividades
                                  </span>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* CREATE/EDIT MODAL */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-card backdrop-blur-md animate-fade-in max-md:items-end max-md:p-0">
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-lg rounded-3xl border border-border/60 bg-card shadow-2xl p-6 relative flex flex-col max-h-[90vh] overflow-y-auto scrollbar-thin max-md:max-h-[85vh] max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:border-l-0 max-md:border-r-0 max-md:pb-10 mobile-bottom-sheet"
          >
            {/* Sheet Handle */}
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/20 pb-4 mb-4">
              <div>
                <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  {editingActivity ? 'Editar Atividade' : 'Nova Atividade'}
                </h3>
                <p className="text-[11px] text-muted-foreground mt-0.5">Defina os parâmetros operacionais da atividade</p>
              </div>
              <button
                onClick={() => {
                  setShowForm(false)
                  setEditingActivity(null)
                }}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form body */}
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Title */}
              <div>
                <label className="ocr-label mb-1.5 block">Título da Atividade *</label>
                <input
                  type="text"
                  placeholder="Ex: Ligação de acompanhamento da proposta"
                  {...register('titulo', { required: 'O título é obrigatório' })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                />
                {errors.titulo && (
                  <span className="text-[10px] text-rose-400 mt-1 block">{errors.titulo.message}</span>
                )}
              </div>

              {/* Type Select buttons */}
              <div>
                <label className="ocr-label mb-1.5 block">Canal / Tipo</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => {
                    const TypeIcon = v.icon
                    return (
                      <label
                        key={k}
                        className="cursor-pointer"
                      >
                        <Controller
                          name="tipo"
                          control={control}
                          render={({ field }) => {
                            const isSelected = field.value === k
                            return (
                              <div
                                onClick={() => field.onChange(k)}
                                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                                  isSelected
                                    ? 'bg-muted border-primary text-primary shadow-inner shadow-black/20'
                                    : 'border-border/30 bg-secondary text-muted-foreground hover:text-foreground hover:border-border'
                                }`}
                              >
                                <TypeIcon className="w-3.5 h-3.5 shrink-0" />
                                <span>{v.label}</span>
                              </div>
                            )
                          }}
                        />
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Combined Date & Time Selector */}
              <div className="grid grid-cols-2 gap-3 relative">
                <div>
                  <label className="ocr-label mb-1.5 block">Data Agendada *</label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-secondary text-sm focus:outline-none text-left text-foreground flex items-center justify-between"
                    >
                      <span>
                        {formSelectedDate ? format(formSelectedDate, 'dd/MM/yyyy') : 'Selecione...'}
                      </span>
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                    </button>

                    {/* Hidden date-part input for react-hook-form value */}
                    <input
                      type="hidden"
                      {...register('dueAtDate', { required: 'A data é obrigatória' })}
                    />

                    {/* Popover Custom Calendar */}
                    {showDatePicker && (
                      <div className="absolute top-full left-0 z-50 mt-1 p-3 rounded-2xl border border-border/80 bg-card shadow-2xl w-[260px] animate-scale-in">
                        {/* Popover Calendar Header */}
                        <div className="flex items-center justify-between mb-2">
                          <button
                            type="button"
                            onClick={() => setFormCalendarMonth(prev => subMonths(prev, 1))}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <span className="text-[11px] font-bold capitalize text-muted-foreground">
                            {format(formCalendarMonth, 'MMMM yyyy', { locale: ptBR })}
                          </span>
                          <button
                            type="button"
                            onClick={() => setFormCalendarMonth(prev => addMonths(prev, 1))}
                            className="p-1 rounded hover:bg-muted text-muted-foreground"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1 text-center mb-1">
                          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((wDay, wIdx) => (
                            <span key={wIdx} className="text-[9px] font-bold text-muted-foreground">{wDay}</span>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {popoverCalendarDays.map((day, dIdx) => {
                            const isCurrentM = isSameMonth(day, formCalendarMonth)
                            const isSel = formSelectedDate && isSameDay(day, formSelectedDate)
                            return (
                              <button
                                key={dIdx}
                                type="button"
                                onClick={() => {
                                  setFormSelectedDate(day)
                                  setValue('dueAtDate', format(day, 'yyyy-MM-dd'))
                                  setShowDatePicker(false)
                                }}
                                className={`w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${
                                  isSel
                                    ? 'bg-primary text-primary-foreground'
                                    : isCurrentM
                                    ? 'text-foreground hover:bg-muted'
                                    : 'text-muted-foreground hover:bg-secondary'
                                }`}
                              >
                                {format(day, 'd')}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {errors.dueAtDate && (
                    <span className="text-[10px] text-rose-400 mt-1 block">{errors.dueAtDate.message}</span>
                  )}
                </div>

                <div>
                  <label className="ocr-label mb-1.5 block">Horário Previsto *</label>
                  <div className="relative">
                    <input
                      type="time"
                      {...register('dueAtTime', { required: 'O horário é obrigatório' })}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                    />
                    <Clock className="w-4 h-4 text-muted-foreground absolute right-3.5 top-3.5 pointer-events-none" />
                  </div>
                  {errors.dueAtTime && (
                    <span className="text-[10px] text-rose-400 mt-1 block">{errors.dueAtTime.message}</span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="ocr-label mb-1.5 block">Descrição / Detalhes</label>
                <textarea
                  placeholder="Detalhamento operacional da atividade..."
                  rows={2}
                  {...register('descricao')}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-secondary text-sm focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground resize-none"
                />
              </div>

              {/* Links Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ocr-label mb-1.5 block">Contato Vinculado</label>
                  <select
                    {...register('contactId')}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground cursor-pointer"
                  >
                    <option value="">-- Nenhum --</option>
                    {contacts.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.nome} {c.sobrenome || ''} ({c.telefone})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="ocr-label mb-1.5 block">Negócio (Deal)</label>
                  <select
                    {...register('dealId')}
                    className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground cursor-pointer"
                  >
                    <option value="">-- Nenhum --</option>
                    {deals.map(d => (
                      <option key={d.id} value={d.id}>
                        {d.titulo}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-3 border-t border-border/20 mt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false)
                    setEditingActivity(null)
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-primary text-primary-foreground font-extrabold text-xs hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                >
                  {editingActivity ? 'Salvar Alterações' : 'Criar Atividade'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ActivitiesFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-muted-foreground">Carregando atividades...</p>
      </div>
    </div>
  )
}

export default function ActivitiesPage() {
  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <Suspense fallback={<ActivitiesFallback />}>
        <ActivitiesContent />
      </Suspense>
    </AppLayout>
  )
}
