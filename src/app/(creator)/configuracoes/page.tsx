'use client'

import { useState, useEffect, useRef } from 'react'
import {
    User,
    Lock,
    Puzzle,
    Palette,
    Save,
    Eye,
    EyeOff,
    Loader2,
    CheckCircle,
    XCircle,
    Upload,
    HardDrive,
    Instagram,
    Facebook,
    Webhook,
    Camera,
    ShieldCheck,
    Cloud,
    Zap,
    Type,
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import toast from 'react-hot-toast'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'

const TABS = [
    { id: 'perfil', label: 'My Identity', icon: User },
    { id: 'integracoes', label: 'Ecosystem', icon: Puzzle },
    { id: 'personalizacao', label: 'Bloom Kit', icon: Palette },
]

const passwordSchema = z.object({
    senhaAtual: z.string().min(1, 'Current password is required'),
    novaSenha: z
        .string()
        .min(8, 'Minimum 8 characters')
        .regex(/[A-Z]/, 'Must have an uppercase letter')
        .regex(/[0-9]/, 'Must have a number')
        .regex(/[^A-Za-z0-9]/, 'Must have a special character'),
    confirmarSenha: z.string(),
}).refine((d) => d.novaSenha === d.confirmarSenha, {
    message: 'Passwords do not match',
    path: ['confirmarSenha'],
})

type PasswordForm = z.infer<typeof passwordSchema>

interface Integration {
    tipo: string
    ativo: boolean
    configuracoes?: Record<string, string>
}

const INTEGRATIONS = [
    { id: 'google_drive', label: 'Google Drive', icon: HardDrive, desc: 'Auto-save your blooms' },
    { id: 'dropbox', label: 'Dropbox', icon: Cloud, desc: 'Secure cloud backup' },
    { id: 'instagram', label: 'Instagram', icon: Instagram, desc: 'Auto-schedule reels' },
    { id: 'facebook', label: 'Facebook', icon: Facebook, desc: 'Publish to your pages' },
    { id: 'webhook', label: 'Custom Webhook', icon: Webhook, desc: 'Connect to any flow' },
]

export default function ConfiguracoesPage() {
    const [activeTab, setActiveTab] = useState('perfil')
    const [profile, setProfile] = useState({ nome: '', email: '', avatar_url: null as string | null })
    const [isLoadingProfile, setIsLoadingProfile] = useState(true)
    const [isSavingProfile, setIsSavingProfile] = useState(false)
    const [showOldPw, setShowOldPw] = useState(false)
    const [showNewPw, setShowNewPw] = useState(false)
    const [isSavingPw, setIsSavingPw] = useState(false)
    const [integrations, setIntegrations] = useState<Record<string, Integration>>({})
    const [webhookUrl, setWebhookUrl] = useState('')
    const [logoPreview, setLogoPreview] = useState<string | null>(null)
    const [brandColors, setBrandColors] = useState({ primary: '#6B21A8', secondary: '#F472B6' })
    const logoInputRef = useRef<HTMLInputElement>(null)
    const avatarInputRef = useRef<HTMLInputElement>(null)

    const {
        register,
        handleSubmit,
        reset: resetPasswordForm,
        formState: { errors: passwordErrors },
    } = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

    useEffect(() => {
        async function loadData() {
            try {
                const [profileRes, intRes] = await Promise.all([
                    fetch('/api/creator/profile'),
                    fetch('/api/creator/integracoes'),
                ])

                if (profileRes.ok) {
                    const data = await profileRes.json()
                    setProfile({ nome: data.nome || '', email: data.email || '', avatar_url: data.avatar_url || null })
                }

                if (intRes.ok) {
                    const data: Integration[] = await intRes.json()
                    const map: Record<string, Integration> = {}
                    data.forEach((i) => {
                        map[i.tipo] = { tipo: i.tipo, ativo: i.ativo, configuracoes: (i.configuracoes as Record<string, string>) || {} }
                    })
                    setIntegrations(map)
                    if (map.webhook?.configuracoes?.url) setWebhookUrl(map.webhook.configuracoes.url)
                }
            } finally {
                setIsLoadingProfile(false)
            }
        }
        loadData()
    }, [])

    const handleSaveProfile = async () => {
        setIsSavingProfile(true)
        const res = await fetch('/api/creator/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nome: profile.nome, email: profile.email }),
        })

        if (!res.ok) {
            toast.error('Error saving profile')
        } else {
            toast.success('Identity blooming!')
        }
        setIsSavingProfile(false)
    }

    const handleChangePassword = async (data: PasswordForm) => {
        setIsSavingPw(true)
        const res = await fetch('/api/creator/profile', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ senhaAtual: data.senhaAtual, novaSenha: data.novaSenha }),
        })

        if (!res.ok) {
            const err = await res.json()
            toast.error(err.error || 'Error updating password')
        } else {
            toast.success('Security blooming!')
            resetPasswordForm()
        }
        setIsSavingPw(false)
    }

    const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        const preview = URL.createObjectURL(file)
        setProfile((p) => ({ ...p, avatar_url: preview }))
        toast.success('Icon updated!')
    }

    const handleToggleIntegration = async (tipo: string) => {
        const current = integrations[tipo]
        const newState = !current?.ativo

        const res = await fetch('/api/creator/integracoes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tipo,
                ativo: newState,
                token_acesso: null,
                configuracoes: tipo === 'webhook' ? { url: webhookUrl } : {},
            }),
        })

        if (!res.ok) {
            toast.error('Error updating ecosystem')
            return
        }

        setIntegrations((prev) => ({
            ...prev,
            [tipo]: { tipo, ativo: newState, configuracoes: tipo === 'webhook' ? { url: webhookUrl } : {} },
        }))

        toast.success(newState ? `${tipo} synced!` : `${tipo} disconnected`)
    }

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setLogoPreview(URL.createObjectURL(file))
        toast.success('Brand asset uploaded!')
    }

    if (isLoadingProfile) {
        return (
            <div className="flex-1 p-8 lg:p-12 animate-pulse space-y-8 max-w-4xl mx-auto">
                <div className="h-12 w-48 bg-surface-200 rounded-2xl" />
                <div className="h-64 w-full bg-surface-100 rounded-[40px]" />
            </div>
        )
    }

    return (
        <main className="flex-1 p-8 lg:p-12 bg-surface-50 min-h-screen">
            <div className="max-w-4xl mx-auto flex flex-col gap-8">
                <header>
                    <h1 className="text-4xl font-black text-text-primary tracking-tight">System Preferences</h1>
                    <p className="text-text-muted mt-2 font-medium">Fine-tune your Luminous experience.</p>
                </header>

                {/* Tabs */}
                <div className="flex gap-2 p-2 bg-white border border-surface-200 rounded-3xl shadow-sm">
                    {TABS.map((tab) => {
                        const Icon = tab.icon
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={cn(
                                    'flex-1 flex items-center justify-center gap-3 py-4 px-6 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all',
                                    activeTab === tab.id 
                                        ? 'bg-primary text-white shadow-lg shadow-primary/20 scale-[1.02]' 
                                        : 'text-text-muted hover:bg-surface-50 hover:text-text-primary'
                                )}
                            >
                                <Icon className="w-4 h-4" />
                                <span className="hidden sm:inline">{tab.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Profile Tab */}
                {activeTab === 'perfil' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Avatar */}
                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm">
                            <div className="flex flex-col sm:flex-row items-center gap-8">
                                <div className="relative group">
                                    <div className="w-32 h-32 rounded-[48px] bg-primary/5 border-2 border-surface-200 p-1 flex items-center justify-center overflow-hidden group-hover:scale-[1.05] transition-transform duration-500">
                                        {profile.avatar_url ? (
                                            <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover rounded-[44px]" />
                                        ) : (
                                            <span className="text-primary text-4xl font-black">{getInitials(profile.nome || 'U')}</span>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => avatarInputRef.current?.click()}
                                        className="absolute -bottom-2 -right-2 w-10 h-10 rounded-2xl bg-white border border-surface-200 shadow-xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all transform group-hover:rotate-12"
                                    >
                                        <Camera className="w-4 h-4" />
                                    </button>
                                </div>
                                <div className="flex-1 text-center sm:text-left">
                                    <h3 className="text-xl font-black text-text-primary">Profile Icon</h3>
                                    <p className="text-text-muted mt-2 font-medium">Resolution blooming at best size 400x400.</p>
                                    <button 
                                        onClick={() => avatarInputRef.current?.click()} 
                                        className="mt-6 bg-surface-50 text-text-primary font-black px-8 py-3 rounded-2xl hover:bg-surface-100 transition-all text-sm"
                                    >
                                        Change Icon
                                    </button>
                                </div>
                            </div>
                            <input ref={avatarInputRef} type="file" accept="image/*" onChange={handleAvatarUpload} className="hidden" />
                        </div>

                        {/* Info */}
                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-8">
                            <h3 className="text-xl font-black text-text-primary">Identity Details</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Creator Full Name</label>
                                    <input
                                        type="text"
                                        value={profile.nome}
                                        onChange={(e) => setProfile((p) => ({ ...p, nome: e.target.value }))}
                                        className="w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">E-mail Address</label>
                                    <input
                                        type="email"
                                        value={profile.email}
                                        onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))}
                                        className="w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex justify-end pt-4">
                                <button
                                    onClick={handleSaveProfile}
                                    disabled={isSavingProfile}
                                    className="bg-primary text-white font-black px-12 py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3 disabled:opacity-50"
                                >
                                    {isSavingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                                    REFRESH IDENTITY
                                </button>
                            </div>
                        </div>

                        {/* Password */}
                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-8">
                            <h3 className="text-xl font-black text-text-primary flex items-center gap-3">
                                <ShieldCheck className="w-6 h-6 text-primary" />
                                Vault Access
                            </h3>
                            <form onSubmit={handleSubmit(handleChangePassword)} className="space-y-8">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2">Old Secret</label>
                                        <div className="relative group">
                                            <input 
                                                type={showOldPw ? 'text' : 'password'} 
                                                className={cn(
                                                    "w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm pr-14",
                                                    passwordErrors.senhaAtual && 'border-red-200'
                                                )} 
                                                {...register('senhaAtual')} 
                                            />
                                            <button type="button" onClick={() => setShowOldPw(!showOldPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors">
                                                {showOldPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2">New Bloom Secret</label>
                                        <div className="relative group">
                                            <input 
                                                type={showNewPw ? 'text' : 'password'} 
                                                className={cn(
                                                    "w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm pr-14",
                                                    passwordErrors.novaSenha && 'border-red-200'
                                                )} 
                                                {...register('novaSenha')} 
                                            />
                                            <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors">
                                                {showNewPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2">Confirm Bloom</label>
                                        <input 
                                            type="password" 
                                            className={cn(
                                                "w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm",
                                                passwordErrors.confirmarSenha && 'border-red-200'
                                            )} 
                                            {...register('confirmarSenha')} 
                                        />
                                    </div>
                                </div>
                                <div className="flex justify-end">
                                    <button type="submit" disabled={isSavingPw} className="bg-text-primary text-white font-black px-12 py-4 rounded-2xl hover:bg-black transition-all flex items-center gap-3 disabled:opacity-50">
                                        {isSavingPw ? <Loader2 className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                                        UPDATE ACCESS
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Integrations Tab */}
                {activeTab === 'integracoes' && (
                    <div className="grid grid-cols-1 gap-4 animate-fade-in pb-20">
                        {INTEGRATIONS.map((int) => {
                            const Icon = int.icon
                            const isActive = integrations[int.id]?.ativo || false
                            return (
                                <div key={int.id} className="group bg-white border border-surface-200 rounded-[32px] p-8 shadow-sm hover:shadow-premium transition-all flex items-center gap-8 relative overflow-hidden">
                                    {isActive && <div className="absolute top-0 left-0 w-1.5 h-full bg-primary" />}
                                    <div className={cn(
                                        "w-16 h-16 rounded-[24px] flex items-center justify-center flex-shrink-0 transition-all",
                                        isActive ? "bg-primary/5 text-primary scale-110" : "bg-surface-50 text-text-muted group-hover:bg-surface-100"
                                    )}>
                                        <Icon className="w-8 h-8" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-4">
                                            <h4 className="text-xl font-black text-text-primary">{int.label}</h4>
                                            {isActive ? (
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/5 text-primary text-[10px] font-black uppercase tracking-widest">
                                                    <CheckCircle className="w-3 h-3" />
                                                    Synced
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-100 text-text-muted text-[10px] font-black uppercase tracking-widest">
                                                    <XCircle className="w-3 h-3" />
                                                    Dormant
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-text-muted mt-1 font-medium">{int.desc}</p>
                                        {int.id === 'webhook' && (
                                            <div className="mt-4 max-w-lg">
                                                <input
                                                    type="url"
                                                    placeholder="https://bloom-stream.io/webhook"
                                                    value={webhookUrl}
                                                    onChange={(e) => setWebhookUrl(e.target.value)}
                                                    className="w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-inner"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        onClick={() => handleToggleIntegration(int.id)}
                                        className={cn(
                                            "min-w-[140px] font-black py-4 rounded-2xl transition-all text-sm",
                                            isActive 
                                                ? "bg-red-50 text-red-500 hover:bg-red-500 hover:text-white" 
                                                : "bg-surface-50 text-text-primary hover:bg-primary hover:text-white"
                                        )}
                                    >
                                        {isActive ? 'DISCONNECT' : 'SYNC NOW'}
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}

                {/* Personalization Tab */}
                {activeTab === 'personalizacao' && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-6">
                            <h3 className="text-xl font-black text-text-primary">Master Brand Asset</h3>
                            <p className="text-text-muted font-medium">
                                This bloom logo will be automatically injected into all your HD creations for consistent branding.
                            </p>
                            <div
                                className="w-full h-48 rounded-[32px] border-4 border-dashed border-surface-200 hover:border-primary/30 bg-surface-50 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer group relative overflow-hidden"
                                onClick={() => logoInputRef.current?.click()}
                            >
                                {logoPreview ? (
                                    <img src={logoPreview} alt="Logo" className="h-full object-contain p-8 z-10" />
                                ) : (
                                    <>
                                        <Upload className="w-8 h-8 text-text-muted group-hover:text-primary transition-colors group-hover:scale-110 duration-500" />
                                        <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Inject Master Logo Asset</span>
                                    </>
                                )}
                            </div>
                            <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </div>

                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-8">
                            <h3 className="text-xl font-black text-text-primary flex items-center gap-4">
                                <Palette className="w-6 h-6 text-primary" />
                                Luminous Tone Kit
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Primary Bloom Tone</label>
                                    <div className="flex items-center gap-4">
                                        <div 
                                            className="w-14 h-14 rounded-2xl border-2 border-surface-200 shadow-sm relative overflow-hidden"
                                            style={{ backgroundColor: brandColors.primary }}
                                        >
                                            <input
                                                type="color"
                                                value={brandColors.primary}
                                                onChange={(e) => setBrandColors((p) => ({ ...p, primary: e.target.value }))}
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={brandColors.primary}
                                            onChange={(e) => setBrandColors((p) => ({ ...p, primary: e.target.value }))}
                                            className="flex-1 bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 font-mono text-sm font-bold uppercase outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Accent Bloom Tone</label>
                                    <div className="flex items-center gap-4">
                                        <div 
                                            className="w-14 h-14 rounded-2xl border-2 border-surface-200 shadow-sm relative overflow-hidden"
                                            style={{ backgroundColor: brandColors.secondary }}
                                        >
                                            <input
                                                type="color"
                                                value={brandColors.secondary}
                                                onChange={(e) => setBrandColors((p) => ({ ...p, secondary: e.target.value }))}
                                                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                                            />
                                        </div>
                                        <input
                                            type="text"
                                            value={brandColors.secondary}
                                            onChange={(e) => setBrandColors((p) => ({ ...p, secondary: e.target.value }))}
                                            className="flex-1 bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 font-mono text-sm font-bold uppercase outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white border border-surface-200 rounded-[40px] p-10 shadow-sm flex flex-col gap-6">
                            <h3 className="text-xl font-black text-text-primary flex items-center gap-4">
                                <Type className="w-6 h-6 text-primary" />
                                Typography Flow
                            </h3>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Standard Text Face</label>
                                <select className="w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl px-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm appearance-none cursor-pointer">
                                    {['Outfit', 'Inter', 'Montserrat', 'Outfit Bold', 'Roboto', 'Syne'].map((f) => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="flex justify-end pt-4">
                            <button
                                onClick={() => toast.success('Kit saved!')}
                                className="bg-primary text-white font-black px-12 py-5 rounded-3xl shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-3"
                            >
                                <Save className="w-5 h-5" />
                                SAVE BLOOM KIT
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </main>
    )
}
