'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, Lock, Mail, User, Sparkles, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { signIn } from 'next-auth/react'
import { cn } from '@/lib/utils'

const cadastroSchema = z.object({
    nome: z.string().min(3, 'Name must be at least 3 characters'),
    email: z.string().email('Invalid email'),
    senha: z
        .string()
        .min(8, 'Minimum 8 characters')
        .regex(/[A-Z]/, 'Must contain at least 1 uppercase letter')
        .regex(/[0-9]/, 'Must contain at least 1 number')
        .regex(/[^A-Za-z0-9]/, 'Must contain at least 1 special character'),
    confirmarSenha: z.string(),
}).refine((d) => d.senha === d.confirmarSenha, {
    message: 'Passwords do not match',
    path: ['confirmarSenha'],
})

type CadastroForm = z.infer<typeof cadastroSchema>

// Helper to calculate password strength (0 to 4)
const calculateStrength = (password: string) => {
    let strength = 0
    if (!password) return strength
    if (password.length >= 8) strength += 1
    if (/[A-Z]/.test(password)) strength += 1
    if (/[0-9]/.test(password)) strength += 1
    if (/[^A-Za-z0-9]/.test(password)) strength += 1
    return strength
}

export default function CadastroPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const {
        register,
        handleSubmit,
        watch,
        formState: { errors },
    } = useForm<CadastroForm>({
        resolver: zodResolver(cadastroSchema),
    })

    // Watch password to calculate strength
    const senhaValue = watch('senha', '')
    const strength = calculateStrength(senhaValue)

    const getStrengthColor = () => {
        if (strength === 0) return 'bg-surface-200'
        if (strength <= 2) return 'bg-red-400'       
        if (strength === 3) return 'bg-amber-400' 
        return 'bg-emerald-400'                      
    }

    const getStrengthLabel = () => {
        if (strength === 0) return 'Type a secret'
        if (strength <= 2) return 'Weak bloom'
        if (strength === 3) return 'Growing'
        return 'Strong oak'
    }

    const onSubmit = async (data: CadastroForm) => {
        setIsLoading(true)
        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    nome: data.nome,
                    email: data.email,
                    password: data.senha,
                }),
            })

            const result = await response.json()

            if (!response.ok) {
                if (result.error?.includes('Email já cadastrado') || result.error?.includes('already')) {
                    toast.error('Identity already exists. Try blooming in via login.')
                } else {
                    toast.error(result.error || 'Failed to plant your account. Try again.')
                }
                return
            }

            const signInResult = await signIn('credentials', {
                email: data.email,
                password: data.senha,
                redirect: false,
            })

            if (signInResult?.ok) {
                toast.success('Your garden is ready! Welcome to Pétalas.')
                router.push('/dashboard')
                router.refresh()
            } else {
                toast.success('Account planted! Bloom in through login.')
                router.push('/login')
            }
        } catch {
            toast.error('Error planting account. Try again.')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="animate-fade-in max-w-md w-full">
            <div className="mb-10">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest mb-4">
                    <Sparkles className="w-3 h-3" />
                    Join the ecosystem
                </div>
                <h2 className="text-4xl font-black text-text-primary tracking-tight">Plant your Account</h2>
                <p className="text-text-muted mt-3 font-medium">
                    Start blooming professional AI content today.
                </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Full Identity Name</label>
                    <div className="relative group mt-2">
                        <User className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            type="text"
                            placeholder="Alex Smith"
                            className={cn(
                                'w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm',
                                errors.nome && 'border-red-200'
                            )}
                            {...register('nome')}
                        />
                    </div>
                    {errors.nome && <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-wider px-2">{errors.nome.message}</p>}
                </div>

                <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">E-mail Address</label>
                    <div className="relative group mt-2">
                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            type="email"
                            placeholder="alex@bloom.io"
                            className={cn(
                                'w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-6 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm',
                                errors.email && 'border-red-200'
                            )}
                            {...register('email')}
                        />
                    </div>
                    {errors.email && <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-wider px-2">{errors.email.message}</p>}
                </div>

                <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Access Secret</label>
                    <div className="relative group mt-2">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Min. 8 characters"
                            className={cn(
                                'w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-14 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm',
                                errors.senha && 'border-red-200'
                            )}
                            {...register('senha')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>

                    <div className="mt-4 px-2">
                        <div className="flex gap-1.5 h-1">
                            {[1, 2, 3, 4].map((level) => (
                                <div
                                    key={level}
                                    className={cn(
                                        'flex-1 rounded-full transition-all duration-500',
                                        strength >= level ? getStrengthColor() : 'bg-surface-200'
                                    )}
                                />
                            ))}
                        </div>
                        <div className="mt-2 flex justify-between items-center">
                            <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">
                                {getStrengthLabel()}
                            </span>
                        </div>
                    </div>
                    {errors.senha && <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-wider px-2">{errors.senha.message}</p>}
                </div>

                <div>
                    <label className="text-[10px] font-black text-text-muted uppercase tracking-[0.2em] px-2 italic">Confirm Secret</label>
                    <div className="relative group mt-2">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            type={showConfirm ? 'text' : 'password'}
                            placeholder="Repeat secret"
                            className={cn(
                                'w-full bg-surface-50 border-2 border-transparent focus:border-primary/20 rounded-2xl pl-12 pr-14 py-4 text-sm font-bold text-text-primary outline-none transition-all shadow-sm',
                                errors.confirmarSenha && 'border-red-200'
                            )}
                            {...register('confirmarSenha')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowConfirm(!showConfirm)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
                        >
                            {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                    </div>
                    {errors.confirmarSenha && (
                        <p className="mt-2 text-[10px] font-black text-red-500 uppercase tracking-wider px-2">{errors.confirmarSenha.message}</p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary text-white font-black py-5 rounded-[24px] shadow-2xl shadow-primary/30 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Planting Identity...
                        </>
                    ) : (
                        <>
                            BLOOM MY ACCOUNT
                            <ArrowRight className="w-5 h-5" />
                        </>
                    )}
                </button>
            </form>

            <p className="mt-10 text-center text-[10px] font-black text-text-muted uppercase tracking-[0.2em]">
                Already a member?{' '}
                <Link href="/login" className="text-primary hover:underline underline-offset-4 decoration-2">
                    Bloom-in
                </Link>
            </p>
        </div>
    )
}
