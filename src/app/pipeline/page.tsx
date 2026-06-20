'use client'

import React, { useEffect, useState, useMemo, Suspense, useRef } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { crmService } from '@/lib/services'
import { useRouter } from 'next/navigation'
import {
  Plus, X, Zap, CheckCircle2,
  MoreVertical, Trash2, User, Calendar,
  MessageSquare, Paperclip, Clock,
  CheckSquare, Square, Search, Settings,
  ArrowRight, Archive, TrendingUp,
  Phone, Info, Send, ChevronLeft, ChevronRight, Check, FileText
} from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileActionSelect } from '@/components/ui/MobileActionSelect'

import { MockDeal, MockContact, MockUser, MockActivity, MockPipeline, MockStage, MockDealStageHistory } from '@/lib/mockData'
import { toast, Toaster } from 'sonner'
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import { useCategories } from '@/lib/categories'

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(v)

import * as crmActions from '@/app/actions/crm'

// Priority config mapping (Inverted semantic)
const PRIORITY_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; emoji: string }> = {
  BAIXA: {
    label: 'LEAD AP',
    color: 'text-emerald-600 dark:text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    emoji: '🟢'
  },
  MEDIA: {
    label: 'ZONA CINZA',
    color: 'text-amber-600 dark:text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    emoji: '🟠'
  },
  ALTA: {
    label: 'DESQUALIFICADA',
    color: 'text-rose-600 dark:text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    emoji: '🔴'
  },
  NAO_RESPONDEU: {
    label: 'NÃO RESPONDEU',
    color: 'text-muted-foreground',
    bg: 'bg-muted',
    border: 'border-border',
    emoji: '⚪'
  }
}

const LOSS_REASONS = [
  'Desistência',
  'Falta de contato',
  'Falta de orçamento',
  'Não é o público-alvo',
  'Foi para concorrente',
  'Timing inadequado',
  'Sem interesse',
  'Outro'
]

// Owner badge color generator (deterministic HSL)
function getOwnerColor(userId: string) {
  if (!userId) return { bg: 'bg-neutral-800', border: 'border-neutral-700', text: 'text-neutral-300' }
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = Math.abs(hash % 360)
  return {
    bg: `hsl(${h}, 50%, 15%)`,
    border: `1px solid hsl(${h}, 50%, 30%)`,
    text: `hsl(${h}, 85%, 85%)`
  }
}

