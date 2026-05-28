'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/AppLayout'
import {
  useContacts,
  useContactStats,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  useDeleteContacts,
  useMergeContacts
} from '@/hooks/useContacts'
import { crmService } from '@/lib/services'
import type { ContactInput } from '@/app/actions/crm'
import * as crmActions from '@/app/actions/crm'
import {
  Plus, Search, X, Phone, Mail, MapPin, Tag, Edit2, Trash2,
  UserCheck, Merge, Zap, ArrowLeft, Calendar, FileText,
  ChevronRight, CheckSquare, Square, AlertCircle, ShoppingBag,
  Info, Globe, Database, Settings, Check
} from 'lucide-react'
import { toast, Toaster } from 'sonner'
import { z } from 'zod'
import { useCategories } from '@/lib/categories'
import { MobileActionSelect } from '@/components/ui/MobileActionSelect'

// Form schema using Zod for validation
const contactSchema = z.object({
  nome: z.string().min(2, 'O nome deve ter pelo menos 2 caracteres'),
  sobrenome: z.string().optional(),
  email: z.string().email('E-mail inválido').or(z.literal('')).optional(),
  telefone: z.string().min(10, 'O telefone deve ter DDD + número (mínimo 10 dígitos)'),
  cidade: z.string().optional(),
  estado: z.string().optional(),
  documento: z.string().optional(),
  dataNascimento: z.string().optional(),
  origem: z.string().optional(),
  consentimentoLgpd: z.boolean(),
  enderecoCompleto: z.object({
    rua: z.string().optional(),
    numero: z.string().optional(),
    complemento: z.string().optional(),
    bairro: z.string().optional(),
    cidade: z.string().optional(),
    estado: z.string().optional(),
    cep: z.string().optional()
  }).optional()
})

