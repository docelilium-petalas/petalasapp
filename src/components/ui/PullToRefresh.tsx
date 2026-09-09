'use client'

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { RefreshCw } from 'lucide-react'

/**
 * Puxar-para-atualizar no mobile.
 *
 * ⚠️ Por que precisou ser implementado à mão: `globals.css` fixa `html, body` com
 * `position: fixed` + `overscroll-behavior-y: contain` no mobile. Isso é
 * deliberado — segura o bounce do iOS e evita que a página inteira role atrás dos
 * sheets — mas mata junto o pull-to-refresh nativo do navegador. Sem gesto e sem
 * botão, a única forma de buscar dado novo no celular era trocar de aba e voltar.
 *
 * O rolador de verdade é o `<main>` do AppLayout, não o body. Então o gesto é
 * lido nele.
 */

const LIMIAR = 72
/** Além do limiar o dedo "pesa": o indicador não desce indefinidamente. */
const RESISTENCIA = 0.4
const DESLOCAMENTO_MAXIMO = 110
/** Desvio horizontal que caracteriza swipe lateral, não puxada. */
const TOLERANCIA_HORIZONTAL = 24
/**
 * Tempo mínimo com o indicador visível.
 *
 * Sem ele, um refresh que resolve em 80ms pisca e o usuário fica sem saber se
 * alguma coisa aconteceu — o gesto parece ter falhado mesmo tendo funcionado.
 */
const DURACAO_MINIMA_MS = 550

type Atualizador = () => void | Promise<unknown>

type ContextoAtualizacao = {
  registrar: (fn: Atualizador | null) => void
}

const Contexto = createContext<ContextoAtualizacao | null>(null)

/**
 * Registra o que esta página faz quando o usuário puxa para atualizar.
 *
 * Página que não chama isto ainda atualiza: o fallback dispara os eventos
 * `crm-*-updated` do barramento que os hooks já escutam. Registrar é para quem
 * tem um loader próprio (pipeline e dashboard não escutam o barramento).
 */