// ─── DRAGGABLE CARD COMPONENT ────────────────────────────────────────────────
function DraggableDealCard({
  deal,
  contact,
  owner,
  hasFutureActivity,
  hasOverdueActivity,
  hasUnreadMessage,
  lastMessageTime,
  isRecentMessage,
  inActiveCadence,
  isSelected,
  isSelectionMode,
  onSelect,
  onClick,
  onOpenMenu,
  isOpenMenu,
  onMarkWon,
  onMarkLost,
  onDelete,
  history,
  stageSlaHours,
  pulsingDeals,
  onActivateSelectionMode,
  stageName,
  stageColor,
  pendingTasksCount
}: {
  deal: MockDeal
  contact: MockContact | undefined
  owner: MockUser | undefined
  hasFutureActivity: boolean
  hasOverdueActivity: boolean
  hasUnreadMessage: boolean
  lastMessageTime: string
  isRecentMessage: boolean
  inActiveCadence: boolean
  isSelected: boolean
  isSelectionMode: boolean
  onSelect: () => void
  onClick: () => void
  onOpenMenu: () => void
  isOpenMenu: boolean
  onMarkWon: () => void
  onMarkLost: () => void
  onDelete: () => void
  history: MockDealStageHistory[]
  stageSlaHours: number
  pulsingDeals: Set<string>
  onActivateSelectionMode?: () => void
  stageName?: string
  stageColor?: string
  pendingTasksCount?: number
}) {
  const isMobile = useIsMobile()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    disabled: isMobile
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50
      }
    : undefined

  const phoneClean = contact?.telefone ? contact.telefone.replace(/\D/g, '') : ''
  const prio = PRIORITY_CONFIG[deal.prioridade] || PRIORITY_CONFIG.MEDIA
  const isPulsing = pulsingDeals.has(deal.id)

  const BRL = (v: number) =>
    new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 0
    }).format(v)

  // Parse tags
  let parsedTags: string[] = []
  if (deal.tags) {
    try {
      parsedTags = JSON.parse(deal.tags)
    } catch {
      parsedTags = deal.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        borderLeftWidth: '4px',
        borderLeftColor: deal.prioridade === 'ALTA' ? '#f87171'
                : deal.prioridade === 'NAO_RESPONDEU' ? '#9ca3af'
                : deal.prioridade === 'MEDIA' ? 'transparent'
                : '#34d399'
      }}
      className={`relative group flex flex-col p-2.5 rounded-lg border transition-all duration-300 ${
        isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
          : 'border-border/50 bg-card hover:bg-card/80 shadow-sm'
      } ${isPulsing ? 'animate-pulse border-primary/90' : ''}`}
      onClick={(e) => {
        if (isSelectionMode) {
          e.stopPropagation()
          onSelect()
        } else {
          onClick()
        }
      }}
      {...(!isMobile ? attributes : {})}
      {...(!isMobile ? listeners : {})}
    >
      {/* Row 1: Priority Indicator, Title, Context Menu */}
      <div className="flex items-start justify-between gap-2 pointer-events-none">
        <div className="flex items-start gap-2.5 flex-1 pt-0.5">
          <h4 className="text-[13px] font-bold text-foreground line-clamp-2 leading-snug">
            {deal.titulo}
          </h4>
        </div>

        <div className="flex items-center gap-1 pointer-events-auto z-10 shrink-0 -mt-1 -mr-1">
          {/* Selection Checkbox (Always visible) */}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onSelect()
            }}
            className="p-2 text-muted-foreground hover:text-primary transition-colors"
          >
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-primary" />
            ) : (
              <Square className="w-4 h-4 opacity-50 hover:opacity-100 transition-opacity" />
            )}
          </button>

          {/* Context menu */}
          {!isSelectionMode && (
            <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onOpenMenu()
              }}
              className="p-2 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <MoreVertical className="w-4 h-4" />
            </button>
            {isOpenMenu && (
              <div
                className="absolute right-0 top-8 w-44 rounded-xl border border-border bg-popover shadow-2xl overflow-hidden z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => onMarkWon()}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-primary/10 text-primary transition-colors font-medium"
                >
                  <CheckCircle2 className="w-4 h-4" /> Marcar Ganho
                </button>
                <button
                  onClick={() => onMarkLost()}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-destructive/10 text-destructive transition-colors font-medium"
                >
                  <X className="w-4 h-4" /> Marcar Perdido
                </button>
                <div className="h-px bg-border my-1" />
                <button
                  onClick={() => onDelete()}
                  className="flex items-center gap-2.5 w-full px-4 py-3 text-sm hover:bg-destructive/10 text-destructive transition-colors font-medium"
                >
                  <Trash2 className="w-4 h-4" /> Excluir
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      </div>

      {/* Main card details content */}
      <div className="flex flex-col gap-1.5 mt-1.5 w-full pl-5">
        {/* Row 2: Contact Name & Phone */}
        <div className="flex flex-col gap-0.5 pointer-events-none">
          <p className="text-[12px] font-semibold text-foreground/90 leading-tight">
            {contact?.nome} {contact?.sobrenome || ''}
          </p>
          {contact?.telefone && (
            <a
              href={`https://wa.me/${phoneClean}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto text-[10px] text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors w-fit"
            >
              <Phone className="w-2.5 h-2.5" /> {contact.telefone}
            </a>
          )}
        </div>

        {/* Row 3: Badges Grid (Priority, Product, Origin, etc.) */}
        <div className="flex flex-wrap items-center gap-1 pointer-events-none">
          {deal.prioridade !== 'MEDIA' && (
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border ${prio.color} ${prio.bg} ${prio.border}`}>
              {prio.emoji} {prio.label}
            </span>
          )}

          {deal.produtoInteresse && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-muted text-muted-foreground border border-border/50 truncate max-w-[100px]">
              📦 {deal.produtoInteresse}
            </span>
          )}

          {deal.origem && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-muted text-muted-foreground border border-border/50">
              🔗 {deal.origem}
            </span>
          )}

          {deal.ramoEmpresa && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-muted text-muted-foreground border border-border/50 truncate max-w-[100px]">
              🏢 {deal.ramoEmpresa}
            </span>
          )}

          {deal.faturamentoMensal !== undefined && deal.faturamentoMensal > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-muted text-muted-foreground border border-border/50">
              💰 Fat: {BRL(deal.faturamentoMensal)}
            </span>
          )}

          {deal.aiScore > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 animate-pulse">
              ✨ AI: {deal.aiScore}%
            </span>
          )}

          {(pendingTasksCount ?? 0) > 0 && (
            <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold border ${hasOverdueActivity ? 'bg-rose-500/10 text-rose-500 border-rose-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'}`}>
              <CheckSquare className="w-2.5 h-2.5" /> {pendingTasksCount}
            </span>
          )}

          {inActiveCadence && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
              <Zap className="w-2.5 h-2.5" /> Cadência
            </span>
          )}

          {parsedTags.includes('disparado') ? (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              ✅ DISPARADO{(() => { const d = parsedTags.find(t => t.startsWith('disparos:')); return d ? ` ×${d.split(':')[1]}` : '' })()}
            </span>
          ) : parsedTags.includes('listado') && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold bg-violet-500/10 text-violet-400 border border-violet-500/20">
              📋 LISTADO{(() => { const d = parsedTags.find(t => t.startsWith('disparos:')); return d ? ` ×${d.split(':')[1]}` : '' })()}
            </span>
          )}

          {parsedTags.filter(tag => tag !== 'listado' && tag !== 'disparado' && tag !== 'mensagem_enviada' && !tag.startsWith('disparos:')).map(tag => (
            <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-medium bg-primary/5 text-primary border border-primary/20">
              #{tag}
            </span>
          ))}
        </div>

        {/* Row 4: Owner & Stage Info */}
        <div className="flex flex-col gap-1 mt-0.5">
          <div className="flex items-center gap-1.5 pointer-events-none">
            <User className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">
              {owner ? `${owner.nome} ${owner.sobrenome || ''}` : 'Sem vendedor'}
            </span>
          </div>

          {stageName && (
            <div className="flex items-center gap-1.5 pointer-events-none">
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{
                  backgroundColor: stageColor || '#fbbf24',
                  boxShadow: `0 0 4px ${stageColor || '#fbbf24'}`
                }}
              />
              <span className="text-[10px] font-bold text-muted-foreground/80 uppercase tracking-wide">
                {stageName}
              </span>
            </div>
          )}
        </div>

        {/* Row 5: Value + Action Trigger */}
        <div className="flex items-center justify-between border-t border-border/10 pt-1.5 mt-1 pointer-events-none">
          <span className="text-[14px] font-extrabold text-primary tracking-tight">
            {BRL(deal.valorEstimado)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── DROPPABLE STAGE COLUMN COMPONENT ───────────────────────────────────────
function DroppableColumn({
  stage,
  deals,
  contacts,
  users,
  activities,
  history,
  isSelectionMode,
  selectedDeals,
  onSelectDeal,
  onSelectAllInStage,
  onDealClick,
  openMenuDealId,
  setOpenMenuDealId,
  onMarkWon,
  onMarkLost,
  onDeleteDeal,
  onDeleteStage,
  pulsingDeals,
  lastMessageMap,
  activeCadenceSet
}: {
  stage: MockStage
  deals: MockDeal[]
  contacts: MockContact[]
  users: MockUser[]
  activities: MockActivity[]
  history: MockDealStageHistory[]
  isSelectionMode: boolean
  selectedDeals: Set<string>
  onSelectDeal: (id: string) => void
  onSelectAllInStage: (stageId: string, checked: boolean) => void
  onDealClick: (deal: MockDeal) => void
  openMenuDealId: string | null
  setOpenMenuDealId: (id: string | null) => void
  onMarkWon: (deal: MockDeal) => void
  onMarkLost: (deal: MockDeal) => void
  onDeleteDeal: (id: string, forcePermanent?: boolean) => void
  onDeleteStage: (stage: MockStage) => void
  pulsingDeals: Set<string>
  lastMessageMap: Record<string, { time: string; isRecent: boolean }>
  activeCadenceSet: Set<string>
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id
  })

  const stageTotal = deals.reduce((sum, d) => sum + d.valorEstimado, 0)
  const allDealsSelected = deals.length > 0 && deals.every((d) => selectedDeals.has(d.id))

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col w-72 shrink-0 rounded-2xl border transition-all duration-300 ${
        isOver
          ? 'border-primary/80 bg-primary/5 shadow-inner'
          : 'border-border/30 bg-neutral-950/40'
      }`}
    >
      {/* Stage Header */}
      <div
        className="group px-4 py-3.5 border-b border-border/20 flex flex-col gap-1.5"
        style={{ borderTop: `3px solid ${stage.cor}` }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isSelectionMode && deals.length > 0 && (
              <button
                onClick={() => onSelectAllInStage(stage.id, !allDealsSelected)}
                className="text-muted-foreground hover:text-primary transition-colors mr-0.5"
              >
                {allDealsSelected ? (
                  <CheckSquare className="w-3.5 h-3.5 text-primary" />
                ) : (
                  <Square className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </button>
            )}
            <span className="font-bold text-sm text-foreground truncate max-w-[130px]" title={stage.nome}>
              {stage.nome}
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400">
              {deals.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-primary">{BRL(stageTotal)}</span>
            <button
              onClick={() => onDeleteStage(stage)}
              className="text-muted-foreground hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100"
              title="Excluir coluna"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {stage.slaHours > 0 && (
          <p className="text-[10px] text-neutral-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> SLA: {stage.slaHours}h | Probabilidade: {stage.probabilidade}%
          </p>
        )}
      </div>

      {/* Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-2.5 space-y-2.5 max-h-[calc(100vh-280px)] min-h-[150px]">
        {deals.map((deal) => {
          const contact = contacts.find((c) => c.id === deal.contactId)
          const owner = users.find((u) => u.id === deal.ownerUserId)
          const isSelected = selectedDeals.has(deal.id)
          const pendingTasksCount = activities.filter(a => a.dealId === deal.id && a.status === 'OPEN').length
          const dealActivities = activities.filter((a) => a.dealId === deal.id)
          const hasOverdueActivity = dealActivities.some((a) => a.status === 'OPEN' && new Date(a.dueAt).getTime() < Date.now())
                    const hasFutureActivity = dealActivities.some(
            (a) => a.status === 'OPEN' && new Date(a.dueAt).getTime() > Date.now()
          )
          const contactPhone = (contact?.telefone || deal.telefone || '').replace(/\D/g, '')
          const msgData = lastMessageMap[contactPhone] || null
          const hasUnreadMessage = msgData?.isRecent ?? false
          const lastMessageTime = msgData?.time ?? ''
          const isRecentMessage = msgData?.isRecent ?? false
          const inActiveCadence = activeCadenceSet.has(deal.id)

          return (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              contact={contact}
              owner={owner}
              hasFutureActivity={hasFutureActivity} hasOverdueActivity={hasOverdueActivity}
              hasUnreadMessage={hasUnreadMessage}
              lastMessageTime={lastMessageTime}
              isRecentMessage={isRecentMessage}
              inActiveCadence={inActiveCadence}
              isSelected={isSelected}
              isSelectionMode={isSelectionMode}
              onSelect={() => onSelectDeal(deal.id)}
              onClick={() => onDealClick(deal)}
              onOpenMenu={() => setOpenMenuDealId(openMenuDealId === deal.id ? null : deal.id)}
              isOpenMenu={openMenuDealId === deal.id}
              onMarkWon={() => onMarkWon(deal)}
              onMarkLost={() => onMarkLost(deal)}
              onDelete={() => onDeleteDeal(deal.id)}
              history={history}
              stageSlaHours={stage.slaHours}
              pulsingDeals={pulsingDeals}
              onActivateSelectionMode={() => {}}
              stageName={stage.nome}
            />
          )
        })}

        {deals.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center opacity-30 border border-dashed border-border/10 rounded-xl">
            <div className="w-8 h-8 rounded-full border border-dashed border-neutral-600 mb-2 flex items-center justify-center">
              <Plus className="w-4 h-4 text-neutral-600" />
            </div>
            <p className="text-[11px] text-muted-foreground">Arraste negócios aqui</p>
          </div>
        )}
      </div>
    </div>
  )
}

// Internal type for mock service state access
type CrmInternal = typeof crmService & {
  getState?: () => { users: MockUser[]; history: MockDealStageHistory[]; deals: MockDeal[] }
}
const crmInternal = crmService as unknown as CrmInternal

// ─── PIPELINE MAIN CONTENT ──────────────────────────────────────────────────
function PipelineContent() {
  const router = useRouter()
  const categoriesStore = useCategories()

  // State definitions
  const isMobile = useIsMobile()
  const [activeStageIndex, setActiveStageIndex] = useState(0)
  const [showMobileFilters, setShowMobileFilters] = useState(false)
  const [pipelines, setPipelines] = useState<MockPipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('')
  const [stages, setStages] = useState<MockStage[]>([])
  const [deals, setDeals] = useState<MockDeal[]>([])
  const [contacts, setContacts] = useState<MockContact[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [activities, setActivities] = useState<MockActivity[]>([])
  const [history, setHistory] = useState<MockDealStageHistory[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; isAdmin: boolean } | null>(null)

  const [loading, setLoading] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [pulsingDeals, setPulsingDeals] = useState<Set<string>>(new Set())
  const [showKpis, setShowKpis] = useState(false)
  const [lastMessageMap, setLastMessageMap] = useState<Record<string, { time: string; isRecent: boolean }>>({})
  const [activeCadenceSet, setActiveCadenceSet] = useState<Set<string>>(new Set())

  // Filters
  const [filterOwner, setFilterOwner] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [filterOrigin, setFilterOrigin] = useState<string>('all')
  const [searchText, setSearchText] = useState<string>('')

  // Modals & Sheets
  const [selectedDeal, setSelectedDeal] = useState<MockDeal | null>(null)
  const [showNewDeal, setShowNewDeal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [showLostReasonModal, setShowLostReasonModal] = useState<{ deal: MockDeal } | { bulk: true } | null>(null)
  const [lostReasonInput, setLostReasonInput] = useState('')
  const [customLostReason, setCustomLostReason] = useState('')
  const [showNewStageModal, setShowNewStageModal] = useState(false)
  const [newStageName, setNewStageName] = useState('')
  const [stageToDelete, setStageToDelete] = useState<MockStage | null>(null)
  const [migrateToStageId, setMigrateToStageId] = useState<string>('')

  // Bulk Selection Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [bulkStageTarget, setBulkStageTarget] = useState('')
  const [bulkOwnerTarget, setBulkOwnerTarget] = useState('')
  const [bulkPriorityTarget, setBulkPriorityTarget] = useState('')
  const [bulkTagTarget, setBulkTagTarget] = useState('')
  const [selectedCadenciaTarget, setSelectedCadenciaTarget] = useState('')
  const [cadencias, setCadencias] = useState<any[]>([])

  // Context Menu
  const [openMenuDealId, setOpenMenuDealId] = useState<string | null>(null)

  // New Deal form state
  const [newDeal, setNewDeal] = useState({
    titulo: '',
    valorEstimado: '',
    contactId: '',
    stageId: '',
    produtoInteresse: '',
    origem: '',
    prioridade: 'MEDIA',
    ramoEmpresa: '',
    faturamentoMensal: '',
    ownerUserId: ''
  })
  const [isNewContact, setIsNewContact] = useState(false)
  const [newContactData, setNewContactData] = useState({ nome: '', telefone: '' })


  // Set mounted
  useEffect(() => {
    Promise.resolve().then(() => setMounted(true))
  }, [])

  // Listen to mobile layout actions (Search is global, Add and Filters are contextual)
  useEffect(() => {
    if (!mounted) return
    const handleToggleFilters = () => setShowMobileFilters(prev => !prev)
    const handleAddDeal = () => setShowNewDeal(true)

    window.addEventListener('toggle-mobile-filters', handleToggleFilters)
    window.addEventListener('trigger-add-deal', handleAddDeal)

    return () => {
      window.removeEventListener('toggle-mobile-filters', handleToggleFilters)
      window.removeEventListener('trigger-add-deal', handleAddDeal)
    }
  }, [mounted])

  // Check URL query parameters on load
  useEffect(() => {
    if (!mounted || loading || deals.length === 0) return
    const params = new URLSearchParams(window.location.search)
    const urlDealId = params.get('dealId')
    const urlAction = params.get('action')

    if (urlDealId) {
      const found = deals.find(d => d.id === urlDealId)
      if (found) {
        setSelectedDeal(found)
      }
    }
    if (urlAction === 'new') {
      setShowNewDeal(true)
    }
  }, [mounted, loading, deals])

  // Load basic data
  useEffect(() => {
    if (mounted) {

      load()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  // Realtime Polling fallback (20s)
  useEffect(() => {
    if (!mounted) return
    const interval = setInterval(() => {
      loadQuietly()
    }, 20000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, selectedPipelineId])

  async function load() {
    setLoading(true)
    try {
      const [pipes, currentUserData] = await Promise.all([
        crmActions.getPipelines(),
        crmActions.getCurrentUser()
      ])
      setPipelines(pipes)
      setCurrentUser(currentUserData)
      if (!(window as any).__filterOwnerSet) {
        setFilterOwner('all')
        ;(window as any).__filterOwnerSet = true
      }

      // Get initial selection from localStorage or defaults
      let activeId = localStorage.getItem('ocr_active_pipeline_id')
      if (!activeId || !pipes.some((p) => p.id === activeId)) {
        const defPipe = pipes.find((p) => p.isDefault) || pipes[0]
        activeId = defPipe ? defPipe.id : ''
      }
      setSelectedPipelineId(activeId)

      if (activeId) {
        await loadPipelineData(activeId)
      }
    } catch {
      toast.error('Erro ao carregar dados do pipeline.')
    } finally {
      setLoading(false)
    }
  }

  async function loadQuietly() {
    if (!selectedPipelineId) return
    await loadPipelineData(selectedPipelineId)
  }

  async function loadPipelineData(pipelineId: string) {
    const [stgs, dls, allContacts, allActivities, allCadencias, teamUsers, allHistory, activeDealIds] = await Promise.all([
      crmActions.getStages(pipelineId),
      crmActions.getDeals(pipelineId),
      crmActions.getContacts(),
      crmActions.getActivities(),
      crmActions.getCadencias(),
      crmActions.getTeamUsers(),
      crmActions.getAllHistory(),
      crmActions.getActiveDealsInCadences()
    ])

    setUsers(teamUsers)
    setHistory(allHistory)
    setStages(stgs)
    setDeals(dls)
    setContacts(allContacts)
    setActivities(allActivities)
    setCadencias(allCadencias)
    setActiveCadenceSet(new Set(activeDealIds))

    setNewDeal((p) => ({
      ...p,
      stageId: stgs[0]?.id || '',
      pipelineId: pipelineId
    }))

    // Load last message times for all contacts with phones
    const phones = allContacts
      .filter(c => c.telefone)
      .map(c => c.telefone!)
    if (phones.length > 0) {
      crmActions.getLastMessagesForPhones(phones).then(map => setLastMessageMap(map))
    }
  }

  // Handle pipeline switch
  const handlePipelineSwitch = async (id: string) => {
    setSelectedPipelineId(id)
    localStorage.setItem('ocr_active_pipeline_id', id)
    setLoading(true)
    await loadPipelineData(id)
    setLoading(false)
    // Clear selection
    setSelectedDeals(new Set())
  }

  // Sensors for DnD – pointer with 8px activation distance to prevent click conflicts
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    })
  )

  // Active drag deal (for DragOverlay)
  const [activeDragDealId, setActiveDragDealId] = useState<string | null>(null)

  // Drag End handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    const dealId = active.id as string
    const newStageId = over.id as string

    const deal = deals.find((d) => d.id === dealId)
    if (!deal) return

    if (deal.stageId === newStageId) return

    // Optimistic UI update
    const previousDeals = [...deals]
    setDeals((prev) =>
      prev.map((d) => (d.id === dealId ? { ...d, stageId: newStageId, updatedAt: new Date().toISOString() } : d))
    )

    try {
      await crmActions.moveDealStage(dealId, newStageId, 'kanban_drag')
      
      // Pulse glow for 6s
      setPulsingDeals((prev) => {
        const next = new Set(prev)
        next.add(dealId)
        return next
      })
      setTimeout(() => {
        setPulsingDeals((prev) => {
          const next = new Set(prev)
          next.delete(dealId)
          return next
        })
      }, 6000)

      // Refresh history log
      const allHistory = await crmActions.getAllHistory()
      setHistory(allHistory)
      toast.success('Negócio movido com sucesso!')
    } catch {
      setDeals(previousDeals)
      toast.error('Erro ao mover negócio.')
    }
  }

  // Create Deal handler
  const handleCreateStage = async () => {
    if (!newStageName.trim() || !selectedPipelineId) return
    try {
      await crmActions.createStage({
        pipelineId: selectedPipelineId,
        nome: newStageName.trim(),
        cor: '#39FF88', // Default neon green
        probabilidade: 0,
        slaHours: 24
      })
      await loadPipelineData(selectedPipelineId)
      setShowNewStageModal(false)
      setNewStageName('')
      toast.success('Coluna criada com sucesso!')
    } catch {
      toast.error('Erro ao criar coluna.')
    }
  }

  const handleDeleteStage = async () => {
    if (!stageToDelete) return
    try {
      // Migrate deals if selected
      const stageDeals = deals.filter(d => d.stageId === stageToDelete.id && d.status === 'OPEN')
      if (stageDeals.length > 0 && migrateToStageId) {
        const promises = stageDeals.map(d => crmActions.moveDealStage(d.id, migrateToStageId, 'migration'))
        await Promise.all(promises)
      }

      await crmActions.deleteStage(stageToDelete.id)
      await loadPipelineData(selectedPipelineId)
      setStageToDelete(null)
      setMigrateToStageId('')
      toast.success('Coluna excluída com sucesso!')
    } catch {
      toast.error('Erro ao excluir coluna.')
    }
  }

  const handleCreateDeal = async () => {
    if (!newDeal.titulo) {
      toast.error('Título é obrigatório.')
      return
    }

    if (!isNewContact && !newDeal.contactId) {
      toast.error('Selecione um contato.')
      return
    }

    if (isNewContact && (!newContactData.nome || !newContactData.telefone)) {
      toast.error('Nome e telefone do novo contato são obrigatórios.')
      return
    }

    try {
      let finalContactId = newDeal.contactId

      if (isNewContact) {
        const createdContact = await crmActions.createContact({
          nome: newContactData.nome,
          telefone: newContactData.telefone.replace(/\D/g, '')
        })
        finalContactId = createdContact.id
      }

      const created = await crmActions.createDeal({
        titulo: newDeal.titulo,
        valorEstimado: parseFloat(newDeal.valorEstimado) || 0,
        contactId: finalContactId as string,
        stageId: newDeal.stageId || stages[0]?.id || '',
        produtoInteresse: newDeal.produtoInteresse || undefined,
        origem: newDeal.origem || undefined,
        prioridade: newDeal.prioridade as MockDeal['prioridade'],
        status: 'OPEN' as MockDeal['status'],
        ramoEmpresa: newDeal.ramoEmpresa || undefined,
        faturamentoMensal: parseFloat(newDeal.faturamentoMensal) || 0,
        ownerUserId: newDeal.ownerUserId || currentUser?.id || undefined,
        aiScore: 0,
        userId: ''
      })

      setDeals((prev) => [...prev, created])
      setShowNewDeal(false)
      // reset
      setNewDeal({
        titulo: '',
        valorEstimado: '',
        contactId: '',
        stageId: stages[0]?.id || '',
        produtoInteresse: '',
        origem: '',
        prioridade: 'MEDIA',
        ramoEmpresa: '',
        faturamentoMensal: '',
        ownerUserId: ''
      })
      
      // Refresh history log
      const allHistory = await crmActions.getAllHistory()
      setHistory(allHistory)

      toast.success('Negócio criado com sucesso!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao criar negócio.')
    }
  }

  // Delete / Archive Deal
  const handleDeleteDeal = async (id: string, forcePermanent = false) => {
    if (!confirm(forcePermanent ? 'Excluir permanentemente?' : 'Deseja arquivar este negócio?')) return
    try {
      await crmActions.deleteDeal(id, forcePermanent)
      if (forcePermanent) {
        setDeals((prev) => prev.filter((d) => d.id !== id))
      } else {
        // Soft delete: keep in deals state if needed or just remove from active
        setDeals((prev) => prev.filter((d) => d.id !== id))
      }
      setSelectedDeals((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (selectedDeal?.id === id) setSelectedDeal(null)
      toast.success(forcePermanent ? 'Negócio excluído permanentemente.' : 'Negócio arquivado com sucesso.')
    } catch {
      toast.error('Erro ao excluir.')
    }
    setOpenMenuDealId(null)
  }

  // Close Won
  const handleMarkWon = async (deal: MockDeal) => {
    try {
      const updated = await crmActions.closeDeal(deal.id, 'WON')
      setDeals((prev) => prev.map((d) => (d.id === deal.id ? updated : d)))
      if (selectedDeal?.id === deal.id) setSelectedDeal(updated)
      toast.success('🎉 Negócio marcado como GANHO! Parabéns!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao fechar negócio.')
    }
    setOpenMenuDealId(null)
  }

  // Close Lost Trigger
  const triggerMarkLost = (deal: MockDeal) => {
    setShowLostReasonModal({ deal })
    setLostReasonInput(LOSS_REASONS[0])
    setCustomLostReason('')
    setOpenMenuDealId(null)
  }

  // Close Lost Confirm
  const handleConfirmLost = async () => {
    if (!showLostReasonModal) return
    const finalReason = lostReasonInput === 'Outro' ? customLostReason : lostReasonInput
    if (!finalReason) {
      toast.error('Por favor, informe o motivo da perda.')
      return
    }

    try {
      if ('bulk' in showLostReasonModal) {
        // Bulk close lost
        const promises = Array.from(selectedDeals).map((id) =>
          crmActions.closeDeal(id, 'LOST', finalReason)
        )
        await Promise.all(promises)
        // reload
        await loadPipelineData(selectedPipelineId)
        setSelectedDeals(new Set())
        toast.error('Negócios selecionados fechados como PERDIDOS.')
      } else {
        const deal = showLostReasonModal.deal
        const updated = await crmActions.closeDeal(deal.id, 'LOST', finalReason)
        setDeals((prev) => prev.map((d) => (d.id === deal.id ? updated : d)))
        if (selectedDeal?.id === deal.id) setSelectedDeal(updated)
        toast.error('Negócio marcado como perdido.')
      }
      setShowLostReasonModal(null)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao fechar negócio.')
    }
  }

  // Reopen deal
  const handleReopenDeal = async (dealId: string) => {
    try {
      const updated = await crmActions.reopenDeal(dealId)
      await loadPipelineData(selectedPipelineId)
      if (selectedDeal?.id === dealId) setSelectedDeal(updated)
      toast.success('Negócio reaberto com sucesso!')
    } catch {
      toast.error('Erro ao reabrir.')
    }
  }

  // Selection toggles
  const handleSelectDeal = (id: string) => {
    setSelectedDeals((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      if (next.size > 0) {
        setIsSelectionMode(true)
      } else {
        setIsSelectionMode(false)
      }
      return next
    })
  }

  const handleGoToCaixaRapido = async () => {
    const dealIds = Array.from(selectedDeals)
    try {
      await crmActions.tagDealsAsListado(dealIds)
      await loadPipelineData(selectedPipelineId)
    } catch {
      // non-blocking — navigate anyway
    }
    sessionStorage.setItem('pipeline_deals_to_action', JSON.stringify(dealIds))
    setSelectedDeals(new Set())
    setIsSelectionMode(false)
    router.push('/caixa-rapido?tab=wizard')
  }

  const handleBulkAddToCadence = async () => {
    if (!selectedCadenciaTarget) return
    try {
      const dealIds = Array.from(selectedDeals)
      const count = await crmActions.addLeadsToCadence(selectedCadenciaTarget, dealIds, 'deal')
      toast.success(`${count} leads adicionados à cadência com sucesso!`)
      setSelectedDeals(new Set())
      setIsSelectionMode(false)
      setSelectedCadenciaTarget('')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar leads à cadência')
    }
  }

  const handleSelectAllInStage = (stageId: string, checked: boolean) => {
    const stageDeals = visibleDeals.filter((d) => d.stageId === stageId && d.status === 'OPEN')
    setSelectedDeals((prev) => {
      const next = new Set(prev)
      stageDeals.forEach((d) => {
        if (checked) next.add(d.id)
        else next.delete(d.id)
      })
      return next
    })
  }

  // Bulk Actions
  const handleBulkMove = async () => {
    if (!bulkStageTarget) return
    try {
      const promises = Array.from(selectedDeals).map((id) =>
        crmActions.moveDealStage(id, bulkStageTarget, 'bulk_move')
      )
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      setBulkStageTarget('')
      toast.success('Negócios movidos em lote!')
    } catch {
      toast.error('Erro ao mover em lote.')
    }
  }

  const handleBulkAssign = async () => {
    if (!bulkOwnerTarget) return
    try {
      const promises = Array.from(selectedDeals).map((id) =>
        crmActions.updateDeal(id, { ownerUserId: bulkOwnerTarget || undefined })
      )
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      setBulkOwnerTarget('')
      toast.success('Responsáveis atribuídos em lote!')
    } catch {
      toast.error('Erro ao atribuir em lote.')
    }
  }

  const handleBulkChangePriority = async () => {
    if (!bulkPriorityTarget) return
    try {
      const promises = Array.from(selectedDeals).map((id) =>
        crmActions.updateDeal(id, { prioridade: bulkPriorityTarget as MockDeal['prioridade'] })
      )
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      setBulkPriorityTarget('')
      toast.success('Prioridades alteradas em lote!')
    } catch {
      toast.error('Erro ao alterar prioridades.')
    }
  }

  const handleBulkAddTag = async () => {
    if (!bulkTagTarget) return
    try {
      const promises = Array.from(selectedDeals).map(async (dealId) => {
        const deal = deals.find(d => d.id === dealId)
        if (!deal) return

        // Add tag to deal
        let dealTags: string[] = []
        if (typeof (deal as any).tags === 'string') {
          try { dealTags = JSON.parse((deal as any).tags) } catch { dealTags = [] }
        } else if (Array.isArray((deal as any).tags)) {
          dealTags = (deal as any).tags
        }
        if (!dealTags.includes(bulkTagTarget)) {
          await crmActions.updateDeal(dealId, { tags: JSON.stringify([...dealTags, bulkTagTarget]) } as any)
        }

        // Also add to contact
        if (deal.contactId) {
          const contact = contacts.find(c => c.id === deal.contactId)
          if (contact) {
            let contactTags: string[] = []
            if (typeof contact.tags === 'string') {
              try { contactTags = JSON.parse(contact.tags) } catch { contactTags = [] }
            } else if (Array.isArray(contact.tags)) {
              contactTags = contact.tags
            }
            if (!contactTags.includes(bulkTagTarget)) {
              await crmActions.updateContact(contact.id, { tags: [...contactTags, bulkTagTarget] })
            }
          }
        }
      })
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      setBulkTagTarget('')
      toast.success('Tag aplicada em lote!')
    } catch {
      toast.error('Erro ao aplicar tag em lote.')
    }
  }

  const handleBulkCloseWon = async () => {
    if (!confirm('Deseja realmente marcar todos os negócios selecionados como GANHOS?')) return
    try {
      const promises = Array.from(selectedDeals).map((id) =>
        crmActions.closeDeal(id, 'WON')
      )
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      toast.success('Negócios marcados como GANHOS!')
    } catch {
      toast.error('Erro ao fechar em lote.')
    }
  }

  const handleBulkCloseLost = () => {
    setShowLostReasonModal({ bulk: true })
    setLostReasonInput(LOSS_REASONS[0])
    setCustomLostReason('')
  }

  const handleBulkDelete = async () => {
    if (!confirm('Excluir TODOS os negócios selecionados permanentemente? Esta ação é irreversível.')) return
    try {
      const promises = Array.from(selectedDeals).map((id) => crmActions.deleteDeal(id, false))
      await Promise.all(promises)
      await loadPipelineData(selectedPipelineId)
      setSelectedDeals(new Set())
      toast.success('Negócios excluídos em lote!')
    } catch {
      toast.error('Erro ao excluir em lote.')
    }
  }

  const handleBulkAddToList = () => {
    // Add WhatsApp blast list modal trigger
    // Collect contact ids
    const contactIds = Array.from(selectedDeals)
      .map((dealId) => deals.find((d) => d.id === dealId)?.contactId)
      .filter(Boolean)

    if (contactIds.length === 0) return

    toast.success(`${contactIds.length} contatos vinculados adicionados à lista de disparos!`)
    setSelectedDeals(new Set())
  }

  // Filter computations
  const visibleDeals = deals.filter((deal) => {
    // Owner filter
    if (filterOwner !== 'all') {
      if (filterOwner === 'unassigned') {
        if (deal.ownerUserId) return false
      } else {
        if (deal.ownerUserId !== filterOwner) return false
      }
    }

    // Priority filter
    if (filterPriority !== 'all' && deal.prioridade !== filterPriority) {
      return false
    }

    // Origin/Tag filter
    if (filterOrigin !== 'all') {
      const dealContact = contacts.find((c) => c.id === deal.contactId)
      const phoneClean = dealContact?.telefone ? dealContact.telefone.replace(/\D/g, '') : ''
      const dealOrig = deal.origem || (phoneClean ? 'whatsapp' : 'manual')
      if (dealOrig !== filterOrigin) return false
    }

    // Search query (title, contact name, phone)
    if (searchText.trim() !== '') {
      const query = searchText.toLowerCase()
      const titleMatch = deal.titulo.toLowerCase().includes(query)
      
      const dealContact = contacts.find((c) => c.id === deal.contactId)
      const contactMatch = dealContact
        ? `${dealContact.nome} ${dealContact.sobrenome || ''}`.toLowerCase().includes(query)
        : false
      const phoneMatch = dealContact ? dealContact.telefone.includes(query) : false

      return titleMatch || contactMatch || phoneMatch
    }

    return true
  })

  // KPI Calculations (for visible deals, open only)
  const openDeals = visibleDeals.filter((d) => d.status === 'OPEN')
  const openDealsCount = openDeals.length
  const totalValue = openDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
  const ticketMedio = openDealsCount > 0 ? totalValue / openDealsCount : 0

  // Forecast ponderado
  const forecastValue = openDeals.reduce((sum, d) => {
    const stage = stages.find((s) => s.id === d.stageId)
    const prob = stage ? stage.probabilidade : 0
return sum + d.valorEstimado * (prob / 100)
  }, 0)

  // Conversão histórica do pipeline selecionado
  const allHistoryDeals = deals // both open, won and lost
  const wonDealsCount = allHistoryDeals.filter((d) => d.status === 'WON').length
  const lostDealsCount = allHistoryDeals.filter((d) => d.status === 'LOST').length
  const totalClosed = wonDealsCount + lostDealsCount
  const conversionRate = totalClosed > 0 ? (wonDealsCount / totalClosed) * 100 : 0

  // Combined Touch/Swipe/Pull-to-refresh logic for Mobile View
  const touchStartXColumn = useRef(0)
  const touchEndXColumn = useRef(0)
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartYPull = useRef(0)

  const handleTouchStartMobile = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return
    
    // Swipe Column Tracking
    touchStartXColumn.current = e.targetTouches[0].clientX
    touchEndXColumn.current = e.targetTouches[0].clientX

    // Pull-to-refresh Tracking
    const scrollTop = e.currentTarget.scrollTop
    if (scrollTop === 0) {
      touchStartYPull.current = e.targetTouches[0].clientY
      setIsPulling(true)
    } else {
      setIsPulling(false)
    }
  }

  const handleTouchMoveMobile = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isMobile) return
    
    // Swipe Column tracking
    touchEndXColumn.current = e.targetTouches[0].clientX

    // Pull-to-refresh tracking
    if (isPulling) {
      const currentY = e.targetTouches[0].clientY
      const diffY = currentY - touchStartYPull.current
      if (diffY > 0) {
        setPullDistance(Math.min(diffY * 0.4, 70))
      }
    }
  }

  const handleTouchEndMobile = async () => {
    if (!isMobile) return

    // Swipe Column evaluation
    const diff = touchStartXColumn.current - touchEndXColumn.current
    if (diff > 75) {
      // Swiped Left -> next column
      setActiveStageIndex(prev => Math.min(stages.length - 1, prev + 1))
    } else if (diff < -75) {
      // Swiped Right -> prev column
      setActiveStageIndex(prev => Math.max(0, prev - 1))
    }

    // Pull-to-refresh evaluation
    setIsPulling(false)
    if (pullDistance > 45 && !isRefreshing) {
      setIsRefreshing(true)
      setPullDistance(45)
      await loadQuietly()
      setIsRefreshing(false)
      setPullDistance(0)
      toast.success('Funil atualizado!')
    } else {
      setPullDistance(0)
    }
  }


  if (loading || !mounted) {
    return (
      <div className="flex items-center justify-center h-full min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-neutral-400">Carregando pipeline...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-neutral-950/20 max-md:pb-16 select-none relative">
      
      {/* ─── DESKTOP HEADER & FILTERS ─── */}
      {!isMobile && (
        <>
          <div className="flex flex-col gap-4 px-6 py-4 border-b border-border/20 bg-black/30 backdrop-blur-md shrink-0">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-bold tracking-tight text-foreground">Pipeline Comercial</h1>
                  {pipelines.length > 0 && (
                    <MobileActionSelect
                      label="Selecionar Funil"
                      value={selectedPipelineId}
                      onChange={handlePipelineSwitch}
                      options={pipelines.map((p) => ({ value: p.id, label: `${p.nome} ${p.isDefault ? '⭐' : ''}` }))}
                      className="bg-neutral-900/80 border border-border/40 text-sm font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                    />
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {openDealsCount} oportunidades em aberto • Funil selecionado: {pipelines.find(p => p.id === selectedPipelineId)?.nome}
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-2.5">
                <button
                  onClick={() => setShowKpis(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    showKpis
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-neutral-900 border-border/40 text-muted-foreground hover:text-foreground'
                  }`}
                  title={showKpis ? 'Ocultar indicadores' : 'Mostrar indicadores'}
                >
                  <TrendingUp className="w-3.5 h-3.5" />
                  {showKpis ? 'Ocultar KPIs' : 'Ver KPIs'}
                </button>

                <button
                  onClick={() => setIsSelectionMode(!isSelectionMode)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    isSelectionMode
                      ? 'bg-primary text-black border-primary'
                      : 'bg-neutral-900 border-border/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {isSelectionMode ? 'Sair da Seleção' : 'Selecionar'}
                </button>

                <button
                  onClick={() => setShowArchived(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/40 bg-neutral-900 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-neutral-800/60 transition-all"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Ver Arquivados
                </button>

                <button
                  onClick={() => {
                    router.push('/settings?tab=pipeline')
                  }}
                  className="p-2 rounded-xl border border-border/40 bg-neutral-900 text-muted-foreground hover:text-foreground hover:bg-neutral-800/60 transition-all"
                  title="Configurar Pipelines"
                >
                  <Settings className="w-4 h-4" />
                </button>

                <button
                  onClick={() => setShowNewDeal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:shadow-lg hover:shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Novo Deal
                </button>
              </div>
            </div>

            {/* FILTERS */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar por deal, contato..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border/30 bg-neutral-900/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                  {searchText && (
                    <button
                      onClick={() => setSearchText('')}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <select
                  value={filterOwner}
                  onChange={(e) => setFilterOwner(e.target.value)}
                  className="bg-neutral-950/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="all">Vendedor: Todos</option>
                  <option value="unassigned">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} {u.sobrenome || ''}
                    </option>
                  ))}
                </select>

                <select
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="bg-neutral-950/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="all">Prioridade: Todas</option>
                  <option value="BAIXA">Lead AP</option>
                  <option value="MEDIA">Zona Cinza</option>
                  <option value="ALTA">Desqualificada</option>
                  <option value="NAO_RESPONDEU">Não respondeu</option>
                </select>

                <select
                  value={filterOrigin}
                  onChange={(e) => setFilterOrigin(e.target.value)}
                  className="bg-neutral-950/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="all">Origem: Todas</option>
                  <option value="Meta Ads">Meta Ads</option>
                  <option value="Indicação">Indicação</option>
                  <option value="WhatsApp Orgânico">WhatsApp Orgânico</option>
                  <option value="Google">Google</option>
                </select>
              </div>

              <button
                onClick={() => {
                  setFilterOwner('all')
                  setFilterPriority('all')
                  setFilterOrigin('all')
                  setSearchText('')
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded hover:bg-neutral-800"
              >
                Limpar Filtros
              </button>
            </div>

            {/* ─── SELECTION BULK ACTIONS BAR (fixed near filters) ─── */}
            {isSelectionMode && selectedDeals.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-1 py-2.5 rounded-xl border border-primary/30 bg-primary/5 animate-fade-in">
                <div className="flex items-center gap-2 shrink-0">
                  <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
                  <p className="text-xs font-bold text-primary">{selectedDeals.size} selecionados</p>
                </div>
                <div className="h-4 w-px bg-border/40 shrink-0" />
                <div className="flex flex-wrap items-center gap-2 text-xs flex-1">
                  <div className="flex items-center gap-1">
                    <MobileActionSelect label="Mover etapa" value={bulkStageTarget} onChange={setBulkStageTarget}
                      options={stages.map((s) => ({ value: s.id, label: s.nome }))} placeholder="Etapa..."
                      className="bg-neutral-900 border border-border/40 rounded-xl px-2.5 py-1 text-xs" />
                    <button onClick={handleBulkMove} disabled={!bulkStageTarget}
                      className="px-2.5 py-1.5 rounded-xl bg-primary text-black font-bold text-xs disabled:opacity-40">Mover</button>
                  </div>
                  <div className="flex items-center gap-1">
                    <MobileActionSelect label="Atribuir vendedor" value={bulkOwnerTarget} onChange={setBulkOwnerTarget}
                      options={users.map((u) => ({ value: u.id, label: u.nome }))} placeholder="Vendedor..."
                      className="bg-neutral-900 border border-border/40 rounded-xl px-2.5 py-1 text-xs" />
                    <button onClick={handleBulkAssign} disabled={!bulkOwnerTarget}
                      className="px-2.5 py-1.5 rounded-xl bg-primary text-black font-bold text-xs disabled:opacity-40">Atribuir</button>
                  </div>
                  <button onClick={handleGoToCaixaRapido}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-1.5 transition-colors">
                    <Zap className="w-3 h-3" /> Nova Ação
                  </button>
                  <div className="flex items-center gap-1">
                    <MobileActionSelect label="Cadência" value={selectedCadenciaTarget} onChange={setSelectedCadenciaTarget}
                      options={cadencias.map((c) => ({ value: c.id, label: c.nome }))} placeholder="Cadência..."
                      className="bg-neutral-900 border border-border/40 rounded-xl px-2.5 py-1 text-xs text-foreground" />
                    <button onClick={handleBulkAddToCadence} disabled={!selectedCadenciaTarget}
                      className="px-2.5 py-1.5 rounded-xl bg-primary text-black font-bold text-xs disabled:opacity-40">Cadência</button>
                  </div>
                  <button onClick={handleBulkCloseWon}
                    className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-bold text-xs">Ganho</button>
                  <button onClick={handleBulkCloseLost}
                    className="px-2.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs">Perdido</button>
                  <button onClick={handleBulkDelete}
                    className="p-1.5 rounded-xl hover:bg-rose-950 hover:text-rose-400 text-muted-foreground transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setSelectedDeals(new Set()); setIsSelectionMode(false) }}
                    className="ml-auto text-muted-foreground hover:text-foreground font-bold text-[11px] flex items-center gap-1">
                    <X className="w-3 h-3" /> Limpar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* DESKTOP KPIS WIDGET — collapsible */}
          {showKpis && (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 px-6 pt-2 pb-3 shrink-0">
              {[
                { label: 'Abertos', value: openDealsCount, sub: 'Oportunidades', color: 'text-foreground' },
                { label: 'Pipeline', value: BRL(totalValue), sub: 'Soma total', color: 'text-primary' },
                { label: 'Forecast', value: BRL(forecastValue), sub: 'Ponderado', color: 'text-emerald-400' },
                { label: 'Ticket Médio', value: BRL(ticketMedio), sub: 'Por negócio', color: 'text-foreground' },
                { label: 'Conversão', value: `${conversionRate.toFixed(1)}%`, sub: 'Ganho/Perdido', color: 'text-primary' }
              ].map((kpi, idx) => (
                <div key={idx} className="p-2.5 rounded-xl border border-border/20 bg-neutral-900/35 flex flex-col gap-0.5">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">{kpi.label}</p>
                  <h3 className={`text-sm font-extrabold tracking-tight ${kpi.color}`}>{kpi.value}</h3>
                  <p className="text-[9px] text-muted-foreground">{kpi.sub}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── MOBILE VIEW: STAGE SELECTOR + KANBAN ─── */}
      {isMobile ? (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Stage selector header */}
          <div className="shrink-0 bg-background border-b border-border/30">
            {/* Pipeline selector (only when multiple pipelines) */}
            {pipelines.length > 1 && (
              <div className="flex items-center gap-2 px-4 pt-3 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Funil:</span>
                <select
                  value={selectedPipelineId}
                  onChange={e => handlePipelineSwitch(e.target.value)}
                  className="flex-1 bg-muted border border-border/40 text-xs font-semibold rounded-xl px-2 py-1.5 focus:outline-none text-foreground"
                >
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.nome}{p.isDefault ? ' ★' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Stage pills — horizontal scroll */}
            <div className="overflow-x-auto flex-1 touch-pan-x hide-scrollbar scroll-smooth">
              <div className="flex gap-2 px-4 py-3 w-max">
                {stages.map((stage, idx) => {
                  const stageCount = visibleDeals.filter(d => d.stageId === stage.id && d.status === 'OPEN').length
                  const isActive = idx === activeStageIndex
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveStageIndex(idx)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shrink-0 ${
                        isActive
                          ? 'border-transparent text-black shadow-md'
                          : 'border-border/40 bg-muted/60 text-muted-foreground'
                      }`}
                      style={isActive ? { backgroundColor: stage.cor } : {}}
                    >
                      {stage.nome}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isActive ? 'bg-black/20 text-white' : 'bg-background text-muted-foreground'}`}>
                        {stageCount}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Active stage info bar */}
            {stages[activeStageIndex] && (() => {
              const st = stages[activeStageIndex]
              const stageDls = visibleDeals.filter(d => d.stageId === st.id && d.status === 'OPEN')
              const stageTotal = stageDls.reduce((s, d) => s + d.valorEstimado, 0)
              return (
                <div className="flex items-center justify-between px-4 py-2 border-t border-border/10">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: st.cor }} />
                    <span className="text-xs font-bold text-foreground">{st.nome}</span>
                    {st.slaHours > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-extrabold uppercase tracking-wider">
                        SLA {st.slaHours}h
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setIsSelectionMode(!isSelectionMode)}
                      className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${
                        isSelectionMode ? 'bg-primary text-black' : 'bg-neutral-800 text-muted-foreground hover:bg-neutral-700'
                      }`}
                    >
                      {isSelectionMode ? 'Sair da Seleção' : 'Selecionar'}
                    </button>
                    <span className="text-[11px] text-muted-foreground">{stageDls.length} deals</span>
                    <span className="text-[11px] font-bold text-primary">{BRL(stageTotal)}</span>
                  </div>
                </div>
              )
            })()}
          </div>

          {/* Card list — scrollable */}
          <div
            onTouchStart={handleTouchStartMobile}
            onTouchMove={handleTouchMoveMobile}
            onTouchEnd={handleTouchEndMobile}
            className="flex-1 overflow-y-auto px-4 py-4 relative scrollbar-thin"
          >
            {/* Pull to refresh indicator */}
            {pullDistance > 0 && (
              <div
                style={{ height: `${pullDistance}px`, opacity: pullDistance / 45 }}
                className="flex items-center justify-center overflow-hidden transition-all duration-150 select-none text-xs text-muted-foreground gap-2 font-semibold shrink-0"
              >
                <div className={`w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full ${isRefreshing || pullDistance > 45 ? 'animate-spin' : ''}`} />
                <span>{pullDistance > 45 ? 'Solte para atualizar...' : 'Puxe para atualizar...'}</span>
              </div>
            )}

            {stages[activeStageIndex] ? (() => {
              const stage = stages[activeStageIndex]
              const stageDealsList = visibleDeals.filter(
                (d) => d.stageId === stage.id && d.status === 'OPEN'
              )
              return (
                <div className="flex flex-col space-y-3.5 pb-24">
                  {stageDealsList.map((deal) => {
                    const contact = contacts.find((c) => c.id === deal.contactId)
                    const owner = users.find((u) => u.id === deal.ownerUserId)
                    const isSelected = selectedDeals.has(deal.id)
                    const pendingTasksCount = activities.filter(a => a.dealId === deal.id && a.status === 'OPEN').length
                    const dealActivities = activities.filter((a) => a.dealId === deal.id)
                    const hasOverdueActivity = dealActivities.some((a) => a.status === 'OPEN' && new Date(a.dueAt).getTime() < Date.now())
                    const hasFutureActivity = dealActivities.some(
                      (a) => a.status === 'OPEN' && new Date(a.dueAt).getTime() > Date.now()
                    )
                    const contactPhone = (contact?.telefone || deal.telefone || '').replace(/\D/g, '')
                    const msgData = lastMessageMap[contactPhone] || null
                    const hasUnreadMessage = msgData?.isRecent ?? false
                    const lastMessageTime = msgData?.time ?? ''
                    const isRecentMessage = msgData?.isRecent ?? false
                    const inActiveCadence = activeCadenceSet.has(deal.id)

                    return (
                      <DraggableDealCard
                        key={deal.id}
                        deal={deal}
                        contact={contact}
                        owner={owner}
                        hasFutureActivity={hasFutureActivity} hasOverdueActivity={hasOverdueActivity}
                        hasUnreadMessage={hasUnreadMessage}
                        lastMessageTime={lastMessageTime}
                        isRecentMessage={isRecentMessage}
                        inActiveCadence={inActiveCadence}
                        isSelected={isSelected}
                        isSelectionMode={isSelectionMode}
                        onSelect={() => handleSelectDeal(deal.id)}
                        onClick={() => setSelectedDeal(deal)}
                        onOpenMenu={() => setOpenMenuDealId(openMenuDealId === deal.id ? null : deal.id)}
                        isOpenMenu={openMenuDealId === deal.id}
                        onMarkWon={() => handleMarkWon(deal)}
                        onMarkLost={() => triggerMarkLost(deal)}
                        onDelete={() => handleDeleteDeal(deal.id)}
                        history={history}
                        stageSlaHours={stage.slaHours}
                        pulsingDeals={pulsingDeals}
                        onActivateSelectionMode={() => setIsSelectionMode(true)}
                        stageName={stage.nome}
                        stageColor={stage.cor}
                        pendingTasksCount={pendingTasksCount}
                      />
                    )
                  })}

                  {stageDealsList.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center opacity-40 border border-dashed border-border/20 rounded-2xl">
                      <div className="w-10 h-10 rounded-full border border-dashed border-border mb-3 flex items-center justify-center">
                        <Plus className="w-5 h-5 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold text-muted-foreground">Sem negócios nesta etapa</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">Toque em + para adicionar</p>
                    </div>
                  )}
                </div>
              )
            })() : (
              <div className="text-center py-20 text-muted-foreground text-sm">Nenhuma etapa configurada</div>
            )}
          </div>
        </div>
      ) : (
        /* Desktop Kanban board rendering with drag and drop kit */
        <div className="flex-1 overflow-x-auto pipeline-top-scroll">
          <DndContext
            sensors={sensors}
            onDragStart={(event) => setActiveDragDealId(event.active.id as string)}
            onDragEnd={(event) => {
              setActiveDragDealId(null)
              handleDragEnd(event)
            }}
            onDragCancel={() => setActiveDragDealId(null)}
          >
            <div className="flex gap-4 p-6 min-w-max h-full">
              {stages.map((stage) => {
                const stageDealsList = visibleDeals.filter(
                  (d) => d.stageId === stage.id && d.status === 'OPEN'
                )
                return (
                  <DroppableColumn
                    key={stage.id}
                    stage={stage}
                    deals={stageDealsList}
                    contacts={contacts}
                    users={users}
                    activities={activities}
                    history={history}
                    isSelectionMode={isSelectionMode}
                    selectedDeals={selectedDeals}
                    onSelectDeal={handleSelectDeal}
                    onSelectAllInStage={handleSelectAllInStage}
                    onDealClick={setSelectedDeal}
                    openMenuDealId={openMenuDealId}
                    setOpenMenuDealId={setOpenMenuDealId}
                    onMarkWon={handleMarkWon}
                    onMarkLost={triggerMarkLost}
                    onDeleteDeal={handleDeleteDeal}
                    onDeleteStage={setStageToDelete}
                    pulsingDeals={pulsingDeals}
                    lastMessageMap={lastMessageMap}
                    activeCadenceSet={activeCadenceSet}
                  />
                )
              })}

              <button
                onClick={() => setShowNewStageModal(true)}
                className="w-72 shrink-0 rounded-2xl border border-dashed border-border/30 hover:border-primary/50 bg-neutral-950/20 hover:bg-primary/5 flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-primary transition-all group min-h-[150px]"
              >
                <div className="w-10 h-10 rounded-full bg-neutral-900 group-hover:bg-primary/10 flex items-center justify-center transition-colors">
                  <Plus className="w-5 h-5" />
                </div>
                <span className="font-bold text-sm">Adicionar Coluna</span>
              </button>
            </div>
            
            <DragOverlay dropAnimation={null}>
              {activeDragDealId ? (() => {
                const d = deals.find(x => x.id === activeDragDealId)
                if (!d) return null
                return (
                  <div className="w-72 p-3.5 rounded-xl border border-primary/60 bg-neutral-900/95 shadow-2xl shadow-primary/20 opacity-90 cursor-grabbing">
                    <p className="text-xs font-bold text-foreground line-clamp-2">{d.titulo}</p>
                    <p className="text-[10px] text-primary mt-1">{BRL(d.valorEstimado)}</p>
                  </div>
                )
              })() : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}

      {/* ─── MOBILE VIEW: FLOATING + ACTION BUTTON (FAB) ─── */}
      {isMobile && (
        <button
          type="button"
          onClick={() => setShowNewDeal(true)}
          className="fixed bottom-20 right-6 z-30 w-14 h-14 rounded-full bg-primary text-black flex items-center justify-center shadow-2xl active:scale-95 hover:shadow-primary/30 transition-transform ocr-glow-intense border border-primary/20 shrink-0"
        >
          <Plus className="w-7 h-7 text-black font-extrabold" />
        </button>
      )}

      {/* ─── MOBILE VIEW: FILTERS BOTTOM SHEET ─── */}
      {isMobile && showMobileFilters && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowMobileFilters(false)}
        >
          <div
            className="w-full max-h-[85vh] bg-neutral-950 border-t border-border/40 rounded-t-3xl p-6 flex flex-col space-y-4 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="flex justify-center shrink-0 -mt-2">
              <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-border/20 shrink-0">
              <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Filtros e Busca</h3>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="text-xs text-muted-foreground font-semibold"
              >
                Fechar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 py-2 scrollbar-thin">
              {/* Search */}
              <div>
                <label className="ocr-label mb-1.5 block">Buscar Negócio</label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Buscar deal, contato ou telefone..."
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
                  />
                  {searchText && (
                    <button
                      type="button"
                      onClick={() => setSearchText('')}
                      className="absolute right-3 top-2.5 text-muted-foreground"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Owner Filter */}
              <div>
                <label className="ocr-label mb-1.5 block">Vendedor Responsável</label>
                <MobileActionSelect
                  label="Vendedor Responsável"
                  value={filterOwner}
                  onChange={setFilterOwner}
                  options={[
                    { value: 'all', label: 'Todos os vendedores' },
                    { value: 'unassigned', label: 'Sem responsável' },
                    ...users.map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))
                  ]}
                  className="w-full"
                />
              </div>

              {/* Priority Filter */}
              <div>
                <label className="ocr-label mb-1.5 block">Prioridade</label>
                <MobileActionSelect
                  label="Prioridade"
                  value={filterPriority}
                  onChange={setFilterPriority}
                  options={[
                    { value: 'all', label: 'Todas as prioridades' },
                    { value: 'BAIXA', label: '🟢 LEAD AP' },
                    { value: 'MEDIA', label: '🟠 ZONA CINZA' },
                    { value: 'ALTA', label: '🔴 DESQUALIFICADA' },
                    { value: 'NAO_RESPONDEU', label: '⚪ NÃO RESPONDEU' }
                  ]}
                  className="w-full"
                />
              </div>

              {/* Origin Filter */}
              <div>
                <label className="ocr-label mb-1.5 block">Origem</label>
                <MobileActionSelect
                  label="Origem"
                  value={filterOrigin}
                  onChange={setFilterOrigin}
                  options={[
                    { value: 'all', label: 'Todas as origens' },
                    { value: 'Meta Ads', label: 'Meta Ads' },
                    { value: 'Indicação', label: 'Indicação' },
                    { value: 'WhatsApp Orgânico', label: 'WhatsApp Orgânico' },
                    { value: 'Google', label: 'Google' }
                  ]}
                  className="w-full"
                />
              </div>
            </div>

            {/* Filter buttons */}
            <div className="pt-3 border-t border-border/20 flex gap-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setFilterOwner('all')
                  setFilterPriority('all')
                  setFilterOrigin('all')
                  setSearchText('')
                  setShowMobileFilters(false)
                }}
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-bold text-muted-foreground active:bg-neutral-900"
              >
                Limpar Filtros
              </button>
              <button
                type="button"
                onClick={() => setShowMobileFilters(false)}
                className="flex-1 py-3 rounded-xl bg-primary text-black font-extrabold text-xs active:opacity-90 animate-pulse-glow"
              >
                Aplicar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile bulk actions bar */}
      {isMobile && isSelectionMode && selectedDeals.size > 0 && (
        <div className="fixed bottom-20 left-2 right-2 z-40 bg-neutral-950/95 border border-primary/30 rounded-2xl p-3 shadow-2xl flex flex-wrap items-center gap-2 animate-scale-in">
          <span className="text-xs font-bold text-primary">{selectedDeals.size} sel.</span>
          <button onClick={handleGoToCaixaRapido}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs flex items-center gap-1.5">
            <Zap className="w-3 h-3" /> Nova Ação
          </button>
          <button onClick={handleBulkCloseWon} className="px-2 py-1.5 rounded-xl bg-emerald-500 text-black font-bold text-xs">Ganho</button>
          <button onClick={handleBulkCloseLost} className="px-2 py-1.5 rounded-xl bg-rose-500 text-white font-bold text-xs">Perdido</button>
          <button onClick={() => { setSelectedDeals(new Set()); setIsSelectionMode(false) }}
            className="p-1.5 text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* ─── NEW DEAL MODAL ─── */}
      {showNewDeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => setShowNewDeal(false)}
        >
          <div
            className="relative w-full max-w-lg bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in shadow-2xl max-md:max-h-[85vh] max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:border-l-0 max-md:border-r-0 max-md:pb-10 overflow-y-auto mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight">Nova Oportunidade</h3>
              <button
                onClick={() => setShowNewDeal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <div>
                <label className="ocr-label mb-1 block">Título do Deal *</label>
                <input
                  type="text"
                  value={newDeal.titulo}
                  onChange={(e) => setNewDeal((p) => ({ ...p, titulo: e.target.value }))}
                  onFocus={(e) => isMobile && e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                  placeholder="Ex: Contrato de Tráfego Semestral"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="ocr-label block">Contato *</label>
                  <button 
                    type="button" 
                    onClick={() => setIsNewContact(!isNewContact)}
                    className="text-[10px] text-primary hover:underline font-bold"
                  >
                    {isNewContact ? 'Vincular existente' : '+ Novo Contato'}
                  </button>
                </div>
                {isNewContact ? (
                  <div className="grid grid-cols-2 gap-3.5">
                    <input
                      type="text"
                      value={newContactData.nome}
                      onChange={(e) => setNewContactData(p => ({ ...p, nome: e.target.value }))}
                      placeholder="Nome do Contato"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                    />
                    <input
                      type="text"
                      value={newContactData.telefone}
                      onChange={(e) => setNewContactData(p => ({ ...p, telefone: e.target.value }))}
                      placeholder="Telefone (WhatsApp)"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                    />
                  </div>
                ) : (
                  <MobileActionSelect
                    label="Vincular Contato"
                    value={newDeal.contactId}
                    onChange={(val) => setNewDeal((p) => ({ ...p, contactId: val }))}
                    options={contacts.map((c) => ({ value: c.id, label: `${c.nome} ${c.sobrenome || ''} (${c.telefone})` }))}
                    placeholder="Selecione um contato da base..."
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                <div>
                  <label className="ocr-label mb-1 block">Valor Estimado (R$)</label>
                  <input
                    type="number"
                    value={newDeal.valorEstimado}
                    onChange={(e) => setNewDeal((p) => ({ ...p, valorEstimado: e.target.value }))}
                    onFocus={(e) => isMobile && e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    placeholder="Ex: 5000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Vendedor Responsável</label>
                  <MobileActionSelect
                    label="Vendedor Responsável"
                    value={newDeal.ownerUserId || currentUser?.id || ''}
                    onChange={(val) => setNewDeal((p) => ({ ...p, ownerUserId: val }))}
                    options={
                      currentUser?.isAdmin 
                        ? users.map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))
                        : users.filter(u => u.id === currentUser?.id).map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))
                    }
                    placeholder={currentUser?.isAdmin ? "Sem responsável" : `${users.find(u => u.id === currentUser?.id)?.nome ?? ''} (Você)`}
                    disabled={!currentUser?.isAdmin}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                <div>
                  <label className="ocr-label mb-1 block">Prioridade</label>
                  <MobileActionSelect
                    label="Prioridade"
                    value={newDeal.prioridade}
                    onChange={(val) => setNewDeal((p) => ({ ...p, prioridade: val }))}
                    options={[
                      { value: 'BAIXA', label: '🟢 LEAD AP' },
                      { value: 'MEDIA', label: '🟠 ZONA CINZA' },
                      { value: 'ALTA', label: '🔴 DESQUALIFICADA' },
                      { value: 'NAO_RESPONDEU', label: '⚪ NÃO RESPONDEU' }
                    ]}
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Etapa Comercial</label>
                  <MobileActionSelect
                    label="Etapa Comercial"
                    value={newDeal.stageId}
                    onChange={(val) => setNewDeal((p) => ({ ...p, stageId: val }))}
                    options={stages.map((s) => ({ value: s.id, label: s.nome }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5 max-md:grid-cols-1">
                <div>
                  <label className="ocr-label mb-1 block">Produto de Interesse</label>
                  <MobileActionSelect
                    label="Produto de Interesse"
                    value={newDeal.produtoInteresse}
                    onChange={(val) => setNewDeal((p) => ({ ...p, produtoInteresse: val }))}
                    options={categoriesStore.categories.products.map((p) => ({ value: p, label: p }))}
                    placeholder="Selecione..."
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Origem</label>
                  <MobileActionSelect
                    label="Origem"
                    value={newDeal.origem}
                    onChange={(val) => setNewDeal((p) => ({ ...p, origem: val }))}
                    options={categoriesStore.categories.origins.map((o) => ({ value: o, label: o }))}
                    placeholder="Selecione..."
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-4 shrink-0 border-t border-border/10 max-md:pb-4">
              <button
                type="button"
                onClick={() => setShowNewDeal(false)}
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-neutral-900 active:bg-neutral-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateDeal}
                className="flex-1 py-3 rounded-xl bg-primary text-black font-bold text-xs hover:shadow-lg hover:shadow-primary/20 active:opacity-90 transition-all"
              >
                Criar Oportunidade
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── NEW STAGE MODAL ─── */}
      {showNewStageModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => setShowNewStageModal(false)}
        >
          <div
            className="w-full max-w-sm bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:pb-10 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight">Nova Coluna</h3>
              <button
                onClick={() => setShowNewStageModal(false)}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="ocr-label mb-1 block">Nome da Coluna</label>
                <input
                  type="text"
                  value={newStageName}
                  onChange={(e) => setNewStageName(e.target.value)}
                  placeholder="Ex: Em Negociação"
                  className="w-full px-3 py-2 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                  autoFocus
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4 shrink-0 border-t border-border/10 max-md:pb-4">
              <button
                onClick={() => setShowNewStageModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateStage}
                disabled={!newStageName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-black font-bold text-xs hover:bg-primary/90 disabled:opacity-50"
              >
                Criar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE STAGE MIGRATION MODAL ─── */}
      {stageToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => { setStageToDelete(null); setMigrateToStageId('') }}
        >
          <div
            className="w-full max-w-md bg-neutral-950 border border-rose-500/30 shadow-[0_0_24px_rgba(244,63,94,0.15)] rounded-2xl p-6 space-y-4 animate-scale-in max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:pb-10 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight text-rose-400">Excluir Coluna</h3>
              <button
                onClick={() => { setStageToDelete(null); setMigrateToStageId('') }}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Você está prestes a excluir a coluna <strong className="text-foreground">{stageToDelete.nome}</strong>.
              </p>
              
              {deals.filter(d => d.stageId === stageToDelete.id && d.status === 'OPEN').length > 0 ? (
                <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                  <p className="text-xs font-semibold text-amber-400">
                    Atenção: Existem negócios nesta coluna!
                  </p>
                  <div>
                    <label className="ocr-label text-amber-400/80 mb-1 block">Mover negócios para a coluna:</label>
                    <MobileActionSelect
                      label="Mover negócios"
                      value={migrateToStageId}
                      onChange={setMigrateToStageId}
                      options={stages.filter(s => s.id !== stageToDelete.id).map(s => ({ value: s.id, label: s.nome }))}
                      placeholder="Selecione uma etapa..."
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-neutral-400">Nenhum negócio ativo nesta coluna. A exclusão será feita imediatamente.</p>
              )}
            </div>

            <div className="flex gap-3 pt-4 shrink-0 border-t border-border/10 max-md:pb-4">
              <button
                onClick={() => { setStageToDelete(null); setMigrateToStageId('') }}
                className="flex-1 py-2.5 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-neutral-900"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteStage}
                disabled={deals.filter(d => d.stageId === stageToDelete.id && d.status === 'OPEN').length > 0 && !migrateToStageId}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 text-white font-bold text-xs hover:bg-rose-600 disabled:opacity-50"
              >
                Confirmar e Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── LOST REASON MODAL ─── */}
      {showLostReasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => setShowLostReasonModal(null)}
        >
          <div
            className="w-full max-w-md bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:pb-10 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight">Motivo de Perda</h3>
              <button
                onClick={() => setShowLostReasonModal(null)}
                className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 flex-1">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Para fechar o negócio como **PERDIDO**, selecione ou descreva o motivo principal.
              </p>

              <div>
                <label className="ocr-label mb-1 block">Motivo Padrão</label>
                <MobileActionSelect
                  label="Motivo Padrão"
                  value={lostReasonInput}
                  onChange={setLostReasonInput}
                  options={LOSS_REASONS.map(r => ({ value: r, label: r }))}
                />
              </div>

              {lostReasonInput === 'Outro' && (
                <div>
                  <label className="ocr-label mb-1 block">Especifique o Motivo</label>
                  <textarea
                    value={customLostReason}
                    onChange={(e) => setCustomLostReason(e.target.value)}
                    onFocus={(e) => isMobile && e.target.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    placeholder="Descreva brevemente o motivo..."
                    rows={3}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowLostReasonModal(null)}
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-neutral-900 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLost}
                className="flex-1 py-3 rounded-xl bg-rose-500 text-white font-semibold text-xs hover:bg-rose-600 transition-colors"
              >
                Confirmar Perda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── VIEW ARCHIVED DEALS MODAL ─── */}
      {showArchived && (
        <ArchivedDealsView
          pipelineId={selectedPipelineId}
          contacts={contacts}
          users={users}
          stages={stages}
          onClose={() => setShowArchived(false)}
          onReopenDeal={handleReopenDeal}
          onDeleteDeal={handleDeleteDeal}
        />
      )}

      {/* ─── DEAL DETAIL DRAWER/SHEET ─── */}
      {selectedDeal && (
        <DealDetailDrawer
          deal={selectedDeal}
          contacts={contacts}
          users={users}
          stages={stages}
          activities={activities}
          historyLogs={history}
          currentUser={currentUser}
          onClose={() => setSelectedDeal(null)}
          onUpdateDeal={async (id, data) => {
            try {
              const updated = await crmActions.updateDeal(id, data)
              setDeals((prev) => prev.map((d) => (d.id === id ? updated : d)))
              setSelectedDeal(updated)
              const allHistory = await crmActions.getAllHistory()
              setHistory(allHistory)
            } catch {
              toast.error('Erro ao atualizar negócio.')
            }
          }}
          onMarkWon={handleMarkWon}
          onMarkLost={triggerMarkLost}
          onReopenDeal={handleReopenDeal}
          onDeleteDeal={handleDeleteDeal}
          onAddActivity={async (activityData) => {
            try {
              const created = await crmActions.createActivity(activityData)
              setActivities((prev) => [...prev, created])
              toast.success('Atividade criada!')
            } catch {
              toast.error('Erro ao criar atividade.')
            }
          }}
          onToggleActivity={async (activityId, done) => {
            try {
              const updated = await crmActions.updateActivity(activityId, {
                status: (done ? 'DONE' : 'OPEN') as 'DONE' | 'OPEN',
                doneAt: done ? new Date().toISOString() : undefined
              })
              setActivities((prev) => prev.map((a) => (a.id === activityId ? updated : a)))
              toast.success(done ? 'Atividade concluída!' : 'Atividade reaberta!')
            } catch {
              toast.error('Erro ao atualizar atividade.')
            }
          }}
          onDeleteActivity={async (activityId) => {
            try {
              await crmActions.deleteActivity(activityId)
              setActivities((prev) => prev.filter((a) => a.id !== activityId))
              toast.success('Atividade excluída.')
            } catch {
              toast.error('Erro ao excluir atividade.')
            }
          }}
          onUpdateActivity={async (activityId, data) => {
            try {
              const updated = await crmActions.updateActivity(activityId, data)
              setActivities((prev) => prev.map((a) => (a.id === activityId ? updated : a)))
              toast.success('Atividade atualizada!')
            } catch {
              toast.error('Erro ao atualizar atividade.')
            }
          }}
        />
      )}
    </div>
  )
}