export default function ContactsPage() {
  const categoriesStore = useCategories()
  const { contacts, loading, mutate } = useContacts()
  const [deals, setDeals] = useState<{ id: string; contactId?: string; status: string; titulo: string; valorEstimado: number; prioridade?: string; produtoInteresse?: string; createdAt: string; updatedAt: string; fechadoEm?: string }[]>([])
  const [activities, setActivities] = useState<{ id: string; contactId?: string; status: string; titulo: string; descricao?: string; dueAt: string; doneAt?: string }[]>([])
  
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [selectedOrigens, setSelectedOrigens] = useState<string[]>([])
  
  // Selection mode states
  const [isSelectionMode, setIsSelectionMode] = useState(false)
  const [checkedIds, setCheckedIds] = useState<Record<string, boolean>>({})
  const [selectedListaTarget, setSelectedListaTarget] = useState('')
  const [selectedCadenciaTarget, setSelectedCadenciaTarget] = useState('')
  const [listasDisparo, setListasDisparo] = useState<any[]>([])
  const [cadencias, setCadencias] = useState<any[]>([])
  
  // Modals state
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingContact, setEditingContact] = useState<(ContactInput & { id: string }) | null>(null)
  const [formTab, setFormTab] = useState<'dados' | 'endereco' | 'marketing'>('dados')
  
  // Detail tabs state
  const [detailTab, setDetailTab] = useState<'dados' | 'vendas' | 'deals' | 'atividades'>('dados')

  // Merge modal state
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeTargetId, setMergeTargetId] = useState<string>('')
  const [mergeQuery, setMergeQuery] = useState('')

  // Form states
  const [formData, setFormData] = useState({
    nome: '',
    sobrenome: '',
    email: '',
    telefone: '',
    cidade: '',
    estado: '',
    documento: '',
    dataNascimento: '',
    origem: '',
    consentimentoLgpd: true,
    enderecoCompleto: {
      rua: '',
      numero: '',
      complemento: '',
      bairro: '',
      cidade: '',
      estado: '',
      cep: ''
    },
    tags: [] as string[],
    camposCustomizados: {} as Record<string, string>
  })
  
  const [newTagInput, setNewTagInput] = useState('')
  const [customFieldKey, setCustomFieldKey] = useState('')
  const [customFieldValue, setCustomFieldValue] = useState('')

  // Mutator hooks
  const createContact = useCreateContact()
  const updateContact = useUpdateContact()
  const deleteContact = useDeleteContact()
  const deleteContacts = useDeleteContacts()
  const mergeContacts = useMergeContacts()

  // Load complementary data (deals, activities) for joins
  useEffect(() => {
    const loadComplementary = () => {
      Promise.all([
        crmActions.getAllDeals(),
        crmActions.getActivities()
      ]).then(([allDeals, allActivities]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setDeals((allDeals as any[]).map((d: any) => ({
          id: d.id,
          contactId: d.contactId ?? undefined,
          status: d.status,
          titulo: d.titulo,
          valorEstimado: d.valorEstimado,
          prioridade: d.prioridade,
          produtoInteresse: d.produtoInteresse ?? undefined,
          createdAt: typeof d.createdAt === 'string' ? d.createdAt : d.createdAt?.toISOString?.() ?? '',
          updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : d.updatedAt?.toISOString?.() ?? '',
          fechadoEm: d.fechadoEm ? (typeof d.fechadoEm === 'string' ? d.fechadoEm : d.fechadoEm.toISOString()) : undefined,
        })))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setActivities((allActivities as any[]).map((a: any) => ({
          id: a.id,
          contactId: a.contactId ?? undefined,
          status: a.status,
          titulo: a.titulo,
          descricao: a.descricao ?? undefined,
          dueAt: typeof a.dueAt === 'string' ? a.dueAt : a.dueAt?.toISOString?.() ?? '',
          doneAt: a.doneAt ? (typeof a.doneAt === 'string' ? a.doneAt : a.doneAt.toISOString()) : undefined,
        })))
      }).catch((err: unknown) => {
        toast.error('Erro ao carregar dados complementares: ' + (err instanceof Error ? err.message : String(err)))
      })
    }
    loadComplementary()
    window.addEventListener('crm-deals-updated', loadComplementary)
    window.addEventListener('crm-activities-updated', loadComplementary)
    return () => {
      window.removeEventListener('crm-deals-updated', loadComplementary)
      window.removeEventListener('crm-activities-updated', loadComplementary)
    }
  }, [])

  // Load dispatch lists and cadences for bulk selection
  useEffect(() => {
    const loadListsAndCadences = () => {
      Promise.all([
        crmActions.getListasDisparo(),
        crmActions.getCadencias()
      ]).then(([lists, cads]) => {
        setListasDisparo(lists)
        setCadencias(cads)
      }).catch((err: unknown) => {
        console.error('Erro ao carregar listas/cadencias:', err)
      })
    }
    loadListsAndCadences()
    window.addEventListener('crm-lists-updated', loadListsAndCadences)
    window.addEventListener('crm-cadences-updated', loadListsAndCadences)
    return () => {
      window.removeEventListener('crm-lists-updated', loadListsAndCadences)
      window.removeEventListener('crm-cadences-updated', loadListsAndCadences)
    }
  }, [])

  // Currently selected contact
  const selectedContact = useMemo(() => {
    if (!selectedId) return null
    return contacts.find(c => c.id === selectedId) || null
  }, [selectedId, contacts])

  // Selected contact's stats
  const { stats: contactStats } = useContactStats(selectedId)

  const [categoryFilter, setCategoryFilter] = useState<'all' | 'leads' | 'recuperar' | 'perdidos'>('all')

  // KPIs calculations
  const totalContatos = contacts.length
  
  // Contacts with at least one active deal
  const leadsIds = useMemo(() => {
    return new Set(deals.filter(d => d.status === 'OPEN').map(d => d.contactId))
  }, [deals])

  // Contacts with at least one WON deal
  const wonIds = useMemo(() => {
    return new Set(deals.filter(d => d.status === 'WON').map(d => d.contactId))
  }, [deals])

  // Contacts with at least one LOST deal
  const lostIds = useMemo(() => {
    return new Set(deals.filter(d => d.status === 'LOST').map(d => d.contactId))
  }, [deals])

  // Contacts with any deals
  const anyDealIds = useMemo(() => {
    return new Set(deals.map(d => d.contactId))
  }, [deals])

  const totalLeads = useMemo(() => {
    return contacts.filter(c => leadsIds.has(c.id)).length
  }, [contacts, leadsIds])

  const totalParaRecuperar = useMemo(() => {
    return contacts.filter(c => !leadsIds.has(c.id) && !wonIds.has(c.id)).length
  }, [contacts, leadsIds, wonIds])

  const totalPerdidos = useMemo(() => {
    return contacts.filter(c => lostIds.has(c.id) && !leadsIds.has(c.id) && !wonIds.has(c.id)).length
  }, [contacts, lostIds, leadsIds, wonIds])

  // Filtered contacts list
  const filteredContacts = useMemo(() => {
    return contacts.filter(c => {
      // Category filter
      if (categoryFilter === 'leads' && !leadsIds.has(c.id)) return false
      if (categoryFilter === 'recuperar' && (leadsIds.has(c.id) || wonIds.has(c.id))) return false
      if (categoryFilter === 'perdidos' && (!lostIds.has(c.id) || leadsIds.has(c.id) || wonIds.has(c.id))) return false

      const nameMatch = `${c.nome} ${c.sobrenome || ''}`.toLowerCase().includes(searchQuery.toLowerCase())
      const telMatch = (c.telefone || '').includes(searchQuery)
      const emailMatch = (c.email || '').toLowerCase().includes(searchQuery.toLowerCase())
      
      const queryMatch = nameMatch || telMatch || emailMatch
      
      const tagsMatch = selectedTags.length === 0 || 
        selectedTags.some(t => c.tags?.includes(t))
      
      const origensMatch = selectedOrigens.length === 0 || 
        selectedOrigens.includes(c.derivedOrigem)

      return queryMatch && tagsMatch && origensMatch
    })
  }, [contacts, searchQuery, selectedTags, selectedOrigens, categoryFilter, leadsIds, wonIds, lostIds])

  // Checkbox state for current page visible items
  const isAllChecked = useMemo(() => {
    if (filteredContacts.length === 0) return false
    return filteredContacts.every(c => checkedIds[c.id])
  }, [filteredContacts, checkedIds])

  const toggleAllChecked = () => {
    if (isAllChecked) {
      setCheckedIds({})
    } else {
      const nextChecked: Record<string, boolean> = {}
      filteredContacts.forEach(c => {
        nextChecked[c.id] = true
      })
      setCheckedIds(nextChecked)
    }
  }

  const toggleChecked = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setCheckedIds(prev => ({
      ...prev,
      [id]: !prev[id]
    }))
  }

  const checkedCount = useMemo(() => {
    return filteredContacts.filter(c => checkedIds[c.id]).length
  }, [filteredContacts, checkedIds])

  // Bulk Delete
  const handleBulkDelete = async () => {
    const ids = Object.keys(checkedIds).filter(id => checkedIds[id])
    if (ids.length === 0) return
    
    if (!window.confirm(`Tem certeza que deseja excluir permanentemente ${ids.length} contatos?`)) {
      return
    }

    try {
      const toastId = toast.loading(`Excluindo ${ids.length} contatos...`)
      await deleteContacts.execute(ids)
      toast.dismiss(toastId)
      toast.success(`${ids.length} contatos excluídos em lote!`)
      setCheckedIds({})
      setIsSelectionMode(false)
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null)
      }
    } catch (err: unknown) {
      toast.error('Erro na exclusão em lote: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  const handleBulkAddToLista = async () => {
    if (!selectedListaTarget) return
    const ids = Object.keys(checkedIds).filter(id => checkedIds[id])
    if (ids.length === 0) return
    try {
      const toastId = toast.loading('Adicionando contatos à lista...')
      const count = await crmActions.addLeadsToListaDisparo(selectedListaTarget, ids, 'contact')
      toast.dismiss(toastId)
      toast.success(`${count} contatos adicionados à lista de disparo com sucesso!`)
      setCheckedIds({})
      setIsSelectionMode(false)
      setSelectedListaTarget('')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar contatos à lista de disparo')
    }
  }

  const handleBulkAddToCadence = async () => {
    if (!selectedCadenciaTarget) return
    const ids = Object.keys(checkedIds).filter(id => checkedIds[id])
    if (ids.length === 0) return
    try {
      const toastId = toast.loading('Adicionando contatos à cadência...')
      const count = await crmActions.addLeadsToCadence(selectedCadenciaTarget, ids, 'contact')
      toast.dismiss(toastId)
      toast.success(`${count} contatos adicionados à cadência com sucesso!`)
      setCheckedIds({})
      setIsSelectionMode(false)
      setSelectedCadenciaTarget('')
    } catch (e: any) {
      toast.error(e.message || 'Erro ao adicionar contatos à cadência')
    }
  }

  // Open creation modal
  const openCreateModal = () => {
    setEditingContact(null)
    setFormData({
      nome: '',
      sobrenome: '',
      email: '',
      telefone: '',
      cidade: '',
      estado: '',
      documento: '',
      dataNascimento: '',
      origem: '',
      consentimentoLgpd: true,
      enderecoCompleto: {
        rua: '',
        numero: '',
        complemento: '',
        bairro: '',
        cidade: '',
        estado: '',
        cep: ''
      },
      tags: [],
      camposCustomizados: {}
    })
    setFormTab('dados')
    setShowFormModal(true)
  }

  // Open edit modal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const openEditModal = (contact: any) => {
    setEditingContact({ id: contact.id, nome: contact.nome, ...contact })
    setFormData({
      nome: contact.nome || '',
      sobrenome: contact.sobrenome || '',
      email: contact.email || '',
      telefone: contact.telefone || '',
      cidade: contact.cidade || '',
      estado: contact.estado || '',
      documento: contact.documento || '',
      dataNascimento: contact.dataNascimento || '',
      origem: contact.origem || '',
      consentimentoLgpd: contact.consentimentoLgpd ?? true,
      enderecoCompleto: {
        rua: contact.enderecoCompleto?.rua || '',
        numero: contact.enderecoCompleto?.numero || '',
        complemento: contact.enderecoCompleto?.complemento || '',
        bairro: contact.enderecoCompleto?.bairro || '',
        cidade: contact.enderecoCompleto?.cidade || '',
        estado: contact.enderecoCompleto?.estado || '',
        cep: contact.enderecoCompleto?.cep || ''
      },
      tags: contact.tags || [],
      camposCustomizados: (contact.camposCustomizados || {}) as Record<string, string>
    })
    setFormTab('dados')
    setShowFormModal(true)
  }

  // Submit contact form
  const handleSubmit = async () => {
    // Validate with Zod
    const validation = contactSchema.safeParse(formData)
    if (!validation.success) {
      const errors = validation.error.issues.map(err => `${err.path.join('.')}: ${err.message}`).join('\n')
      toast.error('Erro de validação:\n' + errors)
      return
    }

    try {
      const payload: ContactInput = {
        nome: formData.nome,
        sobrenome: formData.sobrenome || undefined,
        email: formData.email || undefined,
        telefone: formData.telefone,
        cidade: formData.cidade || undefined,
        estado: formData.estado || undefined,
        documento: formData.documento || undefined,
        dataNascimento: formData.dataNascimento || undefined,
        origem: formData.origem || undefined,
        consentimentoLgpd: formData.consentimentoLgpd,
        tags: formData.tags,
        enderecoCompleto: formData.enderecoCompleto,
        camposCustomizados: formData.camposCustomizados,
      }

      if (editingContact) {
        await updateContact.execute(editingContact.id, payload)
        toast.success('Contato atualizado com sucesso!')
      } else {
        const created = await createContact.execute(payload)
        setSelectedId(created.id)
        toast.success('Contato criado com sucesso!')
      }
      setShowFormModal(false)
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao salvar contato: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Delete single contact
  const handleSingleDelete = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir permanentemente este contato e todos os seus negócios associados?')) return
    try {
      await deleteContact.execute(id)
      setSelectedId(null)
      toast.success('Contato excluído com sucesso!')
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao excluir contato: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Merge contact submission
  const handleMerge = async () => {
    if (!selectedId || !mergeTargetId) return
    if (!window.confirm('Atenção: Esta ação é irreversível. O contato secundário será excluído e seus negócios/atividades serão vinculados ao contato principal. Confirmar mesclagem?')) return
    try {
      const merged = await mergeContacts.execute(selectedId, mergeTargetId)
      setSelectedId(merged.id)
      setShowMergeModal(false)
      setMergeTargetId('')
      toast.success('Contatos mesclados com sucesso!')
      mutate()
    } catch (err: unknown) {
      toast.error('Erro ao mesclar contatos: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // WhatsApp click handler
  const handleWhatsApp = (phone: string) => {
    const cleanPhone = phone.replace(/\D/g, '')
    window.open(`https://wa.me/${cleanPhone}`, '_blank')
  }

  // Trigger test webhook
  const handleTestWebhook = async (phone: string, name: string) => {
    try {
      const toastId = toast.loading('Ingerindo lead de teste no webhook...')
      await crmService.webhookElementor({
        nome: name,
        telefone: phone,
        email: `${name.toLowerCase()}@teste-webhook.com`,
        utm_source: 'Meta Ads',
        utm_medium: 'cpc',
        utm_campaign: 'HMI_caixa_rapido_campanha',
        campos_customizados: {
          fb_lead_id: 'fb-lead-webhook-' + Math.random().toString(36).substr(2, 9),
          form_name: 'Formulário Elementor Teste Webhook'
        }
      })
      toast.dismiss(toastId)
      toast.success('Lead simulado ingerido! Recarregando contatos...')
      mutate()
    } catch (err: unknown) {
      toast.error('Erro na simulação do webhook: ' + (err instanceof Error ? err.message : String(err)))
    }
  }

  // Tag list editing helpers
  const addTag = () => {
    if (!newTagInput.trim()) return
    if (formData.tags.includes(newTagInput.trim())) return
    setFormData(prev => ({
      ...prev,
      tags: [...prev.tags, newTagInput.trim()]
    }))
    setNewTagInput('')
  }

  const removeTag = (t: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== t)
    }))
  }

  // Custom fields helpers
  const addCustomField = () => {
    if (!customFieldKey.trim() || !customFieldValue.trim()) return
    const key = customFieldKey.trim().toLowerCase().replace(/\s+/g, '_')
    setFormData(prev => ({
      ...prev,
      camposCustomizados: {
        ...prev.camposCustomizados,
        [key]: customFieldValue.trim()
      }
    }))
    setCustomFieldKey('')
    setCustomFieldValue('')
  }

  const removeCustomField = (key: string) => {
    setFormData(prev => {
      const next = { ...prev.camposCustomizados }
      delete next[key]
      return {
        ...prev,
        camposCustomizados: next
      }
    })
  }

  // UI helper colors
  const initials = (c: { nome: string; sobrenome?: string }) => `${c.nome[0]}${c.sobrenome?.[0] || ''}`.toUpperCase()
  const avatarColor = (id: string) => {
    const colors = ['bg-emerald-700', 'bg-blue-700', 'bg-purple-700', 'bg-orange-700', 'bg-rose-700']
    return colors[id.charCodeAt(id.length - 1) % colors.length]
  }

  // Filters for merge contacts dropdown
  const mergeEligibleContacts = useMemo(() => {
    if (!selectedId) return []
    return contacts.filter(c => 
      c.id !== selectedId && 
      `${c.nome} ${c.sobrenome || ''}`.toLowerCase().includes(mergeQuery.toLowerCase())
    )
  }, [contacts, selectedId, mergeQuery])

  // Filter deals & activities specifically for selected contact
  const selectedContactDeals = useMemo(() => {
    if (!selectedId) return []
    return deals.filter(d => d.contactId === selectedId)
  }, [deals, selectedId])

  const selectedContactActivities = useMemo(() => {
    if (!selectedId) return []
    return activities.filter(a => a.contactId === selectedId)
  }, [activities, selectedId])

  return (
    <AppLayout>
      <Toaster theme="dark" position="top-right" closeButton />
      <div className="flex h-full flex-col lg:flex-row bg-black text-foreground">
        
        {/* LEFT COLUMN: LIST AND FILTERS */}
        <div className={`flex flex-col border-r border-border/20 bg-neutral-900/10 shrink-0 select-none ${selectedId ? 'hidden lg:flex lg:w-[400px]' : 'flex-1'}`}>
          
          {/* List Header & KPIs */}
          <div className="p-5 border-b border-border/20 space-y-4">
            {/* KPIs */}
            <div className="grid grid-cols-4 gap-2 mb-2">
              <button
                type="button"
                onClick={() => setCategoryFilter('all')}
                className={`flex flex-col p-2 rounded-xl items-center justify-center transition-all ${
                  categoryFilter === 'all'
                    ? 'bg-neutral-800 border-neutral-600 border-2 shadow-lg shadow-neutral-900/50 scale-[1.03]'
                    : 'bg-neutral-900/40 border border-border/20 hover:bg-neutral-850/50 hover:border-neutral-700'
                }`}
              >
                <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider mb-0.5">Total</span>
                <span className="text-sm font-black text-foreground">{totalContatos}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('leads')}
                className={`flex flex-col p-2 rounded-xl items-center justify-center transition-all ${
                  categoryFilter === 'leads'
                    ? 'bg-primary/20 border-primary border-2 shadow-lg shadow-primary/10 scale-[1.03]'
                    : 'bg-primary/5 border border-primary/10 hover:bg-primary/10 hover:border-primary/30'
                }`}
              >
                <span className="text-[9px] text-primary/80 font-bold uppercase tracking-wider mb-0.5">Leads</span>
                <span className="text-sm font-black text-primary">{totalLeads}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('recuperar')}
                className={`flex flex-col p-2 rounded-xl items-center justify-center transition-all ${
                  categoryFilter === 'recuperar'
                    ? 'bg-amber-500/20 border-amber-500 border-2 shadow-lg shadow-amber-500/10 scale-[1.03]'
                    : 'bg-amber-500/5 border border-amber-500/10 hover:bg-amber-500/10 hover:border-amber-500/30'
                }`}
              >
                <span className="text-[9px] text-amber-500/80 font-bold uppercase tracking-wider mb-0.5">Recuperar</span>
                <span className="text-sm font-black text-amber-500">{totalParaRecuperar}</span>
              </button>
              <button
                type="button"
                onClick={() => setCategoryFilter('perdidos')}
                className={`flex flex-col p-2 rounded-xl items-center justify-center transition-all ${
                  categoryFilter === 'perdidos'
                    ? 'bg-rose-500/20 border-rose-500 border-2 shadow-lg shadow-rose-500/10 scale-[1.03]'
                    : 'bg-rose-500/5 border border-rose-500/10 hover:bg-rose-500/10 hover:border-rose-500/30'
                }`}
              >
                <span className="text-[9px] text-rose-500/80 font-bold uppercase tracking-wider mb-0.5">Perdidos</span>
                <span className="text-sm font-black text-rose-500">{totalPerdidos}</span>
              </button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                  Contatos <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 font-medium">{filteredContacts.length}</span>
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">Base unificada de leads NetLife</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsSelectionMode(!isSelectionMode)}
                  className={`p-2 rounded-xl border text-xs font-semibold flex items-center gap-1 transition-all ${
                    isSelectionMode 
                      ? 'bg-primary/20 border-primary text-primary hover:bg-primary/30' 
                      : 'border-border/60 hover:bg-neutral-800 text-muted-foreground'
                  }`}
                  title="Seleção em Lote"
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button
                  onClick={openCreateModal}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-black font-bold text-xs hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                >
                  <Plus className="w-4 h-4 text-black stroke-[3px]" /> Criar
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl border border-border/30 bg-black/40 shadow-inner focus-within:border-primary/50 transition-colors">
              <Search className="w-4 h-4 text-neutral-400 shrink-0" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome, telefone ou email..."
                className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-neutral-500 text-foreground"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="p-0.5 rounded-full hover:bg-neutral-800">
                  <X className="w-3.5 h-3.5 text-neutral-400" />
                </button>
              )}
            </div>

            {/* Tag/Origin filters */}
            <div className="flex flex-col gap-2 pt-1">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <Tag className="w-3 h-3 text-neutral-500 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 shrink-0 mr-1">Tags:</span>
                {categoriesStore.categories.tags.map(tagObj => {
                  const tag = tagObj.label
                  const isSelected = selectedTags.includes(tag)
                  return (
                    <button
                      key={tag}
                      onClick={() => setSelectedTags(prev => isSelected ? prev.filter(t => t !== tag) : [...prev, tag])}
                      className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 transition-all font-medium ${
                        isSelected 
                          ? 'bg-primary/20 border-primary/45 text-primary' 
                          : 'bg-neutral-900 border-border/20 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {tag}
                    </button>
                  )
                })}
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin">
                <Globe className="w-3 h-3 text-neutral-500 shrink-0" />
                <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-500 shrink-0 mr-1">Origem:</span>
                {categoriesStore.categories.origins.map(orig => {
                  const isSelected = selectedOrigens.includes(orig)
                  return (
                    <button
                      key={orig}
                      onClick={() => setSelectedOrigens(prev => isSelected ? prev.filter(o => o !== orig) : [...prev, orig])}
                      className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 transition-all font-medium ${
                        isSelected 
                          ? 'bg-primary/20 border-primary/45 text-primary' 
                          : 'bg-neutral-900 border-border/20 text-neutral-400 hover:border-neutral-700'
                      }`}
                    >
                      {orig}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Selection Toolbar */}
            {isSelectionMode && (
              <div className="flex items-center justify-between p-3.5 bg-neutral-950 border border-primary/25 rounded-2xl animate-scale-in">
                <div className="flex items-center gap-2">
                  <button onClick={toggleAllChecked} className="p-0.5 rounded text-neutral-400 hover:text-white">
                    {isAllChecked ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                  </button>
                  <span className="text-xs text-neutral-300 font-semibold">{checkedCount} selecionados</span>
                </div>
                {checkedCount > 0 && (
                  <button
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-destructive/30 bg-destructive/10 text-destructive text-[11px] font-bold hover:bg-destructive hover:text-white transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir em Lote
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Contact List Scroll Area */}
          <div className="flex-1 overflow-y-auto divide-y divide-border/10 scrollbar-thin">
            {loading && (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-xs text-muted-foreground">Carregando contatos...</span>
              </div>
            )}
            
            {!loading && filteredContacts.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground p-6">
                <Info className="w-10 h-10 stroke-[1.5] opacity-25 mb-2" />
                <p className="text-sm font-semibold">Nenhum contato encontrado</p>
                <p className="text-xs mt-0.5 opacity-70">Ajuste os filtros de busca ou crie um novo contato.</p>
              </div>
            )}

            {filteredContacts.map(c => {
              const isSelected = selectedId === c.id
              const isChecked = !!checkedIds[c.id]
              
              // Conditional badges
              const isHmi = c.productGroup === 'HMI'
              
              return (
                <div
                  key={c.id}
                  onClick={() => isSelectionMode ? toggleChecked(c.id) : setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-all cursor-pointer border-l-2 ${
                    isSelected 
                      ? 'bg-primary/5 border-l-primary' 
                      : 'hover:bg-neutral-900/30 border-l-transparent'
                  } ${isSelectionMode && isChecked ? 'bg-primary/5' : ''}`}
                >
                  {/* Checkbox if selection mode */}
                  {isSelectionMode && (
                    <button 
                      onClick={(e) => toggleChecked(c.id, e)} 
                      className="shrink-0 p-0.5 rounded text-neutral-400 hover:text-white"
                    >
                      {isChecked ? <CheckSquare className="w-4 h-4 text-primary" /> : <Square className="w-4 h-4" />}
                    </button>
                  )}

                  {/* Avatar */}
                  <div className={`w-10 h-10 rounded-xl ${avatarColor(c.id)} flex items-center justify-center font-bold text-xs text-white shrink-0 shadow-md`}>
                    {initials(c)}
                  </div>

                  {/* Contact Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-sm font-semibold text-neutral-200 truncate">{c.nome} {c.sobrenome || ''}</p>
                      {/* Classification Badge */}
                      <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                        isHmi 
                          ? 'bg-gradient-to-r from-amber-500/20 to-purple-500/20 text-amber-300 border border-amber-500/30' 
                          : 'border border-blue-500/25 text-blue-400 bg-blue-500/5'
                      }`}>
                        {isHmi ? 'HMI · Meta Ads' : 'Sistema'}
                      </span>
                    </div>

                    <p className="text-[11px] text-neutral-400 truncate mt-0.5 flex items-center gap-1">
                      <Phone className="w-2.5 h-2.5 opacity-60" /> {c.telefone}
                    </p>
                    
                    {c.email && (
                      <p className="text-[10px] text-neutral-500 truncate mt-0.5 flex items-center gap-1">
                        <Mail className="w-2.5 h-2.5 opacity-60" /> {c.email}
                      </p>
                    )}

                    {/* Bottom Metadata Badges */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {c.derivedOrigem && (
                        <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-neutral-900 border border-border/20 text-neutral-400">
                          {c.derivedOrigem}
                        </span>
                      )}
                      {c.dealsCount > 0 && (
                        <span className="text-[9px] font-medium px-1.5 py-0.2 rounded bg-neutral-800 text-neutral-300">
                          {c.dealsCount} Negócio{c.dealsCount > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <ChevronRight className="w-4 h-4 text-neutral-600 shrink-0" />
                </div>
              )
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DETAILS PANE */}
        <div className={`flex-1 flex flex-col min-w-0 ${!selectedId ? 'hidden lg:flex' : 'flex'}`}>
          {selectedContact ? (
            <div className="flex-1 flex flex-col h-full bg-gradient-to-b from-[#090d16] to-[#030712] overflow-y-auto scrollbar-thin">
              
              {/* Desktop Header / Mobile Navigation */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-border/20 bg-black/40 backdrop-blur-md sticky top-0 z-20">
                <div className="flex items-center gap-3">
                  <button onClick={() => setSelectedId(null)} className="lg:hidden p-2 rounded-xl border border-border/50 text-neutral-400 hover:bg-neutral-800">
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-2xl ${avatarColor(selectedContact.id)} flex items-center justify-center font-bold text-lg text-white shadow-lg`}>
                      {initials(selectedContact)}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white leading-none">{selectedContact.nome} {selectedContact.sobrenome || ''}</h2>
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                          selectedContact.productGroup === 'HMI'
                            ? 'bg-gradient-to-r from-amber-500/25 to-purple-500/25 text-amber-300 border border-amber-500/30' 
                            : 'border border-blue-500/30 text-blue-400 bg-blue-500/5'
                        }`}>
                          {selectedContact.productGroup === 'HMI' ? 'HMI · Meta Ads' : 'Sistema'}
                        </span>
                        {selectedContact.consentimentoLgpd ? (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            LGPD Consentido
                          </span>
                        ) : (
                          <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            LGPD Indefinido
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowMergeModal(true)}
                    className="p-2.5 rounded-xl border border-border hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    title="Mesclar Contato"
                  >
                    <Merge className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => openEditModal(selectedContact)}
                    className="p-2.5 rounded-xl border border-border hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
                    title="Editar Contato"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleSingleDelete(selectedContact.id)}
                    className="p-2.5 rounded-xl border border-destructive/20 text-destructive bg-destructive/5 hover:bg-destructive hover:text-white transition-all"
                    title="Excluir Contato"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="p-6 space-y-6 max-w-4xl mx-auto w-full">
                
                {/* QUICK ACTIONS BAR */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-neutral-950/40 p-3 rounded-2xl border border-border/10">
                  <button
                    onClick={() => handleWhatsApp(selectedContact.telefone)}
                    className="flex justify-center items-center gap-2 px-4 py-3 rounded-xl border border-border/50 bg-neutral-900/40 hover:border-emerald-500/50 hover:bg-emerald-500/5 text-xs font-semibold text-neutral-200 transition-all hover:scale-[1.02]"
                  >
                    <Phone className="w-4 h-4 text-emerald-400" /> Abrir WhatsApp
                  </button>
                  <a
                    href={`/activities?contact=${selectedContact.id}`}
                    className="flex justify-center items-center gap-2 px-4 py-3 rounded-xl border border-border/50 bg-neutral-900/40 hover:border-indigo-500/50 hover:bg-indigo-500/5 text-xs font-semibold text-neutral-200 transition-all text-center hover:scale-[1.02]"
                  >
                    <Calendar className="w-4 h-4 text-indigo-400" /> Agendar Atividade
                  </a>
                  <a
                    href={`/pipeline?contact=${selectedContact.id}`}
                    className="flex justify-center items-center gap-2 px-4 py-3 rounded-xl border border-border/50 bg-neutral-900/40 hover:border-primary/50 hover:bg-primary/5 text-xs font-semibold text-neutral-200 transition-all text-center hover:scale-[1.02]"
                  >
                    <Zap className="w-4 h-4 text-primary" /> Criar Negócio
                  </a>
                  <button
                    onClick={() => handleTestWebhook(selectedContact.telefone, selectedContact.nome)}
                    className="flex justify-center items-center gap-2 px-4 py-3 rounded-xl border border-border/50 bg-neutral-900/40 hover:border-amber-500/50 hover:bg-amber-500/5 text-xs font-semibold text-neutral-200 transition-all hover:scale-[1.02]"
                    title="Simula a chegada de um lead via Webhook Elementor"
                  >
                    <Globe className="w-4 h-4 text-amber-400" /> Disparar Webhook
                  </button>
                </div>

                {/* STATS MATRIX GRID */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    {
                      label: 'Vendas Fechadas (WON)',
                      value: contactStats?.wonDealsCount ?? 0,
                      desc: 'Negócios finalizados',
                      icon: () => <Check className="w-5 h-5 text-emerald-400" />
                    },
                    {
                      label: 'Total Gasto (LTV)',
                      value: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(contactStats?.totalValue ?? 0),
                      desc: 'Receita líquida',
                      icon: () => <ShoppingBag className="w-5 h-5 text-indigo-400" />
                    },
                    {
                      label: 'Total de Negócios',
                      value: contactStats?.dealsCount ?? 0,
                      desc: 'Histórico no CRM',
                      icon: () => <Database className="w-5 h-5 text-blue-400" />
                    },
                    {
                      label: 'Compromissos',
                      value: contactStats?.activitiesCount ?? 0,
                      desc: 'Atividades registradas',
                      icon: () => <FileText className="w-5 h-5 text-amber-400" />
                    }
                  ].map((stat, idx) => (
                    <div key={idx} className="p-4 rounded-2xl border border-border/10 bg-neutral-900/30 backdrop-blur-sm relative overflow-hidden shadow-md">
                      <div className="absolute top-0 right-0 p-3 opacity-20">
                        {stat.icon()}
                      </div>
                      <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">{stat.label}</p>
                      <p className="text-xl font-bold text-white mt-1">{stat.value}</p>
                      <p className="text-[10px] text-neutral-400 mt-0.5">{stat.desc}</p>
                    </div>
                  ))}
                </div>

                {/* DETAIL TABS */}
                <div className="border-b border-border/20 flex gap-6 overflow-x-auto scrollbar-none pb-0">
                  {[
                    { id: 'dados', label: 'Dados de Cadastro' },
                    { id: 'vendas', label: 'Histórico de Compras' },
                    { id: 'deals', label: 'Linha do Tempo (Negócios)' },
                    { id: 'atividades', label: 'Compromissos e Tarefas' }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setDetailTab(tab.id as 'dados' | 'vendas' | 'deals' | 'atividades')}
                      className={`pb-3 font-semibold text-xs transition-all shrink-0 tracking-wider uppercase relative ${
                        detailTab === tab.id 
                          ? 'text-primary' 
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                      {detailTab === tab.id && (
                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary animate-fade-in" />
                      )}
                    </button>
                  ))}
                </div>

                {/* TAB CONTENT: DADOS */}
                {detailTab === 'dados' && (
                  <div className="space-y-6">
                    
                    {/* Informações Pessoais & Endereço */}
                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-primary" /> Informações Pessoais
                        </h4>
                        <div className="space-y-3 text-sm">
                          {[
                            { label: 'Nome Completo', value: `${selectedContact.nome} ${selectedContact.sobrenome || ''}` },
                            { label: 'E-mail', value: selectedContact.email || '-', copyable: !!selectedContact.email },
                            { label: 'Telefone', value: selectedContact.telefone, copyable: true },
                            { label: 'Documento (CPF/CNPJ)', value: selectedContact.documento || '-' },
                            { label: 'Data de Nascimento', value: selectedContact.dataNascimento ? new Date(selectedContact.dataNascimento).toLocaleDateString('pt-BR') : '-' }
                          ].map(item => (
                            <div key={item.label} className="flex justify-between py-1.5 border-b border-border/5">
                              <span className="text-neutral-500 text-xs">{item.label}</span>
                              <span className="font-semibold text-neutral-200">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary" /> Endereço Completo
                        </h4>
                        <div className="space-y-3 text-sm">
                          {[
                            { label: 'CEP', value: selectedContact.enderecoCompleto?.cep || '-' },
                            { label: 'Logradouro', value: selectedContact.enderecoCompleto?.rua || '-' },
                            { label: 'Número', value: selectedContact.enderecoCompleto?.numero || '-' },
                            { label: 'Complemento', value: selectedContact.enderecoCompleto?.complemento || '-' },
                            { label: 'Bairro', value: selectedContact.enderecoCompleto?.bairro || '-' },
                            { label: 'Cidade / Estado', value: selectedContact.enderecoCompleto?.cidade ? `${selectedContact.enderecoCompleto.cidade} - ${selectedContact.enderecoCompleto.estado || ''}` : '-' }
                          ].map(item => (
                            <div key={item.label} className="flex justify-between py-1.5 border-b border-border/5">
                              <span className="text-neutral-500 text-xs">{item.label}</span>
                              <span className="font-semibold text-neutral-200">{item.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Marketing & UTM info */}
                    <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                      <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-primary" /> Atribuição de Marketing (UTMs)
                      </h4>
                      
                      <div className="grid md:grid-cols-2 gap-6">
                        {/* First Touch UTM */}
                        <div className="space-y-2 border-r border-border/10 pr-2">
                          <h5 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Primeiro Toque (Congelado)</h5>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-neutral-500">Origem (Source)</span><span className="font-semibold text-neutral-200">{selectedContact.firstUtmSource || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Mídia (Medium)</span><span className="font-semibold text-neutral-200">{selectedContact.firstUtmMedium || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Campanha (Campaign)</span><span className="font-semibold text-neutral-200">{selectedContact.firstUtmCampaign || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Term (Palavra-chave)</span><span className="font-semibold text-neutral-200">{selectedContact.firstUtmTerm || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Capturado em</span><span className="font-semibold text-neutral-300">{selectedContact.firstUtmAt ? new Date(selectedContact.firstUtmAt).toLocaleString('pt-BR') : '-'}</span></div>
                          </div>
                        </div>

                        {/* Last Touch UTM */}
                        <div className="space-y-2">
                          <h5 className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider">Último Toque (Mais Recente)</h5>
                          <div className="space-y-1.5 text-xs">
                            <div className="flex justify-between"><span className="text-neutral-500">Origem (Source)</span><span className="font-semibold text-neutral-200">{selectedContact.lastUtmSource || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Mídia (Medium)</span><span className="font-semibold text-neutral-200">{selectedContact.lastUtmMedium || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Campanha (Campaign)</span><span className="font-semibold text-neutral-200">{selectedContact.lastUtmCampaign || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Term (Palavra-chave)</span><span className="font-semibold text-neutral-200">{selectedContact.lastUtmTerm || '-'}</span></div>
                            <div className="flex justify-between"><span className="text-neutral-500">Atualizado em</span><span className="font-semibold text-neutral-300">{selectedContact.lastUtmAt ? new Date(selectedContact.lastUtmAt).toLocaleString('pt-BR') : '-'}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tags e Campos Customizados */}
                    <div className="grid md:grid-cols-2 gap-6">
                      
                      <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-primary" /> Tags Comerciais
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {(selectedContact.tags || []).length === 0 && (
                            <span className="text-xs text-neutral-500">Nenhuma tag cadastrada.</span>
                          )}
                          {(selectedContact.tags || []).map((tag: string) => (
                            <span key={tag} className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Settings className="w-3.5 h-3.5 text-primary" /> Campos Customizados
                        </h4>
                        <div className="space-y-2 text-xs">
                          {Object.keys(selectedContact.camposCustomizados || {}).length === 0 ? (
                            <span className="text-neutral-500">Nenhum campo customizado inserido.</span>
                          ) : (
                            Object.entries(selectedContact.camposCustomizados || {}).map(([key, val]) => (
                              <div key={key} className="flex justify-between py-1 border-b border-border/5">
                                <span className="text-neutral-400 capitalize">{key.replace(/_/g, ' ')}</span>
                                <span className="font-semibold text-neutral-200">{String(val)}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                    {/* Webhook Meta fbMetadata */}
                    {selectedContact.fbMetadata && Object.keys(selectedContact.fbMetadata).length > 0 && (
                      <div className="p-5 rounded-2xl border border-border/10 bg-neutral-950/40 space-y-4">
                        <h4 className="text-xs font-bold text-neutral-400 uppercase tracking-wider flex items-center gap-1.5">
                          <Globe className="w-3.5 h-3.5 text-primary" /> Metadata Lead Ads (Facebook Ads Integration)
                        </h4>
                        <pre className="p-4 rounded-xl bg-black border border-border/25 text-neutral-300 font-mono text-[11px] overflow-x-auto">
                          {JSON.stringify(selectedContact.fbMetadata, null, 2)}
                        </pre>
                      </div>
                    )}

                  </div>
                )}

                {/* TAB CONTENT: VENDAS (WON DEALS) */}
                {detailTab === 'vendas' && (
                  <div className="space-y-4">
                    {selectedContactDeals.filter(d => d.status === 'WON').length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-border/20 rounded-2xl text-neutral-500 text-xs">
                        Nenhuma compra finalizada registrada no CRM.
                      </div>
                    ) : (
                      selectedContactDeals.filter(d => d.status === 'WON').map(deal => (
                        <div key={deal.id} className="p-4 rounded-2xl border border-border/15 bg-neutral-950/40 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                              <ShoppingBag className="w-4 h-4 text-emerald-400" />
                            </div>
                            <div>
                              <p className="text-sm font-bold text-white">{deal.titulo}</p>
                              <p className="text-[10px] text-neutral-400 mt-0.5">
                                Fechado em: {deal.fechadoEm ? new Date(deal.fechadoEm).toLocaleDateString('pt-BR') : new Date(deal.updatedAt).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-extrabold text-emerald-400">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.valorEstimado)}
                            </p>
                            <span className="text-[9px] px-1.5 py-0.5 bg-neutral-900 text-neutral-400 rounded-md border border-neutral-800">
                              WON Deal
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB CONTENT: DEALS (ALL HISTORIES / STEPS) */}
                {detailTab === 'deals' && (
                  <div className="space-y-4">
                    {selectedContactDeals.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-border/20 rounded-2xl text-neutral-500 text-xs">
                        Nenhum negócio ativo ou histórico para este lead.
                      </div>
                    ) : (
                      selectedContactDeals.map(deal => (
                        <div key={deal.id} className="p-4 rounded-2xl border border-border/15 bg-neutral-950/40 space-y-3">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-white">{deal.titulo}</p>
                            <span className={`text-[10px] px-2 py-0.5 rounded font-bold uppercase ${
                              deal.status === 'WON' 
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                                : deal.status === 'LOST' 
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                            }`}>
                              {deal.status}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-neutral-400">
                            <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500">Valor</span><span className="font-semibold text-neutral-200">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.valorEstimado)}</span></div>
                            <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500">Prioridade</span><span className="font-semibold text-neutral-200">{deal.prioridade}</span></div>
                            <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500">Produto</span><span className="font-semibold text-neutral-200">{deal.produtoInteresse || '-'}</span></div>
                            <div><span className="block text-[9px] uppercase tracking-wider text-neutral-500">Criado em</span><span className="font-semibold text-neutral-300">{new Date(deal.createdAt).toLocaleDateString('pt-BR')}</span></div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* TAB CONTENT: ACTIVITIES */}
                {detailTab === 'atividades' && (
                  <div className="space-y-4">
                    {selectedContactActivities.length === 0 ? (
                      <div className="text-center py-10 border border-dashed border-border/20 rounded-2xl text-neutral-500 text-xs">
                        Nenhuma atividade cadastrada para este contato.
                      </div>
                    ) : (
                      selectedContactActivities.map(act => (
                        <div key={act.id} className="p-4 rounded-2xl border border-border/15 bg-neutral-950/40 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              act.status === 'DONE' 
                                ? 'bg-neutral-800 border border-neutral-700 text-neutral-500' 
                                : 'bg-primary/10 border border-primary/20 text-primary'
                            }`}>
                              <Calendar className="w-4 h-4" />
                            </div>
                            <div>
                              <p className={`text-sm font-semibold ${act.status === 'DONE' ? 'line-through text-neutral-500' : 'text-white'}`}>
                                {act.titulo}
                              </p>
                              {act.descricao && (
                                <p className="text-[11px] text-neutral-400 truncate mt-0.5 max-w-sm">{act.descricao}</p>
                              )}
                              <p className="text-[10px] text-neutral-500 mt-0.5">
                                Vencimento: {new Date(act.dueAt).toLocaleDateString('pt-BR')}
                              </p>
                            </div>
                          </div>
                          
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            act.status === 'DONE' 
                              ? 'bg-neutral-800 text-neutral-400' 
                              : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          }`}>
                            {act.status}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                )}

              </div>
            </div>
          ) : (
            <div className="hidden lg:flex flex-1 flex-col items-center justify-center text-center text-muted-foreground p-12 bg-gradient-to-b from-[#090d16] to-[#030712]">
              <div className="p-6 rounded-3xl border border-border/10 bg-neutral-950/20 backdrop-blur-md max-w-sm shadow-2xl">
                <UserCheck className="w-12 h-12 text-primary/45 mx-auto mb-4 stroke-[1.5]" />
                <h3 className="text-base font-bold text-white">Selecione um contato</h3>
                <p className="text-xs mt-1 text-neutral-400">Escolha um contato da listagem lateral para ver suas informações detalhadas, UTMs e métricas de vendas.</p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CREATE & EDIT CONTACT DIALOG (TABBED FORM) */}
      {showFormModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowFormModal(false)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
          <div 
            className="relative w-full max-w-lg bg-[#0d111c] border border-border/30 rounded-3xl p-6 space-y-5 animate-scale-in shadow-2xl overflow-y-auto max-h-[90vh]" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editingContact ? 'Editar Contato' : 'Criar Novo Contato'}</h3>
              <button onClick={() => setShowFormModal(false)} className="p-2 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Tabs */}
            <div className="flex gap-4 border-b border-border/15">
              {[
                { id: 'dados', label: 'Cadastro' },
                { id: 'endereco', label: 'Endereço' },
                { id: 'marketing', label: 'Atribuição/Tags' }
              ].map(tab => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFormTab(tab.id as 'dados' | 'endereco' | 'marketing')}
                  className={`pb-2 text-xs font-bold uppercase tracking-wider relative transition-colors ${
                    formTab === tab.id ? 'text-primary' : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                  {formTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-primary" />}
                </button>
              ))}
            </div>

            {/* TAB CONTENT: DADOS */}
            {formTab === 'dados' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Nome *</label>
                  <input
                    value={formData.nome}
                    onChange={e => setFormData(p => ({ ...p, nome: e.target.value }))}
                    placeholder="João"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Sobrenome</label>
                  <input
                    value={formData.sobrenome}
                    onChange={e => setFormData(p => ({ ...p, sobrenome: e.target.value }))}
                    placeholder="Silva"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Telefone *</label>
                  <input
                    value={formData.telefone}
                    onChange={e => setFormData(p => ({ ...p, telefone: e.target.value }))}
                    placeholder="5562999999999"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">E-mail</label>
                  <input
                    value={formData.email}
                    onChange={e => setFormData(p => ({ ...p, email: e.target.value }))}
                    placeholder="joao@empresa.com"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">CPF ou CNPJ</label>
                  <input
                    value={formData.documento}
                    onChange={e => setFormData(p => ({ ...p, documento: e.target.value }))}
                    placeholder="123.456.789-00"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Data Nascimento</label>
                  <input
                    value={formData.dataNascimento}
                    onChange={e => setFormData(p => ({ ...p, dataNascimento: e.target.value }))}
                    type="date"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 flex items-center gap-2 pt-2">
                  <input
                    id="consentimento"
                    type="checkbox"
                    checked={formData.consentimentoLgpd}
                    onChange={e => setFormData(p => ({ ...p, consentimentoLgpd: e.target.checked }))}
                    className="rounded border-neutral-700 bg-neutral-950 text-primary focus:ring-0 focus:ring-offset-0"
                  />
                  <label htmlFor="consentimento" className="text-xs text-neutral-400 cursor-pointer">Aceita os termos de consentimento LGPD</label>
                </div>
              </div>
            )}

            {/* TAB CONTENT: ENDERECO */}
            {formTab === 'endereco' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">CEP</label>
                  <input
                    value={formData.enderecoCompleto.cep}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, cep: e.target.value } }))}
                    placeholder="74000-000"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Logradouro (Rua/Av.)</label>
                  <input
                    value={formData.enderecoCompleto.rua}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, rua: e.target.value } }))}
                    placeholder="Av. Anhanguera"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Número</label>
                  <input
                    value={formData.enderecoCompleto.numero}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, numero: e.target.value } }))}
                    placeholder="100"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Complemento</label>
                  <input
                    value={formData.enderecoCompleto.complemento}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, complemento: e.target.value } }))}
                    placeholder="Quadra 12"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Bairro</label>
                  <input
                    value={formData.enderecoCompleto.bairro}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, bairro: e.target.value } }))}
                    placeholder="Setor Central"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Cidade</label>
                  <input
                    value={formData.enderecoCompleto.cidade}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, cidade: e.target.value }, cidade: e.target.value }))}
                    placeholder="Goiânia"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Estado</label>
                  <input
                    value={formData.enderecoCompleto.estado}
                    onChange={e => setFormData(p => ({ ...p, enderecoCompleto: { ...p.enderecoCompleto, estado: e.target.value }, estado: e.target.value }))}
                    placeholder="GO"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>
              </div>
            )}

            {/* TAB CONTENT: MARKETING */}
            {formTab === 'marketing' && (
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Origem Comercial (Mídia)</label>
                  <input
                    value={formData.origem}
                    onChange={e => setFormData(p => ({ ...p, origem: e.target.value }))}
                    placeholder="Meta Ads"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                  />
                </div>

                {/* Tags management */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block">Adicionar Tags</label>
                  <div className="flex gap-2">
                    <input
                      value={newTagInput}
                      onChange={e => setNewTagInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())}
                      placeholder="Nova tag"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-border/30 bg-neutral-950 text-sm focus:outline-none focus:ring-1 focus:ring-primary/45 text-white"
                    />
                    <button
                      type="button"
                      onClick={addTag}
                      className="px-4 rounded-xl bg-primary text-black font-semibold text-xs"
                    >
                      Incluir
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {formData.tags.map(tag => (
                      <span key={tag} className="text-xs font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 flex items-center gap-1">
                        {tag}
                        <button type="button" onClick={() => removeTag(tag)} className="text-primary hover:text-white font-bold ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                </div>

                {/* Custom fields management */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block">Campos Customizados</label>
                  <div className="flex gap-2">
                    <input
                      value={customFieldKey}
                      onChange={e => setCustomFieldKey(e.target.value)}
                      placeholder="Nome do campo (ex: Ramo)"
                      className="flex-1 px-3 py-2 rounded-xl border border-border/30 bg-neutral-950 text-xs text-white focus:outline-none"
                    />
                    <input
                      value={customFieldValue}
                      onChange={e => setCustomFieldValue(e.target.value)}
                      placeholder="Valor"
                      className="flex-1 px-3 py-2 rounded-xl border border-border/30 bg-neutral-950 text-xs text-white focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={addCustomField}
                      className="px-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs"
                    >
                      Adicionar
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-[120px] overflow-y-auto scrollbar-thin">
                    {Object.entries(formData.camposCustomizados).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center p-2 rounded-lg bg-neutral-950 border border-border/10 text-xs">
                        <span className="text-neutral-400 capitalize">{key.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-white font-semibold">{val}</span>
                          <button type="button" onClick={() => removeCustomField(key)} className="text-rose-400 hover:text-rose-600 font-bold">×</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-border/10">
              <button 
                type="button"
                onClick={() => setShowFormModal(false)} 
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-neutral-400 hover:bg-neutral-800 transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="button"
                onClick={handleSubmit} 
                className="flex-1 py-2.5 rounded-xl bg-primary text-black font-extrabold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
              >
                {editingContact ? 'Salvar Alterações' : 'Criar Contato'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MERGE CONTACTS DIALOG */}
      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowMergeModal(false)}>
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />
          <div 
            className="relative w-full max-w-md bg-[#0d111c] border border-border/30 rounded-3xl p-6 space-y-4 animate-scale-in shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Merge className="w-5 h-5 text-primary" /> Mesclar Contatos
              </h3>
              <button onClick={() => setShowMergeModal(false)} className="p-2 rounded-xl hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-extrabold block">Instrução importante:</span>
                O contato principal será mantido: <span className="font-extrabold text-white">{selectedContact?.nome} {selectedContact?.sobrenome}</span>. Todos os negócios e compromissos do contato que você selecionar abaixo serão mesclados a ele.
              </div>
            </div>

            <div>
              <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Buscar Contato Secundário</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/30 bg-neutral-950 focus-within:border-primary/50 transition-colors">
                <Search className="w-4 h-4 text-neutral-500 shrink-0" />
                <input
                  value={mergeQuery}
                  onChange={e => setMergeQuery(e.target.value)}
                  placeholder="Buscar contato secundário..."
                  className="flex-1 bg-transparent text-sm text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-[160px] overflow-y-auto scrollbar-thin divide-y divide-border/10 border border-border/10 rounded-2xl bg-neutral-950/30">
              {mergeEligibleContacts.length === 0 && (
                <div className="p-4 text-center text-xs text-neutral-500">Nenhum outro contato elegível encontrado.</div>
              )}
              {mergeEligibleContacts.map(c => (
                <button
                  key={c.id}
                  onClick={() => setMergeTargetId(c.id)}
                  className={`w-full flex items-center justify-between p-3 text-left text-xs transition-colors ${
                    mergeTargetId === c.id 
                      ? 'bg-primary/10 text-primary' 
                      : 'text-neutral-300 hover:bg-neutral-900/40'
                  }`}
                >
                  <div>
                    <p className="font-bold">{c.nome} {c.sobrenome || ''}</p>
                    <p className="text-[10px] text-neutral-400 mt-0.5">{c.telefone}</p>
                  </div>
                  {mergeTargetId === c.id && <Check className="w-4 h-4 text-primary" />}
                </button>
              ))}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowMergeModal(false)}
                className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-neutral-400 hover:bg-neutral-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleMerge}
                disabled={!mergeTargetId}
                className="flex-1 py-2.5 rounded-xl bg-primary text-black font-extrabold text-sm hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
              >
                Confirmar e Mesclar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Bulk Actions Bar */}
      {isSelectionMode && checkedCount > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[90%] max-w-4xl bg-neutral-950/95 border border-primary/30 rounded-2xl p-4 shadow-[0_0_24px_rgba(57,255,136,0.15)] flex flex-wrap items-center justify-between gap-4 animate-scale-in max-md:bottom-20 max-md:w-[95%]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping shrink-0" />
            <p className="text-xs font-bold text-foreground">
              {checkedCount} selecionados
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              <MobileActionSelect
                label="Lista de Disparo"
                value={selectedListaTarget}
                onChange={setSelectedListaTarget}
                options={listasDisparo.map((l) => ({ value: l.id, label: l.nomeLista }))}
                placeholder="Disparo..."
                className="bg-neutral-900 border border-border/40 rounded-xl px-2.5 py-1 text-xs text-foreground"
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
                className="bg-neutral-900 border border-border/40 rounded-xl px-2.5 py-1 text-xs text-foreground"
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
              onClick={handleBulkDelete}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-destructive/35 bg-destructive/10 text-destructive text-xs font-bold hover:bg-destructive hover:text-white transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" /> Excluir em Lote
            </button>
            
            <button
              onClick={() => {
                setCheckedIds({})
                setIsSelectionMode(false)
              }}
              className="text-neutral-500 hover:text-foreground font-bold pl-1 text-[11px]"
            >
              Limpar
            </button>
          </div>
        </div>
      )}

    </AppLayout>
  )
}
