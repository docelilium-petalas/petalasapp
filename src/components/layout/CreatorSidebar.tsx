'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Video,
    Library,
    Users,
    MessageSquare,
    Settings,
    HelpCircle,
    LogOut,
    Menu,
    X,
    Bell,
    ChevronRight,
    Sparkles,
    UserCircle2,
    History,
} from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'

const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/criar', label: 'Video Creation', icon: Video, activeGlow: true },
    { href: '/biblioteca', label: 'Library', icon: Library },
    { href: '/crm', label: 'CRM', icon: Users },
    { href: '/contatos', label: 'Contacts', icon: UserCircle2 },
    { href: '/suporte', label: 'AI Support', icon: MessageSquare },
]

const bottomItems = [
    { href: '/configuracoes', label: 'Settings', icon: Settings },
    { href: '/ajuda', label: 'Help Center', icon: HelpCircle },
]

export function CreatorSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [mobileOpen, setMobileOpen] = useState(false)
    const { data: session } = useSession()

    const sessionUser = session?.user as any

    const user = sessionUser
        ? {
              nome: sessionUser.name || 'User',
              email: sessionUser.email || '',
              image: sessionUser.image || null,
              plan: sessionUser.plan || 'Pro Plan',
          }
        : null

    const handleLogout = async () => {
        await signOut({ redirect: false })
        toast.success('Sessão encerrada')
        router.push('/login')
    }

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-surface-50">
            {/* Logo Section */}
            <div className="p-8">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 flex-shrink-0">
                        <Sparkles className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-text-primary font-bold text-2xl tracking-tighter leading-none">
                            Luminous
                        </span>
                        <span className="text-[10px] text-text-muted font-bold uppercase tracking-widest mt-1">
                            Video AI & CRM
                        </span>
                    </div>
                </div>
            </div>

            {/* Main Navigation */}
            <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-hide">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                                isActive ? 'sidebar-item-active' : 'sidebar-item',
                                isActive && item.activeGlow && 'sidebar-active-glow'
                            )}
                        >
                            <div className={cn(
                                "p-2 rounded-lg transition-colors",
                                isActive ? "bg-primary text-white" : "bg-transparent group-hover:bg-primary/10"
                            )}>
                                <Icon className="w-5 h-5 flex-shrink-0" />
                            </div>
                            <span className="flex-1">{item.label}</span>
                            {isActive && !item.activeGlow && (
                                <div className="w-1.5 h-6 rounded-full bg-primary" />
                            )}
                            {isActive && item.activeGlow && (
                                <div className="w-1 h-8 rounded-full bg-primary absolute left-0" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Bottom Section */}
            <div className="p-4 border-t border-surface-200 mt-auto bg-surface-50/50">
                {/* User Workspace Info */}
                {user && (
                    <div className="mb-4 bg-white/60 p-3 rounded-2xl border border-surface-200 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                            {user.image ? (
                                <img
                                    src={user.image}
                                    alt={user.nome}
                                    className="w-full h-full rounded-full object-cover"
                                />
                            ) : (
                                <span className="text-primary text-xs font-bold">
                                    {getInitials(user.nome)}
                                </span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-text-primary truncate">Workspace</p>
                            <p className="text-[10px] text-text-muted truncate font-medium">{user.plan}</p>
                        </div>
                    </div>
                )}

                {/* Bottom Nav */}
                <div className="space-y-1 mb-4">
                    {bottomItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="flex items-center gap-3 px-4 py-2 rounded-xl text-text-muted hover:text-text-primary hover:bg-white/80 transition-all duration-200 text-sm font-medium"
                        >
                            <item.icon className="w-4 h-4" />
                            <span>{item.label}</span>
                        </Link>
                    ))}
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2 rounded-xl text-text-muted hover:text-red-600 hover:bg-red-50 transition-all duration-200 text-sm font-medium"
                    >
                        <LogOut className="w-4 h-4" />
                        <span>Logout</span>
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-72 bg-surface-50 border-r border-surface-200 h-screen sticky top-0 flex-shrink-0 z-40">
                <SidebarContent />
            </aside>

            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-white/95 backdrop-blur-md border-b border-surface-200 shadow-sm">
                <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/10">
                        <Sparkles className="w-5 h-5 text-white" />
                    </div>
                    <span className="text-text-primary font-bold text-xl tracking-tighter">
                        Luminous
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <button className="p-2 text-text-muted hover:text-primary transition-colors relative">
                        <History className="w-5 h-5" />
                    </button>
                    <button className="p-2 text-text-muted hover:text-primary transition-colors relative">
                        <Bell className="w-5 h-5" />
                        <div className="notification-dot" />
                    </button>
                    <button
                        onClick={() => setMobileOpen(!mobileOpen)}
                        className="p-2 text-text-muted hover:text-primary transition-colors"
                    >
                        {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                    </button>
                </div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-text-primary/20 backdrop-blur-sm transition-all duration-300"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={cn(
                    'lg:hidden fixed top-0 left-0 h-full w-80 bg-white border-r border-surface-200 z-50 transition-transform duration-500 cubic-bezier(0.4, 0, 0.2, 1)',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <SidebarContent />
            </aside>
        </>
    )
}

