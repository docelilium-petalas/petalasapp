'use client'

import React, { useState } from 'react'
import { Flower2, ArrowRight, Mail, Lock, User, ShieldCheck } from 'lucide-react'
import { Toaster, toast } from 'sonner'

type Mode = 'login' | 'register'

export default function AuthPage() {
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

      if (res.ok) {
        toast.success(mode === 'login' ? 'Acesso autorizado! Carregando painel...' : 'Conta criada! Entrando...')
        window.location.href = '/dashboard'
      } else {
        const data = await res.json()
        toast.error(data.error || 'Erro ao processar requisição.')
        setLoading(false)
      }
    } catch {
      toast.error('Ocorreu um erro na conexão.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center relative overflow-hidden select-none">
      <Toaster theme="dark" position="top-right" closeButton />

      {/* Ambient background blobs */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-[#C87783]/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-[#44121E]/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Card */}
      <div className="relative z-10 w-full max-w-md mx-4">

        {/* Brand */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-[#C87783]/10 border border-[#C87783]/30 flex items-center justify-center mb-4">
            <Flower2 className="w-8 h-8 text-[#C87783]" />
          </div>
          <h1
            className="text-4xl text-foreground leading-none"
            style={{ fontFamily: 'var(--font-signature, cursive)' }}
          >
            Doce Lilium
          </h1>
          <p className="text-[10px] uppercase tracking-[0.3em] text-neutral-500 mt-1 font-medium">
            Alma Feminina
          </p>
        </div>

        {/* Form card */}
        <div className="bg-card/80 border border-neutral-800 rounded-2xl p-8 backdrop-blur-xl shadow-2xl">

          {/* Tab switcher */}
          <div className="flex rounded-xl bg-muted/60 p-1 mb-7 border border-neutral-700/50">
            <button
              type="button"
              onClick={() => switchMode('login')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${
                mode === 'login'
                  ? 'bg-[#C87783] text-foreground shadow-lg shadow-[#C87783]/20'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Entrar
            </button>
            <button
              type="button"
              onClick={() => switchMode('register')}
              className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-200 ${
                mode === 'register'
                  ? 'bg-[#C87783] text-foreground shadow-lg shadow-[#C87783]/20'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Criar conta
            </button>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-xl font-bold text-foreground">
              {mode === 'login' ? 'Bem-vindo à operação' : 'Nova conta'}
            </h2>
            <p className="text-xs text-neutral-500 mt-1">
              {mode === 'login'
                ? 'Preencha suas credenciais para acessar o painel.'
                : 'Configure seu acesso à plataforma.'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Nome</label>
                <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-neutral-700 bg-muted/60 focus-within:border-[#C87783]/60 focus-within:ring-1 focus-within:ring-[#C87783]/20 transition-all">
                  <User className="w-4 h-4 text-neutral-500 shrink-0" />
                  <input
                    type="text"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    placeholder="Seu nome"
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-neutral-600"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">E-mail</label>
              <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-neutral-700 bg-muted/60 focus-within:border-[#C87783]/60 focus-within:ring-1 focus-within:ring-[#C87783]/20 transition-all">
                <Mail className="w-4 h-4 text-neutral-500 shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="seuemail@empresa.com"
                  className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-neutral-600"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Senha</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => toast.info('Entre em contato com o administrador para resetar a senha.')}
                    className="text-[10px] font-semibold text-[#C87783] hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                )}
              </div>
              <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-neutral-700 bg-muted/60 focus-within:border-[#C87783]/60 focus-within:ring-1 focus-within:ring-[#C87783]/20 transition-all">
                <Lock className="w-4 h-4 text-neutral-500 shrink-0" />
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-neutral-600"
                />
              </div>
            </div>

            {mode === 'register' && (
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Confirmar senha</label>
                <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl border border-neutral-700 bg-muted/60 focus-within:border-[#C87783]/60 focus-within:ring-1 focus-within:ring-[#C87783]/20 transition-all">
                  <Lock className="w-4 h-4 text-neutral-500 shrink-0" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="flex-1 bg-transparent text-sm text-foreground focus:outline-none placeholder:text-neutral-600"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#C87783] hover:bg-[#b8676f] text-foreground font-bold text-sm tracking-wide transition-all shadow-lg shadow-[#C87783]/20 hover:shadow-[#C87783]/30 disabled:opacity-60 disabled:cursor-not-allowed mt-2 cursor-pointer"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <span>{mode === 'login' ? 'Entrar' : 'Criar minha conta'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 flex items-center justify-center gap-1.5 text-[10px] text-neutral-600">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>LGPD · Criptografia de ponta a ponta</span>
          </div>
        </div>
      </div>
    </div>
  )
}
