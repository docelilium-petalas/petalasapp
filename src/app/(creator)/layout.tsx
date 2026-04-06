'use client'

import { type ReactNode } from 'react'
import { CreatorSidebar } from '@/components/layout/CreatorSidebar'
import { Search, Bell, History, Sparkles } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { getInitials } from '@/lib/utils'

export default function CreatorLayout({ children }: { children: ReactNode }) {
    const { data: session } = useSession()
    const user = session?.user as any

    return (
        <div className="flex min-h-screen bg-surface-50">
            {/* Sidebar */}
            <CreatorSidebar />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Navigation Bar - Only for Desktop, Mobile has it in Sidebar */}
                <header className="hidden lg:flex items-center justify-between px-8 py-4 bg-surface-50">
                    {/* Search Section */}
                    <div className="flex-1 max-w-2xl relative group">
                        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                            <Search className="w-4 h-4 text-text-muted transition-colors group-focus-within:text-primary" />
                        </div>
                        <input
                            type="text"
                            placeholder="Search across videos, leads, and assets..."
                            className="w-full bg-surface-100/50 border border-transparent focus:bg-white focus:border-primary/20 hover:bg-surface-100 text-sm py-2.5 pl-11 pr-4 rounded-full outline-none transition-all duration-300 shadow-sm focus:shadow-md"
                        />
                    </div>

                    {/* Actions Section */}
                    <div className="flex items-center gap-5 ml-8">
                        <div className="flex items-center gap-2">
                            <button className="p-2.5 text-text-muted hover:text-primary hover:bg-white rounded-full transition-all duration-200">
                                <Bell className="w-5 h-5" />
                            </button>
                            <button className="p-2.5 text-text-muted hover:text-primary hover:bg-white rounded-full transition-all duration-200">
                                <History className="w-5 h-5" />
                            </button>
                        </div>

                        <button className="bg-primary text-white text-sm font-bold px-6 py-2.5 rounded-xl hover:bg-primary-600 transition-all duration-200 shadow-lg shadow-primary/20 active:scale-95">
                            Upgrade
                        </button>

                        <div className="w-10 h-10 rounded-full border-2 border-white bg-surface-200 flex items-center justify-center overflow-hidden shadow-sm">
                            {user?.image ? (
                                <img src={user.image} alt={user.name} className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-text-muted text-xs font-bold">{getInitials(user?.name || 'U')}</span>
                            )}
                        </div>
                    </div>
                </header>

                <main className="flex-1 lg:overflow-y-auto">
                    <div className="pt-16 lg:pt-0">{children}</div>
                </main>
            </div>
        </div>
    )
}

