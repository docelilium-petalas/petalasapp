'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Flower2, Coins, ArrowRight, ShieldCheck, Mail, Lock, User } from 'lucide-react'
import { Toaster, toast } from 'sonner'
import { useAuth } from '@/context/AuthContext'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const router = useRouter()
  const { user, loading: authLoading, setUser } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!authLoading && user) {
      router.replace('/dashboard')
    }
  }, [authLoading, user, router])

  const switchMode = (next: Mode) => {
    setMode(next)
    setNome('')
    setEmail('')
    setPassword('')
    setConfirmPassword('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (mode === 'register') {
      if (!nome.trim()) { toast.error('Informe seu nome.'); return }
      if (!email.trim()) { toast.error('Informe seu email.'); return }
      if (password.length < 6) { toast.error('Senha deve ter pelo menos 6 caracteres.'); return }
      if (password !== confirmPassword) { toast.error('As senhas não coincidem.'); return }
    } else {
      if (!email || !password) { toast.error('Preencha todos os campos.'); return }
    }

    setLoading(true)
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register'
      const payload = mode === 'login'
        ? { email, password }
        : { nome, email, password }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()

      if (res.ok) {
        toast.success(mode === 'login' ? 'Acesso autorizado! Carregando painel...' : 'Conta criada! Entrando...')
        setUser(data.user)
        setTimeout(() => {
          router.push('/dashboard')
        }, 800)
      } else {
        toast.error(data.error || 'Erro ao processar requisição.')
        setLoading(false)
      }
    } catch {
      toast.error('Ocorreu um erro na conexão.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex text-foreground select-none relative overflow-hidden bg-background">
      <Toaster theme="light" position="top-right" closeButton />

      {/* Logo no Canto Superior Esquerdo */}
      <div className="absolute top-8 left-8 z-50 flex flex-col items-center justify-center w-28 h-40 border-2 border-primary rounded-t-full rounded-b-full p-2 bg-background/80 backdrop-blur-md shadow-lg shadow-primary/20 scale-90 origin-top-left border-2 border-primary rounded-t-full rounded-b-full p-2 bg-background/80 backdrop-blur-md shadow-lg shadow-primary/20">
        <span className="text-[6px] sm:text-[8px] uppercase tracking-widest text-foreground font-medium mb-1" style={{ fontFamily: "var(--font-montserrat)" }}>Alma Feminina</span>
        <Flower2 className="w-8 h-8 sm:w-12 sm:h-12 text-primary mb-1" />
        <div className="flex flex-col items-center -space-y-2 sm:-space-y-3">
          <span className="text-2xl sm:text-3xl text-foreground" style={{ fontFamily: "var(--font-signature)" }}>Doce</span>
          <span className="text-2xl sm:text-3xl text-foreground ml-3 sm:ml-4" style={{ fontFamily: "var(--font-signature)" }}>Lilium</span>
        </div>
      </div>


      {/* Floating Ambient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[140px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-primary-glow/5 rounded-full blur-[160px] pointer-events-none" style={{ animation: 'float 8s ease-in-out infinite reverse' }} />

      
      {/* LEFT SIDE: Marketing (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-card/50 border-r border-border/30 relative">
        <div className="pt-32 space-y-6 max-w-lg my-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary uppercase tracking-wider">
            <Coins className="w-3.5 h-3.5" />
            <span>Estilo & Elegância</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight text-foreground">
            Vista-se de <span className="ocr-gradient-text">delicadeza e sofisticação.</span>
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            A identidade visual da Doce Lílium Closet transmite delicadeza, feminilidade e elegância em cada detalhe.
          </p>
          <div className="pt-6 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm">
              <span className="block text-lg font-bold text-primary text-glow">10x</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Beleza Refinada</span>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-card/40 backdrop-blur-sm">
              <span className="block text-lg font-bold text-primary text-glow">+45%</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Essência Feminina</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <ShieldCheck className="w-4 h-4 text-primary" />
          <span>Conformidade com a LGPD e criptografia de ponta a ponta.</span>
        </div>
      </div>

      {/* RIGHT SIDE: Auth Card */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12 relative z-10">
        <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl border border-border/80 bg-card/80 backdrop-blur-xl shadow-2xl ocr-glass-strong relative">

          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Flower2 className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs uppercase tracking-wider">Doce Lilium</span>
          </div>

          
          

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-border/60 bg-card/60 p-1 mb-8">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'login' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'register' ? 'bg-primary text-primary-foreground shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Criar conta
            </button>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {mode === 'login' ? 'Bem-vindo à operação' : 'Criar nova conta'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1">
              {mode === 'login'
                ? 'Preencha suas credenciais para acessar seu painel.'
                : 'Preencha os dados para configurar seu acesso.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Nome</label>
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Seu nome"
                    className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">E-mail</label>
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seuemail@empresa.com"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Senha</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => toast.info('Entre em contato com o administrador para resetar a senha.')}
                    className="text-[10px] font-semibold text-primary hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Confirmar senha</label>
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-background focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-sm focus:outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm tracking-wide transition-all active:scale-98 hover:shadow-lg hover:shadow-primary/20 cursor-pointer border border-primary-glow mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Entrar' : 'Criar minha conta'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

        </div>
      </div>
    </div>
  )
}
