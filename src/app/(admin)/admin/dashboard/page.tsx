'use client'

import { useState, useEffect } from 'react'
import {
    Users,
    Video,
    TrendingUp,
    Activity,
    ArrowUpRight,
    Clock,
    LayoutGrid,
    Target,
} from 'lucide-react'
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts'
import { formatDateTime, getStatusColor, getStatusLabel, cn } from '@/lib/utils'

interface Stats {
    totalUsers: number
    videosThisMonth: number
    videosToday: number
    totalQuotaConsumed: number
}

interface VideoActivity {
    id: string
    nome_produto: string
    status: string
    created_at: string
    user_nome: string | null
}

// Generate last 30 days data
function generateChartData() {
    const data = []
    for (let i = 29; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        data.push({
            date: date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
            videos: Math.floor(Math.random() * 15) + 1,
        })
    }
    return data
}

const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-white border border-surface-200 rounded-[20px] px-6 py-4 shadow-xl animate-fade-in">
                <p className="text-[10px] font-black text-text-muted uppercase tracking-widest">{label}</p>
                <p className="text-xl font-black text-primary mt-1">
                    {payload[0].value} <span className="text-sm">Vids</span>
                </p>
            </div>
        )
    }
    return null
}

export default function AdminDashboardPage() {
    const [stats, setStats] = useState<Stats>({
        totalUsers: 0,
        videosThisMonth: 0,
        videosToday: 0,
        totalQuotaConsumed: 0,
    })
    const [recentVideos, setRecentVideos] = useState<VideoActivity[]>([])
    const [topUsers, setTopUsers] = useState<Array<{ nome: string; total: number }>>([])
    const [chartData] = useState(generateChartData())
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        async function loadData() {
            setIsLoading(true)
            try {
                const response = await fetch('/api/admin/dashboard-stats')
                if (response.ok) {
                    const data = await response.json()
                    setStats(data.stats)
                    setRecentVideos(data.recentVideos)
                    setTopUsers(data.topUsers)
                }
            } finally {
                setIsLoading(false)
            }
        }
        loadData()
    }, [])

    const metricCards = [
        {
            label: 'Active Creators',
            value: stats.totalUsers,
            icon: Users,
            color: 'text-blue-500',
            bg: 'bg-blue-50',
            change: '+12%',
        },
        {
            label: 'Monthly Blooms',
            value: stats.videosThisMonth,
            icon: Video,
            color: 'text-primary',
            bg: 'bg-primary/5',
            change: '+8%',
        },
        {
            label: 'Today Blooms',
            value: stats.videosToday,
            icon: TrendingUp,
            color: 'text-emerald-500',
            bg: 'bg-emerald-50',
            change: '+3%',
        },
        {
            label: 'Total Resource',
            value: stats.totalQuotaConsumed,
            icon: Activity,
            color: 'text-purple-500',
            bg: 'bg-purple-50',
            change: '+5%',
        },
    ]

    return (
        <main className="flex-1 p-8 lg:p-12 bg-surface-50 min-h-screen">
            <div className="max-w-7xl mx-auto flex flex-col gap-12">
                <header>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary text-white text-[10px] font-black uppercase tracking-widest mb-4 shadow-lg shadow-primary/20">
                        <ShieldCheck className="w-3 h-3" />
                        Administrator
                    </div>
                    <h1 className="text-4xl font-black text-text-primary tracking-tight">System Pulse</h1>
                    <p className="text-text-muted mt-2 font-medium">Real-time overview of the Pétalas ecosystem.</p>
                </header>

                {/* Metric Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
                    {metricCards.map((card, i) => {
                        const Icon = card.icon
                        return (
                            <div key={card.label} className="bg-white border border-surface-200 rounded-[32px] p-8 shadow-sm hover:shadow-premium transition-all group animate-fade-in-up" style={{ animationDelay: `${i * 100}ms` }}>
                                <div className="flex items-start justify-between">
                                    <div className="space-y-4">
                                        <p className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                                            {card.label}
                                        </p>
                                        <p className="text-4xl font-black text-text-primary mt-2">
                                            {isLoading ? (
                                                <span className="w-16 h-8 bg-surface-100 rounded-xl animate-pulse inline-block" />
                                            ) : (
                                                card.value.toLocaleString()
                                            )}
                                        </p>
                                    </div>
                                    <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-transform group-hover:rotate-6", card.bg, card.color)}>
                                        <Icon className="w-6 h-6" />
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 mt-6">
                                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-500">
                                        <ArrowUpRight className="w-3 h-3" />
                                        <span className="text-[10px] font-black">{card.change}</span>
                                    </div>
                                    <span className="text-[10px] text-text-muted font-bold uppercase tracking-wider">vs last month</span>
                                </div>
                            </div>
                        )
                    })}
                </div>

                {/* Charts */}
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                    {/* Line Chart */}
                    <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm xl:col-span-2 flex flex-col gap-8">
                        <div className="flex items-center justify-between">
                            <h2 className="text-xl font-black text-text-primary">Bloom Velocity</h2>
                            <div className="flex items-center gap-2 text-[10px] font-black text-text-muted uppercase tracking-widest">
                                <Clock className="w-3 h-3" />
                                LAST 30 DAYS
                            </div>
                        </div>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="date"
                                        stroke="#94a3b8"
                                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                        interval={4}
                                    />
                                    <YAxis
                                        stroke="#94a3b8"
                                        tick={{ fill: '#94a3b8', fontSize: 10, fontWeight: 700 }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#6B21A8', strokeWidth: 1 }} />
                                    <Line
                                        type="monotone"
                                        dataKey="videos"
                                        stroke="#6B21A8"
                                        strokeWidth={4}
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#6B21A8', strokeWidth: 4, stroke: '#fff' }}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Bar chart - Top users */}
                    <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-8">
                        <h2 className="text-xl font-black text-text-primary">Top Bloomers</h2>
                        {topUsers.length > 0 ? (
                            <div className="h-[300px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={topUsers} layout="vertical" margin={{ left: 0, right: 20 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            type="category"
                                            dataKey="nome"
                                            stroke="#94a3b8"
                                            tick={{ fill: '#1e293b', fontSize: 10, fontWeight: 800 }}
                                            tickLine={false}
                                            axisLine={false}
                                            width={100}
                                        />
                                        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
                                        <Bar dataKey="total" fill="#6B21A8" radius={[0, 12, 12, 0]} barSize={24} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-text-muted gap-4">
                                <Target className="w-10 h-10 opacity-10" />
                                <p className="text-sm font-bold">No data yet</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Recent Activity Table */}
                <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-8">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-black text-text-primary">Live Activity</h2>
                        <div className="w-10 h-10 rounded-2xl bg-surface-50 text-text-muted flex items-center justify-center">
                            <Clock className="w-5 h-5" />
                        </div>
                    </div>

                    {recentVideos.length === 0 && !isLoading ? (
                        <div className="text-center py-20 flex flex-col items-center gap-4">
                            <Video className="w-16 h-16 text-surface-200" />
                            <p className="text-text-muted font-bold">The garden is quiet. No blooms yet.</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-surface-100">
                                        <th className="text-left py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Product / Piece</th>
                                        <th className="text-left py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Creator</th>
                                        <th className="text-left py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Timestamp</th>
                                        <th className="text-right py-4 text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-surface-50">
                                    {recentVideos.map((video) => (
                                        <tr key={video.id} className="hover:bg-surface-50/50 transition-colors">
                                            <td className="py-6 font-black text-text-primary text-sm">
                                                {video.nome_produto}
                                            </td>
                                            <td className="py-6 text-sm font-bold text-text-secondary">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/5 text-primary flex items-center justify-center text-[10px] font-black">
                                                        {video.user_nome ? video.user_nome.charAt(0) : '?'}
                                                    </div>
                                                    {video.user_nome || 'Anonymous'}
                                                </div>
                                            </td>
                                            <td className="py-6 text-sm font-medium text-text-muted">
                                                {formatDateTime(video.created_at)}
                                            </td>
                                            <td className="py-6 text-right">
                                                <span
                                                    className={cn(
                                                        "px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                                                        video.status === 'concluido' ? 'bg-emerald-50 text-emerald-600' : 
                                                        video.status === 'processando' ? 'bg-primary/5 text-primary' : 
                                                        'bg-red-50 text-red-500'
                                                    )}
                                                >
                                                    {getStatusLabel(video.status)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </main>
    )
}

function ShieldCheck({ className }: { className?: string }) {
    return (
        <svg
            className={className}
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
        >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
            <path d="m9 12 2 2 4-4" />
        </svg>
    )
}

