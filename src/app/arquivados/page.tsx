'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { crmService } from '@/lib/services'
import { MockDeal, MockContact, MockUser } from '@/lib/mockData'
import { Search, X, Archive, ArrowUpDown } from 'lucide-react'
import { useCategories } from '@/lib/categories'

const BRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(v)

type StatusTab = 'all' | 'WON' | 'LOST'

export default function ArquivadosPage() {
  const categoriesStore = useCategories()

  const [deals, setDeals] = useState<MockDeal[]>([])
  const [contacts, setContacts] = useState<MockContact[]>([])
  const [users, setUsers] = useState<MockUser[]>([])
  const [loading, setLoading] = useState(true)

  const [activeTab, setActiveTab] = useState<StatusTab>('all')
  const [filterOwner, setFilterOwner] = useState<string>('all')
  const [filterProduct, setFilterProduct] = useState<string>('all')
  const [filterDateFrom, setFilterDateFrom] = useState<string>('')
  const [filterDateTo, setFilterDateTo] = useState<string>('')
  const [searchText, setSearchText] = useState<string>('')
  const [sortField, setSortField] = useState<'fechadoEm' | 'valorEstimado'>('fechadoEm')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const pipes = await crmService.getPipelines()

        let allDeals: MockDeal[] = []
        for (const pipe of pipes) {
          const d = await crmService.getDeals(pipe.id)
          allDeals = [...allDeals, ...d]
        }

        const allContacts = await crmService.getContacts()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const state = (crmService as any).getState?.() ?? { users: [] }
        setUsers(state.users || [])
        setDeals(allDeals)
        setContacts(allContacts)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const archivedDeals = useMemo(() =>
    deals.filter(d => d.status === 'WON' || d.status === 'LOST'),
    [deals]
  )

  const wonDeals = useMemo(() => archivedDeals.filter(d => d.status === 'WON'), [archivedDeals])
  const lostDeals = useMemo(() => archivedDeals.filter(d => d.status === 'LOST'), [archivedDeals])
  const conversionRate = archivedDeals.length > 0
    ? Math.round((wonDeals.length / archivedDeals.length) * 100)
    : 0

  const visibleDeals = useMemo(() => {
    let result = archivedDeals.filter(deal => {
      if (activeTab !== 'all' && deal.status !== activeTab) return false
      if (filterOwner !== 'all') {
        if (filterOwner === 'unassigned') {
          if (deal.ownerUserId) return false
        } else {
          if (deal.ownerUserId !== filterOwner) return false
        }
      }
      if (filterProduct !== 'all' && deal.produtoInteresse !== filterProduct) return false

      if (filterDateFrom) {
        const from = new Date(filterDateFrom).getTime()
        const fechado = deal.fechadoEm ? new Date(deal.fechadoEm).getTime() : 0
        if (fechado < from) return false
      }
      if (filterDateTo) {
        const to = new Date(filterDateTo).getTime() + 86400000 // inclusive end of day
        const fechado = deal.fechadoEm ? new Date(deal.fechadoEm).getTime() : 0
        if (fechado > to) return false
      }

      if (searchText.trim() !== '') {
        const q = searchText.toLowerCase()
        const matchTitle = deal.titulo.toLowerCase().includes(q)
        const contact = contacts.find(c => c.id === deal.contactId)
        const matchContact = contact && `${contact.nome} ${contact.sobrenome || ''}`.toLowerCase().includes(q)
        if (!matchTitle && !matchContact) return false
      }

      return true
    })

    result = [...result].sort((a, b) => {
      let va = 0, vb = 0
      if (sortField === 'fechadoEm') {
        va = a.fechadoEm ? new Date(a.fechadoEm).getTime() : 0
        vb = b.fechadoEm ? new Date(b.fechadoEm).getTime() : 0
      } else {
        va = a.valorEstimado
        vb = b.valorEstimado
      }
      return sortDir === 'desc' ? vb - va : va - vb
    })

    return result
  }, [archivedDeals, activeTab, filterOwner, filterProduct, filterDateFrom, filterDateTo, searchText, contacts, sortField, sortDir])

  const filteredWon = visibleDeals.filter(d => d.status === 'WON')
  const filteredLost = visibleDeals.filter(d => d.status === 'LOST')
  const filteredRate = visibleDeals.length > 0
    ? Math.round((filteredWon.length / visibleDeals.length) * 100)
    : 0

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('desc') }
  }

  const clearFilters = () => {
    setFilterOwner('all')
    setFilterProduct('all')
    setFilterDateFrom('')
    setFilterDateTo('')
    setSearchText('')
  }

  const TABS: { id: StatusTab; label: string; count: number; color: string }[] = [
    { id: 'all', label: 'Todos', count: archivedDeals.length, color: 'text-neutral-300' },
    { id: 'WON', label: 'Ganhos', count: wonDeals.length, color: 'text-emerald-400' },
    { id: 'LOST', label: 'Perdidos', count: lostDeals.length, color: 'text-rose-400' }
  ]

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-[#0d0d11] text-foreground select-none overflow-hidden">
        {/* HEADER */}
        <div className="px-6 lg:px-8 pt-6 pb-4 border-b border-border/20 bg-black/40 backdrop-blur-md sticky top-0 z-10 shrink-0">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 text-primary">
                <Archive className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-white">
                  Negócios Arquivados
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">Histórico de oportunidades ganhas ou perdidas</p>
              </div>
            </div>

            {/* KPIs */}
            <div className="flex items-center bg-neutral-900/60 p-1.5 rounded-2xl border border-border/20 shrink-0">
              <div className="px-4 py-1.5 flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Ganhos</span>
                <span className="text-sm font-black text-emerald-400">{wonDeals.length}</span>
              </div>
              <div className="w-px h-8 bg-border/40 mx-1" />
              <div className="px-4 py-1.5 flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Perdidos</span>
                <span className="text-sm font-black text-rose-400">{lostDeals.length}</span>
              </div>
              <div className="w-px h-8 bg-border/40 mx-1" />
              <div className="px-4 py-1.5 flex flex-col items-center">
                <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mb-0.5">Conversão</span>
                <span className="text-sm font-black text-primary">{conversionRate}%</span>
              </div>
            </div>
          </div>

          {/* TABS */}
          <div className="flex items-center gap-1 mb-4">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                  activeTab === tab.id
                    ? 'bg-neutral-800 text-foreground border border-border/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-neutral-900/60'
                }`}
              >
                {tab.label}
                <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                  activeTab === tab.id ? tab.color : 'text-muted-foreground'
                } bg-neutral-900 border border-border/30`}>
                  {tab.count}
                </span>
              </button>
            ))}

            {/* Filtered stats */}
            {(filterOwner !== 'all' || filterProduct !== 'all' || filterDateFrom || filterDateTo || searchText) && (
              <div className="ml-auto flex items-center gap-2 text-[10px] text-muted-foreground font-semibold">
                <span>{filteredWon.length} ganhos · {filteredLost.length} perdidos · {filteredRate}% conv.</span>
              </div>
            )}
          </div>

          {/* FILTERS */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Buscar..."
                className="pl-9 pr-8 py-2 w-52 rounded-xl border border-border/30 bg-neutral-900 text-sm focus:outline-none focus:ring-1 focus:ring-primary/50 text-foreground"
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <select
              value={filterOwner}
              onChange={(e) => setFilterOwner(e.target.value)}
              className="bg-neutral-900 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="all">Vendedor: Todos</option>
              <option value="unassigned">Sem responsável</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.nome} {u.sobrenome || ''}</option>
              ))}
            </select>

            <select
              value={filterProduct}
              onChange={(e) => setFilterProduct(e.target.value)}
              className="bg-neutral-900 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <option value="all">Produto: Todos</option>
              {categoriesStore.categories.products.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            {/* Date Range */}
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">De</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="bg-neutral-900 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide shrink-0">Até</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="bg-neutral-900 border border-border/30 rounded-xl px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            <button
              onClick={clearFilters}
              className="text-xs text-muted-foreground hover:text-foreground font-semibold px-3 py-2 rounded-xl hover:bg-neutral-800 transition-colors ml-auto"
            >
              Limpar
            </button>
          </div>
        </div>

        {/* LIST CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : visibleDeals.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-neutral-900/50 flex items-center justify-center">
                <Archive className="w-8 h-8 text-neutral-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-neutral-200">Nenhum negócio encontrado</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                  Ajuste os filtros acima ou feche negócios na pipeline.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900/40 border border-border/20 rounded-3xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/20 bg-black/40">
                    <th className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px]">Status</th>
                    <th className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px]">Título</th>
                    <th className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px]">Contato</th>
                    <th className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px]">Produto / Origem</th>
                    <th
                      className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px] text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('valorEstimado')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Valor <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                    <th className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px]">Vendedor</th>
                    <th
                      className="p-4 font-semibold text-muted-foreground tracking-wider uppercase text-[10px] text-right cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort('fechadoEm')}
                    >
                      <div className="flex items-center justify-end gap-1">
                        Data Fim <ArrowUpDown className="w-3 h-3" />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/10">
                  {visibleDeals.map((deal) => {
                    const contact = contacts.find((c) => c.id === deal.contactId)
                    const owner = users.find((u) => u.id === deal.ownerUserId)
                    const isWon = deal.status === 'WON'

                    return (
                      <tr key={deal.id} className="hover:bg-neutral-800/30 transition-colors group">
                        <td className="p-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            isWon
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          }`}>
                            {isWon ? 'GANHO' : 'PERDIDO'}
                          </span>
                        </td>
                        <td className="p-4 font-semibold text-neutral-200">
                          {deal.titulo}
                          {deal.motivoPerda && (
                            <span className="block text-[10px] text-rose-400/80 font-medium mt-0.5" title={deal.motivoPerdaCustom || deal.motivoPerda}>
                              Motivo: {deal.motivoPerda}
                            </span>
                          )}
                        </td>
                        <td className="p-4 text-neutral-300 font-medium">
                          {contact ? `${contact.nome} ${contact.sobrenome || ''}` : '-'}
                          {contact?.telefone && (
                            <span className="block text-[10px] text-muted-foreground font-mono mt-0.5">{contact.telefone}</span>
                          )}
                        </td>
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            {deal.produtoInteresse ? (
                              <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-1.5 py-0.5 rounded-md self-start font-bold">
                                {deal.produtoInteresse}
                              </span>
                            ) : '-'}
                            {deal.origem ? (
                              <span className="text-[10px] bg-neutral-800 text-neutral-300 border border-border/40 px-1.5 py-0.5 rounded-md self-start">
                                {deal.origem}
                              </span>
                            ) : ''}
                          </div>
                        </td>
                        <td className="p-4 text-right font-bold text-emerald-400">
                          {BRL(deal.valorEstimado)}
                        </td>
                        <td className="p-4">
                          {owner ? (
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-neutral-800 flex items-center justify-center text-[9px] font-bold">
                                {owner.nome[0]}
                              </div>
                              <span className="text-xs font-medium text-neutral-300">{owner.nome}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">Não atribuído</span>
                          )}
                        </td>
                        <td className="p-4 text-right text-xs text-muted-foreground font-medium">
                          {deal.fechadoEm ? new Date(deal.fechadoEm).toLocaleDateString('pt-BR') : '-'}
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
    </AppLayout>
  )
}
