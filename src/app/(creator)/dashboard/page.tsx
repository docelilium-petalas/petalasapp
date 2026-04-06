'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
    Video, 
    FileText, 
    UserPlus, 
    DollarSign, 
    ArrowUpRight, 
    Plus, 
    ArrowRight, 
    CheckCircle2,
    Sparkles,
    Search,
    ChevronDown,
    MoreHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'

const metrics = [
    { label: 'CREATED VIDEOS', value: '1.284', trend: '+12.5%', icon: Video, color: 'bg-primary/10 text-primary' },
    { label: 'HARD COPIES', value: '492', trend: 'Stable', icon: FileText, color: 'bg-blue-500/10 text-blue-500' },
    { label: 'CAPTURED LEADS', value: '8.102', trend: '+24.1%', icon: UserPlus, color: 'bg-accent/10 text-accent' },
    { label: 'ACTIVE DEALS', value: '156', trend: '+8.2%', icon: DollarSign, color: 'bg-blue-400/10 text-blue-400' },
]

const recentActivity = [
    { id: 1, type: 'video', title: "Video 'Summer Bloom' exported", time: "2 mins ago", detail: "High Quality", color: "bg-primary" },
    { id: 2, type: 'lead', title: "New Lead: Sarah Jenkins", time: "45 mins ago", detail: "From Landing Page", color: "bg-accent" },
    { id: 3, type: 'deal', title: "Deal closed: Green Valley Co.", time: "3 hours ago", detail: "$4,200.00", color: "bg-blue-500" },
    { id: 4, type: 'system', title: "AI Support: Prompt Refined", time: "5 hours ago", detail: "System Update", color: "bg-primary" },
]

