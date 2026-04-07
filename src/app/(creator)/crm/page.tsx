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
        <div className="p-8 space-y-8 max-w-[1400px] mx-auto animate-fade-in bg-[#0B0F1A] min-h-screen text-white">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black tracking-tight">CRM</h1>
                        <p className="text-gray-500 text-[10px] font-black uppercase tracking-widest mt-1">Central de Relacionamentos • 13 Contatos Ativos</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button className="bg-transparent border border-blue-500/40 text-blue-500 px-6 py-2.5 rounded-xl font-bold text-sm tracking-wide uppercase hover:bg-blue-500/5 transition-all flex items-center gap-2">
                        <Target className="w-4 h-4" />
                        Prospectar Leads
                    </button>
                    <button className="bg-gray-800/40 border border-gray-800 text-gray-400 px-6 py-2.5 rounded-xl font-bold text-sm hover:text-white transition-all flex items-center gap-2">
                        <Upload className="w-4 h-4" />
                        Importar CSV
                    </button>
                    <button 
                        onClick={() => setIsNewContactModalOpen(true)}
                        className="bg-blue-600 text-white px-8 py-2.5 rounded-xl font-bold text-sm shadow-xl shadow-blue-500/20 hover:bg-blue-500 transition-all flex items-center gap-2"
                    >
                        <Plus className="w-5 h-5 text-white" />
                        Novo Contato
                    </button>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-[#161B2C]/60 p-8 rounded-[32px] border border-gray-800/40 relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                            <Users className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Total de Contatos</p>
                            <p className="text-4xl font-black text-white leading-none">13</p>
                            <p className="text-[10px] font-bold text-emerald-500 mt-2">0 CLIENTES ATIVOS</p>
                        </div>
                    </div>
                </div>
                <div className="bg-[#161B2C]/60 p-8 rounded-[32px] border border-gray-800/40 relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-blue-400/10 flex items-center justify-center text-blue-400">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Novos este Mês</p>
                            <p className="text-4xl font-black text-white leading-none">11</p>
                            <p className="text-[10px] font-bold text-gray-500 mt-2 uppercase">CONTATOS ADICIONADOS</p>
                        </div>
                    </div>
                </div>
                <div className="bg-[#161B2C]/60 p-8 rounded-[32px] border border-gray-800/40 relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400">
                            <Target className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Taxa de Conversão</p>
                            <p className="text-4xl font-black text-white leading-none">0%</p>
                            <p className="text-[10px] font-bold text-gray-500 mt-2 uppercase">LEAD → CLIENTE</p>
                        </div>
                    </div>
                </div>
                <div className="bg-[#161B2C]/60 p-8 rounded-[32px] border border-gray-800/40 relative overflow-hidden group">
                    <div className="relative z-10 flex flex-col gap-4">
                        <div className="w-10 h-10 rounded-2xl bg-orange-500/10 flex items-center justify-center text-orange-400">
                            <Clock className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest leading-none mb-1">Próximas Atividades</p>
                            <p className="text-4xl font-black text-white leading-none">0</p>
                            <p className="text-[10px] font-bold text-gray-500 mt-2 uppercase">FOLLOW-UPS PENDENTES</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Table Section */}
            <div className="bg-[#161B2C]/40 rounded-[40px] border border-gray-800/30 p-8 shadow-sm">
                {/* Table Filters & Search */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
                    <div className="relative w-full md:max-w-md">
                        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-600" />
                        <input 
                            type="text" 
                            placeholder="Buscar por nome, empresa, email..."
                            className="w-full bg-[#0B0F1A] border border-gray-800 rounded-2xl py-4 pl-14 pr-5 text-sm font-bold text-white placeholder-gray-600 outline-none focus:border-blue-500 transition-all"
                        />
                    </div>

                    <div className="flex items-center bg-[#0B0F1A] p-1.5 rounded-2xl border border-gray-800">
                        {['TODOS 13', 'LEADS 13', 'CLIENTES 0', 'INATIVOS 0'].map((tab) => {
                            const [name, count] = tab.split(' ')
                            const isActive = activeTab === name
                            return (
                                <button 
                                    key={name}
                                    onClick={() => setActiveTab(name)}
                                    className={cn(
                                        "px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap",
                                        isActive ? "bg-blue-500/10 text-blue-500 shadow-lg" : "text-gray-600 hover:text-gray-400"
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
                            <tr className="border-b border-gray-800/50">
                                <th className="text-left py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Contato</th>
                                <th className="text-left py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Email / Telefone</th>
                                <th className="text-left py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Status</th>
                                <th className="text-left py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Canal</th>
                                <th className="text-left py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Última Atividade</th>
                                <th className="text-right py-6 text-[10px] font-black text-gray-500 uppercase tracking-[0.2em] px-4">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/30">
                            {contacts.map((contact) => (
                                <tr key={contact.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="py-6 px-4">
                                        <div className="flex items-center gap-4">
                                            <div className="w-10 h-10 rounded-full bg-blue-600/10 text-blue-500 border border-blue-500/20 flex items-center justify-center text-[10px] font-black">
                                                {contact.avatar}
                                            </div>
                                            <div>
                                                <p className="text-sm font-black text-white group-hover:text-blue-500 transition-colors">{contact.nome}</p>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">{contact.empresa}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-6 px-4 text-xs font-bold text-gray-400">
                                        {contact.email}
                                    </td>
                                    <td className="py-6 px-4">
                                        <span className="bg-gray-800 text-gray-400 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-gray-700/50">
                                            {contact.status}
                                        </span>
                                    </td>
                                    <td className="py-6 px-4">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400 uppercase">
                                            <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                                            {contact.canal}
                                        </div>
                                    </td>
                                    <td className="py-6 px-4 text-xs font-medium text-gray-500 font-mono italic">
                                        {contact.ultimaAtividade}
                                    </td>
                                    <td className="py-6 px-4 text-right">
                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button className="p-2 text-gray-500 hover:text-white transition-colors" title="Visualizar"><Eye className="w-4 h-4" /></button>
                                            <button className="p-2 text-gray-500 hover:text-blue-400 transition-colors" title="Editar"><Edit2 className="w-4 h-4" /></button>
                                            <button className="p-2 text-gray-500 hover:text-red-400 transition-colors" title="Excluir"><Trash2 className="w-4 h-4" /></button>
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
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
                    <div className="bg-[#161B2C] border border-gray-800 rounded-[32px] w-full max-w-2xl overflow-hidden animate-scale-in">
                        <div className="p-8 border-b border-gray-800 flex items-center justify-between bg-[#1A1F2E]">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center">
                                    <UserPlus className="w-5 h-5 text-white" />
                                </div>
                                <h2 className="text-xl font-black text-white uppercase tracking-tight">NOVO CONTATO</h2>
                            </div>
                            <button onClick={() => setIsNewContactModalOpen(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        
                        <div className="p-10 space-y-8 bg-[#161B2C]">
                            <p className="text-[10px] text-gray-500 font-black uppercase tracking-[0.2em] mb-4">Preecha os dados para adicionar ao CRM</p>
                            
                            <div className="grid grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Nome *</label>
                                    <input type="text" placeholder="João Silva" className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Empresa *</label>
                                    <input type="text" placeholder="Empresa LTDA" className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Email *</label>
                                    <input type="email" placeholder="joao@empresa.com" className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Telefone *</label>
                                    <input type="text" placeholder="(11) 99999-9999" className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Cargo *</label>
                                    <input type="text" placeholder="CEO, CFO, Diretor..." className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Canal de Origem *</label>
                                    <div className="relative">
                                        <select className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none appearance-none transition-all">
                                            <option>Selecione...</option>
                                            <option>Google</option>
                                            <option>Indicação</option>
                                            <option>LinkedIn</option>
                                        </select>
                                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Tags</label>
                                <input type="text" placeholder="VIP, Fundos, Alto Valor (separadas por vírgula)" className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all" />
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2 px-1">Notas</label>
                                <textarea rows={4} placeholder="Informações adicionais sobre o contato..." className="w-full bg-[#0B0F1A] border border-gray-800/60 rounded-xl px-4 py-3.5 text-sm font-bold text-white focus:border-blue-500 outline-none transition-all resize-none"></textarea>
                            </div>
                        </div>

                        <div className="p-8 bg-[#1A1F2E] flex gap-4">
                            <button 
                                onClick={() => setIsNewContactModalOpen(false)}
                                className="flex-1 px-8 py-4 rounded-2xl border border-gray-800 text-gray-400 font-bold hover:text-white hover:bg-white/5 transition-all text-sm uppercase tracking-widest"
                            >
                                Cancelar
                            </button>
                            <button className="flex-[2] bg-blue-600 text-white px-10 py-4 rounded-2xl font-black shadow-2xl shadow-blue-500/30 hover:bg-blue-500 transition-all flex items-center justify-center gap-3 text-sm uppercase tracking-widest">
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
