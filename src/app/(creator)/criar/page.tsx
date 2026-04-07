'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Check,
    ChevronRight,
    Upload,
    X,
    Loader2,
    Download,
    Library,
    Plus,
    AlertTriangle,
    CheckCircle,
    Play,
    Sparkles,
    Smartphone,
    RotateCcw,
    ChevronDown,
    ArrowRight
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'
import { saveGeneratedVideo } from './actions'

export default function CriarPage() {
    const router = useRouter()
    
    // States
    const [productName, setProductName] = useState('')
    const [duration, setDuration] = useState('15s')
    const [productPhoto, setProductPhoto] = useState<File | null>(null)
    const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)
    const [progress, setProgress] = useState(0)

    const fileInputRef = useRef<HTMLInputElement>(null)

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (file) {
            setProductPhoto(file)
            setPhotoPreview(URL.createObjectURL(file))
        }
    }

    const handleGenerate = async () => {
        if (!productName) {
            toast.error('Por favor, informe o nome do produto')
            return
        }
        setIsGenerating(true)
        
        let p = 0
        const interval = setInterval(() => {
            p += 5
            setProgress(p)
            if (p >= 100) {
                clearInterval(interval)
                completeGeneration()
            }
        }, 150)
    }

    const completeGeneration = async () => {
        try {
            await saveGeneratedVideo({
                titulo: productName,
                status: 'concluido',
                thumbnail: photoPreview || undefined
            })
            toast.success('Vídeo gerado e salvo na biblioteca!')
            router.push('/biblioteca')
        } catch (error) {
            toast.error('Ocorreu um erro ao salvar o vídeo')
            setIsGenerating(false)
        }
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-64px)]">
                {/* Left Side: Creation Engine Form */}
                <div className="flex-1 p-8 lg:p-12 space-y-12 overflow-y-auto">
                    <header>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">GERADOR DE CONTEÚDO</p>
                        <h1 className="text-5xl font-extrabold text-text-primary tracking-tight">Criar Novo Vídeo</h1>
                    </header>

                    <div className="space-y-16 max-w-xl">
                        {/* 01 Nome do Produto */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-4 ring-primary/5">01</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Nome e Identidade</h3>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">Título do Projeto</label>
                                <input 
                                    type="text" 
                                    placeholder="Ex: Tênis Ultra Flow"
                                    className="w-full bg-surface-50 border-none rounded-2xl p-5 text-text-primary placeholder-surface-300 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                />
                            </div>
                        </section>

                        {/* 02 Upload de Foto */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-surface-100 text-text-muted flex items-center justify-center text-xs font-bold">02</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Foto do Produto</h3>
                            </div>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full aspect-video rounded-[32px] border-2 border-dashed border-surface-200 bg-white hover:bg-surface-50 hover:border-primary/30 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group"
                            >
                                {photoPreview ? (
                                    <div className="relative w-full h-full p-4">
                                        <img src={photoPreview} className="w-full h-full object-contain rounded-2xl" alt="Preview" />
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setPhotoPreview(null); setProductPhoto(null); }}
                                            className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-lg text-text-muted hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-all">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-bold text-text-primary">Faça o upload da foto principal</p>
                                            <p className="text-xs text-text-muted mt-1 uppercase tracking-widest font-black">PNG, JPG ou WEBP até 10MB</p>
                                        </div>
                                    </>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        </section>

                        {/* 03 Duração */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-surface-100 text-text-muted flex items-center justify-center text-xs font-bold">03</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Duração Recomendada</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                {['15s', '20s'].map((d) => (
                                    <button
                                        key={d}
                                        onClick={() => setDuration(d)}
                                        className={cn(
                                            "p-6 rounded-[24px] flex flex-col items-center gap-1 transition-all border-2",
                                            duration === d 
                                                ? "bg-primary/5 border-primary text-primary" 
                                                : "bg-surface-50 border-transparent text-text-muted hover:border-surface-200"
                                        )}
                                    >
                                        <span className="text-xl font-black tracking-tighter leading-none">{d}</span>
                                        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">
                                            {d === '15s' ? 'Curto' : 'Padrão'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Right Side: Preview Display */}
                <div className="w-full lg:w-[600px] bg-surface-50 p-8 lg:p-12 flex flex-col items-center justify-center relative shadow-inner overflow-hidden">
                    {/* Progress Loader overlay */}
                    {isGenerating && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-md z-40 flex flex-col items-center justify-center p-12 text-center">
                            <div className="w-24 h-24 relative mb-8">
                                <svg className="w-full h-full rotate-[-90deg]">
                                    <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-100" />
                                    <circle cx="48" cy="48" r="44" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray={276} strokeDashoffset={276 - (276 * progress) / 100} className="text-rose-500 transition-all duration-300" strokeLinecap="round" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Sparkles className="w-8 h-8 text-rose-500 animate-pulse" />
                                </div>
                            </div>
                            <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase">Vibrando Ideias...</h2>
                            <p className="text-slate-500 font-bold max-w-xs">{progress}% concluído • Nossa IA está renderizando o vídeo perfeito para {productName || 'seu produto'}.</p>
                        </div>
                    )}

                    {/* Preview iPhone Frame */}
                    <div className="relative w-[320px] aspect-[9/19] bg-text-primary rounded-[48px] p-4 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] ring-12 ring-surface-200 overflow-hidden transform hover:-translate-y-2 transition-transform duration-700">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-text-primary rounded-b-2xl z-20" />
                        
                        <div className="w-full h-full rounded-[36px] overflow-hidden bg-surface-900 relative">
                            <img 
                                src={photoPreview || "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000&auto=format&fit=crop"} 
                                className="w-full h-full object-cover"
                                alt="Preview" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                            
                            <div className="absolute bottom-24 left-4 right-4 bg-white/10 backdrop-blur-xl p-5 rounded-2xl border border-white/20">
                                <div className="flex flex-col gap-3">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-white/60">ROTEIRO GERADO POR IA</p>
                                    <p className="text-xs font-bold text-white leading-relaxed">
                                        Experimente o futuro com <span className="text-rose-400">@{productName || "seu produto"}</span>. Design mestre. Precisão e elegância que você merece.
                                    </p>
                                </div>
                            </div>

                            <div className="absolute bottom-8 left-4 flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full border-2 border-white/20 bg-rose-500 flex items-center justify-center text-[10px] font-black text-white italic">
                                    P
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white">@SuaMarca</p>
                                </div>
                            </div>

                            <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-1/3" />
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 w-full max-w-[320px]">
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating || !productName}
                            className="w-full bg-rose-600 text-white p-6 rounded-[32px] font-extrabold flex items-center justify-center gap-3 shadow-2xl shadow-rose-500/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 group uppercase tracking-widest text-sm"
                        >
                            <Sparkles className="w-6 h-6 border-rose-400" />
                            Gerar Vídeo Agora
                            <ArrowRight className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
