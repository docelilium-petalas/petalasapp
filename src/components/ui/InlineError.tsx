"use client";
'use client'

import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface InlineErrorProps {
  /** Título curto do erro (ex.: "Não foi possível carregar o Radar") */
  title?: string
  /** Causa provável / orientação em linguagem humana */
  message?: string
  /** Callback do botão "Tentar novamente"; se ausente, o botão não aparece */
  onRetry?: () => void
  /** Estado de carregamento do retry (desabilita o botão e gira o ícone) */
  retrying?: boolean
  /** Altura mínima da área — usar para preencher o espaço do conteúdo que falhou */
  className?: string
}

/**
 * Estado de erro inline, exibido na área que falhou (em vez de um toast que some).
 * Diferencia "falhou o carregamento" de "sem dados" e oferece ação de recuperação.
 */
export const InlineError: React.FC<InlineErrorProps> = ({
  title = 'Não foi possível carregar os dados',
  message = 'Verifique sua conexão e tente novamente. Se persistir, recarregue a página.',
  onRetry,
  retrying = false,
  className = '',
}) => {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center gap-3 p-6 rounded-2xl border border-destructive/25 bg-destructive/5 ${className}`}
      role="alert"
    >
      <div className="w-11 h-11 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-center text-destructive shrink-0">
        <AlertTriangle className="w-5 h-5" />
      </div>
      <div className="space-y-1 max-w-xs">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary/15 text-primary border border-primary/30 text-xs font-semibold hover:bg-primary/25 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Tentando…' : 'Tentar novamente'}
        </button>
      )}
    </div>
  )
}

export default InlineError

