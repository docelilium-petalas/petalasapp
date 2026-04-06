'use client'

import { useState } from 'react'
import { 
    Plus, 
    MoreVertical, 
    Search, 
    ChevronRight, 
    Sparkles, 
    Zap, 
    CreditCard, 
    ChevronDown, 
    Filter,
    Calendar,
    Users,
    ArrowUpRight
} from 'lucide-react'
import { cn } from '@/lib/utils'

const columns = [
    { title: 'New Lead', count: 3, color: 'bg-blue-500' },
    { title: 'Qualified', count: 2, color: 'bg-primary' },
    { title: 'Proposal', count: 1, color: 'bg-accent' },
    { title: 'Converted', count: 4, color: 'bg-emerald-500' },
]

const cards = [
    { 
        id: 1, 
        column: 'New Lead', 
        title: 'Renovação Cloud Corp', 
        subtitle: 'Subscription renewal for Q3 2024', 
        value: '$12,400',
        badge: { label: 'AI ANALYSIS HIGH', type: 'accent' },
        avatar: 'https://i.pravatar.cc/150?u=1'
    },
    { 
        id: 2, 
        column: 'Qualified', 
        title: 'Consultoria Premium', 
        subtitle: 'Tailored AI implementation strategy', 
        value: '$8,200',
        insight: 'Decision maker visited pricing page 4 times today.',
        avatar: 'https://i.pravatar.cc/150?u=2',
        isStarred: true
    },
    { 
        id: 3, 
        column: 'Proposal', 
        title: 'Nexus Tech Global', 
        subtitle: 'Enterprise video suite 50 seats', 
        value: '$32,000',
        badge: { label: 'DRAFT SENT', type: 'primary' },
        avatar: 'https://i.pravatar.cc/150?u=3'
    },
    { 
        id: 4, 
        column: 'Converted', 
        title: 'Growth Partners', 
        subtitle: 'Annual strategic contract', 
        value: '$15,500',
        badge: { label: 'SUCCESS', type: 'emerald' },
        avatar: 'https://i.pravatar.cc/150?u=4'
    }
]

