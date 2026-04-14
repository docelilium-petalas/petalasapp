'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Video,
    Library,
    Users,
    Settings,
    LogOut,
    Menu,
    X,
    Kanban,
    Sun,
    Moon,
    Calendar,
} from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { cn, getInitials, getAvatarColor } from '@/lib/utils'
import { useTheme } from '@/components/providers/ThemeProvider'
import { Logo } from '@/components/ui/Logo'
import { ImageWithFallback } from '@/components/ui/ImageWithFallback'
import toast from 'react-hot-toast'

const navItems = [
    { href: '/dashboard', label: 'Início', icon: LayoutDashboard },
    { href: '/pipeline', label: 'Pipeline', icon: Kanban },
    { href: '/crm', label: 'Audiência', icon: Users },
    { href: '/agenda', label: 'Estratégia', icon: Calendar },
    { href: '/criar', label: 'Ateliê', icon: Video },
    { href: '/biblioteca', label: 'Acervo', icon: Library },
    { href: '/configuracoes', label: 'Ajustes', icon: Settings },
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
              plan: sessionUser.plan || 'Membro Studio',
          }
        : null

    const { theme, toggleTheme } = useTheme()

    const handleLogout = async () => {
        await signOut({ redirect: false })
        toast.success('Sessão encerrada')
        router.push('/login')
    }

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white">
            {/* Logo */}
            <div className="px-6 py-10 flex justify-center">
                <Link href="/dashboard" className="cursor-pointer group relative flex justify-center w-full min-h-[160px]">
                    <ImageWithFallback 
                        src="/images/logo.png" 
                        alt="" 
                        className="absolute inset-0 w-full h-full object-contain z-10 transition-transform duration-500 group-hover:scale-105" 
                    />
                    <Logo className="w-full transition-transform duration-500 group-hover:scale-105" />
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-6 py-4 space-y-2 overflow-y-auto no-scrollbar">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive =
                        pathname === item.href ||
                        (item.href !== '/dashboard' && pathname.startsWith(item.href))

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(
                                'group relative px-6 py-3.5 rounded-2xl flex items-center gap-4 transition-all duration-300',
                                isActive 
                                    ? 'bg-primary text-white shadow-glow translate-x-1' 
                                    : 'text-text-muted hover:bg-bg-subtle/50 hover:text-primary'
                            )}
                        >
                            <Icon className={cn("w-4.5 h-4.5 flex-shrink-0 transition-transform duration-300 group-hover:scale-110", isActive ? "text-white" : "text-primary/40 group-hover:text-primary")} />
                            <span className="uppercase tracking-[0.15em] text-[10px] font-bold">{item.label}</span>
                            {isActive && (
                                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-white rounded-r-full" />
                            )}
                        </Link>
                    )
                })}
            </nav>

            {/* Footer */}
            <div className="px-6 py-8 border-t border-primary/5 bg-bg-subtle/10">
                {user && (
                    <div className="flex items-center gap-4 px-2 py-3 mb-6 bg-white rounded-3xl shadow-soft border border-primary/5 group transition-all hover:border-primary/20">
                        <div
                            className={cn(
                                'w-10 h-10 rounded-2xl flex items-center justify-center text-xs font-bold flex-shrink-0 overflow-hidden bg-primary/10 text-primary shadow-inner transition-transform group-hover:scale-105'
                            )}
                        >
                            {user.image ? (
                                <img
                                    src={user.image}
                                    alt={user.nome}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                getInitials(user.nome)
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-text-primary truncate leading-tight uppercase tracking-wider">
                                {user.nome}
                            </p>
                            <div className="flex items-center gap-1.5 mt-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-glow animate-pulse" />
                                <span className="text-[8px] uppercase tracking-widest text-primary font-black opacity-60 font-sans">{user.plan}</span>
                            </div>
                        </div>
                    </div>
                )}
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleLogout}
                        className="group flex-1 h-12 rounded-2xl border border-primary/5 bg-white flex items-center justify-center gap-3 text-text-muted hover:text-primary hover:border-primary/20 hover:shadow-soft transition-all duration-300"
                    >
                        <LogOut className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                        <span className="text-[9px] uppercase tracking-widest font-black">Sair</span>
                    </button>
                    <button
                        onClick={toggleTheme}
                        className="w-12 h-12 rounded-2xl bg-white border border-primary/5 flex items-center justify-center text-text-muted hover:text-primary hover:border-primary/20 hover:shadow-soft transition-all duration-300"
                        title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
                    >
                        {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                    </button>
                </div>
            </div>
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            {/* O <aside> se estica com a página (self-stretch) e carrega o bg/border em toda a altura.
                O div interno fica sticky+h-screen para manter a nav visível durante o scroll. */}
            <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 z-40 self-stretch border-r border-surface-100">
                <div className="sticky top-0 h-screen flex flex-col overflow-y-auto">
                    <SidebarContent />
                </div>
            </aside>

            {/* Mobile Header */}
            <div className="mobile-header lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3">
                <Link href="/dashboard" className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity">
                    <Logo className="h-10 w-10" />
                    <span className="text-lg italic font-display font-semibold text-primary">Doce Lilium</span>
                </Link>
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="p-2 text-text-muted hover:text-text-primary transition-colors rounded-lg hover:bg-surface-100"
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {/* Mobile Overlay */}
            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/20"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            {/* Mobile Sidebar */}
            <aside
                className={cn(
                    'lg:hidden fixed top-0 left-0 h-full w-64 border-r border-surface-100 z-50 transition-transform duration-300',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <SidebarContent />
            </aside>
        </>
    )
}
