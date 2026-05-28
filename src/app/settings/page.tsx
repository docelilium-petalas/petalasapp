'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { AppLayout } from '@/components/AppLayout'
import {
  User, Sliders, Zap, Key, ChevronRight,
  Plus, Trash2, Edit3, AlertTriangle,
  Workflow, Check, X, GripVertical, Shield, Users,
  Save, Settings2, Tag,
  Activity, AlertCircle, Copy, CheckSquare, Square, CheckCircle2, Send, Star, FileText
} from 'lucide-react'
import * as crmActions from '@/app/actions/crm'
import { useCategories } from '@/lib/categories'
import { toast, Toaster } from 'sonner'
import { crmService } from '@/lib/services'
import { MockPipeline, MockStage, MockDeal, MockUser, MockTeam, MockIntegration, MockWebhookLog, MockAIAgentConfig } from '@/lib/mockData'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

type Tab = 'perfil' | 'pipeline' | 'integracao' | 'categorias' | 'disparo' | 'usuarios' | 'times' | 'templates'
type UserRole = 'USER' | 'MODERATOR' | 'ADMIN'
type EndpointSourceSystem = 'elementor' | 'facebook_leads' | 'n8n' | 'custom'
type IntegrationTipo = 'inbound_webhook' | 'outbound_api'

interface DisparoChannel {
  id: string
  nome: string
  tipo: 'webhook'
  urlWebhook: string
  pipelineId: string
  ativo: boolean
  createdAt: string
}

interface DisparoLog {
  id: string
  channelId: string
  channelNome: string
  timestamp: string
  leadsCount: number
  status: 'SUCESSO' | 'FALHA'
  mensagem?: string
}

const DEFAULT_CHANNELS: DisparoChannel[] = [
  { id: 'chan-1', nome: 'Disparo Leads Quentes n8n', tipo: 'webhook', urlWebhook: 'https://n8n.netlife.com/webhook/disparo-crm', pipelineId: 'pipe-1', ativo: true, createdAt: new Date().toISOString() },
  { id: 'chan-2', nome: 'Integração Inbound Evolution API', tipo: 'webhook', urlWebhook: 'https://evo.netlife.com/webhook/status', pipelineId: 'pipe-1', ativo: false, createdAt: new Date().toISOString() },
]

const DEFAULT_LOGS: DisparoLog[] = [
  { id: 'log-1', channelId: 'chan-1', channelNome: 'Disparo Leads Quentes n8n', timestamp: new Date(Date.now() - 3600000).toISOString(), leadsCount: 15, status: 'SUCESSO' },
  { id: 'log-2', channelId: 'chan-1', channelNome: 'Disparo Leads Quentes n8n', timestamp: new Date(Date.now() - 7200000).toISOString(), leadsCount: 8, status: 'SUCESSO' },
  { id: 'log-3', channelId: 'chan-2', channelNome: 'Integração Inbound Evolution API', timestamp: new Date(Date.now() - 86400000).toISOString(), leadsCount: 4, status: 'FALHA', mensagem: 'Error: Timeout 10000ms exceeded' },
]

const TABS: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean }[] = [
  { id: 'perfil', label: 'Perfil', icon: User },
  { id: 'pipeline', label: 'Funis & Etapas', icon: Sliders },
  { id: 'integracao', label: 'Integrações', icon: Zap },
  { id: 'categorias', label: 'Categorias', icon: Tag },
  { id: 'disparo', label: 'Disparo & Status', icon: Key },
  { id: 'templates', label: 'Templates', icon: FileText },
  { id: 'usuarios', label: 'Usuários', icon: Shield, adminOnly: true },
  { id: 'times', label: 'Times/Equipes', icon: Users, adminOnly: true }
]

const BEAUTIFUL_COLORS = [
  '#00E676', // Emerald
  '#39FF88', // Mint
  '#00BCD4', // Cyan
  '#2979FF', // Blue
  '#7C3AED', // Violet
  '#E91E63', // Pink
  '#FF9100', // Amber
  '#FF3D00', // Orange-Red
  '#9E9E9E', // Grey
]

// ─── SORTABLE STAGE ITEM COMPONENT ───────────────────────────────────────────
interface SortableStageItemProps {
  stage: MockStage
  onEdit: (stage: MockStage) => void
  onDelete: (stage: MockStage) => void
  dealCount: number
}

