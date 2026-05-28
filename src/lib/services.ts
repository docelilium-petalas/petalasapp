// ARCHITECTURE NOTE — TWO SERVICE LAYERS
//
// This file (crmService) is the MOCK layer: state lives in localStorage (browser)
// or in a global object (server HMR). It powers all CRM features that are not yet
// backed by a real database — pipeline, contacts, deals, activities, AI sessions, etc.
//
// The REAL layer lives in src/app/actions/crm.ts (Next.js Server Actions + Prisma).
// It currently covers: authentication, dashboard KPIs, pipelines, stages, contacts,
// deals, activities, AI deals, and deal stage history — all scoped to the authed user.
//
// Migration path: implement each feature in server actions, delete from this file.
// When this file is empty, delete it. Do NOT add new features here.

import { DealPriority, DealStatus, ActivityStatus } from '@prisma/client'
import * as mockData from './mockData'

// Helper to determine if we are running in the browser
const isBrowser = typeof window !== 'undefined'

// Global mock state interface
interface MockDbState {
  users: mockData.MockUser[]
  teams: mockData.MockTeam[]
  pipelines: mockData.MockPipeline[]
  stages: mockData.MockStage[]
  contacts: mockData.MockContact[]
  deals: mockData.MockDeal[]
  activities: mockData.MockActivity[]
  leads: mockData.MockLead[]
  leadsCnpj: mockData.MockLeadCnpj[]
  listas: mockData.MockListaDisparo[]
  leadsLista: mockData.MockLeadListaDisparo[]
  templates: mockData.MockMessageTemplate[]
  caixaRapidoLists: mockData.MockCaixaRapidoList[]
  segmentos: mockData.MockSegmentoCaixaRapido[]
  reactivationHistory: mockData.MockLeadReactivationHistory[]
  integrations: mockData.MockIntegration[]
  aiAgentConfigs: mockData.MockAIAgentConfig[]
  webhookLogs: mockData.MockWebhookLog[]
  aiSessions: mockData.MockAISession[]
  aiLogs: mockData.MockAILog[]
  history: mockData.MockDealStageHistory[]
}

// Initial state builder
const getInitialState = (): MockDbState => ({
  users: [mockData.INITIAL_USER, ...mockData.INITIAL_SELLERS],
  teams: [mockData.INITIAL_TEAM],
  pipelines: mockData.INITIAL_PIPELINES,
  stages: mockData.INITIAL_STAGES,
  contacts: mockData.INITIAL_CONTACTS,
  deals: mockData.INITIAL_DEALS,
  activities: mockData.INITIAL_ACTIVITIES,
  leads: mockData.INITIAL_LEADS,
  leadsCnpj: mockData.INITIAL_LEADS_CNPJ,
  listas: mockData.INITIAL_LISTAS,
  leadsLista: [],
  templates: mockData.INITIAL_TEMPLATES,
  caixaRapidoLists: mockData.INITIAL_CAIXA_RAPIDO_LISTS,
  segmentos: mockData.INITIAL_SEGMENTOS,
  reactivationHistory: mockData.INITIAL_REACTIVATION_HISTORY,
  integrations: mockData.INITIAL_INTEGRATIONS,
  aiAgentConfigs: mockData.INITIAL_AI_CONFIGS,
  webhookLogs: mockData.INITIAL_WEBHOOK_LOGS,
  aiSessions: [],
  aiLogs: [],
  history: mockData.INITIAL_HISTORY
})

// Initialize state holder in global scope (for server-side Hot Module Replacement persistence)
const globalForMock = global as unknown as { mockDb: MockDbState }
if (!globalForMock.mockDb) {
  globalForMock.mockDb = getInitialState()
}

// Service helper to get current state
function getState(): MockDbState {
  if (isBrowser) {
    const saved = localStorage.getItem('ocr_crm_state')
    if (saved) {
      try {
        const parsed: unknown = JSON.parse(saved)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...getInitialState(), ...(parsed as Partial<MockDbState>) }
        }
      } catch {
        // corrupted storage — reinitialise
      }
    }
    const init = getInitialState()
    localStorage.setItem('ocr_crm_state', JSON.stringify(init))
    return init
  }
  return globalForMock.mockDb
}

// Service helper to save state
function saveState(state: MockDbState) {
  if (isBrowser) {
    localStorage.setItem('ocr_crm_state', JSON.stringify(state))
  } else {
    globalForMock.mockDb = state
  }
}

