'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Zap,
  LayoutDashboard,
  Kanban,
  Users,
  Calendar,
  Search,
  Compass,
  Settings,
  LogOut,
  Menu,
  X,
  Plus,
  Bell,
  Coins,
  Archive,
  Filter,
  Workflow
} from 'lucide-react'
import { useIsMobile } from '@/hooks/useIsMobile'


interface SidebarItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const SIDEBAR_ITEMS: SidebarItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Pipeline', href: '/pipeline', icon: Kanban },
  { name: 'Arquivados', href: '/arquivados', icon: Archive },
  { name: 'Contatos', href: '/contacts', icon: Users },
  { name: 'Atividades', href: '/activities', icon: Calendar },
  { name: 'Busca de Leads', href: '/lead-search', icon: Search },
  { name: 'Caixa Rápido', href: '/caixa-rapido', icon: Zap },
  { name: 'Cadências', href: '/cadencias', icon: Workflow },
  { name: 'Bússola', href: '/bussola', icon: Compass },
  { name: 'Configurações', href: '/settings', icon: Settings }
]

type StoredContact = {
  id: string
  nome: string
  sobrenome?: string
  telefone: string
  email?: string
  cidade?: string
  estado?: string
}

type StoredDeal = {
  id: string
  titulo: string
  produtoInteresse?: string
  valorEstimado: number
  contactId?: string
  telefone?: string
}

interface SidebarContentProps {
  user: { nome: string; sobrenome: string; teamName: string }
  onItemClick: () => void
}