export default function DashboardPage() {
    const [isLoading, setIsLoading] = useState(false) // Mock loading

    const chartData = [
        { month: 'JAN', val: 30, max: 100 },
        { month: 'FEB', val: 60, max: 100 },
        { month: 'MAR', val: 85, max: 100 },
        { month: 'APR', val: 40, max: 100 },
        { month: 'MAY', val: 75, max: 100 },
        { month: 'JUN', val: 95, max: 100 },
        { month: 'JUL', val: 55, max: 100 },
        { month: 'AUG', val: 70, max: 100 },
    ]

    return (
        <div className="p-8 space-y-10 max-w-[1400px] mx-auto animate-fade-in">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-5xl font-extrabold text-text-primary tracking-tight">
                        Hello, Manager
                    </h1>
                    <p className="text-text-muted mt-2 text-lg">
                        Welcome back to <span className="text-primary font-bold">Pétalas</span> dashboard. Your content is blooming.
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-accent/5 border border-accent/20 px-4 py-2 rounded-full flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <span className="text-accent text-[10px] font-black uppercase tracking-widest">AI Status: Optimal</span>
                    </div>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {metrics.map((metric, i) => (
                    <div key={metric.label} className="bg-white p-6 rounded-3xl border border-surface-200 shadow-sm hover:shadow-md transition-all duration-300 group">
                        <div className="flex items-center justify-between mb-8">
                            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 duration-500", metric.color)}>
                                <metric.icon className="w-6 h-6" />
                            </div>
                        </div>
                        <p className="text-[10px] font-black text-text-muted uppercase tracking-widest leading-none mb-2">{metric.label}</p>
                        <h3 className="text-4xl font-extrabold text-text-primary tracking-tighter mb-2">{metric.value}</h3>
                        <div className="flex items-center gap-1.5">
                            {metric.trend.includes('+') ? (
                                <ArrowUpRight className="w-4 h-4 text-emerald-500" />
                            ) : null}
                            <span className={cn(
                                "text-sm font-bold",
                                metric.trend.includes('+') ? "text-emerald-500" : "text-text-muted"
                            )}>
                                {metric.trend}
                            </span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Content Mid Section */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Column: Chart */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="bg-white p-8 rounded-3xl border border-surface-200 shadow-sm relative overflow-hidden h-full flex flex-col">
                        <div className="flex items-center justify-between mb-12">
                            <div>
                                <h2 className="text-2xl font-extrabold text-text-primary tracking-tight">Monthly Content Generation</h2>
                                <p className="text-text-muted text-sm mt-1 font-medium">Total distribution across all platforms</p>
                            </div>
                            <div className="flex bg-surface-100 p-1 rounded-xl gap-1">
                                <button className="px-5 py-1.5 rounded-lg text-xs font-bold text-text-muted hover:bg-white hover:text-text-primary transition-all">Video</button>
                                <button className="px-5 py-1.5 rounded-lg text-xs font-bold bg-primary text-white shadow-md">All Assets</button>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="flex-1 flex items-end justify-between gap-2 px-2 pb-6 min-h-[300px]">
                            {chartData.map((d) => (
                                <div key={d.month} className="flex-1 flex flex-col items-center gap-4 group">
                                    <div className="w-full relative h-64 bg-surface-50 rounded-2xl overflow-hidden cursor-pointer hover:bg-surface-100/80 transition-colors">
                                        <div 
                                            className="absolute bottom-0 left-0 right-0 bg-primary/70 rounded-t-xl group-hover:bg-primary transition-all duration-700 ease-out"
                                            style={{ height: `${d.val}%` }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-black text-text-muted tracking-widest">{d.month}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Quick Start Button (From design layout) */}
                    <Link href="/criar" className="block p-4 bg-primary/10 border border-primary/20 rounded-2xl group hover:bg-primary/15 transition-all">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-white shadow-lg shadow-primary/20 group-hover:scale-110 transition-transform">
                                <Plus className="w-5 h-5" />
                            </div>
                            <span className="font-bold text-primary">Create New Video</span>
                        </div>
                    </Link>
                </div>

                {/* Right Column: AI & Activity */}
                <div className="lg:col-span-4 space-y-6">
                    {/* AI Suggestion Panel */}
                    <div className="bg-primary p-8 rounded-3xl text-white shadow-xl shadow-primary/20 relative overflow-hidden group">
                        <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
                        <div className="relative z-10">
                            <div className="flex items-center gap-2 mb-8 opacity-80">
                                <Sparkles className="w-5 h-5" />
                                <span className="text-[10px] font-black uppercase tracking-widest">AI Suggestion</span>
                            </div>
                            <h3 className="text-3xl font-extrabold tracking-tight mb-8 leading-[1.1]">
                                You have 4 leads likely to close this week.
                            </h3>
                            <button className="w-full bg-white/20 backdrop-blur-md border border-white/30 text-white rounded-2xl py-3 text-sm font-bold hover:bg-white hover:text-primary transition-all active:scale-95">
                                Review Smart List
                            </button>
                        </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="bg-white p-8 rounded-3xl border border-surface-200 shadow-sm">
                        <div className="flex items-center justify-between mb-8">
                            <h2 className="text-xl font-extrabold text-text-primary tracking-tight">Recent Activity</h2>
                            <MoreHorizontal className="w-5 h-5 text-text-muted cursor-pointer" />
                        </div>
                        <div className="space-y-6">
                            {recentActivity.map((act) => (
                                <div key={act.id} className="flex gap-4 group">
                                    <div className="relative flex flex-col items-center">
                                        <div className={cn("w-2.5 h-2.5 rounded-full z-10 mt-1.5 shadow-sm", act.color)} />
                                        <div className="w-[1px] flex-1 bg-surface-200 my-1 group-last:hidden" />
                                    </div>
                                    <div className="flex-1 pb-4 border-b border-surface-50 group-last:border-0">
                                        <p className="text-sm font-bold text-text-primary">{act.title}</p>
                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 font-medium">
                                            <span className="text-[10px] text-text-muted">{act.time}</span>
                                            <span className="text-[10px] text-text-muted/60">•</span>
                                            <span className="text-[10px] text-text-muted">{act.detail}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <button className="w-full mt-6 py-3 border-2 border-surface-100 rounded-2xl text-xs font-bold text-text-muted hover:bg-surface-50 hover:text-text-primary transition-all">
                            VIEW ALL ACTIVITY
                        </button>
                    </div>

                    {/* Featured Asset Card */}
                    <div className="relative rounded-3xl overflow-hidden h-64 group cursor-pointer">
                        <img 
                            src="https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000&auto=format&fit=crop" 
                            className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                            alt="Featured" 
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                        <div className="absolute bottom-6 left-6 right-6 text-white">
                            <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">Featured Asset</p>
                            <h4 className="text-xl font-extrabold tracking-tight leading-tight">Mastering AI Narrative Structures</h4>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

