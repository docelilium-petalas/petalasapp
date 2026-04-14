'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
    Video,
    UserPlus,
    DollarSign,
    ArrowUpRight,
    Plus,
    Zap,
    MoreHorizontal,
    Sparkles,
    ArrowRight,
    FileVideo,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDashboardStats } from './actions'
import toast from 'react-hot-toast'

export default function DashboardPage() {
    const [isLoading, setIsLoading] = useState(true)
    const [data, setData] = useState<any>(null)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const stats = await getDashboardStats()
                setData(stats)
            } catch {
                toast.error('Erro ao carregar dados do painel')
            } finally {
                setIsLoading(false)
            }
        }
        fetchData()
    }, [])

    if (isLoading) {
        return (
            <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
                {/* Header skeleton */}
                <div className="flex items-center justify-between">
                    <div className="space-y-2">
                        <div className="shimmer h-7 w-40 rounded-lg" />
                        <div className="shimmer h-4 w-56 rounded" />
                    </div>
                    <div className="shimmer h-10 w-32 rounded-lg" />
                </div>
                {/* Metric cards skeleton */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="metric-card space-y-3">
                            <div className="shimmer h-10 w-10 rounded-lg" />
                            <div className="space-y-1.5">
                                <div className="shimmer h-3 w-24 rounded" />
                                <div className="shimmer h-7 w-16 rounded" />
                            </div>
                            <div className="shimmer h-3 w-12 rounded" />
                        </div>
                    ))}
                </div>
                {/* Chart skeleton */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                    <div className="lg:col-span-8 card">
                        <div className="shimmer h-5 w-48 rounded mb-6" />
                        <div className="flex items-end gap-2 h-48">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                                    <div className="shimmer w-full rounded-t-md" style={{ height: `${30 + Math.random() * 60}%` }} />
                                    <div className="shimmer h-2.5 w-6 rounded" />
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="lg:col-span-4 space-y-4">
                        <div className="card shimmer h-32" />
                        <div className="card">
                            <div className="shimmer h-5 w-36 rounded mb-4" />
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div key={i} className="flex gap-3 mb-4">
                                    <div className="shimmer w-7 h-7 rounded-full flex-shrink-0" />
                                    <div className="flex-1 space-y-1.5">
                                        <div className="shimmer h-3.5 w-full rounded" />
                                        <div className="shimmer h-3 w-2/3 rounded" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const metrics = data?.metrics || [
        { label: 'Vídeos Gerados', value: '0', change: '0%', status: 'neutral' },
        { label: 'Leads Ativos', value: '0', change: '0%', status: 'neutral' },
        { label: 'Valor do Funil', value: 'R$ 0,00', change: '0%', status: 'neutral' },
        { label: 'Integrações', value: '0', change: 'Ativas', status: 'neutral' },
    ]

    const chartData = data?.chartData || []

    const iconConfigs = [
        { icon: Video, bg: 'bg-primary-tint', color: 'text-primary-var' },
        { icon: UserPlus, bg: 'bg-primary-tint', color: 'text-primary-var' },
        { icon: DollarSign, bg: 'bg-primary-tint', color: 'text-primary-var' },
        { icon: Zap, bg: 'bg-primary-tint', color: 'text-primary-var' },
    ]

    return (
        <div className="p-8 space-y-10 max-w-[1400px] mx-auto animate-fade-in">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-baseline md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-semibold text-text-primary italic font-display">Dashboard</h1>
                    <p className="text-text-muted text-xs uppercase tracking-[0.2em] font-bold mt-2">
                        Visão Geral
                    </p>
                </div>
                <Link
                    href="/criar"
                    className="btn-primary px-8"
                >
                    <Plus className="w-4 h-4 mr-1" />
                    Novo Vídeo
                </Link>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((metric: any, i: number) => {
                    const cfg = iconConfigs[i] || iconConfigs[0]
                    const Icon = cfg.icon
                    return (
                        <div key={metric.label} className="metric-card group">
                            <div className="flex items-center justify-between">
                                <Icon className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors" />
                                {metric.status === 'up' && (
                                    <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                                        <ArrowUpRight className="w-3 h-3" />
                                        <span className="text-[10px] font-bold">{metric.change}</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-xs font-bold uppercase tracking-[0.15em] text-text-muted mb-2">{metric.label}</p>
                                <p className="text-4xl font-bold tracking-tight text-text-primary">
                                    {metric.value}
                                </p>
                            </div>
                        </div>
                    )
                })}
            </div>

            {/* Main section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Chart */}
                <div className="lg:col-span-8">
                    <div className="card h-full flex flex-col p-8">
                        <div className="flex items-center justify-between mb-10">
                            <div>
                                <h2 className="text-xl font-semibold font-display italic">Geração de Conteúdo</h2>
                                <p className="text-text-muted text-xs uppercase tracking-widest font-bold mt-1">
                                    Performance Mensal
                                </p>
                            </div>
                        </div>

                        {chartData.length === 0 || chartData.every((d: any) => d.count === 0) ? (
                            <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] gap-4 bg-bg-subtle/50 rounded-2xl border border-dashed border-primary/20">
                                <Sparkles className="w-8 h-8 text-primary/30" />
                                <p className="text-sm font-medium text-text-secondary">Pronto para começar sua coleção?</p>
                                <Link href="/criar" className="btn-secondary text-[10px] px-6">
                                    CRIAR PRIMEIRA PEÇA
                                </Link>
                            </div>
                        ) : (
                            <div className="flex-1 flex items-end gap-3 pb-4 min-h-[300px]">
                                {chartData.map((d: any) => (
                                    <div
                                        key={d.month}
                                        className="flex-1 flex flex-col items-center gap-4 group"
                                    >
                                        <div className="w-full relative h-[240px] flex items-end">
                                            <div
                                                className="w-full bg-primary/80 group-hover:bg-primary transition-all duration-300 rounded-t-sm"
                                                style={{ height: `${Math.max(d.val, d.count > 0 ? 5 : 0)}%` }}
                                            />
                                            {/* Hover value tooltip */}
                                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-text-primary text-white text-[10px] px-2 py-1 rounded font-bold">
                                                {d.count}
                                            </div>
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                                            {d.month}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Right column */}
                <div className="lg:col-span-4 space-y-6">
                    {/* AI insight */}
                    <div className="card border-l-[3px] border-l-primary bg-bg-subtle p-8">
                        <div className="flex items-center gap-2 mb-4">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <span className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Insight</span>
                        </div>
                        <p className="text-sm text-text-secondary leading-relaxed font-medium italic">
                            {data?.metrics?.[1]?.value === '0'
                                ? '"O sucesso do acervo começa com a curadoria dos contatos."'
                                : `Seu estudo aponta ${data?.metrics?.[1]?.value} leads com alto potencial de engajamento para a nova coleção.`}
                        </p>
                        <Link
                            href="/crm"
                            className="inline-flex items-center gap-2 text-primary font-bold text-[10px] uppercase tracking-widest mt-6 group"
                        >
                            Acessar Dashboard CRM
                            <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                        </Link>
                    </div>

                    {/* Recent activity */}
                    <div className="card p-8">
                        <div className="flex items-center justify-between mb-8">
                            <div>
                                <h2 className="text-lg font-semibold font-display italic">Atividade Recente</h2>
                                <p className="text-text-muted text-[10px] uppercase tracking-widest font-bold">Journal</p>
                            </div>
                        </div>
                        <div className="space-y-6">
                            {(data?.recentActivity || []).length === 0 ? (
                                <div className="text-center py-10 opacity-30">
                                    <Video className="w-8 h-8 mx-auto mb-2" />
                                    <p className="text-[10px] uppercase tracking-widest font-bold">Sem registros hoje</p>
                                </div>
                            ) : (
                                data?.recentActivity.map((act: any) => (
                                    <div key={act.id} className="flex gap-4 items-start">
                                        <div className="w-8 h-8 rounded-full bg-primary/5 flex items-center justify-center text-[10px] font-bold text-primary border border-primary/10 flex-shrink-0">
                                            {act.avatar}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm text-text-secondary leading-tight">
                                                <span className="font-bold text-text-primary">
                                                    {act.user}
                                                </span>{' '}
                                                {act.action}
                                            </p>
                                            <p className="text-[10px] text-text-muted mt-1 uppercase tracking-wider font-semibold">
                                                {act.target}
                                            </p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
