'use client'

import React, { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import {
  Search, Play, CheckSquare, Square,
  Building, MapPin, MoreVertical, Database,
  Archive, Trash2, ArrowRightCircle, Plus, ExternalLink, UserPlus
} from 'lucide-react'
import { toast } from 'sonner'
import * as actions from '@/app/actions/googleLeads'
import * as crmActions from '@/app/actions/crm'
import { MockPipeline } from '@/lib/mockData' // Replace with actual types if needed

// Tipos
type LeadStatus = 'NOVO' | 'IMPORTADO' | 'DESCARTADO'

export default function BuscarLeadsTab() {
  const queryClient = useQueryClient()
  const router = useRouter()

  // Form states
  const [selectedNiche, setSelectedNiche] = useState('')
  const [selectedUf, setSelectedUf] = useState('')
  const [selectedCity, setSelectedCity] = useState('')
  const [cityName, setCityName] = useState('')
  
  // Table filters
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [timeFilter, setTimeFilter] = useState('todos')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  
  // Selection
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set())
  const [isTriggering, setIsTriggering] = useState(false)
  const [triggerSuccess, setTriggerSuccess] = useState(false)
  const [refreshCountdown, setRefreshCountdown] = useState<number | null>(null)

  // Create List States inside Bulk Action Modal
  const [listaMode, setListaMode] = useState<'existente' | 'nova'>('existente')
  const [novaListaNome, setNovaListaNome] = useState('')
  const [novaListaMsg, setNovaListaMsg] = useState('')
  const [novaListaDesc, setNovaListaDesc] = useState('')

  // Data fetching - Niches
  const { data: niches = [], isLoading: loadingNiches } = useQuery({
    queryKey: ['niches'],
    queryFn: () => fetch('/api/admin/niches').then(r => r.json())
  })

  const activeNiches = Array.isArray(niches) ? niches.filter((n: any) => n.status === 'ativo') : []

  const ESTADOS = [
    { sigla: 'AC', nome: 'Acre' }, { sigla: 'AL', nome: 'Alagoas' }, { sigla: 'AP', nome: 'Amapá' },
    { sigla: 'AM', nome: 'Amazonas' }, { sigla: 'BA', nome: 'Bahia' }, { sigla: 'CE', nome: 'Ceará' },
    { sigla: 'DF', nome: 'Distrito Federal' }, { sigla: 'ES', nome: 'Espírito Santo' }, { sigla: 'GO', nome: 'Goiás' },
    { sigla: 'MA', nome: 'Maranhão' }, { sigla: 'MT', nome: 'Mato Grosso' }, { sigla: 'MS', nome: 'Mato Grosso do Sul' },
    { sigla: 'MG', nome: 'Minas Gerais' }, { sigla: 'PA', nome: 'Pará' }, { sigla: 'PB', nome: 'Paraíba' },
    { sigla: 'PR', nome: 'Paraná' }, { sigla: 'PE', nome: 'Pernambuco' }, { sigla: 'PI', nome: 'Piauí' },
    { sigla: 'RJ', nome: 'Rio de Janeiro' }, { sigla: 'RN', nome: 'Rio Grande do Norte' }, { sigla: 'RS', nome: 'Rio Grande do Sul' },
    { sigla: 'RO', nome: 'Rondônia' }, { sigla: 'RR', nome: 'Roraima' }, { sigla: 'SC', nome: 'Santa Catarina' },
    { sigla: 'SP', nome: 'São Paulo' }, { sigla: 'SE', nome: 'Sergipe' }, { sigla: 'TO', nome: 'Tocantins' }
  ];
  const ufs = ESTADOS;

  // Reset city when UF changes
  const [cities, setCities] = useState<any[]>([])
  const [loadingCities, setLoadingCities] = useState(false)

  React.useEffect(() => {
    setSelectedCity('')
    setCityName('')
    
    if (!selectedUf) {
      setCities([])
      return
    }
    
    setLoadingCities(true)
    actions.getIbgeCities(selectedUf)
      .then(data => {
        setCities(data || [])
      })
      .catch(err => {
        console.error(err)
        toast.error('Erro ao carregar cidades')
        setCities([])
      })
      .finally(() => {
        setLoadingCities(false)
      })
  }, [selectedUf])

  // Data fetching - Leads
  const { data: leadsData, isLoading: loadingLeads, refetch: refetchLeads } = useQuery({
    queryKey: ['googleLeads', statusFilter, timeFilter, page, searchQuery],
    queryFn: () => actions.getGoogleLeads({
      status: statusFilter,
      timeRange: timeFilter,
      page,
      pageSize: 10,
      search: searchQuery
    }),
    refetchInterval: 10000 // Refetch a cada 10s para pegar novos leads do N8N
  })

  React.useEffect(() => {
    if (refreshCountdown === null) return
    if (refreshCountdown === 0) {
      setRefreshCountdown(null)
      refetchLeads()
      toast.info('Lista de leads atualizada com novos resultados!')
      return
    }
    const timer = setTimeout(() => {
      setRefreshCountdown(prev => (prev !== null ? prev - 1 : null))
    }, 1000)
    return () => clearTimeout(timer)
  }, [refreshCountdown, refetchLeads])

  // Data fetching - Pipelines for Create Deals
  const { data: pipelines = [] } = useQuery({
    queryKey: ['pipelines'],
    queryFn: () => crmActions.getPipelines()
  })

  // Data fetching - Listas for Add to List
  const { data: listas = [] } = useQuery({
    queryKey: ['listas-disparo'],
    queryFn: () => crmActions.getListasDisparo()
  })

  const handleDispararBusca = async () => {
    if (!selectedNiche || !selectedUf || (!selectedCity && !cityName)) {
      toast.error('Preencha Nicho, UF e Cidade')
      return
    }

    const targetCity = (selectedCity && selectedCity !== 'manual') ? selectedCity : cityName

    setIsTriggering(true)
    setTriggerSuccess(false)

    try {
      const res = await fetch('/api/leads/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nicho: selectedNiche,
          estado: selectedUf,
          cidade: targetCity
        })
      })

      if (!res.ok) throw new Error('Falha ao iniciar busca')
      
      setTriggerSuccess(true)
      toast.success('Busca iniciada. Você pode continuar utilizando o sistema enquanto os resultados são processados.')
      setRefreshCountdown(60) // Start the 1-minute countdown
      
      // Reset success state after 3 seconds
      setTimeout(() => {
        setTriggerSuccess(false)
      }, 3000)
    } catch (err) {
      toast.error('Erro ao disparar automação')
    } finally {
      setIsTriggering(false)
    }
  }

  // Bulk Actions
  const handleSelectAll = (checked: boolean) => {
    if (checked && leadsData?.leads) {
      setSelectedLeads(new Set(leadsData.leads.map((l: any) => l.id)))
    } else {
      setSelectedLeads(new Set())
    }
  }

  const handleToggleSelect = (id: string) => {
    const newSet = new Set(selectedLeads)
    if (newSet.has(id)) newSet.delete(id)
    else newSet.add(id)
    setSelectedLeads(newSet)
  }

  const [showBulkModal, setShowBulkModal] = useState<'lista' | 'deals' | null>(null)
  
  // Modal states
  const [targetLista, setTargetLista] = useState('')
  const [targetPipeline, setTargetPipeline] = useState('')
  const [targetStage, setTargetStage] = useState('')
  const [pipelineStages, setPipelineStages] = useState<any[]>([])

  useEffect(() => {
    if (targetPipeline) {
      crmActions.getStages(targetPipeline).then(setPipelineStages)
    } else {
      setPipelineStages([])
    }
  }, [targetPipeline])

  const handleCriarAcaoCaixaRapido = () => {
    const ids = Array.from(selectedLeads)
    if (ids.length === 0) return
    // Collect lead info for pre-loading in Caixa Rápido
    const selectedLeadData = (leadsData?.leads || []).filter((l: any) => ids.includes(l.id)).map((l: any) => ({
      id: l.id,
      nome: l.empresa || l.nome || 'Lead Google',
      telefone: l.telefone || '',
      empresa: l.empresa || '',
      nicho: l.nicho || '',
    }))
    sessionStorage.setItem('google_leads_for_action', JSON.stringify({
      ids,
      leads: selectedLeadData,
      count: ids.length,
      timestamp: Date.now()
    }))
    router.push('/caixa-rapido?step=3&source=google')
  }

  const executeBulkAction = async (action: string) => {
    const ids = Array.from(selectedLeads)
    if (ids.length === 0) return

    try {
      if (action === 'descartar') {
        await actions.bulkDiscardLeads(ids)
        toast.success(`${ids.length} leads descartados`)
      } else if (action === 'importar') {
        const res = await actions.importToCrm(ids)
        toast.success(`${res.importedCount} leads importados para o CRM`)
      } else if (action === 'lista') {
        if (!targetLista) {
          toast.error('Selecione uma lista existente')
          return
        }
        const res = await actions.addGoogleLeadsToList(ids, targetLista)
        toast.success(`${res.addedCount} leads adicionados à lista`)
        setShowBulkModal(null)
      } else if (action === 'deals') {
        if (!targetPipeline || !targetStage) { toast.error('Selecione funil e etapa'); return }
        const res = await actions.createDealsFromGoogleLeads(ids, targetPipeline, targetStage)
        toast.success(`${res.createdCount} negócios criados`)
        setShowBulkModal(null)
      } else if (action === 'delete') {
        if (!window.confirm('Excluir definitivamente estes leads?')) return
        await actions.bulkDeleteLeads(ids)
        toast.success(`Leads excluídos definitivamente`)
      }
      
      setSelectedLeads(new Set())
      queryClient.invalidateQueries({ queryKey: ['googleLeads'] })
    } catch (err) {
      toast.error('Erro ao executar ação')
    }
  }

  // Modals for bulk actions
  const renderBulkModals = () => {
    if (!showBulkModal) return null

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-card backdrop-blur-sm px-4">
        <div className="w-full max-w-md bg-popover rounded-2xl border border-border p-6 space-y-4 animate-scale-in">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-bold text-foreground">
              {showBulkModal === 'lista' ? 'Adicionar à Lista de Disparo' : 'Criar Negócios no CRM'}
            </h3>
            <span className="text-xs font-bold text-primary px-2 py-1 bg-primary/10 rounded-lg">
              {selectedLeads.size} leads
            </span>
          </div>

          {showBulkModal === 'lista' && (
            <div className="space-y-4">
              {/* Option 1: Add to existing list */}
              <div className="space-y-3">
                <label className="ocr-label mb-1.5 block">Adicionar a Lista Existente</label>
                <select
                  value={targetLista}
                  onChange={e => setTargetLista(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground cursor-pointer"
                >
                  <option value="">-- Escolha uma lista existente --</option>
                  {Array.isArray(listas) && listas.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.nomeLista}</option>
                  ))}
                </select>
                <p className="text-[10px] text-muted-foreground">
                  Leads duplicados pelo telefone serão ignorados automaticamente.
                </p>
              </div>

              {/* Divider */}
              <div className="relative flex items-center gap-3">
                <div className="flex-1 h-px bg-border/40" />
                <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wider">ou</span>
                <div className="flex-1 h-px bg-border/40" />
              </div>

              {/* Option 2: Create action in Caixa Rápido */}
              <button
                type="button"
                onClick={() => { setShowBulkModal(null); handleCriarAcaoCaixaRapido() }}
                className="w-full py-3 px-4 rounded-xl border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary font-bold text-xs transition-all flex items-center justify-center gap-2 group"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Criar Nova Ação no Caixa Rápido
                <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <p className="text-[10px] text-muted-foreground text-center">
                Você será direcionado ao Caixa Rápido com os {selectedLeads.size} leads já carregados — basta escolher a cadência e disparar.
              </p>
            </div>
          )}

          {showBulkModal === 'deals' && (
            <div className="space-y-3">
              <label className="ocr-label block">Funil (Pipeline)</label>
              <select
                value={targetPipeline}
                onChange={e => setTargetPipeline(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground"
              >
                <option value="">-- Escolha um funil --</option>
                {Array.isArray(pipelines) && pipelines.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.nome}</option>
                ))}
              </select>

              <label className="ocr-label block mt-2">Etapa Inicial</label>
              <select
                value={targetStage}
                onChange={e => setTargetStage(e.target.value)}
                disabled={!targetPipeline || pipelineStages.length === 0}
                className="w-full px-3 py-2 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground disabled:opacity-50"
              >
                <option value="">-- Escolha uma etapa --</option>
                {Array.isArray(pipelineStages) && pipelineStages.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.nome}</option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4 border-t border-border/20">
            <button
              onClick={() => setShowBulkModal(null)}
              className="px-4 py-2 rounded-xl border border-border text-muted-foreground hover:bg-secondary text-xs font-bold transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => executeBulkAction(showBulkModal)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
            >
              Confirmar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in relative">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl border border-border/30 bg-card backdrop-blur-md flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Total Minerados</span>
          <span className="text-2xl font-black text-foreground">{leadsData?.kpis?.total || 0}</span>
        </div>
        <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-primary tracking-wider">Novos</span>
          <span className="text-2xl font-black text-primary">{leadsData?.kpis?.novos || 0}</span>
        </div>
        <div className="p-4 rounded-2xl border border-border/30 bg-card flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-emerald-500 tracking-wider">Importados CRM</span>
          <span className="text-2xl font-black text-emerald-400">{leadsData?.kpis?.importados || 0}</span>
        </div>
        <div className="p-4 rounded-2xl border border-border/30 bg-card flex flex-col gap-1">
          <span className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">Descartados</span>
          <span className="text-2xl font-black text-rose-400">{leadsData?.kpis?.descartados || 0}</span>
        </div>
      </div>

      {/* Buscar Form */}
      <div className="p-5 rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 to-transparent">
        <h3 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
          <Search className="w-4 h-4 text-primary" /> Disparar Automação N8N
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div>
            <label className="ocr-label mb-1.5 block">Nicho de Busca</label>
            <select
              value={selectedNiche}
              onChange={e => setSelectedNiche(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer"
            >
              <option value="">Selecione...</option>
              {activeNiches.map((n: any) => (
                <option key={n.id} value={n.nome}>{n.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="ocr-label mb-1.5 block">Estado (UF)</label>
            <select
              value={selectedUf}
              onChange={e => setSelectedUf(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer"
            >
              <option value="">Selecione...</option>
              {ufs.map((u: any) => (
                <option key={u.sigla} value={u.sigla}>{u.nome} ({u.sigla})</option>
              ))}
            </select>
          </div>

          <div>
            <label className="ocr-label mb-1.5 block">Cidade</label>
            <select
              value={selectedCity}
              onChange={e => {
                setSelectedCity(e.target.value)
                if (e.target.value === 'manual') setCityName('')
              }}
              disabled={!selectedUf || loadingCities}
              className="w-full px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground cursor-pointer disabled:opacity-50"
            >
              <option value="">{loadingCities ? 'Carregando...' : 'Selecione a cidade...'}</option>
              {Array.isArray(cities) && cities.map((c: any) => (
                <option key={c.id} value={c.nome}>{c.nome}</option>
              ))}
              <option value="manual">Outra (Digitar manualmente)</option>
            </select>
            {selectedCity === 'manual' && (
              <input
                type="text"
                placeholder="Digite a cidade..."
                value={cityName}
                onChange={e => setCityName(e.target.value)}
                className="w-full mt-2 px-3 py-2.5 rounded-xl border border-border bg-secondary text-xs focus:outline-none text-foreground"
              />
            )}
          </div>

          <div>
            <button
              onClick={handleDispararBusca}
              disabled={isTriggering || triggerSuccess}
              className={`w-full py-2.5 rounded-xl font-extrabold hover:shadow-lg active:scale-95 transition-all text-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed ${
                triggerSuccess 
                  ? 'bg-emerald-500 text-primary-foreground shadow-lg shadow-emerald-500/20' 
                  : isTriggering 
                    ? 'bg-muted text-muted-foreground' 
                    : 'bg-primary text-primary-foreground hover:shadow-primary/20'
              }`}
            >
              {triggerSuccess ? (
                <>
                  <svg className="w-4 h-4 text-primary-foreground animate-scale-in" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  <span>Busca Iniciada!</span>
                </>
              ) : isTriggering ? (
                <>
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-muted-foreground" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Disparando...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-black" />
                  <span>Disparar Busca</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Tabela Central */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-muted-foreground" />
            <h2 className="text-lg font-bold">Central de Leads Minerados</h2>
            {refreshCountdown !== null && (
              <span className="flex items-center gap-1.5 px-3 py-1 rounded-full border border-primary/30 bg-primary/5 text-[10px] text-primary font-bold animate-pulse select-none">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                Atualizando lista em {refreshCountdown}s...
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={timeFilter}
              onChange={e => setTimeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs focus:outline-none text-foreground"
            >
              <option value="todos">Todo período</option>
              <option value="hoje">Hoje</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="30d">Últimos 30 dias</option>
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs focus:outline-none text-foreground"
            >
              <option value="TODOS">Todos Status</option>
              <option value="NOVO">Novos</option>
              <option value="IMPORTADO">Importados</option>
              <option value="DESCARTADO">Descartados</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar lead..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg border border-border bg-secondary text-xs focus:outline-none text-foreground w-48"
              />
            </div>
          </div>
        </div>

        {/* Selected Context Bar — flutuante no topo */}
        {selectedLeads.size > 0 && (
          <div className="fixed top-24 left-1/2 -translate-x-1/2 z-50 bg-card backdrop-blur-xl border border-primary/30 rounded-2xl px-5 py-3.5 flex items-center gap-4 shadow-[0_8px_40px_rgba(0,230,118,0.20)] animate-slide-down" style={{ maxWidth: 'calc(100vw - 32px)' }}>
            {/* Count badge */}
            <div className="flex items-center gap-2 shrink-0">
              <span className="w-7 h-7 rounded-xl bg-primary/20 border border-primary/30 flex items-center justify-center text-primary font-black text-sm">
                {selectedLeads.size}
              </span>
              <span className="text-xs font-black text-primary whitespace-nowrap hidden sm:block">
                selecionados
              </span>
            </div>
            <div className="w-px h-6 bg-border/40 shrink-0" />
            {/* Actions */}
            <div className="flex items-center gap-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
              <button
                onClick={() => handleCriarAcaoCaixaRapido()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-black transition-all hover:opacity-90 active:scale-95 whitespace-nowrap shrink-0"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Criar Ação
              </button>
              <button onClick={() => setShowBulkModal('lista')} className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted text-xs font-bold transition-colors whitespace-nowrap shrink-0">
                + Lista
              </button>
              <button onClick={() => setShowBulkModal('deals')} className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted text-xs font-bold transition-colors whitespace-nowrap shrink-0">
                + Negócios
              </button>
              <button onClick={() => executeBulkAction('importar')} className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted text-xs font-bold transition-colors whitespace-nowrap text-emerald-400 shrink-0">
                CRM
              </button>
              <button onClick={() => executeBulkAction('descartar')} className="px-3 py-1.5 rounded-xl bg-muted hover:bg-muted text-xs font-bold transition-colors whitespace-nowrap text-amber-400 shrink-0">
                Descartar
              </button>
              <button onClick={() => executeBulkAction('delete')} className="p-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors shrink-0" title="Excluir Definitivo">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {/* Close */}
            <button onClick={() => setSelectedLeads(new Set())} className="p-1.5 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0 ml-1">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <div className="rounded-2xl border border-border overflow-hidden bg-card/30">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-card border-b border-border/50 text-[10px] text-muted-foreground font-black tracking-widest uppercase">
              <tr>
                <th className="p-4 w-12 text-center">
                  <button onClick={() => handleSelectAll(selectedLeads.size !== leadsData?.leads?.length)}>
                    {selectedLeads.size === leadsData?.leads?.length && leadsData?.leads?.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-primary" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="p-4">Identidade</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Canal</th>
                <th className="p-4 text-center">Logs</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30 bg-card">
              {loadingLeads ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs">
                    Carregando leads...
                  </td>
                </tr>
              ) : leadsData?.leads?.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-muted-foreground text-xs italic">
                    Nenhum lead encontrado para os filtros selecionados.
                  </td>
                </tr>
              ) : (
                leadsData?.leads?.map((lead: any) => (
                  <tr key={lead.id} className={`hover:bg-muted/10 transition-colors ${selectedLeads.has(lead.id) ? 'bg-primary/5' : ''}`}>
                    <td className="p-4 text-center">
                      <button onClick={() => handleToggleSelect(lead.id)}>
                        {selectedLeads.has(lead.id) ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4 text-muted-foreground" />
                        )}
                      </button>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-[10px] bg-secondary flex items-center justify-center font-black text-primary-foreground text-lg shrink-0 border border-border/50">
                          {(lead.nome || lead.empresa || 'S').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col">
                          <span className="font-black text-sm text-foreground truncate max-w-[250px] uppercase tracking-wide">
                            {lead.empresa || lead.nome || 'Sem Nome'}
                          </span>
                          <span className="text-[10px] text-muted-foreground tracking-wide truncate max-w-[250px]">
                            {lead.telefone ? `📞 ${lead.telefone}` : lead.endereco ? `📍 ${lead.endereco}` : lead.nome ? lead.nome : '—'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="px-3 py-1 rounded-full bg-[#FFF1E6] text-[#FF8A00] text-[10px] font-black uppercase">
                          {lead.status === 'NOVO' ? 'LEAD' : lead.status}
                        </span>
                        {lead.notas?.includes('[listado]') && (
                          <span className="px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 border border-violet-500/30 text-[9px] font-black uppercase tracking-wider">
                            📋 LISTADO
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" viewBox="0 0 24 24">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        <span className="text-[10px] font-black text-foreground tracking-widest uppercase">
                          GOOGLE
                        </span>
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        {lead.nicho && (
                          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[9px] font-black uppercase tracking-wider">
                            {lead.nicho}
                          </span>
                        )}
                        {(lead.cidade || lead.estado) && (
                          <span className="text-[9px] text-muted-foreground font-semibold uppercase">
                            📍 {[lead.cidade, lead.estado].filter(Boolean).join(' - ')}
                          </span>
                        )}
                        <span className="text-[9px] text-muted-foreground/60">
                          {new Date(lead.dataBusca).toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          className="w-8 h-8 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => {
                            if(lead.site) window.open(lead.site, '_blank')
                            else alert('Lead não possui site registrado.')
                          }}
                          title="Ver Site"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                        <button 
                          className="w-8 h-8 rounded-full border border-border/50 flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                          onClick={() => {
                            setSelectedLeads(new Set([lead.id]))
                            executeBulkAction('importar')
                          }}
                          title="Importar para CRM"
                        >
                          <UserPlus className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          
          {/* Pagination */}
          {(leadsData?.totalPages ?? 0) > 1 && (
            <div className="p-4 border-t border-border/50 flex justify-end gap-2 bg-card">
              <button
                disabled={page === 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs disabled:opacity-50 font-semibold"
              >
                Anterior
              </button>
              <span className="px-3 py-1.5 text-xs text-muted-foreground font-bold">
                Página {page} de {leadsData?.totalPages ?? 1}
              </span>
              <button
                disabled={page === (leadsData?.totalPages ?? 1)}
                onClick={() => setPage(p => Math.min(leadsData?.totalPages ?? 1, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-border bg-secondary text-xs disabled:opacity-50 font-semibold"
              >
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>
      {renderBulkModals()}
    </div>
  )
}