export default function CRMPage() {
    return (
        <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-fade-in">
            {/* Header / Breadcrumb */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-2 text-[10px] font-black text-text-muted tracking-widest uppercase mb-2">
                        CRM <ChevronRight className="w-3 h-3" /> SALES PIPELINE
                    </div>
                    <h1 className="text-5xl font-extrabold text-text-primary tracking-tight">
                        Revenue Funnel
                    </h1>
                </div>
                <button className="btn-primary px-8 py-3.5 shadow-xl shadow-primary/25">
                    <Plus className="w-5 h-5" />
                    New Deal
                </button>
            </div>

            {/* Pipeline Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {columns.map((col) => (
                    <div key={col.title} className="flex flex-col gap-6">
                        {/* Column Header */}
                        <div className="flex items-center justify-between group">
                            <div className="flex items-center gap-2">
                                <div className={cn("w-2 h-2 rounded-full", col.color)} />
                                <span className="font-bold text-text-primary">{col.title}</span>
                                <span className="bg-surface-100 text-text-muted text-[10px] font-black px-2 py-0.5 rounded-full">{col.count}</span>
                            </div>
                            <MoreVertical className="w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" />
                        </div>

                        {/* Cards in Column */}
                        <div className="space-y-4">
                            {cards
                                .filter(c => c.column === col.title)
                                .map(card => (
                                    <div key={card.id} className="bg-white p-6 rounded-3xl border border-surface-200 shadow-sm hover:shadow-lg hover:border-primary/20 transition-all duration-300 group cursor-pointer relative overflow-hidden">
                                        {card.isStarred && (
                                            <div className="absolute top-4 right-4 text-primary">
                                                <Sparkles className="w-4 h-4 fill-primary" />
                                            </div>
                                        )}
                                        
                                        {card.badge && (
                                            <div className={cn(
                                                "inline-block text-[8px] font-black px-2 py-0.5 rounded-full mb-4 tracking-widest",
                                                card.badge.type === 'accent' ? "bg-accent/10 text-accent border border-accent/20" : 
                                                card.badge.type === 'primary' ? "bg-primary/10 text-primary border border-primary/20" :
                                                "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                            )}>
                                                {card.badge.label}
                                            </div>
                                        )}

                                        <h3 className="font-extrabold text-text-primary text-sm tracking-tight mb-1 group-hover:text-primary transition-colors">{card.title}</h3>
                                        <p className="text-[10px] text-text-muted font-medium mb-6 line-clamp-2">{card.subtitle}</p>
                                        
                                        {card.insight && (
                                            <div className="bg-accent/5 p-4 rounded-2xl border border-accent/10 mb-6 group-hover:bg-accent/10 transition-colors">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <Sparkles className="w-3 h-3 text-accent" />
                                                    <span className="text-[9px] font-black text-accent uppercase tracking-widest">AI INSIGHT</span>
                                                </div>
                                                <p className="text-[9px] font-bold text-text-secondary leading-normal">{card.insight}</p>
                                            </div>
                                        )}

                                        <div className="flex items-center justify-between">
                                            <span className="text-lg font-black text-primary tracking-tighter">{card.value}</span>
                                            <div className="w-8 h-8 rounded-full border-2 border-white shadow-sm overflow-hidden">
                                                <img src={card.avatar} alt="Avatar" className="w-full h-full object-cover" />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Bottom Analysis & Value */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-8">
                {/* AI Analysis Box */}
                <div className="lg:col-span-8 bg-surface-100/50 p-10 rounded-[40px] border border-surface-200 flex flex-col md:flex-row items-center gap-12 group hover:bg-white transition-all duration-700">
                    <div className="flex-1 space-y-6">
                        <h2 className="text-4xl font-extrabold text-text-primary tracking-tight leading-none">
                            Identify High-Intent Leads with AI
                        </h2>
                        <p className="text-text-muted text-sm font-medium leading-relaxed max-w-md">
                            Our neural engine analyzed your last 50 conversions and found 3 leads in your 'Qualified' column with a 92% close probability.
                        </p>
                        <button className="bg-text-primary text-white px-8 py-4 rounded-full font-bold text-sm shadow-xl shadow-text-primary/20 hover:scale-105 active:scale-95 transition-all">
                            Run Deep Analysis
                        </button>
                    </div>
                    <div className="relative w-48 h-48 flex items-center justify-center">
                        <div className="absolute inset-0 rounded-full border-8 border-primary/10 group-hover:border-primary/20 transition-all duration-700" />
                        <div className="absolute inset-0 rounded-full border-t-8 border-primary group-hover:rotate-180 transition-all duration-1000 ease-in-out" />
                        <Zap className="w-12 h-12 text-primary shadow-primary" />
                    </div>
                </div>

                {/* Pipeline Value Box */}
                <div className="lg:col-span-4 bg-primary p-10 rounded-[40px] text-white flex flex-col justify-between shadow-2xl shadow-primary/30 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -mr-20 -mt-20 blur-3xl group-hover:bg-white/10 transition-all duration-700" />
                    <div className="relative z-10">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-80 mb-2">TOTAL PIPELINE VALUE</p>
                        <h2 className="text-6xl font-black tracking-tighter mb-8">$107,600</h2>
                        
                        <div className="flex items-center gap-4 mt-auto opacity-90 group-hover:opacity-100 transition-opacity translate-y-4">
                            <div className="flex -space-x-4">
                                <div className="w-10 h-10 rounded-full bg-white/20 border-2 border-primary flex items-center justify-center font-bold text-xs">12</div>
                                <div className="w-10 h-10 rounded-full bg-white/40 border-2 border-primary" />
                            </div>
                            <span className="text-[10px] font-bold tracking-tight max-w-[120px] leading-tight text-white/80">Opportunities active in this quarter</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
