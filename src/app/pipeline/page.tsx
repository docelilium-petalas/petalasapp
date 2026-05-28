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
  Phone, Info, Send, ChevronLeft, ChevronRight, Check
} from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'
import { MobileActionSelect } from '@/components/ui/MobileActionSelect'

import { MockDeal, MockContact, MockUser, MockActivity, MockPipeline, MockStage, MockDealStageHistory } from '@/lib/mockData'
import { toast, Toaster } from 'sonner'
import { DndContext, useDraggable, useDroppable, DragEndEvent, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
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
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
    emoji: '🟢'
  },
  MEDIA: {
    label: 'ZONA CINZA',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
    emoji: '🟠'
  },
  ALTA: {
    label: 'DESQUALIFICADA',
    color: 'text-rose-400',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/20',
    emoji: '🔴'
  },
  NAO_RESPONDEU: {
    label: 'NÃO RESPONDEU',
    color: 'text-neutral-400',
    bg: 'bg-muted/55',
    border: 'border-neutral-700/30',
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
  if (!userId) return { bg: 'bg-muted', border: 'border-neutral-700', text: 'text-neutral-300' }
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
  onActivateSelectionMode
}: {
  deal: MockDeal
  contact: MockContact | undefined
  owner: MockUser | undefined
  hasFutureActivity: boolean
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
}) {
  const isMobile = useIsMobile()
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: deal.id,
    disabled: isMobile
  })

  // Swipe gesture state for mobile quick actions
  const [swipeOffset, setSwipeOffset] = useState(0)
  const touchStartX = useRef(0)
  const isSwiping = useRef(false)
  const longPressTimeout = useRef<any>(null)

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobile) return
    touchStartX.current = e.targetTouches[0].clientX
    isSwiping.current = true

    longPressTimeout.current = setTimeout(() => {
      if (onActivateSelectionMode) {
        onActivateSelectionMode()
      }
      onSelect()
      toast.success('Modo de seleção ativado!')
    }, 700)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobile || !isSwiping.current) return
    const currentX = e.targetTouches[0].clientX
    const diff = currentX - touchStartX.current
    if (Math.abs(diff) > 10) {
      if (longPressTimeout.current) {
        clearTimeout(longPressTimeout.current)
        longPressTimeout.current = null
      }
    }
    if (diff < 0) {
      setSwipeOffset(Math.max(diff, -180)) // max swipe left is -180px
    } else {
      setSwipeOffset(0)
    }
  }

  const handleTouchEnd = () => {
    if (longPressTimeout.current) {
      clearTimeout(longPressTimeout.current)
      longPressTimeout.current = null
    }
    if (!isMobile) return
    isSwiping.current = false
    if (swipeOffset < -60) {
      setSwipeOffset(-180) // snap open to reveal 3 buttons (60px each)
    } else {
      setSwipeOffset(0) // snap back closed
    }
  }

  const style = transform && !isMobile
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50
      }
    : undefined

  // Compute time in stage using stage_history
  const stageHistory = history.filter(h => h.dealId === deal.id && h.paraStageId === deal.stageId)
  const lastEntry = stageHistory.length > 0 ? stageHistory[stageHistory.length - 1] : null
  const entryTime = lastEntry ? new Date(lastEntry.mudouEm).getTime() : new Date(deal.createdAt).getTime()
  const _diffMs = Date.now() - entryTime
  const _diffHours = _diffMs / (1000 * 60 * 60)
  const _days = Math.floor(_diffHours / 24)
  const _hours = Math.floor(_diffHours % 24)
  let timeInStageStr = `${_hours}h`
  if (_days > 0) timeInStageStr = `${_days}d ${_hours}h`
  else if (_hours === 0) {
    const minutes = Math.floor(_diffMs / (1000 * 60))
    timeInStageStr = `${minutes}m`
  }
  const slaRatio = stageSlaHours > 0 ? _diffHours / stageSlaHours : 0

  let slaEmoji = '🟢'
  let slaTooltip = 'Dentro do SLA'
  if (stageSlaHours > 0) {
    if (slaRatio >= 1.5) {
      slaEmoji = '🔴'
      slaTooltip = `SLA Crítico: ${timeInStageStr} decorridos vs ${stageSlaHours}h SLA`
    } else if (slaRatio >= 1.0) {
      slaEmoji = '🟠'
      slaTooltip = `SLA Estourado: ${timeInStageStr} decorridos vs ${stageSlaHours}h SLA`
    } else if (slaRatio >= 0.5) {
      slaEmoji = '🟡'
      slaTooltip = `SLA em Atenção: ${timeInStageStr} decorridos vs ${stageSlaHours}h SLA`
    }
  }

  const ownerStyle = owner ? getOwnerColor(owner.id) : null
  const phoneClean = contact?.telefone ? contact.telefone.replace(/\D/g, '') : ''
  const finalOrigem = deal.origem || (phoneClean ? 'whatsapp' : 'manual')
  const prio = PRIORITY_CONFIG[deal.prioridade] || PRIORITY_CONFIG.MEDIA
  const isPulsing = pulsingDeals.has(deal.id)

  if (isMobile) {
    return (
      <div className="relative overflow-hidden rounded-xl bg-card border border-border/30 w-full shrink-0">
        {/* Swipe Quick Actions Behind Card */}
        <div className="absolute inset-y-0 right-0 z-0 flex items-center bg-card border-l border-border/20">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkWon()
              setSwipeOffset(0)
            }}
            className="h-full px-4 bg-emerald-500 text-black flex flex-col items-center justify-center font-bold text-[11px] active:opacity-80 shrink-0"
          >
            <CheckCircle2 className="w-5 h-5 mb-1 text-black" />
            <span>Ganho</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onMarkLost()
              setSwipeOffset(0)
            }}
            className="h-full px-3.5 bg-rose-500 text-foreground flex flex-col items-center justify-center font-bold text-[11px] active:opacity-80 shrink-0"
          >
            <X className="w-5 h-5 mb-1 text-foreground" />
            <span>Perdido</span>
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
              setSwipeOffset(0)
            }}
            className="h-full px-4 bg-muted text-rose-500 flex flex-col items-center justify-center font-bold text-[11px] active:opacity-80 shrink-0"
          >
            <Trash2 className="w-5 h-5 mb-1 text-rose-500" />
            <span>Excluir</span>
          </button>
        </div>

        {/* Card Main Body */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={(e) => {
            if (swipeOffset < 0) {
              e.stopPropagation()
              setSwipeOffset(0)
            } else {
              if (isSelectionMode) {
                e.stopPropagation()
                onSelect()
              } else {
                onClick()
              }
            }
          }}
          style={{
            transform: `translate3d(${swipeOffset}px, 0, 0)`,
            transition: isSwiping.current ? 'none' : 'transform 250ms cubic-bezier(0.16, 1, 0.3, 1)'
          }}
          className={`relative z-10 p-4 bg-card border-none transition-colors duration-200 select-none active:bg-muted/80 ${
            isSelected ? 'bg-primary/10 border border-primary/20' : ''
          }`}
        >
          {/* Card Top Row: Priority Badge & Date/Unread Indicators */}
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-md border ${prio.bg} ${prio.color} ${prio.border}`}>
                {prio.label}
              </span>
              {inActiveCadence && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-500/15 text-violet-400 border border-violet-500/25">
                  ⚡ Cadência
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              {isRecentMessage && (
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 relative" title="Mensagem recebida há menos de 1h">
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </span>
              )}
              <span className="text-[10px] font-mono text-neutral-500">
                {new Date(deal.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            </div>
          </div>

          {/* Deal Title */}
          <h4 className="text-[17px] font-bold text-foreground line-clamp-1 leading-tight mb-1 pr-4">
            {deal.titulo}
          </h4>

          {/* Contact and Value Row */}
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/10">
            <div className="flex flex-col min-w-0">
              <p className="text-[15px] font-semibold text-neutral-200 truncate">
                {contact?.nome} {contact?.sobrenome || ''}
              </p>
              {deal.produtoInteresse && (
                <span className="text-[11px] text-neutral-500 truncate mt-0.5">
                  {deal.produtoInteresse} • {finalOrigem}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[16px] font-black text-primary font-mono">{BRL(deal.valorEstimado)}</span>
              
              {/* Owner initials or User default avatar */}
              {owner ? (
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold border shrink-0"
                  style={{
                    backgroundColor: ownerStyle?.bg,
                    borderColor: ownerStyle?.border,
                    color: ownerStyle?.text
                  }}
                >
                  {owner.nome[0]}{owner.sobrenome ? owner.sobrenome[0] : ''}
                </div>
              ) : (
                <div className="w-7 h-7 rounded-full border border-dashed border-neutral-700 flex items-center justify-center bg-card shrink-0">
                  <User className="w-4 h-4 text-neutral-600" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative group p-3.5 rounded-xl border transition-all duration-300 ${
        isDragging ? 'opacity-40 cursor-grabbing' : 'cursor-grab active:cursor-grabbing'
      } ${
        isSelected
          ? 'border-primary bg-primary/10 shadow-lg shadow-primary/5'
          : 'border-border/30 bg-card/60 hover:border-border/80 hover:bg-card/85'
      } ${isPulsing ? 'animate-pulse border-primary/90 shadow-[0_0_12px_rgba(57,255,136,0.35)]' : ''}`}
      onClick={(e) => {
        // If selection mode, toggle selection on click too, else open drawer
        if (isSelectionMode) {
          e.stopPropagation()
          onSelect()
        } else {
          onClick()
        }
      }}
    >
      {/* Checkbox for selection */}
      {(isSelectionMode || isSelected) ? (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          className="absolute top-2.5 right-2.5 z-10 text-muted-foreground hover:text-primary transition-colors"
        >
          {isSelected ? (
            <CheckSquare className="w-4 h-4 text-primary" />
          ) : (
            <Square className="w-4 h-4 text-muted-foreground" />
          )}
        </button>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onSelect()
          }}
          className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-opacity"
        >
          <Square className="w-4 h-4 text-muted-foreground" />
        </button>
      )}

      {/* Context menu (only shown when not in selection mode) */}
      {!isSelectionMode && (
        <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation()
              onOpenMenu()
            }}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <MoreVertical className="w-3.5 h-3.5" />
          </button>
          {isOpenMenu && (
            <div
              className="absolute right-0 top-7 z-20 w-44 rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => {
                  onMarkWon()
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-primary/10 text-primary transition-colors"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Marcar Ganho
              </button>
              <button
                onClick={() => {
                  onMarkLost()
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-destructive/10 text-destructive transition-colors"
              >
                <X className="w-3.5 h-3.5" /> Marcar Perdido
              </button>
              <div className="h-px bg-border/50 my-1" />
              <button
                onClick={() => {
                  onDelete()
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-xs hover:bg-destructive/10 text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Excluir
              </button>
            </div>
          )}
        </div>
      )}

      {/* Drag Handle Listener Area */}
      <div {...attributes} {...listeners} className="absolute inset-0 right-8 bottom-8" />

      {/* Card Content (Relative so it clicks correctly) */}
      <div className="relative pointer-events-none">
        {/* Deal Title */}
        <h4 className="text-xs font-bold text-foreground line-clamp-2 leading-snug pr-4">
          {deal.titulo}
        </h4>

        {/* Priority Badge */}
        <div className="mt-2 flex">
          <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${prio.bg} ${prio.color} ${prio.border}`}>
            {prio.label}
          </span>
        </div>

        {/* Contact Info */}
        <div className="mt-2 text-[11px] text-muted-foreground">
          <p className="font-medium text-neutral-300">
            {contact?.nome} {contact?.sobrenome || ''}
          </p>
          {phoneClean && (
            <a
              href={`https://wa.me/${phoneClean}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pointer-events-auto inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5"
            >
              <Phone className="w-2.5 h-2.5" /> {contact?.telefone}
            </a>
          )}
        </div>

        {/* Value & Metadata */}
        <div className="mt-3 flex items-center justify-between border-t border-border/10 pt-2">
          <div className="flex flex-col">
            <span className="text-[10px] text-muted-foreground">Estimado</span>
            <span className="text-xs font-bold text-primary">{BRL(deal.valorEstimado)}</span>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* SLA Emoji */}
            {stageSlaHours > 0 && (
              <span title={slaTooltip} className="cursor-help text-xs">
                {slaEmoji}
              </span>
            )}

            {/* Owner Badge */}
            {owner ? (
              <div
                title={`Responsável: ${owner.nome}`}
                className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold border"
                style={{
                  backgroundColor: ownerStyle?.bg,
                  borderColor: ownerStyle?.border,
                  color: ownerStyle?.text
                }}
              >
                {owner.nome[0]}
                {owner.sobrenome ? owner.sobrenome[0] : ''}
              </div>
            ) : (
              <div
                title="Sem responsável"
                className="w-5 h-5 rounded-full border border-dashed border-neutral-700 flex items-center justify-center bg-card"
              >
                <User className="w-3 h-3 text-neutral-600" />
              </div>
            )}
          </div>
        </div>

        {/* Extra Flags & Chips */}
        <div className="mt-2.5 flex flex-wrap gap-1 items-center justify-between">
          <div className="flex flex-wrap gap-1">
            {deal.produtoInteresse && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-neutral-400">
                {deal.produtoInteresse}
              </span>
            )}
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 text-primary border border-primary/10">
              {finalOrigem}
            </span>
            {inActiveCadence && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20">
                ⚡ cadência
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1 text-muted-foreground text-[10px] items-end">
            <span className="text-[9px] font-mono flex items-center gap-1 text-neutral-500" title="Última atualização do negócio">
              <Clock className="w-2.5 h-2.5" />
              {new Date(deal.updatedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            {lastMessageTime ? (
              <span className={`text-[9px] font-mono flex items-center gap-1 ${isRecentMessage ? 'text-emerald-400' : 'text-neutral-500'}`} title={isRecentMessage ? 'Mensagem recebida há menos de 1h' : 'Última mensagem'}>
                <MessageSquare className="w-2.5 h-2.5" />
                {isRecentMessage && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                {lastMessageTime}
              </span>
            ) : (
              <span className="text-[9px] font-mono flex items-center gap-1 text-neutral-700" title="Sem mensagens registradas">
                <MessageSquare className="w-2.5 h-2.5" />
                —
              </span>
            )}
          </div>
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
  onDeleteDeal: (id: string) => void
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
          : 'border-border/30 bg-card/40'
      }`}
    >
      {/* Stage Header */}
      <div
        className="px-4 py-3.5 border-b border-border/20 flex flex-col gap-1.5"
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
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted text-neutral-400">
              {deals.length}
            </span>
          </div>
          <span className="text-xs font-bold text-primary">{BRL(stageTotal)}</span>
        </div>
        {stage.slaHours > 0 && (
          <p className="text-[10px] text-neutral-500 flex items-center gap-1">
            <Clock className="w-3 h-3" /> SLA: {stage.slaHours}h | Probabilidade: {stage.probabilidade}%
          </p>
        )}
      </div>

      {/* Cards Scrollable Area */}
      <div className="flex-1 overflow-y-auto scrollbar-thin p-3.5 space-y-3 max-h-[calc(100vh-280px)] min-h-[150px]">
        {deals.map((deal) => {
          const contact = contacts.find((c) => c.id === deal.contactId)
          const owner = users.find((u) => u.id === deal.ownerUserId)
          const isSelected = selectedDeals.has(deal.id)
          const dealActivities = activities.filter((a) => a.dealId === deal.id)
          const hasFutureActivity = dealActivities.some(
            (a) => a.status === 'OPEN' && !!a.dueAt && new Date(a.dueAt).getTime() > Date.now()
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
              hasFutureActivity={hasFutureActivity}
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

  // Bulk Selection Mode
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [selectedDeals, setSelectedDeals] = useState<Set<string>>(new Set())
  const [bulkStageTarget, setBulkStageTarget] = useState('')
  const [bulkOwnerTarget, setBulkOwnerTarget] = useState('')
  const [bulkPriorityTarget, setBulkPriorityTarget] = useState('')
  const [bulkTagTarget, setBulkTagTarget] = useState('')
  const [selectedListaTarget, setSelectedListaTarget] = useState('')
  const [selectedCadenciaTarget, setSelectedCadenciaTarget] = useState('')
  const [listasDisparo, setListasDisparo] = useState<any[]>([])
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
      const pipes = await crmActions.getPipelines()
      setPipelines(pipes)

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
    const [stgs, dls, allContacts, allActivities, allListas, allCadencias, teamUsers, allHistory, activeDealIds] = await Promise.all([
      crmActions.getStages(pipelineId),
      crmActions.getDeals(pipelineId),
      crmActions.getContacts(),
      crmActions.getActivities(),
      crmActions.getListasDisparo(),
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
    setListasDisparo(allListas)
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
  const handleCreateDeal = async () => {
    if (!newDeal.titulo || !newDeal.contactId) {
      toast.error('Título e contato são obrigatórios.')
      return
    }

    try {
      const created = await crmActions.createDeal({
        titulo: newDeal.titulo,
        pipelineId: selectedPipelineId,
        stageId: newDeal.stageId || stages[0]?.id || '',
        contactId: newDeal.contactId,
        valorEstimado: parseFloat(newDeal.valorEstimado) || 0,
        produtoInteresse: newDeal.produtoInteresse || undefined,
        origem: newDeal.origem || undefined,
        prioridade: newDeal.prioridade as MockDeal['prioridade'],
        ramoEmpresa: newDeal.ramoEmpresa || undefined,
        faturamentoMensal: parseFloat(newDeal.faturamentoMensal) || 0,
        ownerUserId: newDeal.ownerUserId || undefined,
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

  // Delete Deal
  const handleDeleteDeal = async (id: string) => {
    if (!confirm('Deseja realmente excluir este negócio? Todas as atividades e histórico serão perdidos.')) return
    try {
      await crmActions.deleteDeal(id)
      setDeals((prev) => prev.filter((d) => d.id !== id))
      setSelectedDeals((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      if (selectedDeal?.id === id) setSelectedDeal(null)
      toast.success('Negócio excluído com sucesso.')
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

  const handleBulkAddToLista = async () => {
    if (!selectedListaTarget) return
    try {
      const dealIds = Array.from(selectedDeals)
      const count = await crmActions.addLeadsToListaDisparo(selectedListaTarget, dealIds, 'deal')
      toast.success(`${count} leads adicionados à lista de disparo com sucesso!`)
      setSelectedDeals(new Set())
      setIsSelectionMode(false)
      setSelectedListaTarget('')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar leads à lista de disparo')
    }
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
      const promises = Array.from(selectedDeals).map((id) => crmActions.deleteDeal(id))
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

  // Column swipe navigation handlers (mobile only)
  const touchStartXColumn = useRef(0)
  const touchEndXColumn = useRef(0)

  const handleTouchStartColumn = (e: React.TouchEvent) => {
    if (!isMobile) return
    touchStartXColumn.current = e.targetTouches[0].clientX
    touchEndXColumn.current = e.targetTouches[0].clientX
  }

  const handleTouchMoveColumn = (e: React.TouchEvent) => {
    if (!isMobile) return
    touchEndXColumn.current = e.targetTouches[0].clientX
  }

  const handleTouchEndColumn = () => {
    if (!isMobile) return
    const diff = touchStartXColumn.current - touchEndXColumn.current
    if (diff > 75) {
      // Swiped Left -> next column
      setActiveStageIndex(prev => Math.min(stages.length - 1, prev + 1))
    } else if (diff < -75) {
      // Swiped Right -> prev column
      setActiveStageIndex(prev => Math.max(0, prev - 1))
    }
  }

  // Pull-to-refresh logic
  const [pullDistance, setPullDistance] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const touchStartYPull = useRef(0)

  const handleTouchStartPull = (e: React.TouchEvent<HTMLDivElement>) => {
    const scrollTop = e.currentTarget.scrollTop
    if (scrollTop === 0) {
      touchStartYPull.current = e.targetTouches[0].clientY
      setIsPulling(true)
    } else {
      setIsPulling(false)
    }
  }

  const handleTouchMovePull = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isPulling) return
    const currentY = e.targetTouches[0].clientY
    const diffY = currentY - touchStartYPull.current
    if (diffY > 0) {
      setPullDistance(Math.min(diffY * 0.4, 70)) // apply resistance
    }
  }

  const handleTouchEndPull = async () => {
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
    <div className="flex flex-col h-full bg-card/20 max-md:pb-16 select-none relative">
      
      {/* ─── DESKTOP HEADER & FILTERS ─── */}
      {!isMobile && (
        <>
          <div className="flex flex-col gap-4 px-6 py-4 border-b border-border/20 bg-background/30 backdrop-blur-md shrink-0">
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
                      className="bg-card/80 border border-border/40 text-sm font-semibold rounded-xl px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
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
                      : 'bg-card border-border/40 text-muted-foreground hover:text-foreground'
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
                      : 'bg-card border-border/40 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  {isSelectionMode ? 'Sair da Seleção' : 'Selecionar'}
                </button>

                <button
                  onClick={() => setShowArchived(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border/40 bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                >
                  <Archive className="w-3.5 h-3.5" />
                  Ver Arquivados
                </button>

                <button
                  onClick={() => {
                    router.push('/settings?tab=pipeline')
                  }}
                  className="p-2 rounded-xl border border-border/40 bg-card text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
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
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border/30 bg-card/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
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
                  className="bg-card/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                  className="bg-card/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
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
                  className="bg-card/65 border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
                >
                  <option value="all">Origem: Todas</option>
                  <option value="whatsapp">whatsapp</option>
                  <option value="manual">manual</option>
                  <option value="facebook">facebook</option>
                  <option value="site">site</option>
                  <option value="google">google</option>
                </select>
              </div>

              <button
                onClick={() => {
                  setFilterOwner('all')
                  setFilterPriority('all')
                  setFilterOrigin('all')
                  setSearchText('')
                }}
                className="text-[10px] text-muted-foreground hover:text-foreground font-semibold px-2 py-1 rounded hover:bg-muted"
              >
                Limpar Filtros
              </button>
            </div>
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
                <div key={idx} className="p-2.5 rounded-xl border border-border/20 bg-card/35 flex flex-col gap-0.5">
                  <p className="text-[9px] text-muted-foreground font-bold uppercase tracking-wide">{kpi.label}</p>
                  <h3 className={`text-sm font-extrabold tracking-tight ${kpi.color}`}>{kpi.value}</h3>
                  <p className="text-[9px] text-muted-foreground">{kpi.sub}</p>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ─── MOBILE VIEW: STAGE SLIDER SELECTOR ─── */}
      {isMobile && stages.length > 0 && (
        <div className="flex flex-col bg-background backdrop-blur-md px-4 py-3 border-b border-border/20 shrink-0 select-none">
          
          {/* Funnel Selector & Total Value Row */}
          <div className="flex items-center justify-between mb-2">
            <div className="max-w-[65%] shrink-0">
              {pipelines.length > 0 && (
                <MobileActionSelect
                  label="Selecionar Funil"
                  value={selectedPipelineId}
                  onChange={handlePipelineSwitch}
                  options={pipelines.map((p) => ({ value: p.id, label: p.nome }))}
                  className="bg-card/60 border border-border/30 text-xs font-semibold rounded-xl px-2.5 py-1.5 focus:outline-none text-foreground w-full"
                />
              )}
            </div>
            
            <div className="text-right flex flex-col items-end shrink-0">
              <span className="text-[12px] font-black text-primary font-mono">
                {BRL(visibleDeals.filter(d => d.stageId === stages[activeStageIndex]?.id && d.status === 'OPEN').reduce((sum, d) => sum + d.valorEstimado, 0))}
              </span>
              <span className="text-[9px] text-muted-foreground font-semibold -mt-0.5">Etapa Total</span>
            </div>
          </div>

          {/* Swipe Left/Right Stage Header Control */}
          <div className="flex items-center justify-between gap-2 py-1">
            <button
              type="button"
              onClick={() => setActiveStageIndex((prev) => Math.max(0, prev - 1))}
              disabled={activeStageIndex === 0}
              className="p-1.5 rounded-lg border border-border/40 text-muted-foreground disabled:opacity-30 active:bg-muted shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex-1 text-center min-w-0">
              <h2 className="text-[15px] font-extrabold text-foreground truncate">
                {stages[activeStageIndex]?.nome}
              </h2>
              <p className="text-[10px] text-muted-foreground font-semibold mt-0.5 uppercase tracking-wide">
                Etapa {activeStageIndex + 1} de {stages.length} • {visibleDeals.filter(d => d.stageId === stages[activeStageIndex]?.id && d.status === 'OPEN').length} negócios
              </p>
            </div>

            <button
              type="button"
              onClick={() => setActiveStageIndex((prev) => Math.min(stages.length - 1, prev + 1))}
              disabled={activeStageIndex === stages.length - 1}
              className="p-1.5 rounded-lg border border-border/40 text-muted-foreground disabled:opacity-30 active:bg-muted shrink-0"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Bullets/Dots selector indicator */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5">
            {stages.map((stg, idx) => (
              <button
                key={stg.id}
                onClick={() => setActiveStageIndex(idx)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  idx === activeStageIndex ? 'w-5 bg-primary' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ─── KANBAN BOARD SECTION ─── */}
      {isMobile ? (
        /* Mobile stage board rendering with swipe and pull-to-refresh */
        <div
          onTouchStart={handleTouchStartColumn}
          onTouchMove={handleTouchMoveColumn}
          onTouchEnd={handleTouchEndColumn}
          onScroll={handleTouchStartPull}
          onTouchMoveCapture={handleTouchMovePull}
          onTouchEndCapture={handleTouchEndPull}
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
              <div className="flex flex-col space-y-3.5 h-full min-h-[400px]">
                {stageDealsList.map((deal) => {
                  const contact = contacts.find((c) => c.id === deal.contactId)
                  const owner = users.find((u) => u.id === deal.ownerUserId)
                  const isSelected = selectedDeals.has(deal.id)
                  const dealActivities = activities.filter((a) => a.dealId === deal.id)
                  const hasFutureActivity = dealActivities.some(
                    (a) => a.status === 'OPEN' && !!a.dueAt && new Date(a.dueAt).getTime() > Date.now()
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
                      hasFutureActivity={hasFutureActivity}
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
                    />
                  )
                })}

                {stageDealsList.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-20 text-center opacity-30 border border-dashed border-border/10 rounded-2xl">
                    <div className="w-10 h-10 rounded-full border border-dashed border-neutral-600 mb-3 flex items-center justify-center">
                      <Plus className="w-5 h-5 text-neutral-600" />
                    </div>
                    <p className="text-sm font-semibold text-muted-foreground">Sem negócios nesta etapa</p>
                  </div>
                )}
              </div>
            )
          })() : (
            <div className="text-center py-20 text-muted-foreground">Nenhuma etapa configurada</div>
          )}
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
                    pulsingDeals={pulsingDeals}
                    lastMessageMap={lastMessageMap}
                    activeCadenceSet={activeCadenceSet}
                  />
                )
              })}
            </div>
            
            <DragOverlay dropAnimation={null}>
              {activeDragDealId ? (() => {
                const d = deals.find(x => x.id === activeDragDealId)
                if (!d) return null
                return (
                  <div className="w-72 p-3.5 rounded-xl border border-primary/60 bg-card/95 shadow-2xl shadow-primary/20 opacity-90 cursor-grabbing">
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowMobileFilters(false)}
        >
          <div
            className="w-full max-h-[85vh] bg-card border-t border-border/40 rounded-t-3xl p-6 flex flex-col space-y-4 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag Handle */}
            <div className="flex justify-center shrink-0 -mt-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
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
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-border/30 bg-card text-sm focus:outline-none text-foreground placeholder:text-muted-foreground"
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
                    { value: 'whatsapp', label: 'whatsapp' },
                    { value: 'manual', label: 'manual' },
                    { value: 'facebook', label: 'facebook' },
                    { value: 'site', label: 'site' },
                    { value: 'google', label: 'google' }
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
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-bold text-muted-foreground active:bg-card"
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

      {/* ─── BULK ACTIONS FOOTER BAR ─── */}
      {isSelectionMode && selectedDeals.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-4xl bg-card/95 border border-primary/30 rounded-2xl p-4 shadow-[0_0_24px_rgba(57,255,136,0.15)] flex flex-wrap items-center justify-between gap-4 animate-scale-in max-md:bottom-20 max-md:w-[95%]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping shrink-0" />
            <p className="text-xs font-bold text-foreground">
              {selectedDeals.size} selecionados
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <MobileActionSelect
                label="Mover etapa"
                value={bulkStageTarget}
                onChange={setBulkStageTarget}
                options={stages.map((s) => ({ value: s.id, label: s.nome }))}
                placeholder="Etapa..."
                className="bg-card border border-border/40 rounded-xl px-2.5 py-1 text-xs"
              />
              <button
                onClick={handleBulkMove}
                disabled={!bulkStageTarget}
                className="p-2 rounded-xl bg-primary text-black font-semibold disabled:opacity-40"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <MobileActionSelect
                label="Atribuir vendedor"
                value={bulkOwnerTarget}
                onChange={setBulkOwnerTarget}
                options={users.map((u) => ({ value: u.id, label: u.nome }))}
                placeholder="Vendedor..."
                className="bg-card border border-border/40 rounded-xl px-2.5 py-1 text-xs"
              />
              <button
                onClick={handleBulkAssign}
                disabled={!bulkOwnerTarget}
                className="p-1.5 rounded-xl bg-primary text-black font-semibold text-xs disabled:opacity-40"
              >
                Atribuir
              </button>
            </div>

            <div className="flex items-center gap-1">
              <MobileActionSelect
                label="Lista de Disparo"
                value={selectedListaTarget}
                onChange={setSelectedListaTarget}
                options={listasDisparo.map((l) => ({ value: l.id, label: l.nomeLista }))}
                placeholder="Disparo..."
                className="bg-card border border-border/40 rounded-xl px-2.5 py-1 text-xs text-foreground"
              />
              <button
                onClick={handleBulkAddToLista}
                disabled={!selectedListaTarget}
                className="p-1.5 rounded-xl bg-emerald-500 text-black font-semibold text-xs disabled:opacity-40"
              >
                Disparo
              </button>
            </div>

            <div className="flex items-center gap-1">
              <MobileActionSelect
                label="Cadência"
                value={selectedCadenciaTarget}
                onChange={setSelectedCadenciaTarget}
                options={cadencias.map((c) => ({ value: c.id, label: c.nome }))}
                placeholder="Cadência..."
                className="bg-card border border-border/40 rounded-xl px-2.5 py-1 text-xs text-foreground"
              />
              <button
                onClick={handleBulkAddToCadence}
                disabled={!selectedCadenciaTarget}
                className="p-1.5 rounded-xl bg-primary text-black font-semibold text-xs disabled:opacity-40"
              >
                Cadência
              </button>
            </div>

            <button
              onClick={handleBulkCloseWon}
              className="px-2.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-black font-semibold text-xs active:opacity-85"
            >
              Ganho
            </button>
            <button
              onClick={handleBulkCloseLost}
              className="px-2.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-foreground font-semibold text-xs active:opacity-85"
            >
              Perdido
            </button>
            <button
              onClick={handleBulkDelete}
              className="p-1.5 rounded-xl hover:bg-rose-950 hover:text-rose-400 text-muted-foreground transition-all shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedDeals(new Set())}
              className="text-neutral-500 hover:text-foreground font-bold pl-1 text-[11px]"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

      {/* ─── NEW DEAL MODAL ─── */}
      {showNewDeal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => setShowNewDeal(false)}
        >
          <div
            className="relative w-full max-w-lg bg-card border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in shadow-2xl max-md:max-h-[85vh] max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:border-l-0 max-md:border-r-0 max-md:pb-10 overflow-y-auto mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight">Nova Oportunidade</h3>
              <button
                onClick={() => setShowNewDeal(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                />
              </div>

              <div>
                <label className="ocr-label mb-1 block">Vincular Contato *</label>
                <MobileActionSelect
                  label="Vincular Contato"
                  value={newDeal.contactId}
                  onChange={(val) => setNewDeal((p) => ({ ...p, contactId: val }))}
                  options={contacts.map((c) => ({ value: c.id, label: `${c.nome} ${c.sobrenome || ''} (${c.telefone})` }))}
                  placeholder="Selecione um contato da base..."
                />
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                </div>

                <div>
                  <label className="ocr-label mb-1 block">Vendedor Responsável</label>
                  <MobileActionSelect
                    label="Vendedor Responsável"
                    value={newDeal.ownerUserId}
                    onChange={(val) => setNewDeal((p) => ({ ...p, ownerUserId: val }))}
                    options={users.map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))}
                    placeholder="Sem responsável"
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
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-card active:bg-muted transition-colors"
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

      {/* ─── LOST REASON MODAL ─── */}
      {showLostReasonModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md max-md:items-end max-md:p-0"
          onClick={() => setShowLostReasonModal(null)}
        >
          <div
            className="w-full max-w-md bg-card border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-t max-md:pb-10 mobile-bottom-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Handle */}
            <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-muted" />
            </div>

            <div className="flex items-center justify-between shrink-0">
              <h3 className="text-base font-extrabold tracking-tight">Motivo de Perda</h3>
              <button
                onClick={() => setShowLostReasonModal(null)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowLostReasonModal(null)}
                className="flex-1 py-3 rounded-xl border border-border/40 text-xs font-semibold text-muted-foreground hover:bg-card transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmLost}
                className="flex-1 py-3 rounded-xl bg-rose-500 text-foreground font-semibold text-xs hover:bg-rose-600 transition-colors"
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
  onDeleteDeal: (id: string) => void
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/85 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-card border border-border/40 rounded-2xl p-6 space-y-4 animate-scale-in shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-extrabold tracking-tight">Oportunidades Arquivadas</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Negócios que foram finalizados (Ganhos ou Perdidos)</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-48">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título, contato..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-border/30 bg-card/60 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
            />
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as 'ALL' | 'WON' | 'LOST')}
            className="bg-card border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none"
          >
            <option value="ALL">Status: Todos</option>
            <option value="WON">Ganhos (Won)</option>
            <option value="LOST">Perdidos (Lost)</option>
          </select>

          <select
            value={filterOwner}
            onChange={(e) => setFilterOwner(e.target.value)}
            className="bg-card border border-border/30 rounded-xl px-2.5 py-1.5 text-xs text-muted-foreground focus:outline-none"
          >
            <option value="all">Vendedor: Todos</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </div>

        {/* Table list */}
        <div className="flex-1 overflow-y-auto scrollbar-thin border border-border/20 rounded-xl">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-card border-b border-border/20 text-muted-foreground font-semibold">
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
                  <tr key={d.id} className="hover:bg-muted/40">
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
                          onDeleteDeal(d.id)
                          setArchived((prev) => prev.filter((item) => item.id !== d.id))
                        }}
                        className="px-2 py-1 rounded bg-rose-500/10 border border-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-foreground font-semibold transition-all"
                      >
                        Excluir
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
  onClose,
  onUpdateDeal,
  onMarkWon,
  onMarkLost,
  onReopenDeal,
  onDeleteDeal,
  onAddActivity,
  onToggleActivity,
  onDeleteActivity
}: {
  deal: any
  contacts: any[]
  users: any[]
  stages: any[]
  activities: any[]
  historyLogs: any[]
  onClose: () => void
  onUpdateDeal: (id: string, data: Partial<any>) => Promise<void>
  onMarkWon: (deal: any) => void
  onMarkLost: (deal: any) => void
  onReopenDeal: (id: string) => Promise<void>
  onDeleteDeal: (id: string) => void
  onAddActivity: (data: any) => Promise<void>
  onToggleActivity: (id: string, done: boolean) => Promise<void>
  onDeleteActivity: (id: string) => Promise<void>
}) {
  const [activeTab, setActiveTab] = useState<'resumo' | 'contato' | 'anotacoes' | 'atividades' | 'historico' | 'utm' | 'mensagens'>('resumo')
  const router = useRouter()
  const categoriesStore = useCategories()

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
      className="fixed inset-0 z-50 flex justify-end bg-background/90 backdrop-blur-sm animate-fade-in max-md:items-end max-md:justify-center"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl bg-card border-l border-border/40 h-full flex flex-col shadow-2xl animate-slide-up max-md:h-[85vh] max-md:rounded-t-3xl max-md:border-t max-md:border-l-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle for mobile bottom sheet */}
        <div className="hidden max-md:flex justify-center shrink-0 pt-3 pb-1">
          <div className="w-12 h-1.5 rounded-full bg-muted" />
        </div>
        {/* Header */}
        <div className="p-6 border-b border-border/20 flex flex-col gap-4">
          <div className="flex items-center justify-between">
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
                className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-rose-400 transition-colors"
                title="Excluir negócio"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors ml-1"
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
                  className="bg-card border border-border text-foreground font-bold px-3 py-1.5 rounded-xl text-lg focus:outline-none"
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
            <div className="p-3.5 rounded-xl border border-border/20 bg-card/35 space-y-1.5">
              <div className="flex items-center justify-between text-[10px]">
                <span className="font-semibold text-muted-foreground">Progresso do SLA da Etapa</span>
                <span className="font-bold text-foreground">{slaProgressText}</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
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
          <div className="flex items-center justify-between gap-1 overflow-x-auto pb-1 scrollbar-thin">
            {stages.map((stage, idx) => {
              const isCurrent = stage.id === deal.stageId;
              const isPast = stages.findIndex(s => s.id === stage.id) < stages.findIndex(s => s.id === deal.stageId);
              return (
                <div key={stage.id} className="flex-1 flex flex-col items-center gap-1.5 min-w-[80px]">
                  <div className={`h-1.5 w-full rounded-full transition-all ${isCurrent ? 'bg-primary shadow-[0_0_5px_rgba(255,255,255,0.3)]' : isPast ? 'bg-primary/40' : 'bg-muted'}`} />
                  <span className={`text-[9px] text-center font-bold px-1 line-clamp-1 ${isCurrent ? 'text-primary' : isPast ? 'text-neutral-400' : 'text-neutral-600'}`}>
                    {stage.nome}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-border/20 bg-muted/30 overflow-x-auto select-none shrink-0">
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
                  <MobileActionSelect
                    label="Vendedor Responsável"
                    value={ownerInput}
                    onChange={setOwnerInput}
                    options={[
                      { value: '', label: 'Sem responsável' },
                      ...users.map((u) => ({ value: u.id, label: `${u.nome} ${u.sobrenome || ''}` }))
                    ]}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
                <div>
                  <label className="ocr-label mb-1 block">Valor Estimado (R$)</label>
                  <input
                    type="number"
                    value={valueInput}
                    onChange={(e) => setValueInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-border/30 bg-card text-xs focus:outline-none"
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
                    onChange={setOrigemInput}
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
                  <div className="p-3 rounded-xl bg-card/50 border border-border/20">
                    <p className="ocr-label mb-0.5">Telefone</p>
                    <p className="text-xs font-semibold">{dealContact?.telefone || '-'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-card/50 border border-border/20 relative">
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
                  <div className="p-3 rounded-xl bg-card/50 border border-border/20 col-span-2 max-md:col-span-1 relative">
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
                    <p className="font-semibold bg-card/60 p-2 rounded-xl border border-border/20 inline-block">
                      Source: {dealContact.lastUtmSource || 'Orgânico'} • Campaign: {dealContact.lastUtmCampaign || '-'}
                    </p>
                  </div>

                  <button
                    onClick={() => {
                      router.push(`/contacts?id=${dealContact.id}`)
                    }}
                    className="w-full py-2.5 rounded-xl border border-border text-xs font-semibold hover:bg-card text-foreground transition-colors"
                  >
                    Ver Perfil Completo de Contatos
                  </button>
                </div>
              ) : (
                <div className="p-6 text-center text-muted-foreground bg-muted/30 rounded-2xl border border-dashed border-border/20">
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono"
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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-card text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground font-mono"
                />
              </div>
            </div>
          )}

          {/* 4. ATIVIDADES */}
          {activeTab === 'atividades' && (
            <div className="space-y-5">
              {/* Form to add */}
              <div className="p-4 rounded-xl border border-border/30 bg-muted/30 space-y-3">
                <h4 className="text-xs font-bold text-foreground">Nova Atividade</h4>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Título da tarefa..."
                    className="col-span-2 w-full px-2.5 py-1.5 rounded-lg border border-border/30 bg-card text-xs focus:outline-none"
                  />
                  <select
                    value={actTipo}
                    onChange={(e) => setActTipo(e.target.value)}
                    className="bg-card border border-border/30 rounded-lg px-2.5 py-1.5 text-xs"
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
                    className="bg-card border border-border/30 rounded-lg px-2 py-1.5 text-xs text-muted-foreground"
                  />
                  <textarea
                    value={actDesc}
                    onChange={(e) => setActDesc(e.target.value)}
                    placeholder="Descrição..."
                    rows={2}
                    className="col-span-2 w-full px-2.5 py-1.5 rounded-lg border border-border/30 bg-card text-xs focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (!actTitle) return
                    await onAddActivity({
                      dealId: deal.id,
                      contactId: deal.contactId,
                      tipo: actTipo,
                      titulo: actTitle,
                      descricao: actDesc || undefined,
                      dueAt: actDate ? new Date(actDate).toISOString() : new Date().toISOString(),
                      status: 'OPEN'
                    })
                    setActTitle('')
                    setActDesc('')
                    setActDate('')
                  }}
                  className="px-3 py-1.5 rounded-lg bg-primary text-black font-bold text-[10px]"
                >
                  Agendar Atividade
                </button>
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
                            ? 'bg-card/35 border-border/10 opacity-60'
                            : 'bg-card/60 border-border/30'
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
                        <button
                          onClick={() => onDeleteActivity(act.id)}
                          className="text-neutral-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
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
              <div className="p-4 rounded-xl border border-border/30 bg-card/35 space-y-3 text-xs">
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
                    <div key={idx} className="p-2 rounded bg-card border border-border/10">
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
            <div className="flex flex-col h-[400px] border border-border/30 rounded-xl overflow-hidden bg-card/25">
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
                    messages.map((m) => (
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
                              ? 'bg-muted text-foreground rounded-tl-none'
                              : m.sender === 'ai'
                              ? 'bg-primary/10 border border-primary/20 text-primary rounded-tr-none'
                              : 'bg-primary text-black font-semibold rounded-tr-none'
                          }`}
                        >
                          {m.text}
                        </div>
                        {m.time && <span className="text-[9px] text-neutral-500 mt-1 px-1">{m.time}</span>}
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Chat Input */}
              <div className="p-3 border-t border-border/20 bg-card flex gap-2">
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
                  className="flex-1 bg-card border border-border/40 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
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
