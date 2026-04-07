'use client'

import { useState } from 'react'
import { 
    Plus, 
    MoreVertical, 
    Search, 
    ChevronRight, 
    Sparkles, 
    Zap, 
    ChevronDown, 
    Filter,
    Calendar,
    Users,
    ArrowUpRight,
    Kanban,
    DollarSign,
    AlertCircle,
    X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const columns = [
    { title: 'NOVO LEAD', count: 1, color: 'bg-blue-500', totalValue: 'R$ 123.232,00' },
    { title: 'QUALIFICAÇÃO', count: 1, color: 'bg-purple-500', totalValue: 'R$ 50.000,00' },
    { title: 'REUNIÃO MARCADA', count: 0, color: 'bg-orange-500', totalValue: 'R$ 0,00' },
    { title: 'PROPOSTA', count: 1, color: 'bg-emerald-500', totalValue: 'R$ 0,00' },
    { title: 'NEGOCIAÇÃO', count: 0, color: 'bg-red-500', totalValue: 'R$ 0,00' },
    { title: 'FOLLOW UP', count: 0, color: 'bg-indigo-500', totalValue: 'R$ 0,00' },
]

const cards = [
    { 
        id: 1, 
        column: 'NOVO LEAD', 
        title: 'trtrt', 
        value: 'R$ 123.232,00',
        priority: 'Média',
        priorityColor: 'bg-orange-400',
        date: '05 de mai',
        avatar: 'H',
        isNew: true
    },
    { 
        id: 2, 
        column: 'QUALIFICAÇÃO', 
        title: 'Testeando', 
        value: 'R$ 50.000,00',
        priority: 'Alta',
        priorityColor: 'bg-red-500',
        date: '12 de mai',
        avatar: 'S',
        isNew: true
    },
    { 
        id: 3, 
        column: 'PROPOSTA', 
        title: 'Reunião com o Fulano', 
        value: 'R$ 0,00',
        priority: 'Média',
        priorityColor: 'bg-orange-400',
        date: '02 de abr',
        avatar: 'H',
        isNew: true
    }
]

export default function PipelinePage() {
    const [isNewColumnModalOpen, setIsNewColumnModalOpen] = useState(false)

    return (
        <div className="p-8 space-y-10 max-w-full mx-auto animate-fade-in bg-[#0B0F1A] min-h-screen text-white">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-blue-500/10 text-blue-400 text-[10px] font-black uppercase tracking-widest mb-4">
                        <Kanban className="w-3 h-3" />
                        Pipeline Comercial
                    </div>
                    <h1 className="text-6xl font-black tracking-tight text-white mb-2">Pipeline</h1>
                    <p className="text-gray-400 text-sm font-medium tracking-wide uppercase">Gestão de Oportunidades + Visão Kanban</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <button className="bg-[#161B2C] border border-gray-800 px-4 py-2.5 rounded-xl flex items-center gap-3 text-sm font-bold text-gray-300 hover:border-gray-700 transition-all">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            Pipeline Principal
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={() => setIsNewColumnModalOpen(true)}
                        className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5 text-white" />
                        Nova Coluna
                    </button>
                    <button className="bg-[#161B2C] border border-gray-800 px-6 py-2.5 rounded-xl font-bold text-sm text-gray-400 hover:text-white transition-all flex items-center gap-2">
                        <Plus className="w-5 h-5" />
                        Novo Board
                    </button>
                </div>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-[#161B2C] p-8 rounded-[32px] border border-gray-800/50 flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-gray-800/50 flex items-center justify-center">
                        <Kanban className="w-6 h-6 text-gray-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Total de Cards</p>
                        <p className="text-4xl font-black text-white">3</p>
                    </div>
                </div>
                <div className="bg-[#161B2C] p-8 rounded-[32px] border border-gray-800/50 flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Valor Total</p>
                        <p className="text-4xl font-black text-blue-500">R$ 173.232,00</p>
                    </div>
                </div>
                <div className="bg-[#161B2C] p-8 rounded-[32px] border border-gray-800/50 flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-1">Cards Vencidos</p>
                        <p className="text-4xl font-black text-white">1</p>
                    </div>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide">
                {columns.map((col) => (
                    <div key={col.title} className="flex-shrink-0 w-[280px] flex flex-col gap-4">
                        {/* Column Header */}
                        <div className="bg-[#161B2C]/40 p-4 rounded-2xl border border-gray-800/30 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2.5 h-2.5 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)]", col.color)} />
                                    <span className="font-black text-xs text-white uppercase tracking-wider">{col.title}</span>
                                </div>
                                <span className="bg-gray-800 text-gray-400 text-[9px] font-black px-1.5 py-0.5 rounded-md">{col.count}</span>
                            </div>
                            <p className="text-[10px] font-bold text-blue-500/80 tracking-tight">{col.totalValue}</p>
                        </div>

                        {/* Drop Area / Cards */}
                        <div className="flex flex-col gap-4 min-h-[500px]">
                            {cards
                                .filter(c => c.column === col.title)
                                .map(card => (
                                    <div key={card.id} className="bg-[#1E2433] p-5 rounded-2xl border border-gray-800 hover:border-blue-500/50 transition-all cursor-pointer group relative">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="font-black text-sm text-white">{card.title}</h3>
                                            {card.isNew && (
                                                <span className="bg-blue-600/20 text-blue-400 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">Novo</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className={cn("w-2 h-2 rounded-full", card.priorityColor)} />
                                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{card.priority}</span>
                                        </div>

                                        <p className="text-blue-500 font-black text-sm mb-4">{card.value}</p>

                                        <div className="flex items-center justify-between border-t border-gray-800 pt-4 mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-black uppercase">
                                                    {card.avatar}
                                                </div>
                                                <span className="text-[10px] font-medium text-gray-500">Iniciado</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-gray-600">
                                                <Calendar className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">{card.date}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                            {/* Add Card Placeholder */}
                            <button className="w-full py-3 border border-dashed border-gray-800 rounded-2xl flex items-center justify-center gap-2 text-gray-600 hover:border-blue-500/30 hover:text-gray-400 transition-all text-[10px] font-black uppercase tracking-widest">
                                <Plus className="w-3 h-3" />
                                Adicionar Card
                            </button>

                            {col.count === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-20 grayscale">
                                    <Kanban className="w-8 h-8 text-gray-400 mb-2" />
                                    <p className="text-[10px] font-black">Nenhum card</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* New Column Button */}
                <div className="flex-shrink-0 w-[280px]">
                    <button 
                        onClick={() => setIsNewColumnModalOpen(true)}
                        className="w-full h-full min-h-[600px] border border-dashed border-gray-800 rounded-[32px] flex flex-col items-center justify-center gap-4 text-gray-600 hover:border-blue-500/30 hover:text-gray-400 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-full border border-dashed border-gray-800 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-black uppercase tracking-widest">Nova Coluna</span>
                    </button>
                </div>
            </div>

            {/* Modal - Nova Coluna */}
            {isNewColumnModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#161B2C] border border-gray-800 rounded-[32px] w-full max-w-sm overflow-hidden animate-scale-in">
                        <div className="p-8 border-b border-gray-800 flex items-center justify-between">
                            <h2 className="text-xl font-black text-white">NOVA COLUNA</h2>
                            <button onClick={() => setIsNewColumnModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Nome da Coluna</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Em Negociação"
                                    className="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-4">Cor</label>
                                <div className="flex flex-wrap gap-3">
                                    {['bg-blue-500', 'bg-blue-400', 'bg-purple-500', 'bg-orange-500', 'bg-red-400', 'bg-rose-500', 'bg-emerald-500'].map((color) => (
                                        <button 
                                            key={color} 
                                            className={cn("w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-transform", color)} 
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-[#0B0F1A]/50 flex gap-4">
                            <button 
                                onClick={() => setIsNewColumnModalOpen(false)}
                                className="flex-1 px-6 py-3 rounded-xl border border-gray-800 text-gray-400 font-bold hover:text-white transition-all"
                            >
                                Cancelar
                            </button>
                            <button className="flex-2 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 hover:bg-blue-500 transition-all">
                                Criar Coluna
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
