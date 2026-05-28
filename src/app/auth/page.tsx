'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Coins, ArrowRight, ShieldCheck, Mail, Lock, User } from 'lucide-react'
import { Toaster, toast } from 'sonner'

type Mode = 'login' | 'register'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

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
        setTimeout(() => {
          router.push('/dashboard')
          router.refresh()
        }, 1000)
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
    <div className="min-h-screen flex text-foreground select-none relative overflow-hidden bg-black">
      <Toaster theme="dark" position="top-right" closeButton />

      {/* Floating Ambient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-primary/10 rounded-full blur-[140px] pointer-events-none animate-float" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[45%] h-[45%] bg-primary-glow/5 rounded-full blur-[160px] pointer-events-none" style={{ animation: 'float 8s ease-in-out infinite reverse' }} />

      {/* LEFT SIDE: Marketing (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-neutral-950/20 border-r border-border/30 relative">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary ocr-glow-soft">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold tracking-tight text-sm uppercase">Operação Caixa Rápido</span>
            <span className="text-[9px] text-muted-foreground font-semibold uppercase tracking-[0.2em] -mt-0.5">Máquina de Vendas</span>
          </div>
        </div>

        <div className="space-y-6 max-w-lg my-auto">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-semibold text-primary uppercase tracking-wider">
            <Coins className="w-3.5 h-3.5" />
            <span>Foco em Faturamento</span>
          </div>
          <h2 className="text-4xl xl:text-5xl font-black leading-tight tracking-tight text-white">
            Controle sua operação comercial e <span className="ocr-gradient-text">acelere o caixa.</span>
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Pipeline, prospecção ativa, disparos de WhatsApp, inteligência artificial e métricas comerciais consolidadas em uma única máquina de vendas.
          </p>
          <div className="pt-6 grid grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-border/40 bg-neutral-900/10 backdrop-blur-sm">
              <span className="block text-lg font-bold text-primary text-glow">10x</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Velocidade de Prospecção</span>
            </div>
            <div className="p-4 rounded-xl border border-border/40 bg-neutral-900/10 backdrop-blur-sm">
              <span className="block text-lg font-bold text-primary text-glow">+45%</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">Conversão Comercial</span>
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
        <div className="w-full max-w-md p-8 sm:p-10 rounded-3xl border border-border/80 bg-neutral-950/60 backdrop-blur-xl shadow-2xl ocr-glass-strong relative">

          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 justify-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <Zap className="w-4 h-4" />
            </div>
            <span className="font-bold text-xs uppercase tracking-wider">Caixa Rápido</span>
          </div>

          {/* Mode toggle */}
          <div className="flex rounded-xl border border-border/60 bg-neutral-900/60 p-1 mb-8">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'login' ? 'bg-primary text-black shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all ${mode === 'register' ? 'bg-primary text-black shadow' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Criar conta
            </button>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
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
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-neutral-950 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
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
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-neutral-950 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
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
              <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-neutral-950 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
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
                <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-border bg-neutral-950 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/25 transition-all">
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
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-black font-bold text-sm tracking-wide transition-all active:scale-98 hover:shadow-lg hover:shadow-primary/20 cursor-pointer border border-primary-glow mt-2"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Entrar na operação' : 'Criar minha conta'}</span>
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