function SidebarContent({ user, onItemClick }: SidebarContentProps) {
  const pathname = usePathname()
  const router = useRouter()
  const isActive = (href: string) => pathname === href

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border select-none">
      {/* Brand Header */}
      <div className="flex items-center gap-3 px-6 py-5 border-b border-sidebar-border">
        <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-card border border-primary/30 overflow-hidden shrink-0">
          {/* Motion blur light background effect */}
          <div className="absolute inset-0 bg-primary/20 blur-md scale-150 animate-pulse mix-blend-screen" />
          <div className="absolute inset-0 bg-gradient-to-tr from-primary/30 to-transparent blur-sm" />
          
          <img src="/logo.png" alt="Logo Caixa Rápido" className="w-full h-full object-cover relative z-10" />
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-sidebar-foreground text-sm uppercase leading-tight">Caixa Rápido</span>
          <span className="text-[9px] text-sidebar-foreground/60 font-semibold uppercase tracking-[0.2em]">Operação CRM</span>
        </div>
      </div>

      {/* Nav Menu */}
      <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto scrollbar-thin">
        {SIDEBAR_ITEMS.map(item => {
          const active = isActive(item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onItemClick}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                active
                  ? 'bg-sidebar-primary/20 text-sidebar-primary-foreground border-l-2 border-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className={`w-5 h-5 transition-transform duration-300 group-hover:scale-105 ${active ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/70'}`} />
              <span>{item.name}</span>
              {item.name === 'Bússola' && (
                <span className="ml-auto flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-glow opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* Team / Profile footer */}
      <div className="p-4 border-t border-sidebar-border bg-sidebar-accent/30">
        <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-sidebar-border bg-sidebar-accent/50">
          <div className="w-8 h-8 rounded-lg bg-sidebar flex items-center justify-center font-bold text-xs text-sidebar-primary border border-sidebar-primary/20">
            {user.nome[0]}{user.sobrenome[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{user.nome} {user.sobrenome}</p>
            <p className="text-[10px] text-sidebar-foreground/60 truncate">{user.teamName}</p>
          </div>
          <button
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              router.push('/auth')
              router.refresh()
            }}
            className="text-sidebar-foreground/60 hover:text-destructive transition-colors cursor-pointer"
            title="Sair"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

export const AppLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname()
  const router = useRouter()
  const isMobile = useIsMobile()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [menuSheetOpen, setMenuSheetOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const mainRef = useRef<HTMLDivElement>(null)
  
  // Track scroll position per pathname
  const scrollPositions = useRef<Record<string, number>>({})

  const user = {
    nome: 'Diretor',
    sobrenome: 'Comercial',
    email: 'admin@caixarapido.com.br',
    teamName: 'Time Vendas Alfa'
  }

  // Keyboard shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-focus search input
  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 50)
    }
  }, [searchOpen])

  // Scroll preservation handler
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (isMobile) {
      scrollPositions.current[pathname] = e.currentTarget.scrollTop
    }
  }

  // Restore scroll on page change
  useEffect(() => {
    if (isMobile && mainRef.current) {
      const savedScroll = scrollPositions.current[pathname] || 0
      const mainEl = mainRef.current
      const timer = setTimeout(() => {
        if (mainEl) {
          mainEl.scrollTop = savedScroll
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [pathname, isMobile])

  const searchResults = useMemo<{ contacts: StoredContact[]; deals: StoredDeal[] }>(() => {
    if (!searchQuery.trim()) return { contacts: [], deals: [] }

    const query = searchQuery.toLowerCase()
    let state: { contacts: StoredContact[]; deals: StoredDeal[] } = { contacts: [], deals: [] }
    try {
      const raw = window.localStorage.getItem('ocr_crm_state')
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
          state = parsed as typeof state
        }
      }
    } catch {
      // corrupted storage — use empty state
    }

    const filteredContacts = (state.contacts ?? []).filter(c =>
      c.nome.toLowerCase().includes(query) ||
      (c.sobrenome && c.sobrenome.toLowerCase().includes(query)) ||
      c.telefone.includes(query) ||
      (c.email && c.email.toLowerCase().includes(query))
    )

    const filteredDeals = (state.deals ?? []).filter(d => {
      const contact = (state.contacts ?? []).find(c => c.id === d.contactId)
      return (
        d.titulo.toLowerCase().includes(query) ||
        (d.produtoInteresse && d.produtoInteresse.toLowerCase().includes(query)) ||
        (contact?.nome && contact.nome.toLowerCase().includes(query)) ||
        (d.telefone && d.telefone.includes(query))
      )
    })

    return {
      contacts: filteredContacts.slice(0, 5),
      deals: filteredDeals.slice(0, 5)
    }
  }, [searchQuery])

  const handleSearchResultClick = (type: 'contact' | 'deal', id: string) => {
    setSearchOpen(false)
    setSearchQuery('')
    if (type === 'deal') {
      router.push(`/pipeline?dealId=${id}`)
    } else {
      router.push(`/contacts?contactId=${id}`)
    }
  }

  // Get Page Title
  const getPageTitle = () => {
    if (pathname === '/') return 'Caixa Rápido'
    const name = pathname?.split('/')[1]
    if (name === 'dashboard') return 'Home'
    return name?.replace('-', ' ') || 'Caixa Rápido'
  }

  // Handle mobile header context actions
  const triggerMobileAdd = () => {
    if (pathname === '/pipeline') {
      window.dispatchEvent(new CustomEvent('trigger-add-deal'))
    } else if (pathname === '/contacts') {
      window.dispatchEvent(new CustomEvent('trigger-add-contact'))
    }
  }

  const triggerMobileFilter = () => {
    window.dispatchEvent(new CustomEvent('toggle-mobile-filters'))
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground antialiased font-sans">
      {/* Sidebar Desktop */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 z-20">
        <SidebarContent user={user} onItemClick={() => setMobileMenuOpen(false)} />
      </div>

      {/* Main Layout Area */}
      <div className="flex flex-col flex-1 overflow-hidden md:pl-64">
        
        {/* Desktop Header */}
        <header className="hidden md:flex items-center justify-between h-16 px-6 border-b border-border/20 bg-background/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold tracking-tight md:text-xl capitalize select-none">
              {getPageTitle()}
            </h1>
          </div>

          {/* Desktop Topbar Actions */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSearchOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 w-64 text-left rounded-xl border border-border/40 bg-secondary text-xs text-muted-foreground hover:border-primary/50 transition-all select-none"
            >
              <Search className="w-4 h-4 text-muted-foreground" />
              <span>Buscar...</span>
              <kbd className="ml-auto px-1.5 py-0.5 rounded bg-muted border border-border/60 text-[9px]">⌘K</kbd>
            </button>

            <button
              onClick={() => router.push('/pipeline?action=new')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-primary text-black font-semibold text-xs transition-transform active:scale-95 hover:shadow-lg hover:shadow-primary/20 ocr-glow-soft cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden lg:inline">Oportunidade</span>
            </button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-2 rounded-xl border border-border/40 hover:border-primary/40 hover:bg-secondary text-muted-foreground hover:text-foreground relative transition-colors cursor-pointer"
              >
                <Bell className="w-4.5 h-4.5" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
              </button>

              {notificationsOpen && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setNotificationsOpen(false)} />
                  <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-border bg-popover p-4 shadow-2xl z-40 ocr-glass-strong animate-scale-in">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Alertas Recentes</h3>
                    <div className="space-y-3">
                      <div className="flex gap-2.5 text-xs pb-3 border-b border-border/50">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                          <Coins className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">Lead Qualificado pela IA</p>
                          <p className="text-[10px] text-muted-foreground">Juliana Santos foi qualificada via WhatsApp.</p>
                        </div>
                      </div>
                      <div className="flex gap-2.5 text-xs">
                        <div className="w-7 h-7 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
                          <Zap className="w-4.5 h-4.5" />
                        </div>
                        <div>
                          <p className="font-semibold text-foreground">SLA Atingido</p>
                          <p className="text-[10px] text-muted-foreground">Carlos Oliveira está na etapa Novo Lead há 5h.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Discreet Logo */}
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-border/30 flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* Mobile Header (Fixed context actions) */}
        <header className="flex md:hidden items-center justify-between h-16 px-4 border-b border-border/30 bg-background/90 backdrop-blur-lg z-30 sticky top-0 safe-top">
          <h1 className="text-base font-extrabold tracking-tight capitalize select-none text-foreground">
            {getPageTitle()}
          </h1>

          <div className="flex items-center gap-3">
            {/* Discreet Logo Mobile */}
            <div className="w-7 h-7 rounded-lg overflow-hidden border border-border/30 flex items-center justify-center shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            {/* Search Trigger */}
            <button
              onClick={() => setSearchOpen(true)}
              className="p-2 rounded-xl border border-border/40 text-muted-foreground active:text-foreground"
            >
              <Search className="w-4.5 h-4.5" />
            </button>

            {/* Filter Trigger (Pipeline or Contacts only) */}
            {(pathname === '/pipeline' || pathname === '/contacts') && (
              <button
                onClick={triggerMobileFilter}
                className="p-2 rounded-xl border border-border/40 text-muted-foreground active:text-foreground"
              >
                <Filter className="w-4.5 h-4.5" />
              </button>
            )}

            {/* Add Opportunity/Contact Trigger */}
            {(pathname === '/pipeline' || pathname === '/contacts') && (
              <button
                onClick={triggerMobileAdd}
                className="p-2 rounded-xl bg-primary text-black font-bold active:opacity-80"
              >
                <Plus className="w-4.5 h-4.5" />
              </button>
            )}

          </div>
        </header>

        {/* Dynamic Page Wrapper */}
        <main
          ref={mainRef}
          onScroll={handleScroll}
          className={`flex-1 bg-background select-none relative scrollbar-thin max-md:pb-16 ${
            pathname === '/pipeline' ? 'overflow-hidden flex flex-col' : 'overflow-y-auto'
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Fixed Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur-lg border-t border-border/40 flex justify-around items-center h-16 md:hidden safe-bottom">
        {[
          { name: 'Home', href: '/dashboard', icon: LayoutDashboard },
          { name: 'Pipeline', href: '/pipeline', icon: Kanban },
          { name: 'Contatos', href: '/contacts', icon: Users },
          { name: 'Bússola', href: '/bussola', icon: Compass },
          { name: 'Menu', href: '#menu', icon: Menu }
        ].map((tab) => {
          const Icon = tab.icon
          const isActive = pathname === tab.href || (tab.href === '#menu' && menuSheetOpen)
          return (
            <button
              key={tab.name}
              onClick={() => {
                if (tab.href === '#menu') {
                  setMenuSheetOpen(!menuSheetOpen)
                } else {
                  setMenuSheetOpen(false)
                  router.push(tab.href)
                }
              }}
              className={`flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all ${
                isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-semibold mt-0.5">{tab.name}</span>
            </button>
          )
        })}
      </div>

      {/* Menu Bottom Sheet (Mobile) */}
      {menuSheetOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-card backdrop-blur-sm" onClick={() => setMenuSheetOpen(false)} />
          <div className="fixed inset-x-0 bottom-0 bg-popover border-t border-border/40 rounded-t-3xl p-6 flex flex-col space-y-4 max-h-[70vh] overflow-y-auto mobile-bottom-sheet">
            
            {/* Sheet Handle */}
            <div className="flex justify-center shrink-0 -mt-2 mb-2">
              <div className="w-12 h-1.5 rounded-full bg-border" />
            </div>

            <div className="flex items-center justify-between pb-3 border-b border-border/20 shrink-0">
              <h3 className="text-sm font-extrabold text-foreground uppercase tracking-wider">Mais Opções</h3>
              <button
                onClick={() => setMenuSheetOpen(false)}
                className="p-1 rounded bg-muted text-xs text-muted-foreground"
              >
                Fechar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3.5 py-2">
              {[
                { name: 'Caixa Rápido', href: '/caixa-rapido', icon: Zap },
                { name: 'Busca de Leads', href: '/lead-search', icon: Search },
                { name: 'Cadências', href: '/cadencias', icon: Workflow },
                { name: 'Arquivados', href: '/arquivados', icon: Archive },
                { name: 'Atividades', href: '/activities', icon: Calendar },
                { name: 'Configurações', href: '/settings', icon: Settings }
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuSheetOpen(false)}
                    className="flex flex-col items-center justify-center p-4 rounded-2xl bg-muted border border-border/20 hover:border-primary/20 text-center space-y-2 group active:bg-muted/80"
                  >
                    <Icon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-xs font-bold text-foreground">{item.name}</span>
                  </Link>
                )
              })}
            </div>

            <div className="border-t border-border/25 pt-4 flex flex-col gap-2 shrink-0">
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border/20 bg-muted/40">
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center font-bold text-xs text-primary border border-primary/20">
                  {user.nome[0]}{user.sobrenome[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{user.nome} {user.sobrenome}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{user.teamName}</p>
                </div>
                <button
                  onClick={async () => {
                    await fetch('/api/auth/logout', { method: 'POST' })
                    setMenuSheetOpen(false)
                    router.push('/auth')
                    router.refresh()
                  }}
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-secondary transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-4.5 h-4.5 text-rose-500" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Mobile Drawer Navigation (Fallback for menu open if needed, but not used since bottom tab covers it) */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="fixed inset-0 bg-card backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-64 bg-background border-r border-border animate-slide-up">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg hover:bg-secondary"
            >
              <X className="w-5 h-5" />
            </button>
            <SidebarContent user={user} onItemClick={() => setMobileMenuOpen(false)} />
          </div>
        </div>
      )}

      {/* Global Search Dialog */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 max-md:pt-16 max-md:px-2">
          <div className="fixed inset-0 bg-card backdrop-blur-md" onClick={() => setSearchOpen(false)} />
          <div className="w-full max-w-lg rounded-2xl border border-border/80 bg-popover p-4 shadow-2xl z-10 ocr-glass-strong animate-scale-in max-md:max-h-[80vh] flex flex-col">
            {/* Search Input */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/40 focus-within:border-primary transition-all shrink-0">
              <Search className="w-5 h-5 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar contatos, negociações ou telefones..."
                className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-muted-foreground"
              />
              <button
                onClick={() => setSearchOpen(false)}
                className="p-1.5 rounded bg-muted text-[10px] text-muted-foreground font-mono"
              >
                ESC
              </button>
            </div>

            {/* Results */}
            {searchQuery.trim() ? (
              <div className="mt-4 space-y-4 overflow-y-auto scrollbar-thin flex-1">
                {/* Contacts Section */}
                {searchResults.contacts.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 px-2">Contatos</h3>
                    <div className="space-y-1">
                      {searchResults.contacts.map(c => (
                        <button
                          key={c.id}
                          onClick={() => handleSearchResultClick('contact', c.id)}
                          className="flex items-center justify-between w-full p-2.5 rounded-lg text-left text-xs hover:bg-primary/10 hover:text-primary transition-all group"
                        >
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-primary">{c.nome} {c.sobrenome}</span>
                            <span className="block text-[10px] text-muted-foreground">{c.telefone}</span>
                          </div>
                          {c.cidade && (
                            <span className="text-[10px] text-muted-foreground">{c.cidade} / {c.estado}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Deals Section */}
                {searchResults.deals.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1 px-2">Negociações</h3>
                    <div className="space-y-1">
                      {searchResults.deals.map(d => (
                        <button
                          key={d.id}
                          onClick={() => handleSearchResultClick('deal', d.id)}
                          className="flex items-center justify-between w-full p-2.5 rounded-lg text-left text-xs hover:bg-primary/10 hover:text-primary transition-all group"
                        >
                          <div>
                            <span className="font-semibold text-foreground group-hover:text-primary">{d.titulo}</span>
                            <span className="block text-[10px] text-muted-foreground">Produto: {d.produtoInteresse ?? 'Não informado'}</span>
                          </div>
                          <span className="font-semibold text-foreground group-hover:text-primary font-mono">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(d.valorEstimado)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.contacts.length === 0 && searchResults.deals.length === 0 && (
                  <p className="text-center text-xs text-muted-foreground py-4">Nenhum resultado encontrado para &quot;{searchQuery}&quot;</p>
                )}
              </div>
            ) : (
              <div className="mt-4 text-center text-xs text-muted-foreground py-6 select-none flex-1">
                Digite um nome, telefone, email ou produto para pesquisar.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