export function useRegistrarAtualizacao(fn: Atualizador, deps: React.DependencyList = []) {
  const ctx = useContext(Contexto)
  // A função é recriada a cada render da página; guardá-la numa ref evita
  // registrar/desregistrar em loop sem obrigar quem usa a memoizar.
  // A escrita vai num efeito, não no corpo do render: mutar ref durante o render
  // quebra em modo concorrente, onde um render pode ser descartado.
  const ref = useRef(fn)
  useEffect(() => { ref.current = fn })

  useEffect(() => {
    if (!ctx) return
    ctx.registrar(() => ref.current())
    return () => ctx.registrar(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, ...deps])
}

/**
 * O rolador de verdade sob o dedo está no topo?
 *
 * ⚠️ Não dá para olhar só o `scrollTop` do `<main>`: em `/pipeline` o main é
 * `overflow-hidden` (quem rola é a coluna do kanban) e em `/activities` quem rola
 * é a área de trabalho interna. Nos dois casos `main.scrollTop` é eternamente 0,
 * e checar só ele faria a puxada disparar no meio de qualquer rolagem.
 *
 * Sobe do alvo do toque até o container procurando o primeiro ancestral que
 * realmente rola, e responde se ELE está no topo. Sem nenhum rolador no caminho,
 * o gesto é livre.
 */
function roladorNoTopo(alvoDoToque: EventTarget | null, limite: HTMLElement): boolean {
  let n = alvoDoToque instanceof HTMLElement ? alvoDoToque : null
  while (n) {
    if (n.scrollHeight > n.clientHeight) {
      const overflowY = getComputedStyle(n).overflowY
      if (overflowY === 'auto' || overflowY === 'scroll') return n.scrollTop <= 0
    }
    if (n === limite) break
    n = n.parentElement
  }
  return true
}

interface PullToRefreshProps {
  /** Container do conteúdo. O gesto é lido nele e nos roladores aninhados. */
  alvo: React.RefObject<HTMLElement | null>
  ativo: boolean
  children: React.ReactNode
}

export function PullToRefresh({ alvo, ativo, children }: PullToRefreshProps) {
  const [distancia, setDistancia] = useState(0)
  const [atualizando, setAtualizando] = useState(false)
  const atualizador = useRef<Atualizador | null>(null)

  const registrar = useCallback((fn: Atualizador | null) => {
    atualizador.current = fn
  }, [])

  const executar = useCallback(async () => {
    setAtualizando(true)
    const inicio = Date.now()
    try {
      if (atualizador.current) {
        await atualizador.current()
      } else {
        // Fallback: acorda todo hook que já escuta o barramento do CRM.
        for (const evento of ['crm-activities-updated', 'crm-contacts-updated', 'crm-deals-updated']) {
          window.dispatchEvent(new Event(evento))
        }
      }
    } catch (e) {
      console.error('Falha ao atualizar pelo gesto de puxar', e)
    } finally {
      const restante = DURACAO_MINIMA_MS - (Date.now() - inicio)
      if (restante > 0) await new Promise(r => setTimeout(r, restante))
      setAtualizando(false)
      setDistancia(0)
    }
  }, [])

  useEffect(() => {
    const el = alvo.current
    if (!el || !ativo) return

    let inicioY = 0
    let inicioX = 0
    let puxando = false
    let atual = 0

    const aoTocar = (e: TouchEvent) => {
      // Rolador fora do topo significa que o usuário está lendo a lista, não puxando.
      if (atualizando || !roladorNoTopo(e.target, el)) return
      inicioY = e.touches[0].clientY
      inicioX = e.touches[0].clientX
      puxando = true
      atual = 0
    }

    const aoMover = (e: TouchEvent) => {
      if (!puxando) return
      const dy = e.touches[0].clientY - inicioY
      const dx = e.touches[0].clientX - inicioX

      // Movimento para cima, ou lateral: é rolagem/swipe de card. Solta o gesto
      // para não competir com o swipe de concluir/editar da lista de atividades.
      if (dy <= 0 || Math.abs(dx) > TOLERANCIA_HORIZONTAL) {
        puxando = false
        atual = 0
        setDistancia(0)
        return
      }

      // `preventDefault` exige listener não-passivo — por isso o registro é
      // nativo com `{ passive: false }` e não via onTouchMove do React.
      e.preventDefault()

      atual = Math.min(
        dy <= LIMIAR ? dy : LIMIAR + (dy - LIMIAR) * RESISTENCIA,
        DESLOCAMENTO_MAXIMO
      )
      setDistancia(atual)
    }

    const aoSoltar = () => {
      if (!puxando) return
      puxando = false
      if (atual >= LIMIAR) {
        // `void`: o gesto não espera a Promise; quem mostra progresso é o estado.
        void executar()
      } else {
        setDistancia(0)
      }
      atual = 0
    }

    el.addEventListener('touchstart', aoTocar, { passive: true })
    el.addEventListener('touchmove', aoMover, { passive: false })
    el.addEventListener('touchend', aoSoltar, { passive: true })
    el.addEventListener('touchcancel', aoSoltar, { passive: true })

    return () => {
      el.removeEventListener('touchstart', aoTocar)
      el.removeEventListener('touchmove', aoMover)
      el.removeEventListener('touchend', aoSoltar)
      el.removeEventListener('touchcancel', aoSoltar)
    }
  }, [alvo, ativo, atualizando, executar])

  const passouLimiar = distancia >= LIMIAR
  const visivel = distancia > 0 || atualizando
  const progresso = Math.min(distancia / LIMIAR, 1)

  return (
    <Contexto.Provider value={{ registrar }}>
      {ativo && (
        <div
          aria-hidden={!visivel}
          className="pointer-events-none absolute inset-x-0 top-0 z-30 flex justify-center"
          style={{
            transform: `translateY(${atualizando ? 16 : Math.max(distancia - 40, -40)}px)`,
            opacity: visivel ? 1 : 0,
            transition: distancia === 0 || atualizando
              ? 'transform 260ms cubic-bezier(0.16, 1, 0.3, 1), opacity 200ms ease'
              : 'none',
          }}
        >
          <div
            className={`w-9 h-9 rounded-full border flex items-center justify-center shadow-lg backdrop-blur-md ${
              passouLimiar || atualizando
                ? 'border-primary/40 bg-primary/15 text-primary'
                : 'border-border/50 bg-card/80 text-muted-foreground'
            }`}
          >
            <RefreshCw
              className={`w-4 h-4 ${atualizando ? 'animate-spin' : ''}`}
              style={atualizando ? undefined : { transform: `rotate(${progresso * 270}deg)` }}
            />
          </div>
        </div>
      )}
      {children}
    </Contexto.Provider>
  )
}
