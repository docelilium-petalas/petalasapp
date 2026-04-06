'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import toast from 'react-hot-toast'
import { Eye, EyeOff, Loader2, Lock, Mail, Github, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { signIn, getSession } from 'next-auth/react'
import { cn } from '@/lib/utils'

const loginSchema = z.object({
    email: z.string().email('E-mail inválido'),
    senha: z.string().min(1, 'Senha é obrigatória'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
    const router = useRouter()
    const [showPassword, setShowPassword] = useState(false)
    const [isLoading, setIsLoading] = useState(false)

    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginForm>({
        resolver: zodResolver(loginSchema),
    })

    const onSubmit = async (data: LoginForm) => {
        setIsLoading(true)
        try {
            const result = await signIn('credentials', {
                email: data.email,
                password: data.senha,
                redirect: false,
            })

            if (result?.error) {
                if (result.error === 'Conta inativa') {
                    toast.error('Sua conta está desativada. Contate o administrador')
                } else {
                    toast.error('E-mail ou senha incorretos')
                }
                return
            }

            if (!result?.ok) {
                toast.error('Erro ao fazer login. Tente novamente')
                return
            }

            toast.success('Login realizado com sucesso!')

            const session = await getSession()
            if ((session?.user as any)?.perfil === 'admin') {
                router.push('/admin/dashboard')
            } else {
                router.push('/dashboard')
            }
            router.refresh()
        } catch {
            toast.error('Erro inesperado. Tente novamente')
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="flex flex-col">
            <div className="hidden lg:flex flex-col items-center mb-12">
                <div className="w-16 h-16 rounded-[24px] bg-primary flex items-center justify-center shadow-2xl shadow-primary/30 mb-4 transition-transform hover:rotate-12">
                    <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h1 className="text-3xl font-black text-text-primary tracking-tight">Pétalas</h1>
            </div>

            <div className="text-center lg:text-left mb-10">
                <h2 className="text-3xl font-black text-text-primary tracking-tight">Sign in to your account</h2>
                <p className="text-text-muted mt-2 font-medium">Use your organization credentials to login.</p>
            </div>

            <div className="space-y-4 mb-10">
                <div className="grid grid-cols-2 gap-4">
                    <button className="flex items-center justify-center gap-3 bg-white border border-surface-200 py-3 rounded-2xl hover:bg-surface-50 transition-all font-bold text-sm text-text-primary shadow-sm active:scale-95">
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                        </svg>
                        Google
                    </button>
                    <button className="flex items-center justify-center gap-3 bg-white border border-surface-200 py-3 rounded-2xl hover:bg-surface-50 transition-all font-bold text-sm text-text-primary shadow-sm active:scale-95">
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.702z"/>
                        </svg>
                        Apple
                    </button>
                </div>
                <div className="flex items-center gap-4">
                    <div className="h-[1px] flex-1 bg-surface-100" />
                    <span className="text-[10px] font-black text-text-muted uppercase tracking-widest">Or login with email</span>
                    <div className="h-[1px] flex-1 bg-surface-100" />
                </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                <div>
                    <div className="relative group">
                        <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            id="email"
                            type="email"
                            placeholder="Email address"
                            className={cn(
                                "w-full bg-surface-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl py-4 pl-14 pr-5 text-sm font-bold text-text-primary placeholder-surface-300 transition-all outline-none",
                                errors.email && "border-red-100 bg-red-50"
                            )}
                            {...register('email')}
                        />
                    </div>
                    {errors.email && (
                        <p className="mt-2 text-xs text-red-500 font-bold pl-2">{errors.email.message}</p>
                    )}
                </div>

                <div>
                    <div className="relative group">
                        <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted group-focus-within:text-primary transition-colors" />
                        <input
                            id="senha"
                            type={showPassword ? 'text' : 'password'}
                            placeholder="Password"
                            className={cn(
                                "w-full bg-surface-50 border-2 border-transparent focus:bg-white focus:border-primary/20 rounded-2xl py-4 pl-14 pr-14 text-sm font-bold text-text-primary placeholder-surface-300 transition-all outline-none",
                                errors.senha && "border-red-100 bg-red-50"
                            )}
                            {...register('senha')}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary transition-colors"
                        >
                            {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                    </div>
                    {errors.senha && (
                        <p className="mt-2 text-xs text-red-500 font-bold pl-2">{errors.senha.message}</p>
                    )}
                </div>

                <div className="flex items-center justify-between px-2">
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <input type="checkbox" className="w-5 h-5 rounded-lg border-surface-200 text-primary focus:ring-primary/20 transition-all cursor-pointer" />
                        <span className="text-sm font-bold text-text-muted group-hover:text-text-primary transition-colors">Remember me</span>
                    </label>
                    <Link
                        href="/esqueci-senha"
                        className="text-sm font-black text-primary hover:text-primary-600 transition-colors uppercase tracking-widest"
                    >
                        Forgot?
                    </Link>
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full bg-primary text-white font-black py-4 rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-3 mt-4"
                >
                    {isLoading ? (
                        <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            AUTHENTICATING...
                        </>
                    ) : (
                        'SIGN IN'
                    )}
                </button>
            </form>

            <p className="mt-12 text-center text-sm font-bold text-text-muted">
                Don't have an account?{' '}
                <Link href="/cadastro" className="text-primary hover:text-primary-600 font-black transition-colors underline-offset-4 hover:underline">
                    Create Account
                </Link>
            </p>
        </div>
    )
}

