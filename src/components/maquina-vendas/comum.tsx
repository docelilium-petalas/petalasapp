'use client'

/**
 * Peças pequenas que as abas da Máquina de Vendas dividem.
 *
 * Só tokens da Doce Lilium (`globals.css`): a cor vem do SIGNIFICADO via
 * `data-tom` do `.dl-chip`, nunca de uma classe de cor solta. Alvo de toque
 * mínimo de 40px em tudo que é botão (`min-h-10`).
 */

import { Loader2, AlertTriangle, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type TomDl = 'positivo' | 'negativo' | 'alerta' | 'info' | 'marca' | undefined

export const BOTAO =
  'inline-flex items-center justify-center gap-1.5 min-h-10 px-3.5 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
export const BOTAO_PRIMARIO =
  'inline-flex items-center justify-center gap-1.5 min-h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
export const BOTAO_ICONE =
  'inline-flex items-center justify-center min-h-10 min-w-10 rounded-xl border border-border-subtle bg-card text-muted-foreground hover:text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed'
export const CAMPO =
  'w-full min-h-10 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring'
export const PAINEL = 'rounded-2xl border border-border bg-card'
export const CABECALHO_PAINEL = 'px-4 sm:px-5 py-3 border-b border-border bg-muted/60 flex flex-wrap items-center justify-between gap-2'

export function Chip({ tom, children, title }: { tom?: TomDl; children: ReactNode; title?: string }) {
  return (
    <span className="dl-chip text-[11px]" data-tom={tom} title={title}>
      {children}
    </span>
  )
}

export function Carregando({ texto = 'Carregando…' }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
      <Loader2 className="w-4 h-4 animate-spin mr-2" /> {texto}
    </div>
  )
}

export function Vazio({ Icone, titulo, detalhe }: { Icone: LucideIcon; titulo: string; detalhe?: string }) {
  return (
    <div className="py-14 px-6 text-center">
      <Icone className="w-7 h-7 mx-auto text-muted-foreground mb-2" aria-hidden />
      <p className="text-sm text-foreground">{titulo}</p>
      {detalhe && <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{detalhe}</p>}
    </div>
  )
}

/** Erro de carga nunca vira tela vazia: vazio e quebrado têm que parecer diferentes. */
export function ErroDeCarga({ erro, tentarDeNovo }: { erro: string; tentarDeNovo?: () => void }) {
  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-3" role="alert">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden />
      <div className="text-sm min-w-0">
        <p className="font-medium text-foreground">Não consegui carregar esta parte.</p>
        <p className="text-muted-foreground mt-1 break-words">{erro}</p>
        {tentarDeNovo && (
          <button onClick={tentarDeNovo} className={`${BOTAO} mt-3`}>
            Tentar de novo
          </button>
        )}
      </div>
    </div>
  )
}

// ── Prova de entrega ─────────────────────────────────────────────────────────

type ProvaNaTela = { nivel: string; tique: string; rotulo: string; detalhe: string }

const TOM_DA_PROVA: Record<string, TomDl> = {
  LIDA: 'positivo',
  ENTREGUE: 'positivo',
  SEM_PROVA: 'alerta',
  FALHOU: 'negativo',
  DEVOLVIDA: 'info',
  NAO_SAIU: undefined,
}

/** `✓` saiu · `✓✓` chegou · `✓✓` lida · `✗` não chegou · `↩` voltou para a fila. */
export function SeloDeProva({ prova }: { prova: ProvaNaTela | null | undefined }) {
  if (!prova) return null
  return (
    <Chip tom={TOM_DA_PROVA[prova.nivel]} title={prova.detalhe}>
      <span aria-hidden className="font-semibold">{prova.tique}</span>
      {prova.rotulo}
    </Chip>
  )
}

// ── De onde veio o texto ─────────────────────────────────────────────────────

const SELO_DO_TEXTO: Record<string, { rotulo: string; tom: TomDl; ajuda: string }> = {
  entregue: { rotulo: 'texto que chegou', tom: 'positivo', ajuda: 'Corpo do template aprovado, com as variáveis que foram de fato.' },
  planejado: { rotulo: 'texto que vai sair', tom: 'info', ajuda: 'Corpo aprovado na Meta com as variáveis congeladas na inscrição.' },
  livre: { rotulo: 'texto livre', tom: 'alerta', ajuda: 'Sem template: só chega se ela falou com a loja nas últimas 24h.' },
  desconhecido: { rotulo: 'texto aproximado', tom: undefined, ajuda: 'A Meta não respondeu; este é o texto planejado, não o aprovado.' },
}

export function SeloDoTexto({ origem, aviso }: { origem: string; aviso?: string | null }) {
  const s = SELO_DO_TEXTO[origem] ?? SELO_DO_TEXTO.desconhecido
  return (
    <Chip tom={s.tom} title={aviso ?? s.ajuda}>
      {s.rotulo}
    </Chip>
  )
}

// ── Status ───────────────────────────────────────────────────────────────────

export const ROTULO_STATUS_MSG: Record<string, string> = {
  AGENDADA: 'Agendada',
  ENVIANDO: 'Enviando',
  ENVIADA: 'Enviada',
  ERRO: 'Erro',
  CANCELADA: 'Cancelada',
  PULADA: 'Pulada',
  VETADA: 'Bloqueada',
}
export const TOM_STATUS_MSG: Record<string, TomDl> = {
  AGENDADA: 'info',
  ENVIANDO: 'info',
  ENVIADA: 'positivo',
  ERRO: 'negativo',
  CANCELADA: undefined,
  PULADA: undefined,
  VETADA: 'alerta',
}
export const ROTULO_STATUS_INSC: Record<string, string> = {
  ATIVA: 'Na régua',
  PAUSADA: 'Pausada',
  CONCLUIDA: 'Concluída',
  RESPONDEU: 'Respondeu',
  CONVERTEU: 'Comprou',
  CANCELADA: 'Cancelada',
  OPT_OUT: 'Pediu para sair',
  NUMERO_INVALIDO: 'Número inválido',
  BLOQUEADA_META: 'Bloqueada pela Meta',
  ERRO: 'Erro',
}
export const TOM_STATUS_INSC: Record<string, TomDl> = {
  ATIVA: 'info',
  PAUSADA: 'alerta',
  CONCLUIDA: undefined,
  RESPONDEU: 'positivo',
  CONVERTEU: 'positivo',
  CANCELADA: undefined,
  OPT_OUT: 'negativo',
  NUMERO_INVALIDO: 'negativo',
  BLOQUEADA_META: 'negativo',
  ERRO: 'negativo',
}

// ── Tempo ────────────────────────────────────────────────────────────────────

const TZ = 'America/Sao_Paulo'

export function quandoLegivel(iso: string, agora = Date.now()): string {
  const d = new Date(iso)
  const min = Math.round((d.getTime() - agora) / 60000)
  if (min <= -60 * 24) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', timeZone: TZ })
  if (min < -60) return `há ${Math.round(-min / 60)} h`
  if (min < 0) return `há ${-min} min`
  if (min < 60) return `em ${min} min`
  if (min < 60 * 24) return `em ${Math.round(min / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: TZ })
}

export const horaCurta = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ })

export const erroDe = (e: unknown) => (e instanceof Error ? e.message : String(e))
