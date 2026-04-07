'use client'

import { useState } from 'react'
import { 
    Plus, 
    Search, 
    ChevronDown, 
    Settings,
    MoreHorizontal,
    Mail,
    Phone,
    Eye,
    Edit2,
    Trash2,
    Download,
    Upload,
    Users,
    TrendingUp,
    Target,
    Clock,
    X,
    MessageSquare,
    Tag,
    UserPlus
} from 'lucide-react'
import { cn } from '@/lib/utils'

const contacts = [
    { 
        id: 1, 
        nome: 'AHL agro', 
        empresa: 'AHL agro', 
        email: '(62) 4006-0606', 
        status: 'Lead', 
        canal: 'Google', 
        ultimaAtividade: 'há 5 dias',
        avatar: 'AA'
    },
    { 
        id: 2, 
        nome: 'Suprema Soluções Agroindustriais', 
        empresa: 'Suprema Soluções Agroindustriais', 
        email: '(62) 98338-0247', 
        status: 'Lead', 
        canal: 'Google', 
        ultimaAtividade: 'há 5 dias',
        avatar: 'SS'
    },
    { 
        id: 3, 
        nome: 'BR AGRONEGÓCIO', 
        empresa: 'BR AGRONEGÓCIO', 
        email: '(62) 3624-3124', 
        status: 'Lead', 
        canal: 'Google', 
        ultimaAtividade: 'há 5 dias',
        avatar: 'BA'
    },
    { 
        id: 4, 
        nome: 'ASSIAGRO - Assistência ao Agronegócio', 
        empresa: 'ASSIAGRO - Assistência ao Agronegócio', 
        email: '(62) 99971-1841', 
        status: 'Lead', 
        canal: 'Google', 
        ultimaAtividade: 'há 5 dias',
        avatar: 'A-'
    }
]