function SortableStageItem({ stage, onEdit, onDelete, dealCount }: SortableStageItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: stage.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
    zIndex: isDragging ? 50 : 'auto'
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3.5 rounded-2xl border border-border/30 bg-muted/40 hover:border-border/60 transition-all gap-3 ${
        isDragging ? 'shadow-lg border-primary/45 bg-card' : ''
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground shrink-0"
        >
          <GripVertical className="w-4.5 h-4.5" />
        </button>

        <div
          className="w-3.5 h-3.5 rounded-full border border-black/30 shrink-0"
          style={{ backgroundColor: stage.cor }}
        />

        <div className="min-w-0">
          <span className="text-xs font-bold text-neutral-200 block truncate">{stage.nome}</span>
          <span className="text-[10px] text-muted-foreground">
            Probabilidade: <strong className="text-neutral-300">{stage.probabilidade}%</strong> • SLA:{' '}
            <strong className="text-neutral-300">{stage.slaHours}h</strong> •{' '}
            <strong className="text-primary">{dealCount} negócios</strong>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(stage)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
          title="Editar etapa"
        >
          <Edit3 className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onDelete(stage)}
          className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-all"
          title="Excluir etapa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}

function SettingsContent() {
  const [tab, setTab] = useState<Tab>('perfil')
  const [currentUser, setCurrentUser] = useState<MockUser | null>(null)
  
  // Perfil state
  const [perfilForm, setPerfilForm] = useState({
    nome: '',
    sobrenome: '',
    telefone: '',
    avatarUrl: ''
  })

  // Webhook Test States
  const [testStates, setTestStates] = useState<
    Record<string, { status: 'idle' | 'loading' | 'success' | 'error'; message: string }>
  >({})

  // General Settings Page States
  const [pipelines, setPipelines] = useState<MockPipeline[]>([])
  const [aiConfig, setAiConfig] = useState<MockAIAgentConfig | null>(null)
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
  const [stages, setStages] = useState<MockStage[]>([])
  const [deals, setDeals] = useState<MockDeal[]>([])

  // Pipeline CRUD
  const [isAddingPipeline, setIsAddingPipeline] = useState(false)
  const [newPipelineName, setNewPipelineName] = useState('')
  const [editingPipelineId, setEditingPipelineId] = useState<string | null>(null)
  const [editingPipelineName, setEditingPipelineName] = useState('')

  // Stage CRUD
  const [isAddingStage, setIsAddingStage] = useState(false)
  const [stageForm, setStageForm] = useState({
    nome: '',
    cor: '#00E676',
    probabilidade: 10,
    slaHours: 24
  })
  const [editingStageId, setEditingStageId] = useState<string | null>(null)

  // Stage deletion migration
  const [deletingStage, setDeletingStage] = useState<MockStage | null>(null)
  const [migrationStageId, setMigrationStageId] = useState('')

  // Webhooks/Integrations states
  const [integrations, setIntegrations] = useState<MockIntegration[]>([])
  const [showAddIntegration, setShowAddIntegration] = useState(false)
  const [integrationForm, setIntegrationForm] = useState({
    nome: '',
    tipo: 'inbound_webhook' as 'inbound_webhook' | 'outbound_api',
    baseUrl: ''
  })
  const [activeAccordionLog, setActiveAccordionLog] = useState<string | null>(null)
  const [webhookLogsMap, setWebhookLogsMap] = useState<Record<string, MockWebhookLog[]>>({})
  const [showAddEndpoint, setShowAddEndpoint] = useState<string | null>(null) // integrationId
  const [endpointForm, setEndpointForm] = useState({
    path: '',
    secretToken: '',
    sourceSystem: 'elementor' as EndpointSourceSystem
  })

  // Categories tab state
  const categoriesStore = useCategories()

  // Disparos webhook URLs
  const [webhookUrls, setWebhookUrls] = useState({
    disparo_webhook_url: '',
    disparo_status_webhook_url: '',
    disparo_cancelar_webhook_url: ''
  })

  // Disparo channels & logs states
  const [channels, setChannels] = useState<DisparoChannel[]>([])
  const [disparoLogs, setDisparoLogs] = useState<DisparoLog[]>([])
  const [showAddChannel, setShowAddChannel] = useState(false)
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [channelForm, setChannelForm] = useState({
    nome: '',
    tipo: 'webhook' as 'webhook',
    urlWebhook: '',
    pipelineId: '',
    ativo: true
  })

  // Template CRUD states
  const [templates, setTemplates] = useState<any[]>([])
  const [showAddTemplate, setShowAddTemplate] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<any | null>(null)
  const [templateForm, setTemplateForm] = useState({
    nome: '',
    categoria: 'Sondagem',
    corpo: ''
  })

  const loadTemplates = async () => {
    try {
      const allTemplates = await crmActions.getTemplates()
      setTemplates(allTemplates)
    } catch (e) {
      console.error('Erro ao carregar templates:', e)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const handleSaveTemplate = async () => {
    if (!templateForm.nome.trim() || !templateForm.corpo.trim()) {
      toast.error('Preencha nome e corpo do template')
      return
    }

    try {
      if (editingTemplate) {
        await crmActions.updateTemplate(editingTemplate.id, {
          nome: templateForm.nome.trim(),
          categoria: templateForm.categoria,
          corpo: templateForm.corpo.trim()
        })
        toast.success('Template atualizado com sucesso!')
        setEditingTemplate(null)
      } else {
        await crmActions.createTemplate({
          nome: templateForm.nome.trim(),
          categoria: templateForm.categoria,
          corpo: templateForm.corpo.trim()
        })
        toast.success('Template criado com sucesso!')
      }
      setShowAddTemplate(false)
      setTemplateForm({ nome: '', categoria: 'Sondagem', corpo: '' })
      loadTemplates()
    } catch (e) {
      toast.error('Erro ao salvar template')
    }
  }

  const handleEditTemplate = (tpl: any) => {
    setTemplateForm({
      nome: tpl.nome,
      categoria: tpl.categoria,
      corpo: tpl.corpo
    })
    setEditingTemplate(tpl)
    setShowAddTemplate(true)
  }

  const handleDeleteTemplate = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este template?')) return
    try {
      await crmActions.deleteTemplate(id)
      toast.success('Template excluído com sucesso!')
      loadTemplates()
    } catch (e) {
      toast.error('Erro ao excluir template')
    }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedChannels = localStorage.getItem('ocr_disparo_channels')
      const savedLogs = localStorage.getItem('ocr_disparo_logs')
      
      if (savedChannels) {
        setChannels(JSON.parse(savedChannels))
      } else {
        setChannels(DEFAULT_CHANNELS)
        localStorage.setItem('ocr_disparo_channels', JSON.stringify(DEFAULT_CHANNELS))
      }
      
      if (savedLogs) {
        setDisparoLogs(JSON.parse(savedLogs))
      } else {
        setDisparoLogs(DEFAULT_LOGS)
        localStorage.setItem('ocr_disparo_logs', JSON.stringify(DEFAULT_LOGS))
      }
    }
  }, [])

  const saveChannelsToStorage = (updated: DisparoChannel[]) => {
    setChannels(updated)
    localStorage.setItem('ocr_disparo_channels', JSON.stringify(updated))
  }

  const saveLogsToStorage = (updated: DisparoLog[]) => {
    setDisparoLogs(updated)
    localStorage.setItem('ocr_disparo_logs', JSON.stringify(updated))
  }

  const handleSaveChannel = () => {
    if (!channelForm.nome.trim() || !channelForm.urlWebhook.trim() || !channelForm.pipelineId) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }

    if (editingChannelId) {
      const updated = channels.map(c => c.id === editingChannelId ? {
        ...c,
        nome: channelForm.nome.trim(),
        urlWebhook: channelForm.urlWebhook.trim(),
        pipelineId: channelForm.pipelineId,
        ativo: channelForm.ativo
      } : c)
      saveChannelsToStorage(updated)
      toast.success('Canal de disparo atualizado!')
      setEditingChannelId(null)
    } else {
      const newChan: DisparoChannel = {
        id: 'chan-' + Math.random().toString(36).substr(2, 9),
        nome: channelForm.nome.trim(),
        tipo: 'webhook',
        urlWebhook: channelForm.urlWebhook.trim(),
        pipelineId: channelForm.pipelineId,
        ativo: channelForm.ativo,
        createdAt: new Date().toISOString()
      }
      saveChannelsToStorage([...channels, newChan])
      toast.success('Canal de disparo criado com sucesso!')
    }

    setChannelForm({ nome: '', tipo: 'webhook', urlWebhook: '', pipelineId: '', ativo: true })
    setShowAddChannel(false)
  }

  const handleEditChannel = (c: DisparoChannel) => {
    setChannelForm({
      nome: c.nome,
      tipo: c.tipo,
      urlWebhook: c.urlWebhook,
      pipelineId: c.pipelineId,
      ativo: c.ativo
    })
    setEditingChannelId(c.id)
    setShowAddChannel(true)
  }

  const handleDeleteChannel = (id: string) => {
    if (!window.confirm('Excluir este canal de disparo?')) return
    const updated = channels.filter(c => c.id !== id)
    saveChannelsToStorage(updated)
    toast.success('Canal de disparo removido.')
  }

  const handleToggleChannel = (id: string) => {
    const updated = channels.map(c => c.id === id ? { ...c, ativo: !c.ativo } : c)
    saveChannelsToStorage(updated)
    toast.success('Status do canal alterado!')
  }

  const handleSimulateDisparo = async (chan: DisparoChannel) => {
    if (!chan.ativo) {
      toast.error('Este canal está desativado. Ative-o antes de disparar.')
      return
    }
    const toastId = toast.loading(`Disparando para ${chan.urlWebhook}...`)
    try {
      const samplePayload = {
        source: 'caixa-rapido-crm',
        channel: chan.nome,
        pipelineId: chan.pipelineId,
        timestamp: new Date().toISOString(),
        leads: [
          { nome: 'Lead Exemplo', telefone: '5562999999999', produto: 'Sistema', origem: 'Meta Ads' }
        ]
      }

      const res = await fetch(chan.urlWebhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePayload),
        signal: AbortSignal.timeout(10000)
      })

      const isSuccess = res.ok
      const newLog: DisparoLog = {
        id: 'log-' + Math.random().toString(36).substr(2, 9),
        channelId: chan.id,
        channelNome: chan.nome,
        timestamp: new Date().toISOString(),
        leadsCount: samplePayload.leads.length,
        status: isSuccess ? 'SUCESSO' : 'FALHA',
        mensagem: isSuccess ? undefined : `HTTP ${res.status}: ${res.statusText}`
      }
      saveLogsToStorage([newLog, ...disparoLogs])
      toast.dismiss(toastId)
      if (isSuccess) {
        toast.success(`Webhook disparado com sucesso! (HTTP ${res.status})`)
      } else {
        toast.error(`Falha no webhook: HTTP ${res.status}`)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      const newLog: DisparoLog = {
        id: 'log-' + Math.random().toString(36).substr(2, 9),
        channelId: chan.id,
        channelNome: chan.nome,
        timestamp: new Date().toISOString(),
        leadsCount: 0,
        status: 'FALHA',
        mensagem: msg
      }
      saveLogsToStorage([newLog, ...disparoLogs])
      toast.dismiss(toastId)
      toast.error(`Erro ao chamar webhook: ${msg}`)
    }
  }

  // Admin: Users list and permissions matrix
  const [users, setUsers] = useState<MockUser[]>([])
  const [showAddUser, setShowAddUser] = useState(false)
  const [userForm, setUserForm] = useState({
    email: '',
    nome: '',
    role: 'USER' as UserRole,
    password: ''
  })
  const [passwordEdit, setPasswordEdit] = useState<Record<string, string>>({})

  // Admin: Teams CRUD
  const [teams, setTeams] = useState<MockTeam[]>([])
  const [showAddTeam, setShowAddTeam] = useState(false)
  const [teamForm, setTeamForm] = useState({
    nome: '',
    ownerUserId: ''
  })
  const [selectedTeamId, setSelectedTeamId] = useState('')

  // sensors for dnd-kit reordering
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // 1. Initial configuration loader
  useEffect(() => {
    const loadData = () => {
      crmService.getCurrentUser().then(user => {
        setCurrentUser(user)
        setPerfilForm({
          nome: user.nome || '',
          sobrenome: user.sobrenome || '',
          telefone: user.telefone || '',
          avatarUrl: user.avatarUrl || ''
        })
        setWebhookUrls({
          disparo_webhook_url: user.disparo_webhook_url || '',
          disparo_status_webhook_url: user.disparo_status_webhook_url || '',
          disparo_cancelar_webhook_url: user.disparo_cancelar_webhook_url || ''
        })
        const adminLoaders: [Promise<MockUser[]>, Promise<MockTeam[]>] = user.role === 'ADMIN'
          ? [crmService.getUsers(), crmService.getTeams()]
          : [Promise.resolve([]) as Promise<MockUser[]>, Promise.resolve([]) as Promise<MockTeam[]>]
        return Promise.all([
          crmService.getPipelines(),
          crmService.getIntegrations(),
          crmService.getAIAgentConfig(),
          adminLoaders[0],
          adminLoaders[1]
        ]).then(([pipes, ints, ai, uList, tList]) => {
          setPipelines(pipes)
          if (pipes.length > 0) {
            const def = pipes.find(p => p.isDefault) || pipes[0]
            setSelectedPipelineId(def.id)
          }
          setIntegrations(ints)
          setAiConfig(ai)
          if (user.role === 'ADMIN') {
            setUsers(uList)
            setTeams(tList)
            if (tList.length > 0) {
              setSelectedTeamId(tList[0].id)
            }
          }
        })
      }).catch(err => console.error('Erro ao carregar dados', err))
    }

    loadData()

    // Listeners for updates
    const handleProfileUpdate = () => {
      crmService.getCurrentUser().then(user => {
        setCurrentUser(user)
        setPerfilForm({
          nome: user.nome || '',
          sobrenome: user.sobrenome || '',
          telefone: user.telefone || '',
          avatarUrl: user.avatarUrl || ''
        })
      })
    }

    const handleIntegrationsUpdate = () => {
      crmService.getIntegrations().then(setIntegrations)
    }

    const handleAiAgentUpdate = () => {
      crmService.getAIAgentConfig().then(setAiConfig)
    }

    const handleUsersUpdate = () => {
      crmService.getUsers().then(setUsers)
    }

    const handleTeamsUpdate = () => {
      crmService.getTeams().then(tList => {
        setTeams(tList)
        if (tList.length > 0 && !selectedTeamId) {
          setSelectedTeamId(tList[0].id)
        }
      })
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('crm-profile-updated', handleProfileUpdate)
      window.addEventListener('crm-integrations-updated', handleIntegrationsUpdate)
      window.addEventListener('crm-ai-agent-updated', handleAiAgentUpdate)
      window.addEventListener('crm-users-updated', handleUsersUpdate)
      window.addEventListener('crm-teams-updated', handleTeamsUpdate)
    }

    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-profile-updated', handleProfileUpdate)
        window.removeEventListener('crm-integrations-updated', handleIntegrationsUpdate)
        window.removeEventListener('crm-ai-agent-updated', handleAiAgentUpdate)
        window.removeEventListener('crm-users-updated', handleUsersUpdate)
        window.removeEventListener('crm-teams-updated', handleTeamsUpdate)
      }
    }
  }, [selectedTeamId])

  // Load stages & deals when pipeline is changed
  useEffect(() => {
    if (!selectedPipelineId) return
    Promise.all([
      crmService.getStages(selectedPipelineId),
      crmService.getDeals(selectedPipelineId)
    ]).then(([loadedStages, loadedDeals]) => {
      setStages(loadedStages)
      setDeals(loadedDeals)
    }).catch(err => console.error('Erro ao carregar etapas', err))
  }, [selectedPipelineId])

  // ─── USER PROFILE SAVE ───────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!perfilForm.nome.trim()) {
      toast.error('O nome é obrigatório')
      return
    }
    try {
      await crmService.updateProfile(currentUser?.id ?? '', perfilForm)
      toast.success('Perfil atualizado com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao atualizar perfil: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // ─── PIPELINE & STAGES ACTIONS ───────────────────────────────────────────────
  const handleSetDefaultPipeline = async (pipeId: string) => {
    try {
      await crmService.setDefaultPipeline(pipeId)
      const list = await crmService.getPipelines()
      setPipelines(list)
      toast.success('Funil padrão atualizado!')
    } catch (err: unknown) {
      toast.error('Erro ao definir funil padrão: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleCreatePipeline = async () => {
    if (!newPipelineName.trim()) {
      toast.error('O nome do funil é obrigatório')
      return
    }
    try {
      const newPipe = await crmService.createPipeline(newPipelineName.trim())
      
      // Auto-create initial stage
      await crmService.createStage({
        pipelineId: newPipe.id,
        nome: 'Novo Lead',
        cor: '#00E676',
        probabilidade: 10,
        slaHours: 24,
        ordem: 1
      })

      const list = await crmService.getPipelines()
      setPipelines(list)
      setSelectedPipelineId(newPipe.id)
      setNewPipelineName('')
      setIsAddingPipeline(false)
      toast.success('Funil de vendas criado com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao criar funil: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleRenamePipeline = async () => {
    if (!editingPipelineName.trim() || !editingPipelineId) return
    try {
      await crmService.updatePipeline(editingPipelineId, { nome: editingPipelineName.trim() })
      const list = await crmService.getPipelines()
      setPipelines(list)
      setEditingPipelineId(null)
      toast.success('Funil renomeado com sucesso!')
    } catch (err: unknown) {
      toast.error('Erro ao renomear: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeletePipeline = async (pipeId: string) => {
    if (pipelines.length <= 1) {
      toast.error('Você deve possuir ao menos um funil no sistema.')
      return
    }
    const pipe = pipelines.find(p => p.id === pipeId)
    if (!pipe) return

    const confirm = window.confirm(`Atenção: A exclusão do funil "${pipe.nome}" é IRREVERSÍVEL. Todos os negócios, estágios e históricos vinculados a ele serão excluídos permanentemente. Deseja prosseguir?`)
    if (!confirm) return

    try {
      await crmService.deletePipeline(pipeId)
      const list = await crmService.getPipelines()
      setPipelines(list)
      const nextDef = list.find(p => p.isDefault) || list[0]
      setSelectedPipelineId(nextDef.id)
      toast.success('Funil excluído permanentemente!')
    } catch (err: unknown) {
      toast.error('Erro ao excluir funil: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // drag end callback to reorder stages
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = stages.findIndex(s => s.id === active.id)
    const newIndex = stages.findIndex(s => s.id === over.id)

    const updated = arrayMove(stages, oldIndex, newIndex)
    setStages(updated)

    try {
      await crmService.reorderStages(selectedPipelineId, updated)
      toast.success('Ordem das etapas atualizada!')
    } catch (err: unknown) {
      toast.error('Erro ao atualizar ordenação: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleOpenAddStage = () => {
    setStageForm({
      nome: '',
      cor: '#00E676',
      probabilidade: 10,
      slaHours: 24
    })
    setEditingStageId(null)
    setIsAddingStage(true)
  }

  const handleOpenEditStage = (stage: MockStage) => {
    setStageForm({
      nome: stage.nome,
      cor: stage.cor,
      probabilidade: stage.probabilidade,
      slaHours: stage.slaHours
    })
    setEditingStageId(stage.id)
    setIsAddingStage(true)
  }

  const handleSaveStage = async () => {
    if (!stageForm.nome.trim()) {
      toast.error('O nome da etapa é obrigatório')
      return
    }

    try {
      if (editingStageId) {
        await crmService.updateStage(editingStageId, stageForm)
        toast.success('Etapa atualizada com sucesso!')
      } else {
        await crmService.createStage({
          ...stageForm,
          pipelineId: selectedPipelineId,
          ordem: stages.length + 1
        })
        toast.success('Nova etapa criada!')
      }
      
      setIsAddingStage(false)
      setEditingStageId(null)
      const loadedStages = await crmService.getStages(selectedPipelineId)
      setStages(loadedStages)
    } catch (err: unknown) {
      toast.error('Erro ao salvar etapa: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteStageClick = (stage: MockStage) => {
    if (stages.length <= 1) {
      toast.error('Você não pode excluir a única etapa deste funil. Crie outra etapa primeiro.')
      return
    }

    const stageDeals = deals.filter(d => d.stageId === stage.id)
    if (stageDeals.length > 0) {
      // Required migration dialog
      setDeletingStage(stage)
      const remaining = stages.filter(s => s.id !== stage.id)
      setMigrationStageId(remaining[0]?.id || '')
    } else {
      if (window.confirm(`Deseja realmente excluir a etapa "${stage.nome}"?`)) {
        executeDeleteStage(stage.id)
      }
    }
  }

  const executeDeleteStage = async (stageId: string, migrationId?: string) => {
    try {
      await crmService.deleteStage(stageId, migrationId)
      toast.success('Etapa excluída com sucesso!')
      setDeletingStage(null)
      setMigrationStageId('')
      
      const loadedStages = await crmService.getStages(selectedPipelineId)
      setStages(loadedStages)
      const loadedDeals = await crmService.getDeals(selectedPipelineId)
      setDeals(loadedDeals)
    } catch (err: unknown) {
      toast.error('Erro ao excluir etapa: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // ─── INTEGRATIONS & WEBHOOKS CRUD ────────────────────────────────────────────
  const handleCreateIntegration = async () => {
    if (!integrationForm.nome.trim()) {
      toast.error('Nome da integração é obrigatório')
      return
    }
    try {
      await crmService.createIntegration({
        nome: integrationForm.nome.trim(),
        tipo: integrationForm.tipo,
        baseUrl: integrationForm.tipo === 'outbound_api' ? integrationForm.baseUrl : undefined,
        ativo: true
      })
      toast.success('Integração cadastrada com sucesso!')
      setShowAddIntegration(false)
      setIntegrationForm({ nome: '', tipo: 'inbound_webhook', baseUrl: '' })
      
      const ints = await crmService.getIntegrations()
      setIntegrations(ints)
    } catch (err: unknown) {
      toast.error('Erro ao criar integração: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleIntegration = async (id: string, currentStatus: boolean) => {
    try {
      await crmService.updateIntegration(id, { ativo: !currentStatus })
      toast.success(`Integração ${!currentStatus ? 'ativada' : 'desativada'}!`)
      const ints = await crmService.getIntegrations()
      setIntegrations(ints)
    } catch (err: unknown) {
      toast.error('Erro ao alterar status: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteIntegration = async (id: string) => {
    if (!window.confirm('Excluir esta integração e todos os endpoints vinculados?')) return
    try {
      await crmService.deleteIntegration(id)
      toast.success('Integração removida!')
      const ints = await crmService.getIntegrations()
      setIntegrations(ints)
    } catch (err: unknown) {
      toast.error('Erro ao excluir integração: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleAddEndpoint = async (intId: string) => {
    if (!endpointForm.path.trim()) {
      toast.error('Identificador do caminho é obrigatório')
      return
    }
    try {
      await crmService.createWebhookEndpoint(
        intId,
        endpointForm.path.trim(),
        endpointForm.secretToken || undefined,
        endpointForm.sourceSystem
      )
      toast.success('Caminho de webhook criado!')
      setShowAddEndpoint(null)
      setEndpointForm({ path: '', secretToken: '', sourceSystem: 'elementor' })
      
      const ints = await crmService.getIntegrations()
      setIntegrations(ints)
    } catch (err: unknown) {
      toast.error('Erro ao criar endpoint: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteEndpoint = async (endpointId: string) => {
    if (!window.confirm('Excluir este endpoint?')) return
    try {
      await crmService.deleteWebhookEndpoint(endpointId)
      toast.success('Endpoint removido!')
      const ints = await crmService.getIntegrations()
      setIntegrations(ints)
    } catch (err: unknown) {
      toast.error('Erro ao remover endpoint: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleAccordionLog = async (endpointId: string) => {
    if (activeAccordionLog === endpointId) {
      setActiveAccordionLog(null)
    } else {
      setActiveAccordionLog(endpointId)
      try {
        const logs = await crmService.getWebhookLogs(endpointId)
        setWebhookLogsMap(prev => ({
          ...prev,
          [endpointId]: logs
        }))
      } catch (err) {
        console.error('Erro ao carregar logs', err)
      }
    }
  }

  // ─── AI SDR VIRTUAL CONFIG SAVE ──────────────────────────────────────────────
  const handleSaveAIConfig = async () => {
    if (!aiConfig) return
    try {
      await crmService.updateAIAgentConfig('usr-admin-123', aiConfig)
      toast.success('Configurações do SDR Virtual salvas!')
    } catch (err: unknown) {
      toast.error('Erro ao salvar IA: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleAIActive = async (newValue: boolean) => {
    if (!aiConfig) return
    
    if (!newValue) {
      const confirm = window.confirm(
        'Atenção: Ao desativar o SDR Virtual, todas as sessões de qualificação ativas e históricos de conversas serão apagados permanentemente. Deseja prosseguir?'
      )
      if (!confirm) return
    }

    try {
      const updated = await crmService.updateAIAgentConfig('usr-admin-123', { ativo: newValue })
      setAiConfig(updated)
      toast.success(`SDR Virtual ${newValue ? 'ativado' : 'desativado'} com sucesso!`)
    } catch (err: unknown) {
      toast.error('Erro ao alterar status da IA: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleBantField = (field: string) => {
    if (!aiConfig) return
    const current = aiConfig.camposObrigatorios || []
    let next: string[] = []
    if (current.includes(field)) {
      next = current.filter(f => f !== field)
    } else {
      next = [...current, field]
    }
    setAiConfig({ ...aiConfig, camposObrigatorios: next })
  }

  // ─── WEBHOOKS URL UPDATES & TESTERS ──────────────────────────────────────────
  const handleUpdateWebhookUrl = async (field: string, val: string) => {
    setWebhookUrls(prev => ({ ...prev, [field]: val }))
    try {
      await crmService.updateProfile('usr-admin-123', { [field]: val })
    } catch (err) {
      console.error('Erro ao atualizar URL', err)
    }
  }

  const handleTestWebhook = async (field: string, url: string) => {
    if (!url) {
      toast.error('URL do webhook é obrigatória para o teste')
      return
    }

    setTestStates(prev => ({
      ...prev,
      [field]: { status: 'loading', message: 'Enviando disparo de teste...' }
    }))

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      await fetch(url, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test: true,
          event: 'webhook_test',
          timestamp: new Date().toISOString(),
          details: 'Disparo de teste simulado pela interface'
        }),
        signal: controller.signal
      })

      clearTimeout(timeoutId)
      setTestStates(prev => ({
        ...prev,
        [field]: { status: 'success', message: 'Webhook respondendo com sucesso!' }
      }))
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const isAbort = err instanceof Error && err.name === 'AbortError'
      setTestStates(prev => ({
        ...prev,
        [field]: {
          status: 'error',
          message: isAbort ? 'Erro: Tempo limite de 10s excedido.' : 'Erro de requisição. Verifique a URL.'
        }
      }))
    }

    setTimeout(() => {
      setTestStates(prev => {
        const copy = { ...prev }
        delete copy[field]
        return copy
      })
    }, 3000)
  }

  // ─── ADMIN: USER MATRIX CRUD & PERMISSIONS ──────────────────────────────────
  const handleCreateUser = async () => {
    if (!userForm.email.trim() || !userForm.nome.trim()) {
      toast.error('Nome e E-mail são obrigatórios')
      return
    }
    try {
      await crmService.createUser(userForm)
      toast.success('Usuário criado com sucesso!')
      setShowAddUser(false)
      setUserForm({ email: '', nome: '', role: 'USER', password: '' })
      const uList = await crmService.getUsers()
      setUsers(uList)
    } catch (err: unknown) {
      toast.error('Erro ao criar usuário: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleToggleUserPermission = async (user: MockUser, featureKey: string) => {
    const current = user.permissions || []
    let next: string[] = []
    if (current.includes(featureKey)) {
      next = current.filter(p => p !== featureKey)
    } else {
      next = [...current, featureKey]
    }

    try {
      await crmService.updateUserPermissions(user.id, next)
      toast.success('Permissões de acesso atualizadas!')
      const uList = await crmService.getUsers()
      setUsers(uList)
    } catch (err: unknown) {
      toast.error('Erro ao atualizar permissões: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleUpdateUserRole = async (userId: string, newRole: UserRole) => {
    try {
      await crmService.updateUserRole(userId, newRole)
      toast.success('Perfil de usuário atualizado!')
      const uList = await crmService.getUsers()
      setUsers(uList)
    } catch (err: unknown) {
      toast.error('Erro ao atualizar perfil: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('Excluir este usuário permanentemente?')) return
    try {
      await crmService.deleteUser(userId)
      toast.success('Usuário removido!')
      const uList = await crmService.getUsers()
      setUsers(uList)
    } catch (err: unknown) {
      toast.error('Erro ao excluir: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleUpdatePassword = async (userId: string) => {
    const newPass = passwordEdit[userId]
    if (!newPass || newPass.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres.')
      return
    }
    try {
      await crmService.updateUserPassword(userId, newPass)
      toast.success('Senha atualizada!')
      setPasswordEdit(p => { const n = { ...p }; delete n[userId]; return n })
    } catch (err: unknown) {
      toast.error('Erro: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // ─── ADMIN: TEAM CRUD ───────────────────────────────────────────────────────
  const handleCreateTeam = async () => {
    if (!teamForm.nome.trim() || !teamForm.ownerUserId) {
      toast.error('Nome e Líder do time são obrigatórios')
      return
    }
    try {
      await crmService.createTeam(teamForm.nome.trim(), teamForm.ownerUserId)
      toast.success('Time criado com sucesso!')
      setShowAddTeam(false)
      setTeamForm({ nome: '', ownerUserId: '' })
      const tList = await crmService.getTeams()
      setTeams(tList)
    } catch (err: unknown) {
      toast.error('Erro ao criar time: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleAddTeamMember = async (teamId: string, memberId: string) => {
    if (!memberId) return
    try {
      await crmService.addTeamMember(teamId, memberId)
      toast.success('Membro adicionado ao time!')
      const tList = await crmService.getTeams()
      setTeams(tList)
    } catch (err: unknown) {
      toast.error('Erro ao adicionar membro: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleRemoveTeamMember = async (teamId: string, memberId: string) => {
    try {
      await crmService.removeTeamMember(teamId, memberId)
      toast.success('Membro removido do time!')
      const tList = await crmService.getTeams()
      setTeams(tList)
    } catch (err: unknown) {
      toast.error('Erro ao remover membro: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleDeleteTeam = async (teamId: string) => {
    if (!window.confirm('Deseja realmente excluir este time? Os membros não serão deletados, apenas o time.')) return
    try {
      await crmService.deleteTeam(teamId)
      toast.success('Time desintegrado!')
      const tList = await crmService.getTeams()
      setTeams(tList)
      if (tList.length > 0) {
        setSelectedTeamId(tList[0].id)
      } else {
        setSelectedTeamId('')
      }
    } catch (err: unknown) {
      toast.error('Erro ao deletar time: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Filter tabs by admin
  const visibleTabs = useMemo(() => {
    return TABS.filter(t => !t.adminOnly || (currentUser && currentUser.role === 'ADMIN'))
  }, [currentUser])

  const selectedTeam = useMemo(() => {
    return teams.find(t => t.id === selectedTeamId)
  }, [teams, selectedTeamId])

  return (
    <div className="flex h-full bg-[#0a0a0c] text-foreground select-none">
      
      {/* Sidebar navigation */}
      <div className="w-60 shrink-0 border-r border-border/30 p-5 space-y-1 bg-background/20 flex flex-col justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground px-3 mb-4">Configurações</p>
          <div className="space-y-1">
            {visibleTabs.map(t => {
              const Icon = t.icon
              const isSel = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    isSel
                      ? 'bg-primary/10 text-primary border border-primary/20 shadow-md shadow-primary/[0.02]'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/40 border border-transparent'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{t.label}</span>
                  {isSel && <ChevronRight className="w-3.5 h-3.5 ml-auto text-primary" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Developer details footer */}
        {currentUser && (
          <div className="p-3.5 rounded-2xl bg-card/35 border border-border/20 text-[10px] text-muted-foreground flex flex-col gap-1">
            <span className="font-bold text-neutral-300">Identidade do Operador</span>
            <span className="truncate">ID: {currentUser.id}</span>
            <span className="capitalize">Role: {currentUser.role}</span>
          </div>
        )}
      </div>

      {/* Workspace panel */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-8">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* 1. PERFIL TAB */}
          {tab === 'perfil' && currentUser && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                  <User className="w-5 h-5 text-primary" />
                  Perfil do Usuário
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Suas informações cadastrais e detalhes da conta</p>
              </div>

              <div className="p-6 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl space-y-5">
                <div className="flex items-center gap-4 pb-5 border-b border-border/20">
                  <div className="relative group">
                    <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-xl font-extrabold text-primary overflow-hidden">
                      {perfilForm.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={perfilForm.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                      ) : (
                        <span>{perfilForm.nome ? perfilForm.nome[0] : 'U'}</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-neutral-200">{perfilForm.nome} {perfilForm.sobrenome}</h3>
                    <p className="text-xs text-muted-foreground">{currentUser.email}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                        {currentUser.role}
                      </span>
                      <span className="text-[9px] text-muted-foreground">Conta ativa desde 21/04/2026</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="ocr-label mb-1.5 block">Nome</label>
                    <input
                      type="text"
                      value={perfilForm.nome}
                      onChange={e => setPerfilForm(p => ({ ...p, nome: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                    />
                  </div>
                  <div>
                    <label className="ocr-label mb-1.5 block">Sobrenome</label>
                    <input
                      type="text"
                      value={perfilForm.sobrenome}
                      onChange={e => setPerfilForm(p => ({ ...p, sobrenome: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="ocr-label mb-1.5 block">Telefone Comercial (WhatsApp)</label>
                    <input
                      type="text"
                      value={perfilForm.telefone}
                      onChange={e => setPerfilForm(p => ({ ...p, telefone: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                      placeholder="Ex: 5562999999999"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="ocr-label mb-1.5 block">URL do Avatar (Imagem)</label>
                    <input
                      type="text"
                      value={perfilForm.avatarUrl}
                      onChange={e => setPerfilForm(p => ({ ...p, avatarUrl: e.target.value }))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                      placeholder="https://exemplo.com/avatar.png"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-3">
                  <button
                    onClick={handleSaveProfile}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-black font-extrabold text-xs hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                  >
                    <Save className="w-4 h-4" /> Salvar Perfil
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 2. PIPELINE & STAGES TAB */}
          {tab === 'pipeline' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                  <Workflow className="w-5 h-5 text-primary" />
                  Funis &amp; Etapas Comerciais
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Gerencie os pipelines de vendas, SLA operacional e migrações de estágios</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* COLUMN 1: Pipelines List */}
                <div className="lg:col-span-5 p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-border/20 pb-3">
                    <h3 className="text-xs font-bold text-neutral-200">Pipelines Ativos</h3>
                    {!isAddingPipeline && (
                      <button
                        onClick={() => setIsAddingPipeline(true)}
                        className="text-[10px] font-extrabold text-primary flex items-center gap-1 hover:underline"
                      >
                        <Plus className="w-3.5 h-3.5" /> Criar Novo
                      </button>
                    )}
                  </div>

                  {isAddingPipeline && (
                    <div className="p-3.5 rounded-2xl border border-primary/20 bg-primary/5 space-y-3 animate-scale-in">
                      <span className="text-[10px] font-extrabold text-primary uppercase tracking-wider block">Novo Funil de Vendas</span>
                      <input
                        type="text"
                        placeholder="Ex: Pós-Vendas / Retenção"
                        value={newPipelineName}
                        onChange={e => setNewPipelineName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/45 text-foreground"
                      />
                      <div className="flex justify-end gap-2 text-[10px]">
                        <button
                          onClick={() => {
                            setIsAddingPipeline(false)
                            setNewPipelineName('')
                          }}
                          className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleCreatePipeline}
                          className="px-2.5 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                        >
                          Criar Funil
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2 max-h-[350px] overflow-y-auto scrollbar-thin">
                    {pipelines.map(p => {
                      const isSel = p.id === selectedPipelineId
                      const isEdit = editingPipelineId === p.id
                      return (
                        <div
                          key={p.id}
                          onClick={() => !isEdit && setSelectedPipelineId(p.id)}
                          className={`group relative p-3 rounded-xl border cursor-pointer transition-all flex flex-col gap-2 ${
                            isSel
                              ? 'border-primary/30 bg-primary/5 shadow-inner'
                              : 'border-border/20 hover:border-border/50 bg-card/10'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            {isEdit ? (
                              <div className="flex items-center gap-1.5 w-full" onClick={e => e.stopPropagation()}>
                                <input
                                  type="text"
                                  value={editingPipelineName}
                                  onChange={e => setEditingPipelineName(e.target.value)}
                                  className="flex-1 px-2.5 py-1 rounded-lg border border-border bg-card text-[11px] text-foreground focus:outline-none"
                                />
                                <button
                                  onClick={handleRenamePipeline}
                                  className="p-1 rounded-md bg-primary text-black"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => setEditingPipelineId(null)}
                                  className="p-1 rounded-md border border-border hover:bg-muted text-muted-foreground"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span className="text-xs font-bold text-neutral-200 truncate">{p.nome}</span>
                                  {p.isDefault && (
                                    <span className="text-[8px] font-extrabold bg-primary/10 text-primary border border-primary/20 px-1 py-0.5 rounded">
                                      Padrão
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                                  {!p.isDefault && (
                                    <button
                                      onClick={() => handleSetDefaultPipeline(p.id)}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-primary"
                                      title="Tornar funil padrão"
                                    >
                                      <Star className="w-3 h-3" />
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setEditingPipelineId(p.id)
                                      setEditingPipelineName(p.nome)
                                    }}
                                    className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                                    title="Renomear"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                  {pipelines.length > 1 && (
                                    <button
                                      onClick={() => handleDeletePipeline(p.id)}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400"
                                      title="Excluir funil"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* COLUMN 2: Stages drag and drop */}
                <div className="lg:col-span-7 p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl space-y-4">
                  <div className="flex items-center justify-between border-b border-border/20 pb-3">
                    <div>
                      <h3 className="text-xs font-bold text-neutral-200">Etapas do Funil Selecionado</h3>
                      <p className="text-[9px] text-muted-foreground mt-0.5">Arraste para reordenar o fluxo</p>
                    </div>

                    {!isAddingStage && (
                      <button
                        onClick={handleOpenAddStage}
                        className="px-2.5 py-1.5 rounded-xl bg-primary text-black font-extrabold text-[10px] flex items-center gap-1 hover:shadow-md active:scale-95 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Adicionar Etapa
                      </button>
                    )}
                  </div>

                  {/* Stage deleting migration warning overlay */}
                  {deletingStage && (
                    <div className="p-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 space-y-3 animate-fade-in">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="text-xs font-bold text-amber-400">Migração de Negócios Pendente</p>
                          <p className="text-[11px] text-muted-foreground mt-0.5">
                            A etapa <strong className="text-neutral-200">&quot;{deletingStage.nome}&quot;</strong> possui{' '}
                            <strong className="text-primary">{deals.filter(d => d.stageId === deletingStage.id).length} negócios ativos</strong>.{' '}
                            Transfira-os para outra etapa antes de prosseguir com a exclusão.
                          </p>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="ocr-label">Estágio de Destino</label>
                        <select
                          value={migrationStageId}
                          onChange={e => setMigrationStageId(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                        >
                          <option value="">-- Selecione uma etapa --</option>
                          {stages.filter(s => s.id !== deletingStage.id).map(s => (
                            <option key={s.id} value={s.id}>{s.nome}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex justify-end gap-2 text-[10px] pt-1">
                        <button
                          onClick={() => {
                            setDeletingStage(null)
                            setMigrationStageId('')
                          }}
                          className="px-3 py-1.5 rounded-lg border border-border hover:bg-card text-muted-foreground"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => executeDeleteStage(deletingStage.id, migrationStageId)}
                          disabled={!migrationStageId}
                          className="px-3 py-1.5 rounded-lg bg-rose-500 text-foreground font-bold hover:bg-rose-600 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Migrar e Confirmar Exclusão
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Add Stage Form inline */}
                  {isAddingStage && (
                    <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-4 animate-scale-in">
                      <span className="text-xs font-bold text-primary block">
                        {editingStageId ? 'Editar Parâmetros da Etapa' : 'Nova Etapa do Funil'}
                      </span>
                      
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="ocr-label mb-1 block">Nome da Etapa</label>
                          <input
                            type="text"
                            placeholder="Ex: Demonstração Agendada"
                            value={stageForm.nome}
                            onChange={e => setStageForm(p => ({ ...p, nome: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="ocr-label mb-1 block">Probabilidade (%)</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={stageForm.probabilidade}
                            onChange={e => setStageForm(p => ({ ...p, probabilidade: Math.max(0, Math.min(100, parseInt(e.target.value) || 0)) }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                          />
                        </div>
                        <div>
                          <label className="ocr-label mb-1 block">SLA de Atendimento (horas)</label>
                          <input
                            type="number"
                            min="1"
                            value={stageForm.slaHours}
                            onChange={e => setStageForm(p => ({ ...p, slaHours: Math.max(1, parseInt(e.target.value) || 0) }))}
                            className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                          />
                        </div>
                      </div>

                      {/* Color list */}
                      <div>
                        <label className="ocr-label mb-1.5 block">Cor da Etapa</label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {BEAUTIFUL_COLORS.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setStageForm(p => ({ ...p, cor: c }))}
                              className={`w-6 h-6 rounded-full border-2 transition-all ${stageForm.cor === c ? 'border-white scale-110' : 'border-transparent hover:scale-105'}`}
                              style={{ backgroundColor: c }}
                            />
                          ))}
                          <div className="relative w-6 h-6 rounded-full overflow-hidden border border-border hover:scale-105 transition-transform cursor-pointer">
                            <input
                              type="color"
                              value={stageForm.cor}
                              onChange={e => setStageForm(p => ({ ...p, cor: e.target.value }))}
                              className="absolute inset-0 w-full h-full p-0 border-0 cursor-pointer scale-150"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 text-xs">
                        <button
                          onClick={() => {
                            setIsAddingStage(false)
                            setEditingStageId(null)
                          }}
                          className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={handleSaveStage}
                          className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                        >
                          {editingStageId ? 'Salvar Etapa' : 'Adicionar Etapa'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Drag and Drop list context */}
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                      <div className="space-y-2">
                        {stages.map(s => {
                          const dealCount = deals.filter(d => d.stageId === s.id).length
                          return (
                            <SortableStageItem
                              key={s.id}
                              stage={s}
                              onEdit={handleOpenEditStage}
                              onDelete={handleDeleteStageClick}
                              dealCount={dealCount}
                            />
                          )
                        })}
                      </div>
                    </SortableContext>
                  </DndContext>
                </div>
              </div>
            </div>
          )}

          {/* 3. INTEGRAÇÕES TAB */}
          {tab === 'integracao' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary" />
                    Central de Integrações (Webhooks)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Monitore logs de requisições, endpoints públicos e callbacks n8n</p>
                </div>

                {!showAddIntegration && (
                  <button
                    onClick={() => setShowAddIntegration(true)}
                    className="px-3 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5 hover:shadow-lg transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Nova Integração
                  </button>
                )}
              </div>

              {/* Add Integration Form */}
              {showAddIntegration && (
                <div className="p-5 rounded-3xl border border-primary/20 bg-primary/5 space-y-4 animate-scale-in max-w-xl mx-auto">
                  <span className="text-xs font-bold text-primary block uppercase tracking-wider">Nova Integração</span>
                  <div className="space-y-3">
                    <div>
                      <label className="ocr-label mb-1.5 block">Nome da Integração</label>
                      <input
                        type="text"
                        placeholder="Ex: Elementor Lead Forms"
                        value={integrationForm.nome}
                        onChange={e => setIntegrationForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                      />
                    </div>
                    <div>
                      <label className="ocr-label mb-1.5 block">Tipo</label>
                      <select
                        value={integrationForm.tipo}
                        onChange={e => setIntegrationForm(p => ({ ...p, tipo: e.target.value as IntegrationTipo }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                      >
                        <option value="inbound_webhook">Inbound Webhook (Recebe leads externos)</option>
                        <option value="outbound_api">Outbound API (Envia dados / Webhooks externos)</option>
                      </select>
                    </div>
                    {integrationForm.tipo === 'outbound_api' && (
                      <div>
                        <label className="ocr-label mb-1.5 block">Base URL / Endpoint da API</label>
                        <input
                          type="text"
                          placeholder="https://n8n.exemplo.com/webhook/disparos"
                          value={integrationForm.baseUrl}
                          onChange={e => setIntegrationForm(p => ({ ...p, baseUrl: e.target.value }))}
                          className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-2">
                    <button
                      onClick={() => setShowAddIntegration(false)}
                      className="px-3 py-2 rounded-xl border border-border text-muted-foreground hover:bg-card"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateIntegration}
                      className="px-3 py-2 rounded-xl bg-primary text-black font-bold hover:opacity-90"
                    >
                      Cadastrar
                    </button>
                  </div>
                </div>
              )}

              {/* Integrations Grid */}
              <div className="space-y-4">
                {integrations.map(int => (
                  <div
                    key={int.id}
                    className="p-5 rounded-3xl border border-border/25 bg-[#0d0d11]/80 backdrop-blur-xl space-y-4 transition-all hover:border-border/45"
                  >
                    <div className="flex items-center justify-between border-b border-border/20 pb-3">
                      <div>
                        <h3 className="font-bold text-sm text-neutral-200">{int.nome}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border ${
                            int.tipo === 'inbound_webhook'
                              ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                              : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                          }`}>
                            {int.tipo === 'inbound_webhook' ? 'Inbound Webhook' : 'Outbound API'}
                          </span>
                          <span className="text-[9px] text-muted-foreground">ID: {int.id}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Toggle active */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-muted-foreground">{int.ativo ? 'Ativo' : 'Inativo'}</span>
                          <button
                            onClick={() => handleToggleIntegration(int.id, int.ativo)}
                            className={`w-9 h-5 rounded-full p-0.5 transition-all ${
                              int.ativo ? 'bg-primary flex justify-end' : 'bg-muted flex justify-start'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-card block shadow" />
                          </button>
                        </div>

                        <button
                          onClick={() => handleDeleteIntegration(int.id)}
                          className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-rose-400 transition-colors"
                          title="Excluir integração"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Integration details */}
                    {int.tipo === 'outbound_api' && (
                      <div className="p-3.5 rounded-2xl bg-card/40 border border-border/20 text-xs">
                        <span className="ocr-label">Base URL Configurada:</span>
                        <code className="text-primary block font-mono mt-1 text-[11px] select-all break-all">{int.baseUrl}</code>
                      </div>
                    )}

                    {int.tipo === 'inbound_webhook' && (
                      <div className="space-y-4">
                        {/* Webhook Endpoints section */}
                        <div className="flex items-center justify-between border-t border-border/10 pt-3">
                          <span className="text-[10px] font-extrabold text-neutral-300 uppercase tracking-wider">Caminhos / Endpoints Ativos</span>
                          {showAddEndpoint !== int.id && (
                            <button
                              onClick={() => {
                                setShowAddEndpoint(int.id)
                                setEndpointForm({ path: '', secretToken: '', sourceSystem: 'elementor' })
                              }}
                              className="text-[10px] font-extrabold text-primary flex items-center gap-1 hover:underline"
                            >
                              <Plus className="w-3.5 h-3.5" /> Adicionar Endpoint
                            </button>
                          )}
                        </div>

                        {/* Add Endpoint dialog inline */}
                        {showAddEndpoint === int.id && (
                          <div className="p-4 rounded-2xl border border-primary/20 bg-primary/5 space-y-3 animate-scale-in">
                            <span className="text-[10px] font-extrabold text-primary block">Configurar Novo Endpoint</span>
                            <div className="grid grid-cols-3 gap-3">
                              <div>
                                <label className="ocr-label mb-1 block">Identificador (slug)</label>
                                <input
                                  type="text"
                                  placeholder="carlos-leads"
                                  value={endpointForm.path}
                                  onChange={e => setEndpointForm(p => ({ ...p, path: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none text-foreground"
                                />
                              </div>
                              <div>
                                <label className="ocr-label mb-1 block">Token de Segurança (Opcional)</label>
                                <input
                                  type="text"
                                  placeholder="sec-xyz..."
                                  value={endpointForm.secretToken}
                                  onChange={e => setEndpointForm(p => ({ ...p, secretToken: e.target.value }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none text-foreground"
                                />
                              </div>
                              <div>
                                <label className="ocr-label mb-1 block">Sistema Origem</label>
                                <select
                                  value={endpointForm.sourceSystem}
                                  onChange={e => setEndpointForm(p => ({ ...p, sourceSystem: e.target.value as EndpointSourceSystem }))}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-card text-xs focus:outline-none text-foreground"
                                >
                                  <option value="elementor">Elementor Forms</option>
                                  <option value="facebook_leads">Meta Lead Ads</option>
                                  <option value="n8n">n8n Workflow</option>
                                  <option value="custom">API Customizada</option>
                                </select>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 text-[10px]">
                              <button
                                onClick={() => setShowAddEndpoint(null)}
                                className="px-2.5 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                              >
                                Cancelar
                              </button>
                              <button
                                onClick={() => handleAddEndpoint(int.id)}
                                className="px-2.5 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                              >
                                Cadastrar
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Endpoints List */}
                        <div className="space-y-2">
                          {(int.endpoints || []).map(ep => {
                            const absoluteUrl = `http://localhost:3000/api/webhook/inbound/${ep.path}`
                            const isAccordionOpen = activeAccordionLog === ep.id
                            const logs = webhookLogsMap[ep.id] || []

                            return (
                              <div
                                key={ep.id}
                                className="p-3.5 rounded-2xl border border-border/20 bg-card/20 space-y-3"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <span className="text-xs font-bold text-neutral-300 block truncate">/api/webhook/inbound/{ep.path}</span>
                                    <span className="text-[10px] text-muted-foreground block mt-0.5">
                                      Origem: <strong className="text-neutral-400 capitalize">{ep.sourceSystem}</strong> • Secret: {ep.secretToken || 'Sem token'}
                                    </span>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => handleToggleAccordionLog(ep.id)}
                                      className="px-2 py-1 rounded-lg border border-border/30 hover:bg-muted text-[10px] font-bold text-muted-foreground hover:text-foreground flex items-center gap-1 transition-all"
                                    >
                                      <Activity className="w-3.5 h-3.5 text-primary animate-pulse" />
                                      {isAccordionOpen ? 'Fechar Logs' : 'Ver Logs'}
                                    </button>

                                    <button
                                      onClick={() => {
                                        navigator.clipboard.writeText(absoluteUrl)
                                        toast.success('URL copiada!')
                                      }}
                                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
                                      title="Copiar URL"
                                    >
                                      <Copy className="w-3.5 h-3.5" />
                                    </button>

                                    <button
                                      onClick={() => handleDeleteEndpoint(ep.id)}
                                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-400 transition-all"
                                      title="Remover endpoint"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                {/* Accordion Logs View */}
                                {isAccordionOpen && (
                                  <div className="pt-3 border-t border-border/10 space-y-3 animate-fade-in">
                                    <span className="text-[9px] font-extrabold uppercase text-primary tracking-widest block">Registro de Eventos Recebidos (Logs)</span>
                                    
                                    {logs.length === 0 ? (
                                      <div className="text-center py-5 text-[11px] text-muted-foreground italic border border-dashed border-border/10 rounded-xl">
                                        Nenhum evento registrado para este endpoint.
                                      </div>
                                    ) : (
                                      <div className="space-y-2 max-h-[250px] overflow-y-auto scrollbar-thin">
                                        {logs.map(log => (
                                          <div
                                            key={log.id}
                                            className="p-3 rounded-xl border border-border/20 bg-card/60 flex flex-col gap-2"
                                          >
                                            <div className="flex items-center justify-between text-[9px]">
                                              <span className={`font-bold px-1.5 py-0.5 rounded ${
                                                log.status === 'SUCCESS' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                                              }`}>
                                                {log.status}
                                              </span>
                                              <span className="text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleString('pt-BR')}
                                              </span>
                                            </div>
                                            <pre className="text-[10px] text-neutral-300 font-mono bg-card p-2.5 rounded-lg overflow-x-auto whitespace-pre">
                                              {log.payload}
                                            </pre>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Snippet Example */}
                                    <div className="p-3.5 rounded-xl border border-border/15 bg-card/60 space-y-2">
                                      <span className="text-[10px] font-bold text-neutral-300 block">Payload Esperado (Inbound Lead JSON)</span>
                                      <pre className="text-[9px] text-neutral-400 font-mono bg-card p-2 rounded-lg select-all">
{`{
  "nome": "Ricardo",
  "sobrenome": "Almeida",
  "telefone": "5562998881234",
  "email": "ricardo@almeida.com",
  "utm_source": "Google Ads",
  "utm_medium": "cpc",
  "utm_campaign": "Automação",
  "campos_customizados": {
    "empresa": "Almeida Tech",
    "cargo": "CEO"
  }
}`}
                                      </pre>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. CATEGORIAS TAB */}
          {tab === 'categorias' && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                  <Tag className="w-5 h-5 text-primary" />
                  Gerenciar Categorias
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">Configure os Produtos, Origens e Tags globais do sistema</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Products */}
                <div className="p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl">
                  <h3 className="text-sm font-bold text-foreground mb-4">Produtos de Interesse</h3>
                  <div className="space-y-3">
                    {categoriesStore.categories.products.map(p => (
                      <div key={p} className="flex items-center justify-between p-2 rounded-xl border border-border/20 bg-muted/40">
                        <span className="text-xs text-neutral-300 font-medium">{p}</span>
                        <button onClick={() => categoriesStore.removeProduct(p)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Novo produto..."
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            categoriesStore.addProduct(e.currentTarget.value)
                            e.currentTarget.value = ''
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Origins */}
                <div className="p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl">
                  <h3 className="text-sm font-bold text-foreground mb-4">Origens dos Leads</h3>
                  <div className="space-y-3">
                    {categoriesStore.categories.origins.map(o => (
                      <div key={o} className="flex items-center justify-between p-2 rounded-xl border border-border/20 bg-muted/40">
                        <span className="text-xs text-neutral-300 font-medium">{o}</span>
                        <button onClick={() => categoriesStore.removeOrigin(o)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Nova origem..."
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            categoriesStore.addOrigin(e.currentTarget.value)
                            e.currentTarget.value = ''
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl">
                  <h3 className="text-sm font-bold text-foreground mb-4">Tags</h3>
                  <div className="space-y-3">
                    {categoriesStore.categories.tags.map(t => (
                      <div key={t.label} className="flex items-center justify-between p-2 rounded-xl border border-border/20 bg-muted/40">
                        <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                          <span className="text-xs text-neutral-300 font-medium">{t.label}</span>
                        </div>
                        <button onClick={() => categoriesStore.removeTag(t.label)} className="p-1 hover:bg-muted rounded-lg text-muted-foreground hover:text-rose-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="text"
                        placeholder="Nova tag..."
                        className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none"
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            const val = e.currentTarget.value.trim()
                            if (val) {
                              categoriesStore.addTag({ label: val, color: BEAUTIFUL_COLORS[Math.floor(Math.random() * BEAUTIFUL_COLORS.length)] })
                              e.currentTarget.value = ''
                            }
                          }
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}


          {/* 6. DISPARO TAB */}
          {tab === 'disparo' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                    <Zap className="w-5 h-5 text-primary animate-pulse" />
                    Canais de Disparo (Caixa Rápido)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Gerencie webhooks de envio em massa de mensagens automáticas vinculados aos seus funis</p>
                </div>

                {!showAddChannel && (
                  <button
                    onClick={() => {
                      setChannelForm({ nome: '', tipo: 'webhook', urlWebhook: '', pipelineId: pipelines[0]?.id || '', ativo: true })
                      setEditingChannelId(null)
                      setShowAddChannel(true)
                    }}
                    className="px-3.5 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5 hover:shadow-lg transition-all active:scale-95 hover:shadow-primary/20"
                  >
                    <Plus className="w-4 h-4" /> Novo Canal
                  </button>
                )}
              </div>

              {/* Form container */}
              {showAddChannel && (
                <div className="p-6 rounded-3xl border border-primary/25 bg-primary/5 space-y-4 max-w-2xl mx-auto animate-scale-in">
                  <span className="text-xs font-bold text-primary block uppercase tracking-wider">
                    {editingChannelId ? 'Editar Canal de Disparo' : 'Novo Canal de Disparo'}
                  </span>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="ocr-label mb-1.5 block font-bold text-neutral-300 text-[11px]">Nome do Canal</label>
                      <input
                        type="text"
                        placeholder="Ex: Disparo Leads Quentes n8n"
                        value={channelForm.nome}
                        onChange={e => setChannelForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground"
                      />
                    </div>
                    
                    <div className="col-span-2">
                      <label className="ocr-label mb-1.5 block font-bold text-neutral-300 text-[11px]">URL do Webhook (Destinatário)</label>
                      <input
                        type="text"
                        placeholder="https://n8n.netlife.com/webhook/..."
                        value={channelForm.urlWebhook}
                        onChange={e => setChannelForm(p => ({ ...p, urlWebhook: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground font-mono"
                      />
                    </div>

                    <div>
                      <label className="ocr-label mb-1.5 block font-bold text-neutral-300 text-[11px]">Funil Vinculado (Pipeline)</label>
                      <select
                        value={channelForm.pipelineId}
                        onChange={e => setChannelForm(p => ({ ...p, pipelineId: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                      >
                        <option value="" disabled>-- Selecione um funil --</option>
                        {pipelines.map(p => (
                          <option key={p.id} value={p.id}>
                            {p.nome} {p.isDefault ? '(Padrão)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 pt-6">
                      <button
                        onClick={() => setChannelForm(p => ({ ...p, ativo: !p.ativo }))}
                        className={`w-9 h-5 rounded-full p-0.5 transition-all ${
                          channelForm.ativo ? 'bg-primary flex justify-end' : 'bg-muted flex justify-start'
                        }`}
                      >
                        <span className="w-4 h-4 rounded-full bg-card block shadow" />
                      </button>
                      <span className="text-xs text-muted-foreground">Status do Canal: <strong className={channelForm.ativo ? 'text-primary' : 'text-neutral-400'}>{channelForm.ativo ? 'Ativo' : 'Inativo'}</strong></span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-3">
                    <button
                      onClick={() => {
                        setShowAddChannel(false)
                        setEditingChannelId(null)
                      }}
                      className="px-3.5 py-2 rounded-xl border border-border text-muted-foreground hover:bg-card transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveChannel}
                      className="px-4 py-2 rounded-xl bg-primary text-black font-extrabold hover:opacity-90 active:scale-95 transition-all"
                    >
                      Salvar Canal
                    </button>
                  </div>
                </div>
              )}

              {/* Channels List Grid */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Canais Ativos</h3>
                {channels.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-muted-foreground italic border border-dashed border-border/10 rounded-2xl bg-card/10">
                    Nenhum canal de disparo configurado. Crie um canal acima.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-4">
                    {channels.map(chan => {
                      const pipeName = pipelines.find(p => p.id === chan.pipelineId)?.nome || 'Funil não encontrado'
                      return (
                        <div
                          key={chan.id}
                          className="p-5 rounded-3xl border border-border/25 bg-[#0d0d11]/80 backdrop-blur-xl space-y-4 transition-all hover:border-border/45"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <h4 className="font-bold text-sm text-neutral-200">{chan.nome}</h4>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded border bg-primary/10 text-primary border-primary/20">
                                  {pipeName}
                                </span>
                                <span className="text-[9px] text-muted-foreground">Criado em {new Date(chan.createdAt).toLocaleDateString('pt-BR')}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {/* Toggle active */}
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-muted-foreground">{chan.ativo ? 'Ativo' : 'Inativo'}</span>
                                <button
                                  onClick={() => handleToggleChannel(chan.id)}
                                  className={`w-9 h-5 rounded-full p-0.5 transition-all ${
                                    chan.ativo ? 'bg-primary flex justify-end' : 'bg-muted flex justify-start'
                                  }`}
                                >
                                  <span className="w-4 h-4 rounded-full bg-card block shadow" />
                                </button>
                              </div>

                              <button
                                onClick={() => handleEditChannel(chan)}
                                className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                                title="Editar canal"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>

                              <button
                                onClick={() => handleDeleteChannel(chan.id)}
                                className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-rose-400 transition-colors"
                                title="Excluir canal"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-card/40 border border-border/20 text-xs">
                            <div className="min-w-0 flex-1">
                              <span className="ocr-label text-[10px] font-bold text-neutral-400">Webhook URL:</span>
                              <code className="text-primary block font-mono mt-1 text-[11px] select-all truncate">{chan.urlWebhook}</code>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(chan.urlWebhook)
                                  toast.success('URL do webhook copiada!')
                                }}
                                className="p-2 rounded-xl hover:bg-neutral-805 text-muted-foreground hover:text-foreground transition-colors"
                                title="Copiar URL"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleSimulateDisparo(chan)}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-primary text-black font-extrabold text-[10px] hover:shadow-lg hover:shadow-primary/10 transition-all active:scale-95"
                              >
                                <Send className="w-3 h-3" /> Simular Disparo
                              </button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Execution Logs Section */}
              <div className="space-y-4 border-t border-border/10 pt-6">
                <h3 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">Histórico de Disparos (Logs)</h3>
                
                {disparoLogs.length === 0 ? (
                  <div className="text-center py-8 text-[11px] text-muted-foreground italic border border-dashed border-border/10 rounded-2xl bg-card/10">
                    Nenhum log de disparo registrado.
                  </div>
                ) : (
                  <div className="p-4 rounded-3xl border border-border/20 bg-[#0d0d11]/80 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead>
                          <tr className="border-b border-border/20 text-muted-foreground font-bold">
                            <th className="pb-3 pr-4">Data/Hora</th>
                            <th className="pb-3 pr-4">Canal</th>
                            <th className="pb-3 pr-4 text-center">Leads</th>
                            <th className="pb-3 pr-4">Status</th>
                            <th className="pb-3">Retorno / Detalhes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/10">
                          {disparoLogs.map(log => (
                            <tr key={log.id} className="hover:bg-card/35 transition-colors">
                              <td className="py-3 pr-4 text-neutral-300 whitespace-nowrap">
                                {new Date(log.timestamp).toLocaleString('pt-BR')}
                              </td>
                              <td className="py-3 pr-4 font-semibold text-neutral-200">
                                {log.channelNome}
                              </td>
                              <td className="py-3 pr-4 text-center text-primary font-bold">
                                {log.leadsCount}
                              </td>
                              <td className="py-3 pr-4">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-[9px] border ${
                                  log.status === 'SUCESSO'
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}>
                                  {log.status}
                                </span>
                              </td>
                              <td className="py-3 text-muted-foreground font-mono max-w-[200px] truncate" title={log.mensagem}>
                                {log.mensagem || 'Disparo enviado com sucesso.'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 7. ADMIN: USUÁRIOS TAB */}
          {tab === 'usuarios' && currentUser && currentUser.role === 'ADMIN' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    Gerenciamento de Usuários
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Controle de acessos, privilégios administrativos e permissões de features</p>
                </div>

                {!showAddUser && (
                  <button
                    onClick={() => setShowAddUser(true)}
                    className="px-3 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5 hover:shadow-lg active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Novo Usuário
                  </button>
                )}
              </div>

              {/* Add User form dialog inline */}
              {showAddUser && (
                <div className="p-5 rounded-3xl border border-primary/20 bg-primary/5 space-y-4 max-w-xl mx-auto animate-scale-in">
                  <span className="text-xs font-bold text-primary block uppercase tracking-wider">Novo Cadastro de Usuário</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="ocr-label mb-1 block">Nome Completo</label>
                      <input
                        type="text"
                        placeholder="Ex: Aline Ferreira"
                        value={userForm.nome}
                        onChange={e => setUserForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground font-semibold"
                      />
                    </div>
                    <div>
                      <label className="ocr-label mb-1 block">E-mail (Login)</label>
                      <input
                        type="email"
                        placeholder="aline@caixarapido.com"
                        value={userForm.email}
                        onChange={e => setUserForm(p => ({ ...p, email: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                      />
                    </div>
                    <div>
                      <label className="ocr-label mb-1 block">Senha Provisória</label>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={userForm.password}
                        onChange={e => setUserForm(p => ({ ...p, password: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                      />
                    </div>
                    <div>
                      <label className="ocr-label mb-1 block">Perfil / Regra</label>
                      <select
                        value={userForm.role}
                        onChange={e => setUserForm(p => ({ ...p, role: e.target.value as UserRole }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                      >
                        <option value="USER">User (Vendedor)</option>
                        <option value="MODERATOR">Moderator (Gerente)</option>
                        <option value="ADMIN">Admin (Diretor)</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-1">
                    <button
                      onClick={() => setShowAddUser(false)}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateUser}
                      className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                    >
                      Cadastrar
                    </button>
                  </div>
                </div>
              )}

              {/* Users list and permissions matrix */}
              <div className="space-y-4">
                {users.map(u => (
                  <div
                    key={u.id}
                    className="p-5 rounded-3xl border border-border/25 bg-[#0d0d11]/85 space-y-4"
                  >
                    <div className="flex items-center justify-between border-b border-border/15 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary">
                          {u.nome ? u.nome[0] : 'U'}
                        </div>
                        <div>
                          <span className="font-bold text-sm text-neutral-200 block">{u.nome} {u.sobrenome || ''}</span>
                          <span className="text-[11px] text-muted-foreground">{u.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <select
                          value={u.role}
                          onChange={e => handleUpdateUserRole(u.id, e.target.value as UserRole)}
                          className="px-2.5 py-1.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer font-semibold"
                        >
                          <option value="USER">Vendedor (USER)</option>
                          <option value="MODERATOR">Gerente (MODERATOR)</option>
                          <option value="ADMIN">Diretor (ADMIN)</option>
                        </select>

                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          disabled={u.id === currentUser.id}
                          className="p-2 rounded-xl hover:bg-card text-muted-foreground hover:text-rose-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Permissions Matrix */}
                    <div className="space-y-3">
                      <span className="text-[10px] font-extrabold text-neutral-300 uppercase tracking-wider block">Matriz de Permissões de Acesso</span>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {[
                          { key: 'dashboard', label: 'Painel Geral' },
                          { key: 'pipeline', label: 'Kanban Pipelines' },
                          { key: 'contacts', label: 'Lista de Contatos' },
                          { key: 'activities', label: 'Compromissos' },
                          { key: 'listas-disparo', label: 'Caixa Rápido' },
                          { key: 'lead-search-google', label: 'Google Maps' },
                          { key: 'lead-search-cnpj', label: 'CNPJ Search' },
                          { key: 'ai-insights', label: 'Qualificação IA' }
                        ].map(feat => {
                          const isPermitted = (u.permissions || []).includes(feat.key)
                          return (
                            <button
                              key={feat.key}
                              type="button"
                              onClick={() => handleToggleUserPermission(u, feat.key)}
                              className={`flex items-center justify-between p-2 rounded-xl border text-[10px] font-semibold transition-all ${
                                isPermitted
                                  ? 'bg-primary/5 border-primary/40 text-primary'
                                  : 'border-border/30 bg-muted/40 text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              <span>{feat.label}</span>
                              {isPermitted ? <CheckSquare className="w-3.5 h-3.5 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0 text-muted-foreground/60" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Change password */}
                    <div className="flex items-center gap-2 pt-1 border-t border-border/10">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground shrink-0">Nova senha</span>
                      <input
                        type="password"
                        placeholder="••••••••"
                        value={passwordEdit[u.id] ?? ''}
                        onChange={e => setPasswordEdit(p => ({ ...p, [u.id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground"
                      />
                      <button
                        onClick={() => handleUpdatePassword(u.id)}
                        disabled={!passwordEdit[u.id]}
                        className="px-3 py-1.5 rounded-xl bg-primary text-black font-bold text-[10px] disabled:opacity-40 hover:opacity-90 transition-all shrink-0"
                      >
                        <Save className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 8. ADMIN: TIMES TAB */}
          {tab === 'times' && currentUser && currentUser.role === 'ADMIN' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                    <Users className="w-5 h-5 text-primary" />
                    Gestão de Times e Equipes
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Agrupe vendedores sob a liderança de gerentes e diretores</p>
                </div>

                {!showAddTeam && (
                  <button
                    onClick={() => setShowAddTeam(true)}
                    className="px-3 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5 hover:shadow-lg active:scale-95 transition-all"
                  >
                    <Plus className="w-4 h-4" /> Criar Equipe
                  </button>
                )}
              </div>

              {/* Add Team Inline form */}
              {showAddTeam && (
                <div className="p-5 rounded-3xl border border-primary/20 bg-primary/5 space-y-4 max-w-xl mx-auto animate-scale-in">
                  <span className="text-xs font-bold text-primary block uppercase tracking-wider">Novo Time Comercial</span>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="ocr-label mb-1 block">Nome do Time</label>
                      <input
                        type="text"
                        placeholder="Ex: Vendas High Ticket Sul"
                        value={teamForm.nome}
                        onChange={e => setTeamForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground font-semibold"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="ocr-label mb-1 block">Proprietário / Líder (Owner)</label>
                      <select
                        value={teamForm.ownerUserId}
                        onChange={e => setTeamForm(p => ({ ...p, ownerUserId: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                      >
                        <option value="">-- Selecione o líder --</option>
                        {users.map(u => (
                          <option key={u.id} value={u.id}>{u.nome} {u.sobrenome || ''} ({u.role})</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-1">
                    <button
                      onClick={() => setShowAddTeam(false)}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleCreateTeam}
                      className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                    >
                      Criar Time
                    </button>
                  </div>
                </div>
              )}

              {/* Teams Dashboard */}
              {teams.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground border border-dashed border-border/25 rounded-2xl bg-card/10">
                  Nenhum time comercial criado.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  {/* Select team */}
                  <div className="lg:col-span-5 p-4 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl space-y-3">
                    <span className="text-[10px] font-extrabold text-neutral-300 uppercase tracking-widest block border-b border-border/10 pb-2">Selecione o Time</span>
                    <div className="space-y-1.5">
                      {teams.map(t => (
                        <div
                          key={t.id}
                          onClick={() => setSelectedTeamId(t.id)}
                          className={`p-3 rounded-xl border cursor-pointer flex items-center justify-between transition-all ${
                            selectedTeamId === t.id
                              ? 'bg-primary/5 border-primary/45 text-primary'
                              : 'border-border/10 bg-muted/30 text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          <span className="text-xs font-bold truncate max-w-[150px]">{t.nome}</span>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              handleDeleteTeam(t.id)
                            }}
                            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Manage members of selected team */}
                  <div className="lg:col-span-7 p-5 rounded-3xl border border-border/30 bg-[#0d0d11]/80 backdrop-blur-xl space-y-4">
                    {selectedTeam ? (
                      <>
                        <div className="border-b border-border/20 pb-3">
                          <h3 className="font-bold text-sm text-neutral-200">{selectedTeam.nome}</h3>
                          <span className="text-[10px] text-muted-foreground mt-0.5">
                            Líder do Time: <strong className="text-neutral-300">
                              {users.find(u => u.id === selectedTeam.ownerUserId)?.nome || 'Não definido'}
                            </strong>
                          </span>
                        </div>

                        {/* Add member selector */}
                        <div className="space-y-2">
                          <label className="ocr-label">Adicionar Vendedor ao Time</label>
                          <div className="flex gap-2">
                            <select
                              id="add-member-select"
                              className="flex-1 px-3 py-2 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                              defaultValue=""
                            >
                              <option value="" disabled>-- Selecione um usuário --</option>
                              {users
                                .filter(u => !(selectedTeam.members || []).includes(u.id))
                                .map(u => (
                                  <option key={u.id} value={u.id}>
                                    {u.nome} {u.sobrenome || ''} ({u.role})
                                  </option>
                                ))
                              }
                            </select>
                            <button
                              onClick={() => {
                                const selectEl = document.getElementById('add-member-select') as HTMLSelectElement
                                if (selectEl) {
                                  handleAddTeamMember(selectedTeam.id, selectEl.value)
                                  selectEl.value = ''
                                }
                              }}
                              className="px-3.5 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:opacity-90 shrink-0 transition-all active:scale-95"
                            >
                              Adicionar
                            </button>
                          </div>
                        </div>

                        {/* Members list */}
                        <div className="space-y-2 pt-3">
                          <span className="text-[10px] font-extrabold text-neutral-300 uppercase tracking-wider block">Integrantes do Time</span>
                          {(selectedTeam.members || []).length === 0 ? (
                            <span className="text-[10px] text-muted-foreground italic pl-1">Vazio</span>
                          ) : (
                            <div className="space-y-1.5 max-h-[250px] overflow-y-auto scrollbar-thin">
                              {(selectedTeam.members || []).map(mId => {
                                const usr = users.find(u => u.id === mId)
                                if (!usr) return null
                                return (
                                  <div
                                    key={mId}
                                    className="p-3.5 rounded-xl border border-border/20 bg-card/20 flex items-center justify-between gap-3 hover:border-border/40 transition-all animate-fade-in"
                                  >
                                    <div className="min-w-0">
                                      <span className="text-xs font-bold text-neutral-200 block truncate">{usr.nome} {usr.sobrenome || ''}</span>
                                      <span className="text-[10px] text-muted-foreground">{usr.email}</span>
                                    </div>
                                    <button
                                      onClick={() => handleRemoveTeamMember(selectedTeam.id, mId)}
                                      className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-rose-400"
                                      title="Remover integrante"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="text-center py-10 text-xs text-muted-foreground italic">
                        Selecione um time ao lado para gerenciar seus integrantes.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 8. TEMPLATES TAB */}
          {tab === 'templates' && (
            <div className="space-y-6 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold tracking-wide text-neutral-100 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-primary" />
                    Templates de Mensagem
                  </h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Gerencie os modelos de mensagens pré-definidos para disparos em lote</p>
                </div>

                {!showAddTemplate && (
                  <button
                    onClick={() => {
                      setTemplateForm({ nome: '', categoria: 'Sondagem', corpo: '' })
                      setEditingTemplate(null)
                      setShowAddTemplate(true)
                    }}
                    className="px-3 py-2 rounded-xl bg-primary text-black font-extrabold text-xs flex items-center gap-1.5 hover:shadow-lg transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" /> Novo Template
                  </button>
                )}
              </div>

              {/* Add/Edit Template form */}
              {showAddTemplate && (
                <div className="p-5 rounded-3xl border border-primary/20 bg-primary/5 space-y-4 max-w-xl mx-auto animate-scale-in">
                  <span className="text-xs font-bold text-primary block uppercase tracking-wider">
                    {editingTemplate ? 'Editar Template de Mensagem' : 'Novo Template de Mensagem'}
                  </span>
                  
                  <div className="space-y-3">
                    <div>
                      <label className="ocr-label mb-1.5 block">Nome do Template</label>
                      <input
                        type="text"
                        placeholder="Ex: Sondagem de Faturamento inicial"
                        value={templateForm.nome}
                        onChange={e => setTemplateForm(p => ({ ...p, nome: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground font-semibold"
                      />
                    </div>

                    <div>
                      <label className="ocr-label mb-1.5 block">Categoria</label>
                      <select
                        value={templateForm.categoria}
                        onChange={e => setTemplateForm(p => ({ ...p, categoria: e.target.value }))}
                        className="w-full px-3 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground cursor-pointer"
                      >
                        <option value="Sondagem">Sondagem</option>
                        <option value="Follow-up">Follow-up</option>
                        <option value="Recuperação">Recuperação</option>
                        <option value="Reativação">Reativação</option>
                        <option value="Personalizado">Personalizado</option>
                      </select>
                    </div>

                    <div>
                      <label className="ocr-label mb-1 block">Variáveis Disponíveis</label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {['{nome}', '{primeiro_nome}', '{ramo}', '{faturamento}'].map(variable => (
                          <button
                            key={variable}
                            type="button"
                            onClick={() => setTemplateForm(p => ({ ...p, corpo: p.corpo + variable }))}
                            className="px-2 py-1 rounded bg-card border border-border/20 text-xs text-primary hover:bg-card transition-colors"
                          >
                            {variable}
                          </button>
                        ))}
                      </div>
                      <label className="ocr-label mb-1.5 block">Corpo da Mensagem</label>
                      <textarea
                        rows={6}
                        placeholder="Escreva a mensagem aqui..."
                        value={templateForm.corpo}
                        onChange={e => setTemplateForm(p => ({ ...p, corpo: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl border border-border bg-card text-xs focus:outline-none text-foreground font-mono"
                      />
                    </div>

                    <div className="p-3.5 rounded-xl bg-card/50 border border-border/20 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase text-primary">Preview com dados fictícios</p>
                        <div className="flex flex-wrap gap-1">
                          {['{{nome}}','{{empresa}}','{{faturamento}}','{{produto}}','{{vendedor}}'].map(v => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setTemplateForm(p => ({ ...p, corpo: p.corpo + v }))}
                              className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 font-mono transition-colors"
                            >
                              {v}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-xs text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                        {templateForm.corpo
                          .replace(/\{\{nome\}\}/g, 'João Silva')
                          .replace(/\{\{empresa\}\}/g, 'Empresa Exemplo Ltda')
                          .replace(/\{\{faturamento\}\}/g, 'R$ 50.000,00')
                          .replace(/\{\{produto\}\}/g, 'Sistema')
                          .replace(/\{\{vendedor\}\}/g, 'Carlos Oliveira')
                          .replace(/\{nome\}/g, 'João Silva')
                          .replace(/\{primeiro_nome\}/g, 'João')
                          .replace(/\{ramo\}/g, 'Alimentos')
                          .replace(/\{faturamento\}/g, 'R$ 50.000,00')
                          || 'Escreva algo no template para ver o preview. Use os botões acima para inserir variáveis.'}
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 text-xs pt-1">
                    <button
                      onClick={() => {
                        setShowAddTemplate(false)
                        setTemplateForm({ nome: '', categoria: 'Sondagem', corpo: '' })
                        setEditingTemplate(null)
                      }}
                      className="px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:bg-card"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveTemplate}
                      className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold hover:opacity-90"
                    >
                      {editingTemplate ? 'Salvar Alterações' : 'Criar Template'}
                    </button>
                  </div>
                </div>
              )}

              {/* Templates grid list */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map(tpl => (
                  <div key={tpl.id} className="p-5 rounded-3xl border border-border/20 bg-card/35 flex flex-col justify-between hover:border-border/40 transition-all">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-sm text-neutral-250 truncate max-w-[180px]">{tpl.nome}</span>
                        <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-md bg-primary/10 text-primary border border-primary/20">
                          {tpl.categoria}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4 bg-background/30 p-3 rounded-xl border border-border/10 font-mono mt-3">
                        {tpl.corpo}
                      </p>
                    </div>

                    <div className="flex gap-2 border-t border-border/10 pt-4 mt-4">
                      <button
                        onClick={() => handleEditTemplate(tpl)}
                        className="flex-1 py-1.5 bg-muted hover:bg-neutral-700 text-xs font-semibold rounded-lg transition-colors border border-border/50 text-foreground"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(tpl.id)}
                        className="flex-1 py-1.5 bg-rose-500/10 hover:bg-rose-500 hover:text-foreground text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                ))}

                {templates.length === 0 && (
                  <div className="col-span-2 text-center py-10 text-muted-foreground border border-dashed border-border/25 rounded-2xl bg-card/10">
                    Nenhum template de mensagem criado.
                  </div>
                )}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

function SettingsFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-neutral-400">Carregando configurações...</p>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <Suspense fallback={<SettingsFallback />}>
        <SettingsContent />
      </Suspense>
    </AppLayout>
  )
}
