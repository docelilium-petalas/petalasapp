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
import { useSession } from 'next-auth/react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

export default function CriarPage() {
    const router = useRouter()
    const { data: session } = useSession()
    
    // States
    const [productName, setProductName] = useState('')
    const [duration, setDuration] = useState('15s')
    const [narrativeStyle, setNarrativeStyle] = useState('High-Energy Hype')
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
        // Mock progress
        let p = 0
        const interval = setInterval(() => {
            p += 5
            setProgress(p)
            if (p >= 100) {
                clearInterval(interval)
                setTimeout(() => {
                    toast.success('Vídeo gerado com sucesso!')
                    router.push('/biblioteca')
                }, 500)
            }
        }, 200)
    }

    return (
        <div className="min-h-screen bg-white">
            <div className="flex flex-col lg:flex-row h-full min-h-[calc(100vh-64px)]">
                {/* Left Side: Creation Engine Form */}
                <div className="flex-1 p-8 lg:p-12 space-y-12">
                    <header>
                        <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em] mb-2">CREATION ENGINE</p>
                        <h1 className="text-5xl font-extrabold text-text-primary tracking-tight">New Video Project</h1>
                    </header>

                    <div className="space-y-16 max-w-xl">
                        {/* 01 Product Identity */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold ring-4 ring-primary/5">01</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Product Identity</h3>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-text-muted uppercase tracking-widest pl-1">PRODUCT NAME</label>
                                <input 
                                    type="text" 
                                    placeholder="e.g. Lumina Smart Watch"
                                    className="w-full bg-surface-50 border-none rounded-2xl p-5 text-text-primary placeholder-surface-300 focus:ring-2 focus:ring-primary/20 transition-all outline-none"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                />
                            </div>
                        </section>

                        {/* 02 Product Assets */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-surface-100 text-text-muted flex items-center justify-center text-xs font-bold">02</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Product Assets</h3>
                            </div>
                            <div 
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full aspect-[4/3] rounded-[32px] border-2 border-dashed border-surface-200 bg-white hover:bg-surface-50 hover:border-primary/30 transition-all flex flex-col items-center justify-center gap-4 cursor-pointer group group"
                            >
                                {photoPreview ? (
                                    <div className="relative w-full h-full p-4">
                                        <img src={photoPreview} className="w-full h-full object-contain rounded-2xl" alt="Preview" />
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); setPhotoPreview(null); setProductPhoto(null); }}
                                            className="absolute top-6 right-6 p-2 bg-white rounded-full shadow-lg text-text-muted hover:text-red-500"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
                                            <Upload className="w-6 h-6" />
                                        </div>
                                        <div className="text-center">
                                            <p className="font-bold text-text-primary">Drop product photo here</p>
                                            <p className="text-xs text-text-muted mt-1">PNG or JPG, up to 10MB</p>
                                        </div>
                                    </>
                                )}
                                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileChange} />
                            </div>
                        </section>

                        {/* 03 Video Duration */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-surface-100 text-text-muted flex items-center justify-center text-xs font-bold">03</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Video Duration</h3>
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                                {['15s', '30s', '60s'].map((d) => (
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
                                            {d === '15s' ? 'SHORT' : d === '30s' ? 'STANDARD' : 'LONG'}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </section>

                        {/* 04 Narrative Style */}
                        <section className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 rounded-full bg-surface-100 text-text-muted flex items-center justify-center text-xs font-bold">04</div>
                                <h3 className="text-lg font-bold text-text-primary tracking-tight">Narrative Style</h3>
                            </div>
                            <div className="relative group">
                                <select 
                                    value={narrativeStyle}
                                    onChange={(e) => setNarrativeStyle(e.target.value)}
                                    className="w-full bg-surface-50 border-none rounded-2xl p-5 text-text-primary font-bold appearance-none outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option>High-Energy Hype</option>
                                    <option>Professional Overview</option>
                                    <option>Casual Review</option>
                                    <option>Educational Deep-dive</option>
                                </select>
                                <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-hover:text-primary transition-colors pointer-events-none" />
                            </div>
                        </section>

                        {/* AI Suggestion Box */}
                        <div className="bg-accent/5 p-8 rounded-[32px] border border-accent/10 relative overflow-hidden group">
                            <div className="flex items-start gap-4">
                                <div className="w-10 h-10 rounded-2xl bg-accent/10 text-accent flex items-center justify-center flex-shrink-0">
                                    <Sparkles className="w-5 h-5" />
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs font-black text-accent uppercase tracking-widest">AI Suggestion</p>
                                    <p className="text-sm font-bold text-text-secondary leading-relaxed">
                                        Based on your product name, a cinematic aesthetic with 30s duration usually converts 40% better.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Preview Display */}
                <div className="w-full lg:w-[600px] bg-surface-50 p-8 lg:p-12 flex flex-col items-center justify-center relative shadow-inner">
                    {/* Header Controls */}
                    <div className="w-full flex items-center justify-between absolute top-12 px-12">
                        <div className="flex bg-white p-2 rounded-2xl shadow-sm gap-2">
                            <div className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/20 pointer-events-none">
                                <Smartphone className="w-5 h-5" />
                            </div>
                            <div className="w-10 h-10 rounded-xl hover:bg-surface-50 text-text-muted flex items-center justify-center transition-colors cursor-pointer">
                                <Play className="w-5 h-5" />
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="bg-white px-4 py-2 rounded-full border border-surface-200 shadow-sm flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                                <span className="text-[10px] font-black uppercase tracking-widest text-text-primary">LIVE PREVIEW</span>
                            </div>
                            <button className="p-3 bg-white rounded-2xl border border-surface-200 shadow-sm hover:rotate-180 transition-all duration-500 text-text-muted hover:text-primary">
                                <RotateCcw className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Preview iPhone Frame */}
                    <div className="relative w-[320px] aspect-[9/18.5] bg-text-primary rounded-[48px] p-4 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.3)] ring-12 ring-surface-200 overflow-hidden transform hover:-translate-y-2 transition-transform duration-700">
                        {/* Notch */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-text-primary rounded-b-2xl z-20" />
                        
                        {/* Screen Content */}
                        <div className="w-full h-full rounded-[36px] overflow-hidden bg-surface-900 relative">
                            <img 
                                src={photoPreview || "https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?q=80&w=1000&auto=format&fit=crop"} 
                                className="w-full h-full object-cover"
                                alt="Preview" 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
                            
                            {/* AI Generated Script Bubble */}
                            <div className="absolute bottom-24 left-4 right-4 bg-white/10 backdrop-blur-xl p-5 rounded-2xl border border-white/20 animate-slide-up">
                                <div className="flex flex-col gap-3">
                                    <p className="text-[8px] font-black uppercase tracking-widest text-white/60">AI GENERATED SCRIPT</p>
                                    <p className="text-xs font-bold text-white leading-relaxed">
                                        Experience the future of {productName || "time"}. Introducing the all-new Lumina. Precision meets elegance.
                                    </p>
                                </div>
                            </div>

                            {/* User Profile Hook */}
                            <div className="absolute bottom-8 left-4 flex items-center gap-2">
                                <div className="w-8 h-8 rounded-full border-2 border-white/20 overflow-hidden">
                                    <img src="https://i.pravatar.cc/150?u=4" alt="User" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-white">@YourBrand</p>
                                    <p className="text-[8px] text-white/60">AI Voice: 'Premium Male'</p>
                                </div>
                            </div>

                            {/* Progress Indicator */}
                            <div className="absolute bottom-4 left-4 right-4 h-1 bg-white/20 rounded-full overflow-hidden">
                                <div className="h-full bg-primary w-1/3" />
                            </div>
                        </div>
                    </div>

                    {/* Bottom CTA Button */}
                    <div className="absolute bottom-12 w-full px-12">
                        <button 
                            onClick={handleGenerate}
                            disabled={isGenerating}
                            className="w-full bg-primary text-white p-6 rounded-[32px] font-extrabold flex items-center justify-center gap-3 shadow-2xl shadow-primary/30 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 group"
                        >
                            {isGenerating ? (
                                <Loader2 className="w-6 h-6 animate-spin" />
                            ) : (
                                <>
                                    <Sparkles className="w-6 h-6" />
                                    Generate Video with AI
                                    <ArrowRight className="w-6 h-6 ml-2 group-hover:translate-x-1 transition-transform" />
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}

