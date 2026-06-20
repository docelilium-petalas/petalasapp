'use client'

import React, { useState } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { Search, Tag } from 'lucide-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import BuscarLeadsTab from './_components/BuscarLeadsTab'
import GestaoNichosTab from './_components/GestaoNichosTab'

type TabType = 'buscar' | 'nichos'

export default function LeadSearchPage() {
  const [activeTab, setActiveTab] = useState<TabType>('buscar')
  const [queryClient] = useState(() => new QueryClient())

  return (
    <QueryClientProvider client={queryClient}>
      <AppLayout>
      <div className="flex flex-col h-full bg-background">
        {/* Header Tabs */}
        <div className="px-6 pt-6 pb-0 border-b border-border/20 shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setActiveTab('buscar')}
              className={`pb-4 px-2 text-sm font-bold tracking-wide transition-all border-b-2 relative ${
                activeTab === 'buscar'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4" />
                Buscar Leads (Google Maps)
              </div>
            </button>
            <button
              onClick={() => setActiveTab('nichos')}
              className={`pb-4 px-2 text-sm font-bold tracking-wide transition-all border-b-2 relative ${
                activeTab === 'nichos'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4" />
                Gestão de Nichos
              </div>
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
          {activeTab === 'buscar' && <BuscarLeadsTab />}
          {activeTab === 'nichos' && <GestaoNichosTab />}
        </div>
      </div>
    </AppLayout>
    </QueryClientProvider>
  )
}
