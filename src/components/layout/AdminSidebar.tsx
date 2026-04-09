'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
    LayoutDashboard,
    Users,
    BarChart3,
    Monitor,
    Settings,
    LogOut,
    Menu,
    X,
    Shield,
    Sun,
    Moon,
} from 'lucide-react'
import { useSession, signOut } from 'next-auth/react'
import { cn, getInitials } from '@/lib/utils'
import { useTheme } from '@/components/providers/ThemeProvider'
import toast from 'react-hot-toast'

const navItems = [
    { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/usuarios', label: 'Usuários', icon: Users },
    { href: '/admin/cotas', label: 'Cotas', icon: BarChart3 },
    { href: '/admin/monitoramento', label: 'Monitoramento', icon: Monitor },
    { href: '/admin/configuracoes', label: 'Configurações', icon: Settings },
]

export function AdminSidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const [mobileOpen, setMobileOpen] = useState(false)
    const { data: session } = useSession()

    const admin = session?.user
        ? {
              nome: session.user.name || '',
              email: session.user.email || '',
              avatar_url: session.user.image || null,
          }
        : null

    const { theme, toggleTheme } = useTheme()

    const handleLogout = async () => {
        await signOut({ redirect: false })
        toast.success('Logout realizado')
        router.push('/login')
    }

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white">
            {/* Logo */}
            <div className="px-5 py-6 border-b border-surface-100">
                <Link href="/admin/dashboard" className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity">
                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
                        <Shield className="w-4 h-4 text-white" />
                    </div>
                    <div>
                        <span className="text-text-primary font-bold text-base tracking-tight block leading-none">
                            Pétalas
                        </span>
                        <span className="text-[10px] text-text-muted font-medium mt-0.5 block">
                            Admin Panel
                        </span>
                    </div>
                </Link>
            </div>

            {/* Navigation */}
            <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
                {navItems.map((item) => {
                    const Icon = item.icon
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileOpen(false)}
                            className={cn(isActive ? 'sidebar-item-active' : 'sidebar-item')}
                        >
                            <Icon className="w-4 h-4 flex-shrink-0" />
                            <span>{item.label}</span>
                        </Link>
                    )
                })}
            </nav>

            {/* Admin Footer */}
            {admin && (
                <div className="px-3 py-4 border-t border-surface-100">
                    <div className="flex items-center gap-3 px-2 py-2">
                        <div className="w-8 h-8 rounded-full bg-surface-100 flex items-center justify-center text-xs font-semibold text-text-muted flex-shrink-0">
                            {admin.avatar_url ? (
                                <img
                                    src={admin.avatar_url}
                                    alt={admin.nome}
                                    className="w-full h-full rounded-full object-cover"
                                />
                            ) : (
                                getInitials(admin.nome)
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-text-primary truncate leading-tight">{admin.nome}</p>
                            <p className="text-xs text-text-muted leading-tight">Administrador</p>
                        </div>
                        <button
                            onClick={toggleTheme}
                            className="p-1.5 text-text-muted hover:text-text-primary hover:bg-surface-100 rounded-lg transition-colors"
                            title={theme === 'dark' ? 'Modo claro' : 'Modo escuro'}
                            aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
                        >
                            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="p-1.5 text-text-muted hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Sair"
                            aria-label="Sair"
                        >
                            <LogOut className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    )

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-60 flex-shrink-0 self-stretch bg-white border-r border-surface-100">
                <div className="sticky top-0 h-screen flex flex-col overflow-y-auto">
                    <SidebarContent />
                </div>
            </aside>

            {/* Mobile Header */}
            <div className="lg:hidden fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 py-3 bg-white border-b border-surface-100">
                <Link href="/admin/dashboard" className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                    <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
                        <Shield className="w-4 h-4 text-white" />
                    </div>
                    <span className="text-text-primary font-bold text-base tracking-tight">
                        Pétalas
                    </span>
                    <span className="text-xs text-text-muted ml-1">Admin</span>
                </Link>
                <button
                    onClick={() => setMobileOpen(!mobileOpen)}
                    className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-100 transition-colors"
                >
                    {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
            </div>

            {mobileOpen && (
                <div
                    className="lg:hidden fixed inset-0 z-40 bg-black/20"
                    onClick={() => setMobileOpen(false)}
                />
            )}

            <aside
                className={cn(
                    'lg:hidden fixed top-0 left-0 h-full w-64 bg-white border-r border-surface-100 z-50 transition-transform duration-300',
                    mobileOpen ? 'translate-x-0' : '-translate-x-full'
                )}
            >
                <SidebarContent />
            </aside>
        </>
    )
}