// ─── ARCHIVED DEALS VIEW COMPONENT ──────────────────────────────────────────
function ArchivedDealsView({
  pipelineId,
  contacts,
  users,
  stages,
  onClose,
  onReopenDeal,
  onDeleteDeal
}: {
  pipelineId: string
  contacts: MockContact[]
  users: MockUser[]
  stages: MockStage[]
  onClose: () => void
  onReopenDeal: (id: string) => void
  onDeleteDeal: (id: string, forcePermanent?: boolean) => void
}) {
  const [filterType, setFilterType] = useState<'ALL' | 'WON' | 'LOST'>('ALL')
  const [filterOwner, setFilterOwner] = useState('all')
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState<MockDeal[]>([])

  useEffect(() => {
    const state = crmInternal.getState?.() ?? { users: [], history: [], deals: [] }
    const allPipelineDeals = state.deals.filter(
      (d: MockDeal) => d.pipelineId === pipelineId && (d.status === 'WON' || d.status === 'LOST')
    )
    Promise.resolve().then(() => setArchived(allPipelineDeals))
  }, [pipelineId])

  const filtered = archived.filter((d) => {
    if (filterType !== 'ALL' && d.status !== filterType) return false
    if (filterOwner !== 'all' && d.ownerUserId !== filterOwner) return false
    if (search.trim() !== '') {
      const q = search.toLowerCase()
      const contact = contacts.find((c) => c.id === d.contactId)
      const contactName = contact ? `${contact.nome} ${contact.sobrenome || ''}`.toLowerCase() : ''
      return d.titulo.toLowerCase().includes(q) || contactName.includes(q)
    }
    return true
  })

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md max-md:items-end max-md:p-0 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-neutral-950 border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in shadow-2xl flex flex-col max-h-[85vh] max-md:max-h-[85vh] max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:border-l-0 max-md:border-r-0 max-md:pb-10 mobile-bottom-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sheet Handle */}
        <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
          <div className="w-12 h-1.5 rounded-full bg-neutral-800" />
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold tracking-tight">Oportunidades Arquivadas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Negócios que foram finalizados (Ganhos ou Perdidos)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-neutral-800 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-48 max-md:w-full">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título, contato..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border/30 bg-neutral-900/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'ALL' | 'WON' | 'LOST')}
            className="bg-neutral-900 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none"
          >
            <option value="ALL">Status: Todos</option>
            <option value="WON">Ganhos (Won)</option>
            <option value="LOST">Perdidos (Lost)</option>
          </select>

          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="bg-neutral-900 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none"
          >
            <option value="all">Vendedor: Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Table list / Cards List */}
        <div className="flex-1 overflow-y-auto scrollbar-thin border border-border/20 rounded-xl">
          <table className="hidden md:table w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-neutral-900 border-b border-border/20 text-muted-foreground font-semibold">
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Contato</th>
                <th className="px-4 py-3">Valor</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/10">
              {filtered.map((d) => {
                const contact = contacts.find((c) => c.id === d.contactId)
                const owner = users.find((u) => u.id === d.ownerUserId)
                const _stage = stages.find((s) => s.id === d.stageId)

                return (
                  <tr key={d.id} className="hover:bg-neutral-900/40">
                    <td className="px-4 py-3 font-semibold text-foreground">{d.titulo}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {contact?.nome} {contact?.sobrenome || ''}
                    </td>
                    <td className="px-4 py-3 text-primary font-bold">{BRL(d.valorEstimado)}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {owner ? `${owner.nome} ${owner.sobrenome || ''}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {d.status === 'WON' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold text-[10px]">
                          GANHO
                        </span>
                      ) : (
                        <span
                          title={`Motivo: ${d.motivoPerda}`}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 font-bold text-[10px] cursor-help"
                        >
                          PERDIDO • {d.motivoPerda || 'Outro'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1.5">
                      <button
                        onClick={() => {
                          onReopenDeal(d.id)
                          // update internal state too
                          setArchived((prev) => prev.filter((item) => item.id !== d.id))
                        }}
                        className="px-2 py-1 rounded bg-primary/10 border border-primary/20 text-primary hover:bg-primary hover:text-black font-semibold transition-all"
                      >
                        Reabrir
                      </button>
                      <button
                        onClick={() => {
                          onDeleteDeal(d.id, true)
                          setArchived((prev) => prev.filter((item) => item.id !== d.id))
                        }}
                        className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white font-semibold transition-all"
                      >
                        Excluir Permanente
                      </button>
                    </td>
                  </tr>
                )
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Nenhum negócio arquivado encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── DEAL DETAIL DRAWER COMPONENT (8 TABS) ──────────────────────────────────
function DealDetailDrawer({
  deal,
  contacts,
  users,
  stages,
  activities,
  historyLogs,
  currentUser,
  onClose,
  onUpdateDeal,
  onMarkWon,
  onMarkLost,
  onReopenDeal,
  onDeleteDeal,
  onAddActivity,
  onToggleActivity,
  onDeleteActivity,
  onUpdateActivity
}: {
  deal: any
  contacts: any[]
  users: any[]
  stages: any[]
  activities: any[]
  historyLogs: any[]
  currentUser: { id: string; isAdmin: boolean } | null
  onClose: () => void
  onUpdateDeal: (id: string, data: Partial<any>) => Promise<void>
  onMarkWon: (deal: any) => void
  onMarkLost: (deal: any) => void
  onReopenDeal: (id: string) => Promise<void>
  onDeleteDeal: (id: string) => void
  onAddActivity: (data: any) => Promise<void>
  onToggleActivity: (id: string, done: boolean) => Promise<void>
  onDeleteActivity: (id: string) => Promise<void>
  onUpdateActivity: (id: string, data: Partial<any>) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'resumo' | 'contato' | 'anotacoes' | 'atividades' | 'historico' | 'utm' | 'mensagens'>('resumo')
  const router = useRouter()
  const categoriesStore = useCategories()

  // Dragging logic
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only drag if clicking the header background, not buttons or inputs inside it
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('input') || (e.target as HTMLElement).closest('select')) {
      return
    }
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false)
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  const dealContact = contacts.find((c) => c.id === deal.contactId)
  const dealOwner = users.find((u) => u.id === deal.ownerUserId)

  // Edit fields
  const [titleInput, setTitleInput] = useState(deal.titulo)
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [valueInput, setValueInput] = useState(deal.valorEstimado.toString())
  const [produtoInput, setProdutoInput] = useState(deal.produtoInteresse || '')
  const [origemInput, setOrigemInput] = useState(deal.origem || '')
  const [prioInput, setPrioInput] = useState(deal.prioridade)
  const [ownerInput, setOwnerInput] = useState(deal.ownerUserId || '')
  const [stageInput, setStageInput] = useState(deal.stageId)

  // Inline edit states for Ramo and Faturamento
  const [ramoInput, setRamoInput] = useState(deal.ramoEmpresa || '')
  const [faturamentoInput, setFaturamentoInput] = useState(
    deal.faturamentoMensal
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.faturamentoMensal)
      : ''
  )
  const [showRamoCheck, setShowRamoCheck] = useState(false)
  const [showFaturamentoCheck, setShowFaturamentoCheck] = useState(false)

  useEffect(() => {
    setRamoInput(deal.ramoEmpresa || '')
    setFaturamentoInput(
      deal.faturamentoMensal
        ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(deal.faturamentoMensal)
        : ''
    )
  }, [deal.ramoEmpresa, deal.faturamentoMensal])

  const handleSaveRamo = async () => {
    if (ramoInput !== deal.ramoEmpresa) {
      await onUpdateDeal(deal.id, { ramoEmpresa: ramoInput })
      setShowRamoCheck(true)
      setTimeout(() => setShowRamoCheck(false), 2000)
    }
  }

  const parseFaturamento = (raw: string): number => {
    // Remove currency symbols, dots (thousands) and convert comma to dot
    const cleaned = raw.replace(/[R$\s.]/g, '').replace(',', '.')
    return parseFloat(cleaned) || 0
  }

  const handleSaveFaturamento = async () => {
    const val = parseFaturamento(faturamentoInput)
    if (val !== deal.faturamentoMensal) {
      await onUpdateDeal(deal.id, { faturamentoMensal: val })
      setFaturamentoInput(
        val > 0
          ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(val)
          : ''
      )
      setShowFaturamentoCheck(true)
      setTimeout(() => setShowFaturamentoCheck(false), 2000)
    }
  }

  // Notes fields with autosave debounce (1s)
  const [anotacoes, setAnotacoes] = useState(deal.anotacoes || '')
  const [anotacoesReuniao, setAnotacoesReuniao] = useState(deal.anotacoesReuniao || '')
  const [saveStatus, setSaveStatus] = useState<'salvo' | 'salvando' | 'erro'>('salvo')
  const saveTimeoutRef = useRef<any>(null)

  // Messages state loaded from action
  const [messages, setMessages] = useState<any[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [newMsg, setNewMsg] = useState('')

  useEffect(() => {
    if (activeTab === 'mensagens') {
      setLoadingMessages(true)
      const phone = dealContact?.telefone || ''
      crmActions.getChatHistory(phone, deal.id).then(msgs => {
        setMessages(msgs)
        setLoadingMessages(false)
      })
    }
  }, [activeTab, deal.id, dealContact?.telefone])

  // Activity Form state
  const [editingActId, setEditingActId] = useState<string | null>(null)
  const [actTitle, setActTitle] = useState('')
  const [actTipo, setActTipo] = useState('tarefa')
  const [actDesc, setActDesc] = useState('')
  const [actDate, setActDate] = useState('')

  // Title save
  const handleSaveTitle = async () => {
    if (titleInput.trim() !== '') {
      await onUpdateDeal(deal.id, { titulo: titleInput })
      setIsEditingTitle(false)
      toast.success('Título atualizado.')
    }
  }

  // General Fields save
  const handleSaveFields = async () => {
    const changes: any = {
      valorEstimado: parseFloat(valueInput) || 0,
      produtoInteresse: produtoInput || null,
      origem: origemInput || null,
      prioridade: prioInput,
      ownerUserId: ownerInput || null,
      stageId: stageInput
    }
    await onUpdateDeal(deal.id, changes)
    toast.success('Campos do negócio salvos!')
  }

  // Autosave for Notes
  const triggerNotesAutosave = (updatedNotes: string, updatedMeetingNotes: string) => {
    setSaveStatus('salvando')
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onUpdateDeal(deal.id, {
          anotacoes: updatedNotes,
          anotacoesReuniao: updatedMeetingNotes
        })
        setSaveStatus('salvo')
      } catch (e) {
        setSaveStatus('erro')
      }
    }, 1000)
  }

  // Activities list for current deal
  const dealActivities = activities.filter((a) => a.dealId === deal.id)

  // History list for current deal
  const [dealHistoryList, setDealHistoryList] = useState<any[]>([])
  useEffect(() => {
    async function fetchHistory() {
      const logs = await crmActions.getDealStageHistory(deal.id)
      setDealHistoryList(logs)
    }
    fetchHistory()
  }, [deal.id, historyLogs])

  // SLA calculations
  const stage = stages.find((s) => s.id === deal.stageId)
  const slaHours = stage ? stage.slaHours : 0
  const [slaProgressText, setSlaProgressText] = useState('')
  const [slaProgressRatio, setSlaProgressRatio] = useState(0)

  useEffect(() => {
    const stageHistory = historyLogs.filter((h: any) => h.dealId === deal.id && h.paraStageId === deal.stageId)
    const lastEntry = stageHistory.length > 0 ? stageHistory[stageHistory.length - 1] : null
    const entryTime = lastEntry ? new Date(lastEntry.mudouEm).getTime() : new Date(deal.createdAt).getTime()
    const diffHours = (Date.now() - entryTime) / (1000 * 60 * 60)

    if (slaHours > 0) {
      setSlaProgressRatio(Math.min(diffHours / slaHours, 1))
      setSlaProgressText(`${diffHours.toFixed(1)}h decorridas / ${slaHours}h limite de SLA`)
    } else {
      setSlaProgressRatio(0)
      setSlaProgressText('Sem limite de SLA definido para esta etapa.')
    }
  }, [deal.stageId, deal.createdAt, historyLogs, slaHours])

  return (
    <div
      className="fixed inset-0 z-50 pointer-events-none"
    >
      <div
        className="absolute right-4 top-[7.5vh] w-full max-w-2xl bg-neutral-950 border border-border/40 h-[85vh] flex flex-col shadow-2xl rounded-2xl pointer-events-auto max-md:right-0 max-md:w-full max-md:h-[85vh] max-md:bottom-0 max-md:top-auto max-md:rounded-t-3xl max-md:rounded-b-none"
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
          transition: isDragging ? 'none' : 'transform 0.1s ease-out'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile bottom sheet */}
        <div
          className="hidden max-md:flex justify-center shrink-0 pt-3 pb-1 relative cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="w-16 h-1.5 rounded-full bg-neutral-600 hover:bg-primary/60 transition-colors" />
          <button
            onClick={onClose}
            className="absolute right-4 top-2 p-1.5 rounded-full bg-neutral-900 text-muted-foreground hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {/* Header */}
        <div 
          className="p-6 border-b border-border/20 flex flex-col gap-4 cursor-grab active:cursor-grabbing max-md:cursor-default"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`flex items-center gap-1.5 text-[10px] font-extrabold px-3 py-1.5 rounded-full border ${
                  deal.status === 'WON'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : deal.status === 'LOST'
                    ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                    : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    deal.status === 'WON'
                      ? 'bg-emerald-400'
                      : deal.status === 'LOST'
                      ? 'bg-rose-400'
                      : 'bg-amber-400'
                  }`}
                />
                {deal.status === 'WON' ? 'GANHO' : deal.status === 'LOST' ? `PERDIDO (${deal.motivoPerda})` : 'ABERTO'}
              </span>

              {deal.status === 'OPEN' && (
                <select
                  value={stageInput}
                  onChange={async (e) => {
                    const newStage = e.target.value
                    setStageInput(newStage)
                    await onUpdateDeal(deal.id, { stageId: newStage })
                  }}
                  className="text-[10px] font-bold bg-neutral-900/50 hover:bg-neutral-900 border border-border/40 rounded-full px-3 py-1.5 text-neutral-300 focus:outline-none transition-colors cursor-pointer"
                >
                  {stages.map(s => (
                    <option key={s.id} value={s.id}>{s.nome}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              {deal.status === 'OPEN' ? (
                <>
                  <button
                    onClick={() => {
                      onMarkWon(deal)
                      onClose()
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black text-xs font-bold transition-all"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> Ganho
                  </button>
                  <button
                    onClick={() => {
                      onMarkLost(deal)
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-500/35 text-rose-400 hover:bg-rose-950/20 text-xs font-semibold transition-all"
                  >
                    <X className="w-3.5 h-3.5" /> Perdido
                  </button>
                </>
              ) : (
                <button
                  onClick={async () => {
                    await onReopenDeal(deal.id)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-primary text-black text-xs font-bold hover:scale-[1.01]"
                >
                  Reabrir Negócio
                </button>
              )}
              <button
                onClick={() => onDeleteDeal(deal.id)}
                className="p-2 rounded-xl border border-border hover:bg-neutral-800 text-muted-foreground hover:text-rose-400 transition-colors"
                title="Excluir negócio"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-border hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-colors ml-1 hidden md:flex"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div>
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="bg-neutral-900 border border-border text-foreground font-bold px-3 py-1.5 rounded-xl text-lg focus:outline-none"
                />
                <button
                  onClick={handleSaveTitle}
                  className="px-3 py-1.5 rounded-xl bg-primary text-black text-xs font-bold"
                >
                  Salvar
                </button>
                <button
                  onClick={() => {
                    setTitleInput(deal.titulo)
                    setIsEditingTitle(false)
                  }}
                  className="px-3 py-1.5 rounded-xl border border-border text-xs text-muted-foreground"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <h2
                onClick={() => setIsEditingTitle(true)}
                className="text-lg font-extrabold tracking-tight text-foreground hover:underline decoration-dashed cursor-pointer flex items-center gap-2"
              >
                {deal.titulo} <span className="text-[10px] text-muted-foreground font-normal">(clique para editar)</span>
              </h2>
            )}
            <p className="text-xl font-black text-primary mt-1.5">{BRL(deal.valorEstimado)}</p>
          </div>

          {/* SLA Progression Bar */}
          {slaHours > 0 && deal.status === 'OPEN' && (
            <div className="p-3.5 rounded-xl border border-border/20 bg-neutral-900/35 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-muted-foreground">Progresso do SLA da Etapa</span>
                <span className="font-bold text-foreground">{slaProgressText}</span>
              </div>
              <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    slaProgressRatio >= 1.0
                      ? 'bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                      : slaProgressRatio >= 0.5
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${slaProgressRatio * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pipeline Stages Timeline */}
        <div className="px-6 pb-4">
          <div className="flex items-center justify-start md:justify-between gap-2 overflow-x-auto pb-2 scrollbar-thin">
            {stages.map((stage, idx) => {
              const isCurrent = stage.id === deal.stageId;
              const isPast = stages.findIndex(s => s.id === stage.id) < stages.findIndex(s => s.id === deal.stageId);
              return (
                <div key={stage.id} className="shrink-0 w-[100px] md:w-auto md:flex-1 flex flex-col items-center gap-1.5">
                  <div className={`h-1.5 w-full rounded-full transition-all ${isCurrent ? 'bg-primary shadow-[0_0_5px_rgba(255,255,255,0.3)]' : isPast ? 'bg-primary/40' : 'bg-neutral-800'}`} />
                  <span className={`text-[9px] text-center font-bold px-1 whitespace-nowrap overflow-hidden text-ellipsis w-full ${isCurrent ? 'text-primary' : isPast ? 'text-neutral-400' : 'text-neutral-600'}`} title={stage.nome}>
                    {stage.nome}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-border/20 bg-neutral-900/30 overflow-x-auto select-none shrink-0">
          {[
            { id: 'resumo', label: 'Resumo' },
            { id: 'contato', label: 'Contato' },
            { id: 'anotacoes', label: 'Anotações' },
            { id: 'atividades', label: 'Atividades' },
            { id: 'historico', label: 'Histórico' },
            { id: 'utm', label: 'UTM / Atribuição' },
            { id: 'mensagens', label: 'Mensagens' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              className={`px-4 py-3 text-xs font-semibold transition-all border-b-2 shrink-0 ${
                activeTab === t.id
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6">
          {/* 1. RESUMO */}
          {activeTab === 'resumo' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
                <div>
                  <label className="ocr-label mb-1 block">Estágio Atual</label>
                  <MobileActionSelect
                    label="Estágio Atual"
                    value={stageInput}
                    onChange={setStageInput}
                    options={stages.map((s) => ({ value: s.id, label: s.nome }))}
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Vendedor Responsável</label>
                  {currentUser?.isAdmin ? (
                    <MobileActionSelect
                      label="Vendedor Responsável"
                      value={ownerInput}
                      onChange={setOwnerInput}
                      options={[
                        { value: '', label: 'Sem responsável' },
                        ...users.map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))
                      ]}
                    />
                  ) : (
                    <div className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900/50 text-sm text-foreground/70 cursor-not-allowed">
                      {ownerInput ? users.find(u => u.id === ownerInput)?.nome || 'Sem responsável' : 'Sem responsável'}
                    </div>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
                <div>
                  <label className="ocr-label mb-1 block">Valor Estimado (R$)</label>
                  <input
                    type="number"
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border/30 bg-neutral-900 text-xs focus:outline-none"
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Prioridade</label>
                  <MobileActionSelect
                    label="Prioridade"
                    value={prioInput}
                    onChange={setPrioInput}
                    options={[
                      { value: 'BAIXA', label: '🟢 LEAD AP' },
                      { value: 'MEDIA', label: '🟠 ZONA CINZA' },
                      { value: 'ALTA', label: '🔴 DESQUALIFICADA' },
                      { value: 'NAO_RESPONDEU', label: '⚪ NÃO RESPONDEU' }
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
                <div>
                  <label className="ocr-label mb-1 block">Produto de Interesse</label>
                  <MobileActionSelect
                    label="Produto de Interesse"
                    value={produtoInput}
                    onChange={setProdutoInput}
                    options={[
                      { value: '', label: 'Selecione...' },
                      ...categoriesStore.categories.products.map(p => ({ value: p, label: p }))
                    ]}
                    placeholder="Selecione..."
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Origem do Negócio</label>
                  <MobileActionSelect
                    label="Origem do Negócio"
                    value={origemInput}
                    onChange={(val) => { setOrigemInput(val); onUpdateDeal(deal.id, { origem: val || null }) }}
                    options={[
                      { value: '', label: 'Selecione...' },
                      ...categoriesStore.categories.origins.map(o => ({ value: o, label: o }))
                    ]}
                    placeholder="Selecione..."
                  />
                </div>
              </div>

              <div className="border-t border-border/20 pt-4 mt-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">
                  Snapshot do Contato (Read-only)
                </h4>
                <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
                  <div className="p-3 rounded-xl bg-neutral-900/50 border border-border/20">
                    <p className="ocr-label mb-0.5">Telefone</p>
                    <p className="text-xs font-semibold">{dealContact?.telefone || '-'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-900/50 border border-border/20 relative">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="ocr-label">Faturamento Mensal</p>
                      {showFaturamentoCheck && <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />}
                    </div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={faturamentoInput}
                      onChange={(e) => setFaturamentoInput(e.target.value)}
                      onBlur={handleSaveFaturamento}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveFaturamento()
                          e.currentTarget.blur()
                        }
                      }}
                      placeholder="R$ 0"
                      className="w-full bg-transparent border-none p-0 text-xs font-semibold focus:outline-none focus:ring-0 text-foreground"
                    />
                  </div>
                  <div className="p-3 rounded-xl bg-neutral-900/50 border border-border/20 col-span-2 max-md:col-span-1 relative">
                    <div className="flex items-center justify-between mb-0.5">
                      <p className="ocr-label">Ramo da Empresa</p>
                      {showRamoCheck && <Check className="w-3.5 h-3.5 text-emerald-400 animate-bounce" />}
                    </div>
                    <input
                      type="text"
                      value={ramoInput}
                      onChange={(e) => setRamoInput(e.target.value)}
                      onBlur={handleSaveRamo}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleSaveRamo()
                          e.currentTarget.blur()
                        }
                      }}
                      placeholder="Ex: Tecnologia"
                      className="w-full bg-transparent border-none p-0 text-xs font-semibold focus:outline-none focus:ring-0 text-foreground"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSaveFields}
                  className="px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:shadow-lg transition-all"
                >
                  Salvar Alterações
                </button>
              </div>
            </div>
          )}

          {/* 2. CONTATO */}
          {activeTab === 'contato' && (
            <div className="space-y-4">
              {dealContact ? (
                <div className="ocr-card card-padding space-y-4 border border-border/30">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-lg">
                      {dealContact.nome[0]}
                      {dealContact.sobrenome ? dealContact.sobrenome[0] : ''}
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground">
                        {dealContact.nome} {dealContact.sobrenome || ''}
                      </h4>
                      <p className="text-xs text-muted-foreground">{dealContact.email || 'Sem e-mail cadastrado'}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3.5 text-xs border-t border-border/20 pt-3.5">
                    <div>
                      <p className="ocr-label mb-0.5">Telefone</p>
                      <p className="font-semibold">{dealContact.telefone}</p>
                    </div>
                    <div>
                      <p className="ocr-label mb-0.5">Cidade/Estado</p>
                      <p className="font-semibold">
                        {dealContact.cidade || '-'}
                        {dealContact.estado ? ` / ${dealContact.estado}` : ''}
                      </p>
                    </div>
                  </div>

                  <div className="text-xs">
                    <p className="ocr-label mb-1">Último UTM Identificado</p>
                    <p className="font-semibold bg-neutral-900/60 p-2 rounded-xl border border-border/20 inline-block">
                      Source: {dealContact.lastUtmSource || 'Orgânico'} • Campaign: {dealContact.lastUtmCampaign || '-'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      router.push(`/contacts?id=${dealContact.id}`)
                    }}
                    className="w-full py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-neutral-900 text-foreground transition-colors"
                  >
                    Ver Perfil Completo de Contatos
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground bg-neutral-900/30 rounded-2xl border border-dashed border-border/20">
                  Nenhum contato vinculado encontrado.
                </div>
              )}
            </div>
          )}

          {/* 3. ANOTAÇÕES */}
          {activeTab === 'anotacoes' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-muted-foreground">Autosave debounced (1s)</span>
                {saveStatus === 'salvando' && <span className="text-primary font-bold animate-pulse">salvando...</span>}
                {saveStatus === 'salvo' && <span className="text-emerald-400 font-bold">✓ salvo</span>}
                {saveStatus === 'erro' && <span className="text-rose-400 font-bold">⚠️ erro ao salvar</span>}
              </div>

              <div>
                <label className="ocr-label mb-1.5 block">Anotações Gerais (Observações livres)</label>
                <textarea
                  value={anotacoes}
                  onChange={(e) => {
                    setAnotacoes(e.target.value)
                    triggerNotesAutosave(e.target.value, anotacoesReuniao)
                  }}
                  placeholder="Escreva detalhes gerais do negócio, perfis dos decisores, etc..."
                  rows={6}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono"
                />
              </div>

              <div>
                <label className="ocr-label mb-1.5 block">Anotações de Reunião (Calls, visitas e alinhamentos)</label>
                <textarea
                  value={anotacoesReuniao}
                  onChange={(e) => {
                    setAnotacoesReuniao(e.target.value)
                    triggerNotesAutosave(anotacoes, e.target.value)
                  }}
                  placeholder="Descreva especificamente o que foi acordado em call/visita..."
                  rows={4}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-900 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono"
                />
              </div>
            </div>
          )}

          {/* 4. ATIVIDADES */}
          {activeTab === 'atividades' && (
            <div className="space-y-5">
              {/* Form to add */}
              <div className="p-4 rounded-xl border border-border/30 bg-neutral-900/30 space-y-3">
                <h4 className="text-xs font-bold text-foreground">Nova Atividade</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Título da tarefa..."
                    className="col-span-2 w-full px-2.5 py-1.5 rounded-lg border border-border/30 bg-neutral-900 text-xs focus:outline-none"
                  />
                  <select
                    value={actTipo}
                    onChange={(e) => setActTipo(e.target.value)}
                    className="bg-neutral-900 border border-border/30 rounded-lg px-2.5 py-1.5 text-xs"
                  >
                    <option value="tarefa">Tarefa</option>
                    <option value="ligacao">Ligação</option>
                    <option value="reuniao">Reunião</option>
                    <option value="WhatsApp">WhatsApp</option>
                    <option value="email">E-mail</option>
                    <option value="nota">Nota</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={actDate}
                    onChange={(e) => setActDate(e.target.value)}
                    className="bg-neutral-900 border border-border/30 rounded-lg px-2 py-1.5 text-xs text-muted-foreground"
                  />
                  <textarea
                    value={actDesc}
                    onChange={(e) => setActDesc(e.target.value)}
                    placeholder="Descrição..."
                    rows={2}
                    className="col-span-2 w-full px-2.5 py-1.5 rounded-lg border border-border/30 bg-neutral-900 text-xs focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!actTitle) return
                      const payload = {
                        tipo: actTipo,
                        titulo: actTitle,
                        descricao: actDesc || undefined,
                        dueAt: actDate ? new Date(actDate).toISOString() : new Date().toISOString()
                      }
                      
                      if (editingActId) {
                        await onUpdateActivity(editingActId, payload)
                      } else {
                        await onAddActivity({
                          dealId: deal.id,
                          contactId: deal.contactId,
                          status: 'OPEN',
                          ...payload
                        })
                      }
                      setActTitle('')
                      setActDesc('')
                      setActDate('')
                      setEditingActId(null)
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold text-[10px]"
                  >
                    {editingActId ? 'Salvar Edição' : 'Agendar Atividade'}
                  </button>
                  {editingActId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingActId(null)
                        setActTitle('')
                        setActDesc('')
                        setActDate('')
                      }}
                      className="px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground text-[10px]"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Activities list */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-foreground">Agendadas e Concluídas</h4>
                {dealActivities.length > 0 ? (
                  <div className="space-y-2">
                    {dealActivities.map((act) => (
                      <div
                        key={act.id}
                        className={`p-3 rounded-xl border flex items-start justify-between gap-3 text-xs ${
                          act.status === 'DONE'
                            ? 'bg-neutral-900/35 border-border/10 opacity-60'
                            : 'bg-neutral-900/60 border-border/30'
                        }`}
                      >
                        <div className="flex gap-2 items-start">
                          <input
                            type="checkbox"
                            checked={act.status === 'DONE'}
                            onChange={(e) => onToggleActivity(act.id, e.target.checked)}
                            className="mt-0.5 cursor-pointer accent-primary"
                          />
                          <div>
                            <p className={`font-bold ${act.status === 'DONE' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                              {act.titulo}
                            </p>
                            {act.descricao && <p className="text-[10px] text-muted-foreground mt-0.5">{act.descricao}</p>}
                            <p className="text-[9px] text-neutral-500 mt-1">
                              Vence em: {new Date(act.dueAt).toLocaleDateString()} {new Date(act.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • Tipo: {act.tipo}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {!act.status || act.status === 'OPEN' ? (
                            <button
                              onClick={() => {
                                setEditingActId(act.id)
                                setActTitle(act.titulo)
                                setActTipo(act.tipo)
                                setActDesc(act.descricao || '')
                                setActDate(act.dueAt ? new Date(act.dueAt).toISOString().slice(0, 16) : '')
                              }}
                              className="text-neutral-500 hover:text-primary p-1"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                            </button>
                          ) : null}
                          <button
                            onClick={() => onDeleteActivity(act.id)}
                            className="text-neutral-500 hover:text-rose-400 p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Sem atividades pendentes.</p>
                )}
              </div>
            </div>
          )}

          {/* 5. HISTÓRICO */}
          {activeTab === 'historico' && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-foreground">Logs de Atividade do Funil</h4>
              {dealHistoryList.length > 0 ? (
                <div className="relative border-l-2 border-border/20 pl-4 ml-2 space-y-4">
                  {dealHistoryList.map((log) => {
                    let logTitle = `Migrou de: ${log.deStage} → ${log.paraStage}`
                    let logColor = 'bg-primary'
                    
                    if (log.fonte === 'fechamento_ganho') {
                      logTitle = `🏆 Marcado como GANHO na etapa ${log.paraStage}`
                      logColor = 'bg-emerald-400'
                    } else if (log.fonte === 'fechamento_perdido') {
                      logTitle = `❌ Marcado como PERDIDO na etapa ${log.paraStage}`
                      logColor = 'bg-rose-500'
                    } else if (log.fonte === 'reabertura') {
                      logTitle = `🔄 Negócio Reaberto na etapa ${log.paraStage}`
                      logColor = 'bg-amber-400'
                    }

                    return (
                      <div key={log.id} className="relative text-xs">
                        <span
                          className={`absolute -left-6 top-1 w-2.5 h-2.5 rounded-full border border-neutral-950 ${logColor}`}
                        />
                        <p className="font-bold text-foreground">{logTitle}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Por: {log.mudouPor} • Origem: {log.fonte}
                        </p>
                        <p className="text-[9px] text-neutral-500 mt-0.5">
                          {new Date(log.mudouEm).toLocaleDateString()} {new Date(log.mudouEm).toLocaleTimeString()}
                        </p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Nenhum histórico registrado.</p>
              )}
            </div>
          )}

          {/* 6. UTM / ATRIBUIÇÃO */}
          {activeTab === 'utm' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-border/30 bg-neutral-900/35 space-y-3 text-xs">
                <div className="flex items-center gap-1.5 text-primary font-bold">
                  <Info className="w-3.5 h-3.5" />
                  <span>UTMs Congeladas na Criação</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  As UTMs registradas abaixo representam a origem do lead no momento em que o negócio foi criado.
                  Elas **nunca mudam**, mesmo que o contato receba novas campanhas posteriormente, garantindo a
                  atribuição correta do ROI.
                </p>

                <div className="grid grid-cols-2 gap-3.5 border-t border-border/20 pt-3.5">
                  {[
                    { label: 'UTM Source', value: deal.utmSource || '-' },
                    { label: 'UTM Medium', value: deal.utmMedium || '-' },
                    { label: 'UTM Campaign', value: deal.utmCampaign || '-' },
                    { label: 'UTM Content', value: deal.utmContent || '-' },
                    { label: 'UTM Term', value: deal.utmTerm || '-' },
                    { label: 'UTM Captured At', value: deal.utmCapturedAt ? new Date(deal.utmCapturedAt).toLocaleDateString() : '-' },
                    { label: 'Landing Page', value: deal.utmLandingPage || '/' },
                    { label: 'Referrer URL', value: deal.utmReferrer || '-' }
                  ].map((utmField, idx) => (
                    <div key={idx} className="p-2 rounded bg-neutral-900 border border-border/10">
                      <span className="ocr-label block text-[9px]">{utmField.label}</span>
                      <span className="font-semibold truncate block mt-0.5 text-foreground" title={utmField.value}>
                        {utmField.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 7. MENSAGENS REAL/MOCK */}
          {activeTab === 'mensagens' && (
            <div className="flex flex-col h-[400px] border border-border/30 rounded-xl overflow-hidden bg-neutral-900/25">
              {loadingMessages ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-muted-foreground">Carregando histórico de mensagens...</span>
                </div>
              ) : (
                <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
                  {messages.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 opacity-50">
                      <MessageSquare className="w-8 h-8 text-neutral-500" />
                      <span className="text-xs text-muted-foreground">Nenhuma mensagem encontrada</span>
                    </div>
                  ) : (
                    Object.entries(
                      messages.reduce((acc, m) => {
                        const d = m.date || new Date().toLocaleDateString('pt-BR');
                        if (!acc[d]) acc[d] = [];
                        acc[d].push(m);
                        return acc;
                      }, {} as Record<string, any[]>)
                    ).map(([dateLabel, msgs]) => (
                      <React.Fragment key={dateLabel}>
                        <div className="flex justify-center my-4">
                          <span className="text-[10px] bg-neutral-800/80 text-neutral-400 px-3 py-1 rounded-full font-semibold border border-neutral-700/50">
                            {dateLabel}
                          </span>
                        </div>
                        {(msgs as any[]).map((m) => (
                          <div
                            key={m.id}
                            className={`flex flex-col max-w-[80%] ${
                              m.sender === 'lead'
                                ? 'mr-auto items-start'
                                : 'ml-auto items-end'
                            }`}
                          >
                            <div
                              className={`p-3 rounded-2xl text-xs leading-relaxed ${
                                m.sender === 'lead'
                                  ? 'bg-neutral-800 text-foreground rounded-tl-none'
                                  : m.sender === 'ai'
                                  ? 'bg-primary/10 border border-primary/20 text-primary rounded-tr-none'
                                  : 'bg-primary text-black font-semibold rounded-tr-none'
                              }`}
                            >
                              {m.text}
                            </div>
                            {m.time && <span className="text-[9px] text-neutral-500 mt-1 px-1">{m.time}</span>}
                          </div>
                        ))}
                      </React.Fragment>
                    ))
                  )}
                </div>
              )}

              {/* Chat Input */}
              <div className="p-3 border-t border-border/20 bg-neutral-950 flex gap-2">
                <input
                  type="text"
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newMsg.trim()) {
                      setMessages((prev) => [
                        ...prev,
                        { id: Date.now().toString(), sender: 'user', text: newMsg, time: 'agora mesmo' }
                      ])
                      setNewMsg('')
                    }
                  }}
                  placeholder="Simular resposta WhatsApp..."
                  className="flex-1 bg-neutral-900 border border-border/40 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                />
                <button
                  onClick={() => {
                    if (!newMsg.trim()) return
                    setMessages((prev) => [
                      ...prev,
                      { id: Date.now().toString(), sender: 'user', text: newMsg, time: 'agora mesmo' }
                    ])
                    setNewMsg('')
                  }}
                  className="p-1.5 rounded-xl bg-primary text-black hover:opacity-90"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── SUSPENSE FALLBACK ───────────────────────────────────────────────────────
function PipelineFallback() {
  return (
    <div className="flex items-center justify-center h-full min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-neutral-400">Carregando pipeline...</p>
      </div>
    </div>
  )
}

// ─── EXPORT PIPELINE PAGE ───────────────────────────────────────────────────
export default function PipelinePage() {
  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <Suspense fallback={<PipelineFallback />}>
        <PipelineContent />
      </Suspense>
    </AppLayout>
  )
}