export default function CRMPage() {
    const [isNewContactModalOpen, setIsNewContactModalOpen] = useState(false)
    const [activeTab, setActiveTab] = useState('TODOS')

    return (
        <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-fade-in bg-transparent min-h-screen text-slate-900">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight text-slate-900">CRM</h1>
                        <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Central de Relacionamentos • 13 Contatos Ativos</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="bg-white border border-rose-500 text-rose-600 px-6 py-2.5 rounded-xl font-bold text-sm tracking-wide uppercase hover:bg-rose-50 transition-all flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Prospectar Leads
                    </button>
                    <button className="bg-white border border-slate-200 text-slate-400 px-6 py-2.5 rounded-xl font-bold text-sm hover:text-slate-900 transition-all flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Importar CSV
                    </button>
                    <button 
                        onClick={() => setIsNewContactModalOpen(true)}
                        className="bg-rose-600 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-rose-500/20 hover:bg-rose-500 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5 text-white" />
                        Novo Contato
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-soft relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-500 group-hover:scale-110 transition-transform">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Total de Contatos</p>
                            <p className="text-4xl font-black text-slate-900 leading-none">13</p>
                            <p className="text-[10px] font-bold text-emerald-500 mt-2">0 CLIENTES ATIVOS</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-soft relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-rose-400/10 flex items-center justify-center text-rose-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Novos este Mês</p>
                            <p className="text-4xl font-black text-slate-900 leading-none">11</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">CONTATOS ADICIONADOS</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-soft relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-600">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Taxa de Conversão</p>
                            <p className="text-4xl font-black text-slate-900 leading-none">0%</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">LEAD → CLIENTE</p>
                        </div>
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-soft relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-600">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Próximas Atividades</p>
                            <p className="text-4xl font-black text-slate-900 leading-none">0</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase">FOLLOW-UPS PENDENTES</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-white rounded-[40px] border border-slate-200 p-8 shadow-soft">
                {/* Table Filters & Search */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nome, empresa, email..."
                            className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-4 pl-14 pr-5 text-sm font-bold text-slate-900 placeholder-slate-400 outline-none focus:border-rose-500 transition-all"
                        />
                    </div>

                    <div className="flex items-center bg-slate-50 p-1.5 rounded-2xl border border-slate-200">
                        {['TODOS 13', 'LEADS 13', 'CLIENTES 0', 'INATIVOS 0'].map((tab) => {
                            const [name, count] = tab.split(' ')
                            const isActive = activeTab === name
                            return (
                                <button 
                                    key={name}
                                    onClick={() => setActiveTab(name)}
                                    className={cn(
                                        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                        isActive ? "bg-white text-rose-600 shadow-sm border border-slate-200" : "text-slate-400 hover:text-slate-600"
                                    )}
                                >
                                    {name} <span className="ml-1 opacity-40">{count}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>

                {/* Contacts Table */}
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-slate-100">
                                <th className="text-left py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Contato</th>
                                <th className="text-left py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Email / Telefone</th>
                                <th className="text-left py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Status</th>
                                <th className="text-left py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Canal</th>
                                <th className="text-left py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Última Atividade</th>
                                <th className="text-right py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {contacts.map((contact) => (
                                <tr key={contact.id} className="hover:bg-slate-50 transition-colors group">
                                    <td className="py-6 px-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-rose-600/10 text-rose-600 border border-rose-500/20 flex items-center justify-center text-[10px] font-black">
                                                {contact.avatar}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-slate-900 group-hover:text-rose-600 transition-colors">{contact.nome}</p>
                                                <p className="text-[10px] text-slate-400 font-bold uppercase">{contact.empresa}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-6 px-4 text-xs font-bold text-slate-500">
                                        {contact.email}
                                    </td>
                                    <td className="py-6 px-4">
                                        <span className="bg-slate-100 text-slate-500 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-slate-200">
                                            {contact.status}
                                        </span>
                                    </td>
                                    <td className="py-6 px-4">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-200" />
                                            {contact.canal}
                                        </div>
                                    </td>
                                    <td className="py-6 px-4 text-xs font-medium text-slate-400 font-mono italic">
                                        {contact.ultimaAtividade}
                                    </td>
                                    <td className="py-6 px-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-slate-400 hover:text-slate-900 transition-colors" title="Visualizar"><Eye className="w-4 h-4" /></button>
                                            <button className="p-2 text-slate-400 hover:text-rose-600 transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                                            <button className="p-2 text-slate-400 hover:text-red-600 transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal - Novo Contato */}
            {isNewContactModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white border border-slate-200 rounded-[32px] w-full max-w-2xl overflow-hidden animate-scale-in shadow-2xl">
                        <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center">
                                    <UserPlus className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">NOVO CONTATO</h2>
                            </div>
                            <button onClick={() => setIsNewContactModalOpen(false)} className="text-slate-400 hover:text-slate-900 transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-10 space-y-8 bg-white">
                            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-4">Preecha os dados para adicionar ao CRM</p>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Nome *</label>
                                    <input type="text" placeholder="João Silva" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Empresa *</label>
                                    <input type="text" placeholder="Empresa LTDA" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Email *</label>
                                    <input type="email" placeholder="joao@empresa.com" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Telefone *</label>
                                    <input type="text" placeholder="(11) 99999-9999" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Cargo *</label>
                                    <input type="text" placeholder="CEO, CFO, Diretor..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Canal de Origem *</label>
                                    <div className="relative">
                                        <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none appearance-none transition-all">
                                            <option>Selecione...</option>
                                            <option>Google</option>
                                            <option>Indicação</option>
                                            <option>LinkedIn</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Tags</label>
                                <input type="text" placeholder="VIP, Fundos, Alto Valor (separadas por vírgula)" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 px-1">Notas</label>
                                <textarea rows={4} placeholder="Informações adicionais sobre o contato..." className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm font-bold text-slate-900 focus:border-rose-500 outline-none transition-all resize-none"></textarea>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50 flex gap-4">
                            <button 
                                onClick={() => setIsNewContactModalOpen(false)}
                                className="flex-1 px-8 py-4 rounded-2xl border border-slate-200 text-slate-400 font-bold hover:text-slate-900 hover:bg-white transition-all text-sm uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button className="flex-[2] bg-rose-600 text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-rose-500/30 hover:bg-rose-500 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest">
                                <Plus className="w-5 h-5 text-white" />
                                Adicionar Contato
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
