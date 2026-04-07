'use client'

import { useState, useEffect } from 'react'
import {
    User,
    Lock,
    Puzzle,
    Save,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle,
    XCircle,
    ShieldCheck,
    Zap,
    Kanban,
    Plus,
    Trash2,
    Check,
    X,
    Settings2,
    ChevronRight
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { getPipelineStages, upsertPipelineStage, deletePipelineStage } from './actions'

const TABS = [
    { id: 'perfil', label: 'PERFIL', icon: User },
    { id: 'pipelines', label: 'PIPELINES', icon: Kanban },
    { id: 'integracoes', label: 'INTEGRAÇÕES', icon: Puzzle },
]

const passwordSchema = z.object({
    senhaAtual: z.string().min(1, 'Senha atual é obrigatória'),
    novaSenha: z.string().min(8, 'Mínimo 8 caracteres'),
    confirmarSenha: z.string(),
}).refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'As senhas não coincidem',
    path: ['confirmarSenha'],
})

type PasswordForm = z.infer<typeof passwordSchema>

export default function ConfiguracoesPage() {
    const [activeTab, setActiveTab] = useState('perfil')
    const [profile, setProfile] = useState({ nome: '', email: '', avatar_url: null as string | null })
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [stages, setStages] = useState<any[]>([])
    const [integrations, setIntegrations] = useState<any[]>([
        { id: 'n8n_video', nome: 'N8N - Gerador de vídeo', ativo: true, tipo: 'video_gen' },
        { id: 'n8n_cnpj', nome: 'N8N - Consulta CNPJ', ativo: true, tipo: 'cnpj_lookup' }
    ])

    const {
        register,
        handleSubmit,
        reset: resetPasswordForm,
        formState: { errors: passwordErrors },
    } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

    useEffect(() => {
        loadAllData()
    }, [])

    async function loadAllData() {
        setIsLoading(true)
        try {
            const [profileRes, stagesData] = await Promise.all([
                fetch('/api/creator/profile'),
                getPipelineStages()
            ])

            if (profileRes.ok) {
                const data = await profileRes.json()
                setProfile({ 
                    nome: data.nome || '', 
                    email: data.email || '', 
                    avatar_url: data.avatar_url || null 
                })
            }
            setStages(stagesData)
        } finally {
            setIsLoading(false)
        }
    }

    const handleSaveProfile = async () => {
        setIsSaving(true)
        const res = await fetch('/api/creator/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: profile.nome, email: profile.email }),
        })

        if (res.ok) toast.success('Perfil atualizado!')
        else toast.error('Erro ao salvar perfil')
        setIsSaving(false)
    }

    const handleAddStage = async () => {
        try {
            await upsertPipelineStage(null, 'Novo Estágio', stages.length)
            const updated = await getPipelineStages()
            setStages(updated)
            toast.success('Estágio adicionado')
        } catch (error) {
            toast.error('Erro ao adicionar estágio')
        }
    }

    const handleUpdateStage = async (id: string, title: string) => {
        try {
            await upsertPipelineStage(id, title, stages.find(s => s.id === id)?.order || 0)
            toast.success('Estágio salvo')
        } catch (error) {
            toast.error('Erro ao salvar')
        }
    }

    const handleDeleteStage = async (id: string) => {
        try {
            await deletePipelineStage(id)
            setStages(stages.filter(s => s.id !== id))
            toast.success('Estágio removido')
        } catch (error) {
            toast.error('Erro ao remover')
        }
    }

    if (isLoading) {
        return (
            <div className="p-12 flex items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
            </div>
        )
    }

    return (
        <main className="flex-1 p-8 lg:p-12 bg-white min-h-screen max-w-6xl mx-auto space-y-12">
            {/* Tab Navigation */}
            <nav className="flex items-center gap-12 border-b border-slate-100 pb-2">
                {TABS.map((tab) => {
                    const Icon = tab.icon
                    const isActive = activeTab === tab.id
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={cn(
                                "flex items-center gap-2 pb-4 text-[11px] font-black tracking-[0.2em] transition-all relative",
                                isActive ? "text-rose-500" : "text-slate-400 hover:text-slate-600"
                            )}
                        >
                            <Icon className="w-4 h-4" />
                            {tab.label}
                            {isActive && <div className="absolute bottom-[-1px] left-0 right-0 h-0.5 bg-rose-500 rounded-full" />}
                        </button>
                    )
                })}
            </nav>

            <div className="animate-fade-in">
                {/* PERFIL TAB */}
                {activeTab === 'perfil' && (
                    <div className="space-y-12">
                        <section className="bg-slate-900 rounded-[32px] p-10 text-white shadow-2xl relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-64 h-64 bg-rose-500/10 blur-[100px] -mr-32 -mt-32" />
                            <div className="relative z-10 space-y-8">
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight">Informações do Perfil</h3>
                                    <p className="text-slate-400 text-xs mt-1">Atualize seus dados pessoais e foto</p>
                                </div>
                                <div className="flex items-center gap-6">
                                    <div className="w-20 h-20 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-rose-500 text-2xl font-black">
                                        {profile.avatar_url ? <img src={profile.avatar_url} className="w-full h-full object-cover rounded-2xl" /> : getInitials(profile.nome)}
                                    </div>
                                    <div>
                                        <p className="text-lg font-bold">{profile.nome}</p>
                                        <p className="text-slate-500 text-sm">{profile.email}</p>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">Nome</label>
                                        <input 
                                            value={profile.nome}
                                            onChange={(e) => setProfile({...profile, nome: e.target.value})}
                                            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm font-medium focus:border-rose-500 outline-none transition-all"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest pl-1">E-mail</label>
                                        <input 
                                            value={profile.email}
                                            onChange={(e) => setProfile({...profile, email: e.target.value})}
                                            className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-sm font-medium focus:border-rose-500 outline-none transition-all"
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end pt-4">
                                    <button 
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2"
                                    >
                                        <Check className="w-4 h-4" /> SALVAR ALTERAÇÕES
                                    </button>
                                </div>
                            </div>
                        </section>

                        <section className="bg-slate-50 rounded-[32px] p-10 border border-slate-100">
                            <div className="space-y-8">
                                <div>
                                    <h3 className="text-xl font-bold tracking-tight text-slate-900">Segurança</h3>
                                    <p className="text-slate-400 text-xs mt-1">Altere sua senha de acesso</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <input placeholder="Senha Atual" type="password" className="bg-white border border-slate-200 rounded-xl p-4 text-sm outline-none focus:border-rose-500" />
                                    <input placeholder="Nova Senha" type="password" className="bg-white border border-slate-200 rounded-xl p-4 text-sm outline-none focus:border-rose-500" />
                                    <input placeholder="Confirmar Senha" type="password" className="bg-white border border-slate-200 rounded-xl p-4 text-sm outline-none focus:border-rose-500" />
                                </div>
                                <div className="flex justify-end">
                                    <button className="bg-slate-900 hover:bg-black text-white px-8 py-3 rounded-xl font-bold text-sm transition-all flex items-center gap-2">
                                        <Lock className="w-4 h-4" /> ALTERAR SENHA
                                    </button>
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* PIPELINES TAB */}
                {activeTab === 'pipelines' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <span className="px-4 py-1.5 rounded-full bg-rose-50 text-rose-600 text-[10px] font-black uppercase tracking-widest border border-rose-100">Padrão</span>
                            </div>
                            <button 
                                onClick={handleAddStage}
                                className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all shadow-xl shadow-rose-500/20"
                            >
                                <Plus className="w-5 h-5" /> NOVO ESTÁGIO
                            </button>
                        </div>

                        <div className="bg-slate-900 rounded-[32px] p-10 text-white space-y-8 shadow-2xl">
                            <div>
                                <h3 className="text-xl font-bold tracking-tight">Estágios</h3>
                                <p className="text-slate-400 text-xs mt-1">Arraste para reordenar os estágios do pipeline</p>
                            </div>

                            <div className="space-y-4">
                                {stages.map((stage) => (
                                    <div key={stage.id} className="group flex items-center gap-4 bg-slate-800/50 border border-slate-700 p-6 rounded-2xl hover:border-rose-500/50 transition-all">
                                        <div className="w-3 h-3 rounded-full bg-rose-500" />
                                        <input 
                                            defaultValue={stage.title}
                                            onBlur={(e) => handleUpdateStage(stage.id, e.target.value)}
                                            className="flex-1 bg-transparent border-none text-sm font-bold outline-none placeholder:text-slate-600"
                                            placeholder="Nome do estágio..."
                                        />
                                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => handleDeleteStage(stage.id)} className="p-2 text-slate-500 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                            <div className="w-px h-4 bg-slate-700" />
                                            <button className="p-2 text-slate-500 cursor-grab active:cursor-grabbing">
                                                <Settings2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {stages.length === 0 && (
                                    <div className="py-20 text-center border-2 border-dashed border-slate-800 rounded-[32px]">
                                        <p className="text-slate-500 text-xs font-black uppercase tracking-widest">Nenhum estágio configurado</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* INTEGRAÇÕES TAB */}
                {activeTab === 'integracoes' && (
                    <div className="space-y-8 animate-fade-in">
                        <div className="flex items-center justify-between">
                            <div className="invisible" />
                            <button className="bg-rose-600 hover:bg-rose-500 text-white px-8 py-3 rounded-xl font-bold text-sm flex items-center gap-2 transition-all">
                                <Plus className="w-5 h-5" /> NOVA INTEGRAÇÃO
                            </button>
                        </div>

                        <div className="space-y-6">
                            <div>
                                <h3 className="text-3xl font-black text-slate-900 tracking-tight">Integrações</h3>
                                <p className="text-slate-400 text-xs mt-1 uppercase font-black tracking-widest">Configure webhooks e APIs externas</p>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                                {integrations.map((int) => (
                                    <div key={int.id} className="bg-slate-900 border border-slate-800 rounded-[32px] p-8 flex items-center justify-between group hover:border-rose-500/30 transition-all text-white">
                                        <div className="flex items-center gap-6">
                                            <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-rose-500">
                                                <Puzzle className="w-6 h-6" />
                                            </div>
                                            <div>
                                                <p className="text-lg font-bold">{int.nome}</p>
                                                <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">N8N Workflows</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4">
                                            <div className={cn(
                                                "w-12 h-6 rounded-full relative transition-all cursor-pointer",
                                                int.ativo ? "bg-rose-600" : "bg-slate-700"
                                            )}>
                                                <div className={cn(
                                                    "absolute top-1 w-4 h-4 bg-white rounded-full transition-all",
                                                    int.ativo ? "right-1" : "left-1"
                                                )} />
                                            </div>
                                            <button className="bg-slate-800 text-slate-300 px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-slate-700 transition-all flex items-center gap-2">
                                                <Plus className="w-3 h-3" /> Endpoint
                                            </button>
                                            <button className="p-2 text-slate-600 hover:text-red-500 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Nova Integração Form Preview as in image */}
                            <div className="bg-slate-900 border border-slate-800 rounded-[32px] p-10 space-y-8 animate-in slide-in-from-bottom-5">
                                <h4 className="text-lg font-bold text-white">Nova Integração</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Nome da Integração</label>
                                        <input placeholder="Ex: Facebook Lead Ads" className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-5 text-white outline-none focus:border-rose-500 transition-all" />
                                    </div>
                                    <div className="space-y-4">
                                        <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Tipo (Identificador Único)</label>
                                        <input placeholder="Ex: facebook_leads" className="w-full bg-slate-800/50 border border-slate-700 rounded-xl p-5 text-white outline-none focus:border-rose-500 transition-all" />
                                    </div>
                                </div>
                                <div className="flex justify-end gap-4">
                                    <button className="px-8 py-3 rounded-xl font-bold text-slate-400 hover:text-white transition-all">Cancelar</button>
                                    <button className="bg-rose-600 hover:bg-rose-500 text-white px-10 py-3 rounded-xl font-bold transition-all shadow-xl shadow-rose-500/20">Salvar</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}