// CENTRAL CRM SERVICES LAYER
export const crmService = {
  getState() {
    return getState()
  },

  // --- AUTH SERVICES ---
  async login(email: string): Promise<mockData.MockUser | null> {
    const state = getState()
    const user = state.users.find(u => u.email === email)
    return user || null
  },

  // --- DASHBOARD SERVICES ---
  async getDashboardKpis(_period: string) {
    const state = getState()
    
    // Calculate faturamento (won deals)
    const wonDeals = state.deals.filter(d => d.status === DealStatus.WON)
    const openDeals = state.deals.filter(d => d.status === DealStatus.OPEN)
    const totalDeals = state.deals.length
    
    const faturamentoTotal = wonDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
    const ticketMedio = wonDeals.length > 0 ? faturamentoTotal / wonDeals.length : 0
    const taxaConversao = totalDeals > 0 ? (wonDeals.length / totalDeals) * 100 : 0
    const receitaEmAberto = openDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
    const atividadesPendentes = state.activities.filter(a => a.status === ActivityStatus.OPEN).length

    // UTM Campaign summary for UTM Widget
    const utmSummary: Record<string, { leads: number; deals: number; won: number; receita: number }> = {}
    state.deals.forEach(d => {
      const source = d.utmSource || 'Tráfego Direto'
      if (!utmSummary[source]) {
        utmSummary[source] = { leads: 0, deals: 0, won: 0, receita: 0 }
      }
      utmSummary[source].leads += 1
      utmSummary[source].deals += 1
      if (d.status === DealStatus.WON) {
        utmSummary[source].won += 1
        utmSummary[source].receita += d.valorEstimado
      }
    })

    const topCampaigns = Object.entries(utmSummary).map(([campanha, data]) => ({
      campanha,
      leads: data.leads,
      deals: data.deals,
      ganhos: data.won,
      receita: data.receita,
      conversao: data.leads > 0 ? (data.won / data.leads) * 100 : 0
    })).sort((a, b) => b.receita - a.receita)

    // Pipeline Stage Funnel chart data
    const stageCounts = state.stages.map(stage => {
      const stageDeals = state.deals.filter(d => d.stageId === stage.id && d.status === DealStatus.OPEN)
      const valor = stageDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
      return {
        name: stage.nome,
        value: stageDeals.length,
        valor
      }
    })

    return {
      faturamentoTotal,
      ticketMedio,
      openDealsCount: openDeals.length,
      taxaConversao,
      receitaEmAberto,
      atividadesPendentes,
      topCampaigns,
      stageCounts
    }
  },

  // --- PIPELINE & STAGE SERVICES ---
  async getPipelines(): Promise<mockData.MockPipeline[]> {
    return getState().pipelines.sort((a, b) => a.ordem - b.ordem)
  },

  async createPipeline(nome: string): Promise<mockData.MockPipeline> {
    const state = getState()
    const newPipeline: mockData.MockPipeline = {
      id: 'pipe-' + Math.random().toString(36).substr(2, 9),
      nome,
      isDefault: state.pipelines.length === 0,
      ativo: true,
      ordem: state.pipelines.length + 1
    }
    state.pipelines.push(newPipeline)
    saveState(state)
    return newPipeline
  },

  async updatePipeline(id: string, data: Partial<mockData.MockPipeline>): Promise<mockData.MockPipeline> {
    const state = getState()
    const index = state.pipelines.findIndex(p => p.id === id)
    if (index === -1) throw new Error('Pipeline não encontrado')
    state.pipelines[index] = { ...state.pipelines[index], ...data }
    saveState(state)
    return state.pipelines[index]
  },

  async setDefaultPipeline(pipelineId: string, _userId: string = 'usr-admin-123'): Promise<void> {
    const state = getState()
    state.pipelines = state.pipelines.map(p => ({
      ...p,
      isDefault: p.id === pipelineId
    }))
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-pipelines-updated'))
    }
  },

  async deletePipeline(pipelineId: string): Promise<void> {
    const state = getState()
    
    // Manual Cascade Delete: history -> deals -> stages -> pipeline
    const pipelineDeals = state.deals.filter(d => d.pipelineId === pipelineId)
    const dealIds = pipelineDeals.map(d => d.id)

    // Remove deal stage history
    state.history = state.history.filter(h => !dealIds.includes(h.dealId))
    
    // Remove deals
    state.deals = state.deals.filter(d => d.pipelineId !== pipelineId)
    
    // Remove stages
    state.stages = state.stages.filter(s => s.pipelineId !== pipelineId)
    
    // Remove pipeline
    state.pipelines = state.pipelines.filter(p => p.id !== pipelineId)

    // Re-assign default if we deleted the default one
    if (state.pipelines.length > 0 && !state.pipelines.some(p => p.isDefault)) {
      state.pipelines[0].isDefault = true
    }

    saveState(state)
  },

  async getStages(pipelineId: string): Promise<mockData.MockStage[]> {
    const state = getState()
    return state.stages.filter(s => s.pipelineId === pipelineId).sort((a, b) => a.ordem - b.ordem)
  },

  async getAllStages(): Promise<mockData.MockStage[]> {
    const state = getState()
    return state.stages
  },

  async createStage(data: Omit<mockData.MockStage, 'id'>): Promise<mockData.MockStage> {
    const state = getState()
    const newStage: mockData.MockStage = {
      ...data,
      id: 'stage-' + Math.random().toString(36).substr(2, 9)
    }
    state.stages.push(newStage)
    saveState(state)
    return newStage
  },

  async updateStage(id: string, data: Partial<mockData.MockStage>): Promise<mockData.MockStage> {
    const state = getState()
    const index = state.stages.findIndex(s => s.id === id)
    if (index === -1) throw new Error('Estágio não encontrado')
    state.stages[index] = { ...state.stages[index], ...data }
    saveState(state)
    return state.stages[index]
  },

  async deleteStage(id: string, migrationStageId?: string): Promise<void> {
    const state = getState()
    const dealsInStage = state.deals.filter(d => d.stageId === id)

    if (dealsInStage.length > 0) {
      if (!migrationStageId) {
        throw new Error('Este estágio possui negócios ativos. Defina um estágio de destino para migrá-los antes de excluir.')
      }
      // Migrate deals
      state.deals = state.deals.map(d => {
        if (d.stageId === id) {
          // Register history transition
          state.history.push({
            id: 'h-' + Math.random().toString(36).substr(2, 9),
            dealId: d.id,
            deStageId: id,
            paraStageId: migrationStageId,
            mudouEm: new Date().toISOString(),
            mudouPor: 'Sistema (Exclusão de Estágio)',
            fonte: 'bulk_move'
          })
          return { ...d, stageId: migrationStageId, updatedAt: new Date().toISOString() }
        }
        return d
      })
    }

    state.stages = state.stages.filter(s => s.id !== id)
    saveState(state)
  },

  async reorderStages(pipelineId: string, stages: mockData.MockStage[]): Promise<void> {
    const state = getState()
    // Update ordem based on index in array
    state.stages = state.stages.map(s => {
      if (s.pipelineId === pipelineId) {
        const foundIndex = stages.findIndex(st => st.id === s.id)
        if (foundIndex !== -1) {
          return { ...s, ordem: foundIndex + 1 }
        }
      }
      return s
    })
    saveState(state)
  },

  async reorderPipelines(pipelines: mockData.MockPipeline[]): Promise<void> {
    const state = getState()
    state.pipelines = state.pipelines.map(p => {
      const foundIndex = pipelines.findIndex(pl => pl.id === p.id)
      if (foundIndex !== -1) {
        return { ...p, ordem: foundIndex + 1 }
      }
      return p
    })
    saveState(state)
  },

  // --- CONTACTS SERVICES ---
  // Helper de RLS de Equipe Virtual
  get_team_user_ids(_userId: string): string[] {
    // usr-admin-123, usr-seller-1 e usr-seller-2 pertencem ao mesmo time
    return ['usr-admin-123', 'usr-seller-1', 'usr-seller-2']
  },

  // --- CONTACTS SERVICES ---
  async getContacts(): Promise<mockData.MockContact[]> {
    const state = getState()
    // Filtro virtual de RLS (todos contatos do time de usr-admin-123)
    const teamUserIds = this.get_team_user_ids('usr-admin-123')
    return state.contacts
      .filter(c => !c.user_id || teamUserIds.includes(c.user_id))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  },

  async createContact(data: Omit<mockData.MockContact, 'id' | 'createdAt'>): Promise<mockData.MockContact> {
    const state = getState()
    
    if (!data.nome || data.nome.trim().length < 2) {
      throw new Error('O nome do contato deve ter pelo menos 2 caracteres.')
    }

    // Normalização do telefone no formato 55DDDNÚMERO
    let telNormalizado = (data.telefone || '').replace(/\D/g, '')
    if (telNormalizado.length > 0 && !telNormalizado.startsWith('55')) {
      telNormalizado = '55' + telNormalizado
    }

    const nowIso = new Date().toISOString()
    const firstUtmSource = data.firstUtmSource || data.origem || undefined
    const firstUtmMedium = data.firstUtmMedium || undefined
    const firstUtmCampaign = data.firstUtmCampaign || undefined
    const firstUtmContent = data.firstUtmContent || undefined
    const firstUtmTerm = data.firstUtmTerm || undefined
    const firstLandingPage = data.firstLandingPage || undefined
    const firstUtmAt = firstUtmSource ? nowIso : undefined

    const newContact: mockData.MockContact = {
      ...data,
      id: 'contact-' + Math.random().toString(36).substr(2, 9),
      user_id: data.user_id || 'usr-admin-123',
      telefone: telNormalizado,
      consentimentoLgpd: data.consentimentoLgpd ?? false,
      enderecoCompleto: data.enderecoCompleto || {},
      fbMetadata: data.fbMetadata || {},
      camposCustomizados: data.camposCustomizados || {},
      firstUtmSource,
      firstUtmMedium,
      firstUtmCampaign,
      firstUtmContent,
      firstUtmTerm,
      firstLandingPage,
      firstUtmAt,
      // lastUtm começa igual ao firstUtm
      lastUtmSource: firstUtmSource,
      lastUtmMedium: firstUtmMedium,
      lastUtmCampaign: firstUtmCampaign,
      lastUtmContent: firstUtmContent,
      lastUtmTerm: firstUtmTerm,
      lastLandingPage: firstLandingPage,
      lastUtmAt: firstUtmAt,
      createdAt: nowIso
    }
    state.contacts.push(newContact)
    saveState(state)
    return newContact
  },

  async updateContact(id: string, data: Partial<mockData.MockContact>): Promise<mockData.MockContact> {
    const state = getState()
    const index = state.contacts.findIndex(c => c.id === id)
    if (index === -1) throw new Error('Contato não encontrado')
    
    const oldContact = state.contacts[index]
    
    // Normalização do telefone se fornecido
    let telNormalizado = oldContact.telefone
    if (data.telefone !== undefined) {
      telNormalizado = data.telefone.replace(/\D/g, '')
      if (telNormalizado.length > 0 && !telNormalizado.startsWith('55')) {
        telNormalizado = '55' + telNormalizado
      }
    }

    // Preparar dados de atualização
    const updatedData = { ...data }
    
    // Impedir sobrescrita de firstUtm*
    delete updatedData.firstUtmSource
    delete updatedData.firstUtmMedium
    delete updatedData.firstUtmCampaign
    delete updatedData.firstUtmContent
    delete updatedData.firstUtmTerm
    delete updatedData.firstLandingPage
    delete updatedData.firstUtmAt

    // Atualizar lastUtm se algum campo de UTM for enviado no update
    const hasUtmUpdate = 
      data.lastUtmSource !== undefined || 
      data.lastUtmMedium !== undefined || 
      data.lastUtmCampaign !== undefined ||
      data.lastUtmContent !== undefined ||
      data.lastUtmTerm !== undefined ||
      data.lastLandingPage !== undefined

    const nowIso = new Date().toISOString()
    const lastUtmSource = hasUtmUpdate ? (data.lastUtmSource ?? oldContact.lastUtmSource) : oldContact.lastUtmSource
    const lastUtmAt = hasUtmUpdate ? nowIso : oldContact.lastUtmAt

    state.contacts[index] = {
      ...oldContact,
      ...updatedData,
      telefone: telNormalizado,
      lastUtmSource,
      lastUtmAt
    }
    saveState(state)
    return state.contacts[index]
  },

  async deleteContact(id: string): Promise<void> {
    const state = getState()
    state.contacts = state.contacts.filter(c => c.id !== id)
    state.deals = state.deals.filter(d => d.contactId !== id)
    state.activities = state.activities.filter(a => a.contactId !== id)
    saveState(state)
  },

  async deleteContacts(ids: string[]): Promise<void> {
    const idSet = new Set(ids)
    const state = getState()
    state.contacts = state.contacts.filter(c => !idSet.has(c.id))
    state.deals = state.deals.filter(d => !idSet.has(d.contactId))
    state.activities = state.activities.filter(a => !a.contactId || !idSet.has(a.contactId))
    saveState(state)
  },

  async getContactStats(contactId: string) {
    const state = getState()
    const deals = state.deals.filter(d => d.contactId === contactId)
    const wonDeals = deals.filter(d => d.status === DealStatus.WON)
    const totalValue = wonDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
    const activities = state.activities.filter(a => a.contactId === contactId)
    
    return {
      wonDealsCount: wonDeals.length,
      totalValue,
      dealsCount: deals.length,
      activitiesCount: activities.length
    }
  },

  async mergeContacts(primaryId: string, secondaryId: string): Promise<mockData.MockContact> {
    const state = getState()
    const primary = state.contacts.find(c => c.id === primaryId)
    const secondary = state.contacts.find(c => c.id === secondaryId)
    if (!primary || !secondary) throw new Error('Contatos não encontrados')

    // Merge tags
    const combinedTags = Array.from(new Set([...(primary.tags || []), ...(secondary.tags || [])]))
    
    // Merge contact fields (preserve primary unless secondary has them and primary doesn't)
    const mergedContact: mockData.MockContact = {
      ...secondary,
      ...primary,
      tags: combinedTags,
      firstUtmSource: primary.firstUtmSource || secondary.firstUtmSource,
      firstUtmMedium: primary.firstUtmMedium || secondary.firstUtmMedium,
      firstUtmCampaign: primary.firstUtmCampaign || secondary.firstUtmCampaign,
      firstUtmAt: primary.firstUtmAt || secondary.firstUtmAt,
      lastUtmSource: secondary.lastUtmSource || primary.lastUtmSource,
      lastUtmMedium: secondary.lastUtmMedium || primary.lastUtmMedium,
      lastUtmCampaign: secondary.lastUtmCampaign || primary.lastUtmCampaign,
      lastUtmAt: secondary.lastUtmAt || primary.lastUtmAt
    }

    // Update state
    state.contacts = state.contacts.filter(c => c.id !== secondaryId)
    const primaryIndex = state.contacts.findIndex(c => c.id === primaryId)
    state.contacts[primaryIndex] = mergedContact

    // Update deals from secondary to primary
    state.deals = state.deals.map(d => d.contactId === secondaryId ? { ...d, contactId: primaryId } : d)

    // Update activities from secondary to primary
    state.activities = state.activities.map(a => a.contactId === secondaryId ? { ...a, contactId: primaryId } : a)

    saveState(state)
    return mergedContact
  },

  // --- DEALS SERVICES ---
  async getDeals(pipelineId: string): Promise<mockData.MockDeal[]> {
    const state = getState()
    return state.deals.filter(d => d.pipelineId === pipelineId)
  },

  async getAllDeals(): Promise<mockData.MockDeal[]> {
    const state = getState()
    return state.deals
  },

  async createDeal(data: Omit<mockData.MockDeal, 'id' | 'createdAt' | 'updatedAt'>): Promise<mockData.MockDeal> {
    const state = getState()
    
    // Rule: todo deal precisa estar vinculado a um contato
    if (!data.contactId) {
      throw new Error('Todo negócio precisa estar vinculado a um contato.')
    }

    const contact = state.contacts.find(c => c.id === data.contactId)
    if (!contact) {
      throw new Error('Contato vinculado não encontrado.')
    }

    // Normalização de telefone para 55DDDNÚMERO (apenas dígitos)
    const rawTelefone = contact.telefone || data.telefone || ''
    const telefoneNormalizado = rawTelefone.replace(/\D/g, '')

    // Origem automática se vazia e houver telefone -> whatsapp
    const origemValida = data.origem || (telefoneNormalizado ? 'whatsapp' : 'manual')

    // Congelar UTMs correspondentes do contato no deal na criação
    const newDeal: mockData.MockDeal = {
      ...data,
      id: 'deal-' + Math.random().toString(36).substr(2, 9),
      telefone: telefoneNormalizado,
      origem: origemValida,
      utmSource: contact.firstUtmSource || data.utmSource || 'Tráfego Direto',
      utmMedium: contact.firstUtmMedium || data.utmMedium || '',
      utmCampaign: contact.firstUtmCampaign || data.utmCampaign || '',
      utmContent: contact.firstUtmSource ? '' : (data.utmContent || ''),
      utmTerm: data.utmTerm || '',
      utmLandingPage: data.utmLandingPage || '/',
      utmReferrer: data.utmReferrer || '',
      utmCapturedAt: contact.firstUtmAt || data.utmCapturedAt || new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Grava ownerAssignedAt se ownerUserId estiver setado
    if (newDeal.ownerUserId) {
      newDeal.ownerAssignedAt = new Date().toISOString()
    }

    state.deals.push(newDeal)

    // Add stage history entry
    state.history.push({
      id: 'h-' + Math.random().toString(36).substr(2, 9),
      dealId: newDeal.id,
      deStageId: null,
      paraStageId: newDeal.stageId,
      mudouEm: newDeal.createdAt,
      mudouPor: 'Sistema',
      fonte: 'manual_form'
    })

    saveState(state)
    return newDeal
  },

  async updateDeal(id: string, data: Partial<mockData.MockDeal>): Promise<mockData.MockDeal> {
    const state = getState()
    const index = state.deals.findIndex(d => d.id === id)
    if (index === -1) throw new Error('Negociação não encontrada')

    const oldDeal = state.deals[index]
    const oldStageId = oldDeal.stageId
    const newStageId = data.stageId

    // Rastrear se o owner mudou pela primeira vez
    let ownerAssignedAt = oldDeal.ownerAssignedAt
    if (data.ownerUserId && !oldDeal.ownerUserId && !oldDeal.ownerAssignedAt) {
      ownerAssignedAt = new Date().toISOString()
    }

    state.deals[index] = {
      ...oldDeal,
      ...data,
      ownerAssignedAt,
      updatedAt: new Date().toISOString()
    }

    // Register stage transition if changed
    if (newStageId && oldStageId !== newStageId) {
      state.history.push({
        id: 'h-' + Math.random().toString(36).substr(2, 9),
        dealId: id,
        deStageId: oldStageId,
        paraStageId: newStageId,
        mudouEm: new Date().toISOString(),
        mudouPor: 'Vendedor',
        fonte: 'menu'
      })
    }

    saveState(state)
    return state.deals[index]
  },

  async moveDealStage(dealId: string, newStageId: string, source: string): Promise<void> {
    const state = getState()
    const index = state.deals.findIndex(d => d.id === dealId)
    if (index === -1) return

    const oldStageId = state.deals[index].stageId
    state.deals[index].stageId = newStageId
    state.deals[index].updatedAt = new Date().toISOString()

    state.history.push({
      id: 'h-' + Math.random().toString(36).substr(2, 9),
      dealId,
      deStageId: oldStageId,
      paraStageId: newStageId,
      mudouEm: new Date().toISOString(),
      mudouPor: 'Vendedor',
      fonte: source
    })

    saveState(state)
  },

  async closeDeal(dealId: string, status: 'WON' | 'LOST', motivoPerda?: string): Promise<mockData.MockDeal> {
    const state = getState()
    const index = state.deals.findIndex(d => d.id === dealId)
    if (index === -1) throw new Error('Negociação não encontrada')

    const deal = state.deals[index]
    let normalizedReason = motivoPerda || ''

    if (status === 'LOST') {
      if (!motivoPerda) {
        throw new Error('Motivo de perda é obrigatório para fechar como perdido.')
      }
      
      // Função normalizeLossReason()
      const normalizeLossReason = (reason: string): string => {
        const normalized = reason.trim().toLowerCase();
        if (normalized.includes('desist') || normalized.includes('desiti') || normalized.includes('cancelar')) {
          return 'Desistência';
        }
        if (normalized.includes('contato') || normalized.includes('não atende') || normalized.includes('nao atende') || normalized.includes('desligou') || normalized.includes('sumiu') || normalized.includes('vácuo') || normalized.includes('vacuo')) {
          return 'Falta de contato';
        }
        if (normalized.includes('orçamento') || normalized.includes('orcamento') || normalized.includes('caro') || normalized.includes('preço') || normalized.includes('preco') || normalized.includes('dinheiro') || normalized.includes('sem verba') || normalized.includes('grana')) {
          return 'Falta de orçamento';
        }
        if (normalized.includes('público') || normalized.includes('publico') || normalized.includes('perfil') || normalized.includes('segmento') || normalized.includes('pequeno') || normalized.includes('grande')) {
          return 'Não é o público-alvo';
        }
        if (normalized.includes('concorrente') || normalized.includes('outro crm') || normalized.includes('outra soluc') || normalized.includes('outra ferramenta')) {
          return 'Foi para concorrente';
        }
        if (normalized.includes('timing') || normalized.includes('momento') || normalized.includes('depois') || normalized.includes('futuro') || normalized.includes('sem tempo')) {
          return 'Timing inadequado';
        }
        if (normalized.includes('interesse') || normalized.includes('não quer') || normalized.includes('nao quer') || normalized.includes('recusou')) {
          return 'Sem interesse';
        }
        return reason;
      }
      normalizedReason = normalizeLossReason(motivoPerda)
    }

    state.deals[index] = {
      ...deal,
      status: status as DealStatus,
      motivoPerda: status === 'LOST' ? normalizedReason : undefined,
      fechadoEm: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    // Registra evento de fechamento no histórico
    state.history.push({
      id: 'h-' + Math.random().toString(36).substr(2, 9),
      dealId,
      deStageId: deal.stageId,
      paraStageId: deal.stageId,
      mudouEm: new Date().toISOString(),
      mudouPor: 'Vendedor',
      fonte: status === 'WON' ? 'fechamento_ganho' : 'fechamento_perdido'
    })
    if (status === 'WON') {
      const contactIndex = state.contacts.findIndex(c => c.id === deal.contactId)
      if (contactIndex !== -1) {
        state.contacts[contactIndex].lastPurchaseAt = new Date().toISOString()
        state.contacts[contactIndex].lastPurchaseValue = deal.valorEstimado
      }
    }

    saveState(state)
    return state.deals[index]
  },

  async reopenDeal(dealId: string): Promise<mockData.MockDeal> {
    const state = getState()
    const index = state.deals.findIndex(d => d.id === dealId)
    if (index === -1) throw new Error('Negociação não encontrada')

    const deal = state.deals[index]
    state.deals[index] = {
      ...deal,
      status: DealStatus.OPEN,
      motivoPerda: undefined,
      fechadoEm: undefined,
      updatedAt: new Date().toISOString()
    }

    // Registra evento de reabertura no histórico
    state.history.push({
      id: 'h-' + Math.random().toString(36).substr(2, 9),
      dealId,
      deStageId: deal.stageId,
      paraStageId: deal.stageId,
      mudouEm: new Date().toISOString(),
      mudouPor: 'Vendedor',
      fonte: 'reabertura'
    })

    saveState(state)
    return state.deals[index]
  },

  async deleteDeal(id: string): Promise<void> {
    const state = getState()
    
    // Cascata manual: apaga histórico do deal -> apaga deal
    state.history = state.history.filter(h => h.dealId !== id)
    state.deals = state.deals.filter(d => d.id !== id)
    state.activities = state.activities.filter(a => a.dealId !== id)
    
    saveState(state)
  },

  async getDealStageHistory(dealId: string) {
    const state = getState()
    return state.history.filter(h => h.dealId === dealId).map(h => {
      const deStage = state.stages.find(s => s.id === h.deStageId)?.nome || (h.deStageId ? 'Etapa Removida' : 'Etapa Inicial')
      const paraStage = state.stages.find(s => s.id === h.paraStageId)?.nome || 'Etapa Nova'
      return {
        ...h,
        deStage,
        paraStage
      }
    }).sort((a, b) => new Date(a.mudouEm).getTime() - new Date(b.mudouEm).getTime())
  },

  async getAllHistory(): Promise<mockData.MockDealStageHistory[]> {
    const state = getState()
    return state.history
  },

  // --- ACTIVITIES SERVICES ---
  async getActivities(): Promise<mockData.MockActivity[]> {
    return getState().activities.sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  },

  async createActivity(data: Omit<mockData.MockActivity, 'id' | 'createdAt'>): Promise<mockData.MockActivity> {
    const state = getState()
    const newActivity: mockData.MockActivity = {
      ...data,
      id: 'act-' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    }
    state.activities.push(newActivity)
    saveState(state)
    return newActivity
  },

  async updateActivity(id: string, data: Partial<mockData.MockActivity>): Promise<mockData.MockActivity> {
    const state = getState()
    const index = state.activities.findIndex(a => a.id === id)
    if (index === -1) throw new Error('Atividade não encontrada')
    state.activities[index] = { ...state.activities[index], ...data }
    saveState(state)
    return state.activities[index]
  },

  async deleteActivity(id: string): Promise<void> {
    const state = getState()
    state.activities = state.activities.filter(a => a.id !== id)
    saveState(state)
  },

  // --- LEAD SEARCH MOCK ---
  async getLeadsGoogle(): Promise<mockData.MockLead[]> {
    return getState().leads
  },

  async getLeadsCnpj(): Promise<mockData.MockLeadCnpj[]> {
    return getState().leadsCnpj
  },

  async executeLeadSearchGoogle(nicho: string, cidade: string, estado: string, quantidade: number): Promise<mockData.MockLead[]> {
    const state = getState()
    // Simulated maps results generator
    const newLeads: mockData.MockLead[] = []
    const nichosSingular = nicho.endsWith('s') ? nicho.slice(0, -1) : nicho

    for (let i = 1; i <= quantidade; i++) {
      const id = 'lead-map-' + Math.random().toString(36).substr(2, 9)
      const nome = `${nichosSingular.charAt(0).toUpperCase() + nichosSingular.slice(1)} ${['Master', 'Premium', 'Ponto Certo', 'Central', 'do Povo'][i % 5]} ${['LTDA', 'Eireli', 'ME', ''][i % 4]}`.trim()
      const ddd = estado === 'SP' ? '11' : estado === 'RJ' ? '21' : estado === 'GO' ? '62' : '61'
      const telefone = `55${ddd}9${Math.floor(10000000 + Math.random() * 90000000)}`
      
      const lead: mockData.MockLead = {
        id,
        nome,
        nicho,
        cidade,
        estado,
        telefone,
        site: `www.${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`,
        endereco: `Rua das Flores, ${i * 12} - Bairro Nobre`,
        avaliacao: parseFloat((3.5 + Math.random() * 1.5).toFixed(1)),
        status: 'ativo',
        createdAt: new Date().toISOString()
      }
      newLeads.push(lead)
      state.leads.push(lead)
    }

    saveState(state)
    return newLeads
  },

  async executeLeadSearchCnpj(cnae: string, cidade: string, estado: string): Promise<mockData.MockLeadCnpj[]> {
    const state = getState()
    const newLeads: mockData.MockLeadCnpj[] = []
    const ddd = estado === 'SP' ? '11' : estado === 'RJ' ? '21' : estado === 'GO' ? '62' : '61'

    for (let i = 1; i <= 5; i++) {
      const id = 'lead-cnpj-' + Math.random().toString(36).substr(2, 9)
      const cnpj = `${Math.floor(10000000 + Math.random() * 90000000)}0001${Math.floor(10 + Math.random() * 89)}`
      const nome = `${['Vendas', 'Distribuidora', 'Serviços', 'Engenharia', 'Soluções'][i - 1]} Alfa ${estado} LTDA`
      const lead: mockData.MockLeadCnpj = {
        id,
        cnpj,
        nome,
        cnaeCodigo: cnae,
        cnaeDescricao: 'Consultoria em tecnologia da informação e afins',
        situacao: 'ATIVA',
        dataAbertura: `${Math.floor(1 + Math.random() * 28)}/0${Math.floor(1 + Math.random() * 8)}/2021`,
        cidade,
        estado,
        email: `contato@${nome.toLowerCase().replace(/[^a-z0-9]/g, '')}.com.br`,
        telefone: `55${ddd}9${Math.floor(10000000 + Math.random() * 90000000)}`,
        createdAt: new Date().toISOString()
      }
      newLeads.push(lead)
      state.leadsCnpj.push(lead)
    }

    saveState(state)
    return newLeads
  },

  // --- BLAST LISTS SERVICES ---
  async getListasDisparo(): Promise<mockData.MockListaDisparo[]> {
    return getState().listas
  },

  async createListaDisparo(data: Omit<mockData.MockListaDisparo, 'id' | 'createdAt'>): Promise<mockData.MockListaDisparo> {
    const state = getState()
    const newLista: mockData.MockListaDisparo = {
      ...data,
      id: 'lista-' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    }
    state.listas.push(newLista)
    saveState(state)
    return newLista
  },

  async updateListaDisparo(id: string, data: Partial<mockData.MockListaDisparo>): Promise<mockData.MockListaDisparo> {
    const state = getState()
    const index = state.listas.findIndex(l => l.id === id)
    if (index === -1) throw new Error('Lista não encontrada')
    state.listas[index] = { ...state.listas[index], ...data }
    saveState(state)
    return state.listas[index]
  },

  async deleteListaDisparo(id: string): Promise<void> {
    const state = getState()
    state.listas = state.listas.filter(l => l.id !== id)
    state.leadsLista = state.leadsLista.filter(ll => ll.listaId !== id)
    saveState(state)
  },

  // --- MESSAGE TEMPLATES ---
  async getTemplates(): Promise<mockData.MockMessageTemplate[]> {
    return getState().templates
  },

  async createTemplate(data: Omit<mockData.MockMessageTemplate, 'id' | 'createdAt'>): Promise<mockData.MockMessageTemplate> {
    const state = getState()
    const newTpl: mockData.MockMessageTemplate = {
      ...data,
      id: 'tpl-' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString()
    }
    state.templates.push(newTpl)
    saveState(state)
    return newTpl
  },



  // --- AI INSIGHTS ---
  async getAiDealsOrdered(): Promise<mockData.MockDeal[]> {
    const state = getState()
    // Filters deals having aiScore > 0 and sorts descending
    return state.deals.filter(d => d.aiScore > 0).sort((a, b) => b.aiScore - a.aiScore)
  },

  async triggerAiQualification(dealId: string): Promise<string> {
    const state = getState()
    const deal = state.deals.find(d => d.id === dealId)
    if (!deal) throw new Error('Deal não encontrado')

    const contact = state.contacts.find(c => c.id === deal.contactId)
    const contactName = contact?.nome || 'Cliente'

    // Create session
    const sessionId = 'session-' + Math.random().toString(36).substr(2, 9)
    const newSession = {
      id: 'sess-' + Math.random().toString(36).substr(2, 9),
      dealId,
      sessionId,
      startedAt: new Date().toISOString(),
      lastInteractionAt: new Date().toISOString(),
      scoreInicial: deal.aiScore || 40,
      scoreFinal: deal.aiScore || 40,
      mensagensEnviadas: 1,
      mensagensRecebidas: 0,
      qualificationResult: 'em_andamento' as const
    }
    state.aiSessions.push(newSession)

    // Add first chat log (Opening prompt)
    const openingMsg = `Olá ${contactName}! Sou a Aline da Operação Caixa Rápido. Vi que você se interessou pelo nosso acelerador comercial de ${deal.produtoInteresse || 'Automação'}. Vocês já possuem vendedores ativos na equipe hoje?`
    
    state.aiLogs.push({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      sessionId,
      dealId,
      role: 'assistant',
      content: openingMsg,
      createdAt: new Date().toISOString()
    })
    return sessionId
  },

  getAILogs: () => {
    const state = getState()
    return state.aiLogs
  },

  // CAIXA RÁPIDO METHODS
  getCaixaRapidoLists: () => {
    const state = getState()
    return state.caixaRapidoLists
  },
  
  getSegmentos: () => {
    const state = getState()
    return state.segmentos
  },

  getReactivationHistory: () => {
    const state = getState()
    return state.reactivationHistory
  },

  createCaixaRapidoList: (listData: Partial<mockData.MockCaixaRapidoList>) => {
    const state = getState()
    const newList: mockData.MockCaixaRapidoList = {
      id: `cr-lista-${Date.now()}`,
      nomeLista: listData.nomeLista || 'Nova Lista',
      descricao: listData.descricao,
      mensagemTemplateId: listData.mensagemTemplateId,
      status: listData.status || 'RASCUNHO',
      totalLeads: listData.totalLeads || 0,
      enviados: 0,
      erros: 0,
      agendamento: listData.agendamento,
      configEnvio: listData.configEnvio || {
        horarioComercial: true,
        intervaloSegundos: 30
      },
      segmentosAplicados: listData.segmentosAplicados || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    state.caixaRapidoLists.push(newList)
    saveState(state)
    return newList
  },

  createSegmento: (segmentData: Partial<mockData.MockSegmentoCaixaRapido>) => {
    const state = getState()
    const newSeg: mockData.MockSegmentoCaixaRapido = {
      id: `seg-${Date.now()}`,
      nome: segmentData.nome || 'Novo Segmento',
      descricao: segmentData.descricao,
      filtros: segmentData.filtros || {},
      createdAt: new Date().toISOString()
    }
    state.segmentos.push(newSeg)
    saveState(state)
    return newSeg
  },

  async getAiChatLogs(sessionId: string) {
    const state = getState()
    return state.aiLogs.filter(log => log.sessionId === sessionId).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  },

  async sendAiUserReply(sessionId: string, reply: string): Promise<string> {
    const state = getState()
    const session = state.aiSessions.find(s => s.sessionId === sessionId)
    if (!session) throw new Error('Sessão não encontrada')

    const deal = state.deals.find(d => d.id === session.dealId)
    if (!deal) throw new Error('Deal não encontrado')

    // 1. Add User reply log
    state.aiLogs.push({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      sessionId,
      dealId: session.dealId,
      role: 'user',
      content: reply,
      createdAt: new Date().toISOString()
    })

    session.mensagensRecebidas += 1

    // 2. Generate simulated AI follow-up response based on keywords
    let aiResponse = ''
    let shouldQualify = false
    let shouldDisqualify = false

    const replyLower = reply.toLowerCase()
    
    if (session.mensagensRecebidas === 1) {
      aiResponse = 'Entendido! E me conta, hoje vocês faturam em média quanto por mês na operação comercial?'
      session.mensagensEnviadas += 1
    } else if (session.mensagensRecebidas === 2) {
      if (replyLower.includes('mil') || replyLower.includes('000') || replyLower.includes('k')) {
        const numbers = replyLower.replace(/[^0-9]/g, '')
        const numVal = parseInt(numbers)
        if (numVal && numVal < 10 && !replyLower.includes('50') && !replyLower.includes('30') && !replyLower.includes('20') && !replyLower.includes('15') && !replyLower.includes('100')) {
          aiResponse = 'Entendi... Como o faturamento atual está abaixo da nossa linha de corte de R$ 10k, a consultoria pode ficar pesada no caixa agora. Recomendo usar nossa ferramenta de disparos frios primeiro para acelerar. Faz sentido?'
          shouldDisqualify = true
        } else {
          aiResponse = 'Excelente, vocês estão no perfil ideal de faturamento! E quem é o decisor final para a contratação de ferramentas e processos comerciais hoje?'
          session.mensagensEnviadas += 1
        }
      } else {
        aiResponse = 'Perfeito. E quem é o decisor comercial que valida as propostas hoje na empresa?'
        session.mensagensEnviadas += 1
      }
    } else {
      aiResponse = 'Ótimo! Identifiquei que vocês estão super aptos a rodar nossa operação de Caixa Rápido comercial. Vou agendar uma reunião com nosso diretor especialista. Qual o melhor horário amanhã?'
      shouldQualify = true
    }

    // Add assistant reply log
    state.aiLogs.push({
      id: 'log-' + Math.random().toString(36).substr(2, 9),
      sessionId,
      dealId: session.dealId,
      role: 'assistant',
      content: aiResponse,
      createdAt: new Date().toISOString()
    })

    if (shouldQualify) {
      session.qualificationResult = 'qualificado'
      session.completedAt = new Date().toISOString()
      session.scoreFinal = 95
      deal.aiScore = 95
      deal.qualificationStatus = 'qualificado'
      deal.qualificationData = JSON.stringify({ bant_orcamento: true, bant_autoridade: true, bant_necessidade: true })
      
      // Auto move deal to stage 2 (Qualificação)
      const qualStage = state.stages.find(s => s.ordem === 2)
      if (qualStage) {
        deal.stageId = qualStage.id
      }
    } else if (shouldDisqualify) {
      session.qualificationResult = 'desqualificado'
      session.completedAt = new Date().toISOString()
      session.scoreFinal = 30
      deal.aiScore = 30
      deal.qualificationStatus = 'desqualificado'
      deal.disqualificationReason = 'Faturamento abaixo do perfil ideal.'
    }

    session.lastInteractionAt = new Date().toISOString()
    saveState(state)

    return aiResponse
  },

  async webhookElementor(payload: {
    nome: string
    sobrenome?: string
    telefone: string
    email?: string
    utm_source?: string
    utm_medium?: string
    utm_campaign?: string
    utm_content?: string
    utm_term?: string
    utm_landing_page?: string
    campos_customizados?: Record<string, unknown>
    user_id?: string
  }): Promise<{ contact: mockData.MockContact; deal: mockData.MockDeal }> {
    const state = getState()
    const userId = payload.user_id || 'usr-admin-123'

    let tel = (payload.telefone || '').replace(/\D/g, '')
    if (tel.length > 0 && !tel.startsWith('55')) {
      tel = '55' + tel
    }
    
    const nowIso = new Date().toISOString()
    let contact = state.contacts.find(c => c.telefone === tel && c.user_id === userId)
    
    const utmSource = payload.utm_source || 'Elementor'
    const utmMedium = payload.utm_medium || ''
    const utmCampaign = payload.utm_campaign || ''
    const utmContent = payload.utm_content || ''
    const utmTerm = payload.utm_term || ''
    const landingPage = payload.utm_landing_page || '/'
    
    if (contact) {
      contact.lastUtmSource = utmSource
      contact.lastUtmMedium = utmMedium
      contact.lastUtmCampaign = utmCampaign
      contact.lastUtmContent = utmContent
      contact.lastUtmTerm = utmTerm
      contact.lastLandingPage = landingPage
      contact.lastUtmAt = nowIso
      
      contact.camposCustomizados = {
        ...(contact.camposCustomizados || {}),
        ...(payload.campos_customizados || {})
      }
    } else {
      contact = {
        id: 'contact-' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        nome: payload.nome || 'Contato Webhook',
        sobrenome: payload.sobrenome || '',
        email: payload.email || '',
        telefone: tel,
        consentimentoLgpd: true,
        firstUtmSource: utmSource,
        firstUtmMedium: utmMedium,
        firstUtmCampaign: utmCampaign,
        firstUtmContent: utmContent,
        firstUtmTerm: utmTerm,
        firstLandingPage: landingPage,
        firstUtmAt: nowIso,
        lastUtmSource: utmSource,
        lastUtmMedium: utmMedium,
        lastUtmCampaign: utmCampaign,
        lastUtmContent: utmContent,
        lastUtmTerm: utmTerm,
        lastLandingPage: landingPage,
        lastUtmAt: nowIso,
        camposCustomizados: payload.campos_customizados || {},
        fbMetadata: {},
        createdAt: nowIso
      }
      state.contacts.push(contact)
    }
    
    const pipe = state.pipelines.find(p => p.isDefault) || state.pipelines[0]
    const defaultStage = state.stages.filter(s => s.pipelineId === pipe.id).sort((a, b) => a.ordem - b.ordem)[0]
    
    const deal = await this.createDeal({
      pipelineId: pipe.id,
      stageId: defaultStage?.id || '',
      contactId: contact.id,
      userId: userId,
      titulo: `Webhook - ${contact.nome} ${contact.sobrenome || ''}`.trim(),
      valorEstimado: 0,
      prioridade: DealPriority.BAIXA,
      status: DealStatus.OPEN,
      utmSource: utmSource,
      utmMedium: utmMedium,
      utmCampaign: utmCampaign,
      utmContent: utmContent,
      utmTerm: utmTerm,
      utmLandingPage: landingPage,
      aiScore: 70
    })
    
    saveState(state)
    return { contact, deal }
  },

  async webhookIngest(payload: {
    nome: string
    sobrenome?: string
    telefone: string
    email?: string
    fb_lead_id?: string
    fb_form_name?: string
    fb_campaign_id?: string
    fb_adset_id?: string
    fb_ad_id?: string
    ramo?: string
    faturamento?: number
    campos_customizados?: Record<string, unknown>
    user_id?: string
  }): Promise<{ contact: mockData.MockContact; deal: mockData.MockDeal }> {
    const state = getState()
    const userId = payload.user_id || 'usr-admin-123'
    
    let tel = (payload.telefone || '').replace(/\D/g, '')
    if (tel.length > 0 && !tel.startsWith('55')) {
      tel = '55' + tel
    }
    
    const nowIso = new Date().toISOString()
    let contact = state.contacts.find(c => c.telefone === tel && c.user_id === userId)
    
    const newFbMeta = {
      fb_lead_id: payload.fb_lead_id || '',
      fb_form_name: payload.fb_form_name || '',
      fb_campaign_id: payload.fb_campaign_id || '',
      fb_adset_id: payload.fb_adset_id || '',
      fb_ad_id: payload.fb_ad_id || '',
      received_at: nowIso
    }
    
    if (contact) {
      contact.lastUtmSource = 'Meta Ads'
      contact.lastUtmMedium = 'paid-social'
      contact.lastUtmCampaign = payload.fb_campaign_id || ''
      contact.lastUtmAt = nowIso
      
      const meta = contact.fbMetadata || {}
      if (Array.isArray(meta)) {
        meta.push(newFbMeta)
      } else if (Object.keys(meta).length > 0) {
        contact.fbMetadata = [meta, newFbMeta]
      } else {
        contact.fbMetadata = newFbMeta
      }
      
      contact.camposCustomizados = {
        ...(contact.camposCustomizados || {}),
        ...(payload.campos_customizados || {})
      }
    } else {
      contact = {
        id: 'contact-' + Math.random().toString(36).substr(2, 9),
        user_id: userId,
        nome: payload.nome || 'Meta Lead',
        sobrenome: payload.sobrenome || '',
        email: payload.email || '',
        telefone: tel,
        consentimentoLgpd: true,
        firstUtmSource: 'Meta Ads',
        firstUtmMedium: 'paid-social',
        firstUtmCampaign: payload.fb_campaign_id || '',
        firstUtmAt: nowIso,
        lastUtmSource: 'Meta Ads',
        lastUtmMedium: 'paid-social',
        lastUtmCampaign: payload.fb_campaign_id || '',
        lastUtmAt: nowIso,
        fbMetadata: newFbMeta,
        camposCustomizados: payload.campos_customizados || {},
        createdAt: nowIso
      }
      state.contacts.push(contact)
    }
    
    const pipe = state.pipelines.find(p => p.isDefault) || state.pipelines[0]
    const defaultStage = state.stages.filter(s => s.pipelineId === pipe.id).sort((a, b) => a.ordem - b.ordem)[0]
    
    const deal = await this.createDeal({
      pipelineId: pipe.id,
      stageId: defaultStage?.id || '',
      contactId: contact.id,
      userId: userId,
      titulo: `Meta Lead - ${contact.nome} ${contact.sobrenome || ''}`.trim(),
      valorEstimado: payload.faturamento || 0,
      prioridade: DealPriority.BAIXA,
      status: DealStatus.OPEN,
      ramoEmpresa: payload.ramo || '',
      faturamentoMensal: payload.faturamento || 0,
      utmSource: 'Meta Ads',
      utmMedium: 'paid-social',
      utmCampaign: payload.fb_campaign_id || '',
      aiScore: 70
    })
    
    saveState(state)
    return { contact, deal }
  },

  // --- SETTINGS & CONFIGS SERVICES ---
  async getCurrentUser(): Promise<mockData.MockUser> {
    const res = await fetch('/api/auth/me', { credentials: 'include' })
    if (!res.ok) throw new Error('Não autenticado')
    const data = await res.json() as { authenticated: boolean; user: { id: string; email: string; nome: string; sobrenome: string; telefone?: string; avatarUrl?: string; role: string } }
    if (!data.authenticated) throw new Error('Não autenticado')
    const u = data.user
    return {
      id: u.id,
      email: u.email,
      nome: u.nome,
      sobrenome: u.sobrenome,
      telefone: u.telefone ?? '',
      avatarUrl: u.avatarUrl ?? '',
      role: (u.role as mockData.MockUser['role']) || 'USER',
    }
  },

  async updateProfile(_userId: string, data: Partial<mockData.MockUser>): Promise<mockData.MockUser> {
    const res = await fetch('/api/profile', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome: data.nome,
        sobrenome: data.sobrenome,
        telefone: data.telefone,
        avatarUrl: data.avatarUrl,
      }),
    })
    if (!res.ok) throw new Error('Erro ao atualizar perfil')
    const updated = await res.json() as { id: string; nome: string; sobrenome: string; telefone: string; avatarUrl: string }
    const current = await this.getCurrentUser()

    if (isBrowser) {
      window.dispatchEvent(new Event('crm-profile-updated'))
    }

    return { ...current, ...updated }
  },



  async getIntegrations(): Promise<mockData.MockIntegration[]> {
    const state = getState()
    return state.integrations || []
  },

  async createIntegration(data: Omit<mockData.MockIntegration, 'id' | 'createdAt' | 'endpoints'>): Promise<mockData.MockIntegration> {
    const state = getState()
    const newInt: mockData.MockIntegration = {
      ...data,
      id: 'int-' + Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      endpoints: []
    }
    state.integrations.push(newInt)
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-integrations-updated'))
    }
    return newInt
  },

  async updateIntegration(id: string, data: Partial<mockData.MockIntegration>): Promise<mockData.MockIntegration> {
    const state = getState()
    const idx = state.integrations.findIndex(i => i.id === id)
    if (idx === -1) throw new Error('Integração não encontrada')
    state.integrations[idx] = {
      ...state.integrations[idx],
      ...data
    }
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-integrations-updated'))
    }
    return state.integrations[idx]
  },

  async deleteIntegration(id: string): Promise<void> {
    const state = getState()
    state.integrations = state.integrations.filter(i => i.id !== id)
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-integrations-updated'))
    }
  },

  async createWebhookEndpoint(integrationId: string, path: string, secretToken?: string, sourceSystem?: 'facebook_leads' | 'elementor' | 'n8n' | 'custom'): Promise<mockData.MockWebhookEndpoint> {
    const state = getState()
    const idx = state.integrations.findIndex(i => i.id === integrationId)
    if (idx === -1) throw new Error('Integração não encontrada')

    const newEndpoint: mockData.MockWebhookEndpoint = {
      id: 'ep-' + Math.random().toString(36).substr(2, 9),
      integrationId,
      path: path.toLowerCase().replace(/[^a-z0-9-]/g, ''),
      secretToken,
      sourceSystem,
      ativo: true,
      createdAt: new Date().toISOString()
    }

    if (!state.integrations[idx].endpoints) {
      state.integrations[idx].endpoints = []
    }
    state.integrations[idx].endpoints.push(newEndpoint)
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-integrations-updated'))
    }
    return newEndpoint
  },

  async deleteWebhookEndpoint(endpointId: string): Promise<void> {
    const state = getState()
    state.integrations = state.integrations.map(i => ({
      ...i,
      endpoints: (i.endpoints || []).filter(e => e.id !== endpointId)
    }))
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-integrations-updated'))
    }
  },

  async getWebhookLogs(endpointId: string): Promise<mockData.MockWebhookLog[]> {
    const state = getState()
    return (state.webhookLogs || []).filter(l => l.endpointId === endpointId)
  },

  async getAIAgentConfig(userId: string = 'usr-admin-123'): Promise<mockData.MockAIAgentConfig | null> {
    const state = getState()
    return state.aiAgentConfigs.find(c => c.userId === userId) || null
  },

  async updateAIAgentConfig(userId: string, data: Partial<mockData.MockAIAgentConfig>): Promise<mockData.MockAIAgentConfig> {
    const state = getState()
    let idx = state.aiAgentConfigs.findIndex(c => c.userId === userId)
    if (idx === -1) {
      const newConfig: mockData.MockAIAgentConfig = {
        id: 'ai-config-' + Math.random().toString(36).substr(2, 9),
        userId,
        nome: 'SDR Virtual - NetLife AI',
        nomeExibicao: 'Sofia | NetLife CRM',
        ativo: true,
        tomComunicacao: 'profissional_descontraido',
        emojisPermitidos: true,
        promptSistema: '',
        promptQualificacao: '',
        promptObjecoes: '',
        scriptAbertura: '',
        scriptQualificacao: '',
        scriptFechamentoPositivo: '',
        scriptFechamentoNegativo: '',
        scoreMinimoQualificado: 70,
        camposObrigatorios: [],
        maxTentativasContato: 3,
        tempoEsperaRespostaHoras: 24,
        modeloIa: 'gpt-4o-mini',
        temperatura: 0.5,
        maxTokens: 500,
        acoesQualificado: { criarAtividade: false, notificar: false },
        acoesDesqualificado: { arquivarDias: 7 },
        webhookSecret: '',
        n8nWebhookUrl: ''
      }
      state.aiAgentConfigs.push(newConfig)
      idx = state.aiAgentConfigs.length - 1
    }

    // Special Rule: Toggle ativo (when turning off) clears active sessions and histories
    if (data.ativo === false && state.aiAgentConfigs[idx].ativo === true) {
      state.aiSessions = []
      state.aiLogs = []
    }

    state.aiAgentConfigs[idx] = {
      ...state.aiAgentConfigs[idx],
      ...data
    }
    saveState(state)
    if (isBrowser) {
      window.dispatchEvent(new Event('crm-ai-agent-updated'))
    }
    return state.aiAgentConfigs[idx]
  },

  // --- USER ADMINISTRATION ---
  async getUsers(): Promise<mockData.MockUser[]> {
    const res = await fetch('/api/admin/users', { cache: 'no-store' })
    if (!res.ok) throw new Error('Erro ao carregar usuários.')
    return res.json()
  },

  async createUser(data: { email: string; nome: string; role: 'ADMIN' | 'MODERATOR' | 'USER'; password?: string }): Promise<mockData.MockUser> {
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro ao criar usuário.')
    return json
  },

  async updateUserRole(userId: string, role: 'ADMIN' | 'MODERATOR' | 'USER'): Promise<mockData.MockUser> {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao atualizar papel.') }
    return { id: userId, email: '', nome: '', sobrenome: '', role, permissions: [], visiblePipelines: [] }
  },

  async updateUserPassword(userId: string, newPassword?: string): Promise<void> {
    if (!newPassword) return
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPassword }),
    })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao atualizar senha.') }
  },

  async updateUserPermissions(userId: string, permissions: string[]): Promise<mockData.MockUser> {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permissions }),
    })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao atualizar permissões.') }
    return { id: userId, email: '', nome: '', sobrenome: '', role: 'USER', permissions, visiblePipelines: [] }
  },

  async deleteUser(userId: string): Promise<void> {
    const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao excluir usuário.') }
  },

  // --- TEAM ADMINISTRATION ---
  async getTeams(): Promise<mockData.MockTeam[]> {
    const res = await fetch('/api/admin/teams', { cache: 'no-store' })
    if (!res.ok) throw new Error('Erro ao carregar times.')
    return res.json()
  },

  async createTeam(nome: string, ownerUserId: string): Promise<mockData.MockTeam> {
    const res = await fetch('/api/admin/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, ownerUserId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Erro ao criar time.')
    return json
  },

  async deleteTeam(teamId: string): Promise<void> {
    const res = await fetch(`/api/admin/teams/${teamId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao excluir time.') }
  },

  async addTeamMember(teamId: string, userId: string): Promise<mockData.MockTeam> {
    const res = await fetch(`/api/admin/teams/${teamId}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao adicionar membro.') }
    const teams = await this.getTeams()
    return teams.find(t => t.id === teamId) ?? { id: teamId, nome: '', ownerUserId: '', members: [] }
  },

  async removeTeamMember(teamId: string, userId: string): Promise<mockData.MockTeam> {
    const res = await fetch(`/api/admin/teams/${teamId}/members/${userId}`, { method: 'DELETE' })
    if (!res.ok) { const j = await res.json(); throw new Error(j.error || 'Erro ao remover membro.') }
    const teams = await this.getTeams()
    return teams.find(t => t.id === teamId) ?? { id: teamId, nome: '', ownerUserId: '', members: [] }
  },

  async getTeamUserIds(userId: string = 'usr-admin-123'): Promise<string[]> {
    const state = getState()
    const userIds = new Set<string>()
    userIds.add(userId) // Próprio usuário sempre

    const teams = state.teams || []
    teams.forEach(t => {
      if (t.members.includes(userId) || t.ownerUserId === userId) {
        t.members.forEach(m => userIds.add(m))
      }
    })

    return Array.from(userIds)
  }
}
