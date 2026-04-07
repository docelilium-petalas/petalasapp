'use client'

import { useState, useEffect } from 'react'
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
import { getPipelineData, createColumn, createOpportunity } from './actions'
import toast from 'react-hot-toast'

export default function PipelinePage() {
    const [isNewColumnModalOpen, setIsNewColumnModalOpen] = useState(false)
    const [isNewCardModalOpen, setIsNewCardModalOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [columns, setColumns] = useState<any[]>([])
    const [cards, setCards] = useState<any[]>([])
    const [newColumnName, setNewColumnName] = useState('')
    const [selectedColor, setSelectedColor] = useState('bg-rose-500')
    
    // Estado para o novo card (Cartaz)
    const [newCardData, setNewCardData] = useState({
        title: '',
        description: '',
        value: '',
        date: '',
        priority: 'media',
        stageId: '',
        responsible: ''
    })

    const fetchData = async () => {
        setIsLoading(true)
        try {
            const data = await getPipelineData()
            setColumns(data.columns)
            setCards(data.cards)
        } catch (error) {
            console.error('Erro ao buscar dados:', error)
            toast.error('Erro ao carregar pipeline')
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        fetchData()
    }, [])

    const handleCreateColumn = async () => {
        if (!newColumnName) return
        try {
            await createColumn(newColumnName, selectedColor)
            toast.success('Coluna criada com sucesso!')
            setNewColumnName('')
            setIsNewColumnModalOpen(false)
            fetchData()
        } catch (error) {
            toast.error('Erro ao criar coluna')
        }
    }

    const handleCreateCard = async () => {
        if (!newCardData.title || !newCardData.stageId) {
            toast.error('Título e Coluna são obrigatórios')
            return
        }
        try {
            await createOpportunity(
                newCardData.stageId,
                newCardData.title,
                parseFloat(newCardData.value) || 0,
                newCardData.priority,
                newCardData.description,
                newCardData.responsible,
                newCardData.date
            )
            toast.success('Cartaz criado com sucesso!')
            setIsNewCardModalOpen(false)
            setNewCardData({
                title: '',
                description: '',
                value: '',
                date: '',
                priority: 'media',
                stageId: '',
                responsible: ''
            })
            fetchData()
        } catch (error) {
            toast.error('Erro ao criar cartaz')
        }
    }

    if (isLoading) {
        return (
            <div className="p-8 flex items-center justify-center min-h-[60vh]">
                <div className="animate-spin text-rose-500">
                    <Zap className="w-12 h-12" />
                </div>
            </div>
        )
    }

    return (
        <div className="p-8 space-y-10 max-w-full mx-auto animate-fade-in bg-transparent min-h-screen text-slate-900">
            {/* Cabeçalho */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-rose-500/10 text-rose-600 text-[10px] font-black uppercase tracking-widest mb-4">
                        <Kanban className="w-3 h-3" />
                        Funil de Vendas Comercial
                    </div>
                    <h1 className="text-6xl font-black tracking-tight text-slate-900 mb-2 italic">Pipeline</h1>
                    <p className="text-slate-500 text-sm font-medium tracking-wide uppercase font-outfit">Gestão de Oportunidades + Visão Kanban</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <button className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl flex items-center gap-3 text-sm font-bold text-slate-600 hover:border-rose-300 transition-all shadow-sm">
                            <div className="w-2 h-2 rounded-full bg-rose-500" />
                            Pipeline Principal
                            <ChevronDown className="w-4 h-4" />
                        </button>
                    </div>
                    <button 
                        onClick={() => setIsNewColumnModalOpen(true)}
                        className="bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-rose-500/20 hover:bg-rose-500 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5 text-white" />
                        Nova Coluna
                    </button>
                    <button className="bg-white border border-slate-200 px-6 py-2.5 rounded-xl font-bold text-sm text-slate-400 hover:text-slate-900 transition-all flex items-center gap-2 shadow-sm italic" title="Em desenvolvimento">
                        <Plus className="w-5 h-5" />
                        Novo Board
                    </button>
                </div>
            </div>

            {/* Linha de Métricas */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
                        <Kanban className="w-6 h-6 text-slate-400" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Cards</p>
                        <p className="text-4xl font-black text-slate-900">{cards.length}</p>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-rose-500/10 flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-rose-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Valor do Funil</p>
                        <p className="text-4xl font-black text-rose-600">
                            {columns.reduce((acc, col) => {
                                const val = parseFloat(col.totalValue.replace(/[^\d]/g, '').replace(',', '.')) / 100
                                return acc + (isNaN(val) ? 0 : val)
                            }, 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                        </p>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm flex items-center gap-6">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 flex items-center justify-center">
                        <AlertCircle className="w-6 h-6 text-red-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Oportunidades Vencidas</p>
                        <p className="text-4xl font-black text-slate-900">0</p>
                    </div>
                </div>
            </div>

            {/* Kanban Board */}
            <div className="flex gap-6 overflow-x-auto pb-8 scrollbar-hide">
                {columns.map((col) => (
                    <div key={col.id} className="flex-shrink-0 w-[280px] flex flex-col gap-4">
                        {/* Column Header */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className={cn("w-2.5 h-2.5 rounded-full shadow-sm", col.color)} />
                                    <span className="font-black text-xs text-slate-900 uppercase tracking-wider">{col.title}</span>
                                </div>
                                <span className="bg-slate-100 text-slate-500 text-[9px] font-black px-1.5 py-0.5 rounded-md">{col.count}</span>
                            </div>
                            <p className="text-[10px] font-bold text-rose-600/80 tracking-tight">{col.totalValue}</p>
                        </div>

                        {/* Drop Area / Cards */}
                        <div className="flex flex-col gap-4 min-h-[500px]">
                            {cards
                                .filter(c => c.columnId === col.id)
                                .map(card => (
                                    <div key={card.id} className="bg-white p-5 rounded-2xl border border-slate-200 hover:border-rose-500/50 transition-all cursor-pointer group relative shadow-soft">
                                        <div className="flex justify-between items-start mb-4">
                                            <h3 className="font-black text-sm text-slate-900">{card.title}</h3>
                                            {card.isNew && (
                                                <span className="bg-rose-600/10 text-rose-600 text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-widest">Novo</span>
                                            )}
                                        </div>
                                        
                                        <div className="flex items-center gap-2 mb-4">
                                            <div className={cn("w-2 h-2 rounded-full", card.priorityColor)} />
                                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{card.priority}</span>
                                        </div>

                                        <p className="text-rose-600 font-black text-sm mb-4">{card.value}</p>

                                        <div className="flex items-center justify-between border-t border-slate-100 pt-4 mt-2">
                                            <div className="flex items-center gap-2">
                                                <div className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-[10px] font-black uppercase">
                                                    {card.avatar}
                                                </div>
                                                <span className="text-[10px] font-medium text-slate-400">Iniciado</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-slate-300">
                                                <Calendar className="w-3 h-3" />
                                                <span className="text-[10px] font-medium">{card.date}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}

                            {/* Placeholder de Adicionar Card */}
                            <button 
                                onClick={() => {
                                    setNewCardData({ ...newCardData, stageId: col.id })
                                    setIsNewCardModalOpen(true)
                                }}
                                className="w-full py-3 border border-dashed border-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-400 hover:border-rose-500/30 hover:text-rose-600 transition-all text-[10px] font-black uppercase tracking-widest"
                            >
                                <Plus className="w-3 h-3" />
                                Adicionar Cartaz
                            </button>

                            {col.count === 0 && (
                                <div className="flex-1 flex flex-col items-center justify-center opacity-20 py-20 grayscale">
                                    <Kanban className="w-8 h-8 text-slate-400 mb-2" />
                                    <p className="text-[10px] font-black">Nenhum card</p>
                                </div>
                            )}
                        </div>
                    </div>
                ))}

                {/* Botão de Nova Coluna */}
                <div className="flex-shrink-0 w-[280px]">
                    <button 
                        onClick={() => setIsNewColumnModalOpen(true)}
                        className="w-full h-full min-h-[600px] border border-dashed border-slate-200 rounded-[32px] flex flex-col items-center justify-center gap-4 text-slate-400 hover:border-rose-500/30 hover:text-rose-600 transition-all group"
                    >
                        <div className="w-12 h-12 rounded-full border border-dashed border-slate-200 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Plus className="w-6 h-6" />
                        </div>
                        <span className="text-sm font-black uppercase tracking-widest">Nova Coluna</span>
                    </button>
                </div>
            </div>

            {/* Modal - Novo Card (Cartaz) */}
            {isNewCardModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-[#101928] border border-slate-800 rounded-[32px] w-full max-w-lg overflow-hidden animate-scale-in shadow-2xl text-white">
                        <div className="p-8 border-b border-slate-800 flex items-center justify-between">
                            <h2 className="text-xl font-black uppercase tracking-tight">Novo Card</h2>
                            <button onClick={() => setIsNewCardModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-10 space-y-8">
                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Título *</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all"
                                    placeholder="Nome da oportunidade"
                                    value={newCardData.title}
                                    onChange={(e) => setNewCardData({...newCardData, title: e.target.value})}
                                />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Descrição</label>
                                <textarea 
                                    className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none h-24 resize-none transition-all"
                                    placeholder="Detalhes do card..."
                                    value={newCardData.description}
                                    onChange={(e) => setNewCardData({...newCardData, description: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Valor (R$)</label>
                                    <input 
                                        type="number"
                                        className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all"
                                        placeholder="0,00"
                                        value={newCardData.value}
                                        onChange={(e) => setNewCardData({...newCardData, value: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Vencimento</label>
                                    <input 
                                        type="date"
                                        className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all text-slate-400"
                                        value={newCardData.date}
                                        onChange={(e) => setNewCardData({...newCardData, date: e.target.value})}
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Prioridade</label>
                                    <select 
                                        className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all appearance-none"
                                        value={newCardData.priority}
                                        onChange={(e) => setNewCardData({...newCardData, priority: e.target.value})}
                                    >
                                        <option value="media">Média</option>
                                        <option value="alta">Alta</option>
                                        <option value="baixa">Baixa</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Coluna</label>
                                    <select 
                                        className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all appearance-none"
                                        value={newCardData.stageId}
                                        onChange={(e) => setNewCardData({...newCardData, stageId: e.target.value})}
                                    >
                                        {columns.map(c => (
                                            <option key={c.id} value={c.id}>{c.title}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 italic">Responsável</label>
                                <input 
                                    type="text" 
                                    className="w-full bg-[#1e293b]/50 border border-slate-700 rounded-xl px-4 py-4 text-sm font-bold focus:border-blue-500 outline-none transition-all"
                                    placeholder="Nome do responsável"
                                    value={newCardData.responsible}
                                    onChange={(e) => setNewCardData({...newCardData, responsible: e.target.value})}
                                />
                            </div>
                        </div>

                        <div className="p-10 flex gap-6 mt-4">
                            <button 
                                onClick={() => setIsNewCardModalOpen(false)}
                                className="flex-1 px-8 py-4 rounded-xl text-slate-400 font-bold hover:text-white hover:bg-slate-800 transition-all uppercase text-xs"
                            >
                                Cancelar
                            </button>
                            <button 
                                onClick={handleCreateCard}
                                className="flex-1 bg-blue-600 text-white px-8 py-4 rounded-xl font-bold shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all uppercase text-xs"
                            >
                                Criar Card
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal - Nova Coluna */}
            {isNewColumnModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white border border-slate-200 rounded-[32px] w-full max-w-sm overflow-hidden animate-scale-in shadow-2xl">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-black text-slate-900 uppercase">Criar Nova Coluna</h2>
                            <button onClick={() => setIsNewColumnModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-8 space-y-6">
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Nome da Coluna</label>
                                <input 
                                    type="text" 
                                    value={newColumnName}
                                    onChange={(e) => setNewColumnName(e.target.value)}
                                    placeholder="Ex: Qualificação"
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-rose-500 transition-all"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Selecione a Identidade Visual</label>
                                <div className="flex flex-wrap gap-3">
                                    {['bg-blue-500', 'bg-blue-400', 'bg-purple-500', 'bg-orange-500', 'bg-red-400', 'bg-rose-500', 'bg-emerald-500'].map((color) => (
                                        <button 
                                            key={color} 
                                            onClick={() => setSelectedColor(color)}
                                            className={cn(
                                                "w-8 h-8 rounded-full cursor-pointer hover:scale-110 transition-transform shadow-sm border-2",
                                                color,
                                                selectedColor === color ? 'border-slate-900' : 'border-transparent'
                                            )} 
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-slate-50 flex gap-4">
                            <button 
                                onClick={() => setIsNewColumnModalOpen(false)}
                                className="flex-1 px-6 py-3 rounded-xl border border-slate-200 text-slate-400 font-bold hover:text-slate-900 transition-all bg-white"
                            >
                                Voltar
                            </button>
                            <button 
                                onClick={handleCreateColumn}
                                className="flex-2 bg-rose-600 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-rose-500/20 hover:bg-rose-500 transition-all"
                            >
                                Confirmar e Criar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
