'use client'

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { AlertTriangle, Trash2, X } from 'lucide-react'

/**
 * Confirmação desenhada, com a mesma ergonomia do `confirm()` nativo.
 *
 * ⚠️ O app tinha 20 chamadas de `window.confirm()` espalhadas por pipeline,
 * contatos, caixa-rápido, cadências, desafios e busca de leads. Três problemas,
 * todos apontados pela revisão de fluxo:
 *
 *  1. O diálogo é do SISTEMA. No meio de uma interface preta ele aparece branco,
 *     com a fonte do SO, e quebra a continuidade visual justamente no momento de
 *     maior tensão — o de apagar coisa.
 *  2. Não mostra O QUE vai ser afetado. "Deseja realmente excluir?" não diz o nome
 *     do objeto nem quantos itens vão junto.
 *  3. No mobile o `confirm()` do Safari/Chrome ancora no topo, longe do polegar.
 *
 * A API é `await confirmar({...})` justamente para a troca ser mecânica:
 *   `if (!confirm('x')) return`  →  `if (!(await confirmar({ titulo: 'x' }))) return`
 */

export type OpcoesConfirmacao = {
  /** Pergunta principal. Curta e direta. */
  titulo: string
  /** O que exatamente acontece. É aqui que vai a consequência. */
  descricao?: string
  /** Nome do objeto afetado — mostrado em destaque. Ex.: o título do negócio. */
  alvo?: string
  /** Rótulo do botão que confirma. Verbo, não "OK". */
  confirmar?: string
  cancelar?: string
  /** `true` pinta a ação de vermelho e usa o ícone de lixeira. */
  destrutivo?: boolean
}

type Pedido = OpcoesConfirmacao & { id: number; resolver: (ok: boolean) => void }

let pedidoAtual: Pedido | null = null
let proximoId = 1
const ouvintes = new Set<() => void>()

function notificar() {
  ouvintes.forEach(fn => fn())
}

function assinar(fn: () => void) {
  ouvintes.add(fn)
  return () => { ouvintes.delete(fn) }
}

function ler() {
  return pedidoAtual
}

/**
 * Abre a confirmação e resolve com a escolha do usuário.
 *
 * Se o `<ConfirmHost />` não estiver montado, resolve `false` — negar por omissão
 * é a falha segura: um host ausente jamais deve virar "sim" para uma exclusão.
 */
export function confirmar(opcoes: OpcoesConfirmacao): Promise<boolean> {
  if (ouvintes.size === 0) {
    console.error('confirmar() chamado sem <ConfirmHost /> montado — negando por segurança.')
    return Promise.resolve(false)
  }

  // Um pedido pendente é substituído e resolvido como negado: dois diálogos
  // empilhados só existem por clique duplo, e nesse caso o segundo é o que vale.
  pedidoAtual?.resolver(false)

  return new Promise<boolean>(resolve => {
    pedidoAtual = { ...opcoes, id: proximoId++, resolver: resolve }
    notificar()
  })
}

export function ConfirmHost() {
  const pedido = useSyncExternalStore(assinar, ler, () => null)
  const [fechando, setFechando] = useState(false)
  const botaoRef = useRef<HTMLButtonElement>(null)

  const responder = React.useCallback((ok: boolean) => {
    const p = pedidoAtual
    if (!p) return
    pedidoAtual = null
    notificar()
    setFechando(false)
    p.resolver(ok)
  }, [])

  // Escape cancela. Enter confirma só se o foco já estiver no botão de ação,
  // para que segurar Enter numa lista não dispare uma exclusão sem querer.
  useEffect(() => {
    if (!pedido) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); responder(false) }
    }
    window.addEventListener('keydown', aoTeclar)
    const t = setTimeout(() => botaoRef.current?.focus(), 60)
    return () => { window.removeEventListener('keydown', aoTeclar); clearTimeout(t) }
  }, [pedido, responder])

  if (!pedido) return null

  const destrutivo = pedido.destrutivo ?? true
  const Icone = destrutivo ? Trash2 : AlertTriangle

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in max-md:items-end max-md:p-0"
      onClick={() => responder(false)}
      role="alertdialog"
      aria-modal="true"
      aria-label={pedido.titulo}
    >
      <div
        onClick={e => e.stopPropagation()}
        className={`w-full max-w-sm rounded-3xl border border-border/60 bg-[#0e0e11] shadow-2xl p-6 relative max-md:max-w-none max-md:rounded-t-3xl max-md:rounded-b-none max-md:border-l-0 max-md:border-r-0 max-md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${
          fechando ? 'mobile-bottom-sheet-down' : 'mobile-bottom-sheet animate-scale-in'
        }`}
      >
        <div className="hidden max-md:flex justify-center shrink-0 -mt-2 mb-3">
          <div className="w-12 h-1.5 rounded-full bg-card" />
        </div>

        <button
          onClick={() => responder(false)}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-card transition-colors no-touch-target max-md:hidden"
          aria-label="Fechar"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className={`w-11 h-11 rounded-2xl border flex items-center justify-center mb-4 ${
            destrutivo
              ? 'bg-destructive/10 border-destructive/25 text-destructive'
              : 'bg-warning/10 border-warning/25 text-warning'
          }`}
        >
          <Icone className="w-5 h-5" />
        </div>

        <h3 className="text-base font-bold text-foreground leading-snug tracking-tight">
          {pedido.titulo}
        </h3>

        {pedido.alvo && (
          <p className="mt-2.5 px-3 py-2 rounded-xl border border-border/40 bg-card/60 text-xs font-semibold text-foreground truncate select-text">
            {pedido.alvo}
          </p>
        )}

        {pedido.descricao && (
          <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed">
            {pedido.descricao}
          </p>
        )}

        <div className="flex gap-3 mt-6 max-md:flex-col-reverse">
          <button
            onClick={() => responder(false)}
            className="flex-1 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:bg-card hover:text-foreground transition-all"
          >
            {pedido.cancelar ?? 'Cancelar'}
          </button>
          <button
            ref={botaoRef}
            onClick={() => responder(true)}
            className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#0e0e11] ${
              destrutivo
                ? 'bg-destructive text-white hover:shadow-lg hover:shadow-destructive/20 focus:ring-destructive'
                : 'bg-primary text-black hover:shadow-lg hover:shadow-primary/20 focus:ring-primary'
            }`}
          >
            {pedido.confirmar ?? (destrutivo ? 'Excluir' : 'Confirmar')}
          </button>
        </div>
      </div>
    </div>
  )
}
