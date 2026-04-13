'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
    Upload,
    X,
    Sparkles,
    ArrowRight,
    Play,
    CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

const steps = [
    { num: '01', label: 'Nome e Identidade' },
    { num: '02', label: 'Foto do Produto' },
    { num: '03', label: 'Duração' },
]

export default function CriarPage() {
    const router = useRouter()

    const [productName, setProductName] = useState('')
    const [duration, setDuration] = useState('15s')
    const [productPhoto, setProductPhoto] = useState<File | null>(null)
    const [photoPreview, setPhotoPreview] = useState<string | null>(null)
    const [isGenerating, setIsGenerating] = useState(false)

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
        if (!productPhoto) {
            toast.error('Por favor, adicione uma foto do produto')
            return
        }
        setIsGenerating(true)

        try {
            // 1. Cria registro no banco com status "processando"
            const res = await fetch('/api/creator/videos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome_produto: productName,
                    descricao_produto: 'Gerado via IA',
                    formato: 'instagram',
                    linha_editorial: 'Geral',
                    duracao: parseInt(duration),
                    tom: 'Vibrante',
                }),
            })

            if (!res.ok) throw new Error('Erro ao criar registro do vídeo')
            const { id: videoId } = await res.json()

            // 2. Dispara o webhook do n8n com a imagem como binário (multipart/form-data)
            const webhookData = new FormData()
            webhookData.append('nomeProduto', productName)
            webhookData.append('videoId', videoId)
            webhookData.append('image', productPhoto)

            fetch('https://auto.devnetlife.com/webhook/docelilium', {
                method: 'POST',
                body: webhookData,
            }).catch(err => console.error('n8n webhook error:', err))

            toast.success('Vídeo enviado para geração! Acompanhe na Biblioteca.')
            router.push('/biblioteca')
        } catch {
            toast.error('Ocorreu um erro ao iniciar a geração')
            setIsGenerating(false)
        }
    }

    const activeStep = !productName ? 0 : !productPhoto ? 1 : 2

    return (
        <div className="min-h-screen" style={{ background: 'var(--color-bg-main)' }}>
            <div className="flex flex-col lg:flex-row min-h-[calc(100vh-57px)]">
                {/* Left — Form */}
                <div className="flex-1 p-6 lg:p-8 space-y-8 overflow-y-auto">
                    {/* Header */}
                    <div>
                        <p className="label mb-1">Gerador de Conteúdo</p>
                        <h1 className="text-2xl font-bold text-text-primary">Criar Novo Vídeo</h1>
                    </div>

                    {/* Progress steps */}
                    <div className="flex items-center gap-0">
                        {steps.map((step, i) => (
                            <div key={step.num} className="flex items-center">
                                <div className="flex items-center gap-2">
                                    <div
                                        className={cn(
                                            'w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors',
                                            i < activeStep
                                                ? 'bg-emerald-500 text-white'
                                                : i === activeStep
                                                ? 'bg-primary text-white'
                                                : 'bg-surface-200 text-text-muted'
                                        )}
                                    >
                                        {i < activeStep ? (
                                            <CheckCircle2 className="w-4 h-4" />
                                        ) : (
                                            step.num
                                        )}
                                    </div>
                                    <span
                                        className={cn(
                                            'text-xs font-medium hidden sm:block',
                                            i === activeStep
                                                ? 'text-text-primary'
                                                : 'text-text-muted'
                                        )}
                                    >
                                        {step.label}
                                    </span>
                                </div>
                                {i < steps.length - 1 && (
                                    <div
                                        className={cn(
                                            'h-px w-8 mx-3 transition-colors',
                                            i < activeStep ? 'bg-emerald-300' : 'bg-surface-200'
                                        )}
                                    />
                                )}
                            </div>
                        ))}
                    </div>

                    <div className="space-y-8 max-w-lg">
                        {/* Step 01 */}
                        <section className="card space-y-4">
                            <div className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold">
                                    1
                                </div>
                                <h3 className="section-title">Nome e Identidade</h3>
                            </div>
                            <div>
                                <label className="label">Título do Projeto</label>
                                <input
                                    type="text"
                                    placeholder="Ex: Tênis Ultra Flow"
                                    className="input-field"
                                    value={productName}
                                    onChange={(e) => setProductName(e.target.value)}
                                />
                            </div>
                        </section>

                        {/* Step 02 */}
                        <section className="card space-y-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                                        productName
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-surface-100 text-text-muted'
                                    )}
                                >
                                    2
                                </div>
                                <h3 className="section-title">Foto do Produto</h3>
                            </div>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="w-full rounded-xl border-2 border-dashed border-surface-200 bg-surface-50 hover:border-primary/30 hover:bg-white transition-all flex flex-col items-center justify-center gap-3 cursor-pointer p-8"
                            >
                                {photoPreview ? (
                                    <div className="relative w-full">
                                        <img
                                            src={photoPreview}
                                            className="w-full max-h-48 object-contain rounded-lg"
                                            alt="Preview"
                                        />
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation()
                                                setPhotoPreview(null)
                                                setProductPhoto(null)
                                            }}
                                            className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-sm text-text-muted hover:text-red-500 transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="w-10 h-10 rounded-lg bg-surface-100 flex items-center justify-center">
                                            <Upload className="w-5 h-5 text-text-muted" />
                                        </div>
                                        <div className="text-center">
                                            <p className="text-sm font-medium text-text-secondary">
                                                Clique para fazer upload
                                            </p>
                                            <p className="text-xs text-text-muted mt-1">
                                                PNG, JPG ou WEBP até 10MB
                                            </p>
                                        </div>
                                    </>
                                )}
                                <input
                                    type="file"
                                    ref={fileInputRef}
                                    className="hidden"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                />
                            </div>
                        </section>

                        {/* Step 03 */}
                        <section className="card space-y-4">
                            <div className="flex items-center gap-3">
                                <div
                                    className={cn(
                                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold',
                                        productName && productPhoto
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-surface-100 text-text-muted'
                                    )}
                                >
                                    3
                                </div>
                                <h3 className="section-title">Duração</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { val: '15s', label: 'Curto', desc: 'Ideal para Stories' },
                                    { val: '20s', label: 'Padrão', desc: 'Maior alcance' },
                                ].map((d) => (
                                    <button
                                        key={d.val}
                                        onClick={() => setDuration(d.val)}
                                        className={cn(
                                            'p-4 rounded-xl border-2 flex flex-col items-start gap-1 transition-all',
                                            duration === d.val
                                                ? 'border-primary bg-primary/5'
                                                : 'border-surface-200 bg-white hover:border-surface-300'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'text-lg font-bold leading-none',
                                                duration === d.val
                                                    ? 'text-primary'
                                                    : 'text-text-primary'
                                            )}
                                        >
                                            {d.val}
                                        </span>
                                        <span className="text-xs text-text-muted">{d.desc}</span>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>
                </div>

                {/* Right — Preview */}
                <div className="w-full lg:w-[480px] bg-white border-l border-surface-100 p-6 lg:p-8 flex flex-col items-center justify-center">
                    {/* Generating overlay */}
                    {isGenerating && (
                        <div className="absolute inset-0 bg-white/90 z-40 flex flex-col items-center justify-center p-8 text-center">
                            <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin mb-6" />
                            <h2 className="text-lg font-bold text-text-primary mb-1">
                                Enviando para geração...
                            </h2>
                            <p className="text-sm text-text-muted">
                                Você será redirecionado para a Biblioteca
                            </p>
                        </div>
                    )}

                    {/* Preview card */}
                    <div className="w-full max-w-sm">
                        <p className="label mb-3 text-center">Pré-visualização</p>

                        <div className="bg-surface-50 border border-surface-200 rounded-xl overflow-hidden">
                            {/* Thumbnail area */}
                            <div className="aspect-video bg-surface-100 relative flex items-center justify-center">
                                {photoPreview ? (
                                    <>
                                        <img
                                            src={photoPreview}
                                            className="w-full h-full object-cover"
                                            alt="Preview"
                                        />
                                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                            <div className="w-12 h-12 rounded-full bg-white/30 backdrop-blur-sm border border-white/40 flex items-center justify-center">
                                                <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-text-muted">
                                        <Play className="w-8 h-8 opacity-30" />
                                        <p className="text-xs">
                                            Faça upload de uma imagem
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Metadata */}
                            <div className="p-4 space-y-2">
                                <div className="flex items-center justify-between">
                                    <p className="text-sm font-medium text-text-primary truncate">
                                        {productName || 'Nome do Produto'}
                                    </p>
                                    <span className="badge badge-gray">{duration}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <p className="text-xs text-text-muted">
                                        Roteiro gerado por IA
                                    </p>
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={isGenerating || !productName}
                            className="w-full btn-primary mt-4 py-3 justify-center disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Sparkles className="w-4 h-4" />
                            Gerar Vídeo
                            <ArrowRight className="w-4 h-4 ml-1" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
