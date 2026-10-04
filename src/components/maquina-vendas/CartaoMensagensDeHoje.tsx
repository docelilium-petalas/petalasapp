'use client'

/**
 * O QUE SAI HOJE — o cartão da Máquina de Vendas no Dashboard.
 *
 * Responde a pergunta de quem atende: uma cliente que recebeu o 3º toque de
 * manhã escreve à tarde, e a equipe precisa saber que aquilo saiu.
 *
 * ⚠️ SOME EM SILÊNCIO PARA QUEM NÃO É ADMIN. `getResumoDeHojeMv()` devolve
 *    `null` em vez de jogar — se jogasse, a falta de permissão viraria
 *    Dashboard quebrado para a equipe inteira. `null` = "não desenhe".
 *
 * Enquanto carrega não ocupa espaço: um esqueleto que some depois empurraria
 * o Dashboard para baixo e de volta a cada abertura.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight, Clock, PauseCircle, Send, Zap } from 'lucide-react'
import { getResumoDeHojeMv, type ResumoDeHoje } from '@/app/actions/maquina-vendas'

export function CartaoMensagensDeHoje() {
  const [r, setR] = useState<ResumoDeHoje | null>(null)

  useEffect(() => {
    let vivo = true
    getResumoDeHojeMv()
      .then((dados) => { if (vivo) setR(dados) })
      .catch(() => { if (vivo) setR(null) })
    return () => { vivo = false }
  }, [])

  if (!r) return null
  const total = r.enviadas + r.restantes

  const numero = (rotulo: string, valor: number, cor: string) => (
    <div className="min-w-0">
      <div className={`text-xl font-bold tabular leading-none ${cor}`}>{valor}</div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-tight">{rotulo}</div>
    </div>
  )

  return (
    <Link href="/maquina-vendas?aba=programacao" className="ocr-card card-padding block hover:border-primary/40 transition-colors">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary"><Zap className="w-4 h-4" /></div>
        <div className="min-w-0">
          <h3 className="font-semibold text-foreground text-sm leading-tight">Máquina de Vendas — hoje</h3>
          <p className="text-[11px] text-muted-foreground leading-tight">
            {total === 0 ? 'Nenhuma mensagem programada para hoje' : `${total} mensagem(ns) no dia · janela ${r.janelaInicio}–${r.janelaFim}`}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
      </div>

      <div className="grid grid-cols-4 gap-3">
        {numero('já saíram', r.enviadas, 'text-success')}
        {numero('na fila de hoje', r.restantes, r.restantes > 0 ? 'text-info' : 'text-muted-foreground')}
        {numero('erros', r.erros, r.erros > 0 ? 'text-destructive' : 'text-muted-foreground')}
        {numero('amanhã', r.amanha, 'text-muted-foreground')}
      </div>

      {r.proxima && !r.envioPausado && (
        <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5 min-w-0">
          <Clock className="w-3 h-3 shrink-0" />
          Próxima às <strong className="text-foreground">{r.proxima.hora}</strong> — {r.proxima.nome}
          <span className="truncate">· {r.proxima.cadenciaNome}</span>
        </p>
      )}
      {r.restantes === 0 && r.enviadas > 0 && !r.envioPausado && (
        <p className="mt-3 text-[11px] text-muted-foreground flex items-center gap-1.5">
          <Send className="w-3 h-3 shrink-0 text-success" /> A fila de hoje acabou.
        </p>
      )}

      <div className="flex flex-wrap gap-1.5 mt-3">
        {r.envioPausado && <span className="dl-chip" data-tom="alerta"><PauseCircle className="w-3 h-3" /> Envio pausado — nada sai</span>}
        {!r.cabe && <span className="dl-chip" data-tom="alerta"><AlertTriangle className="w-3 h-3" /> Passa do teto do dia — o excedente escorrega</span>}
        {r.atrasadas > 0 && <span className="dl-chip" data-tom="alerta"><AlertTriangle className="w-3 h-3" /> {r.atrasadas} atrasada(s) de dias anteriores</span>}
      </div>
    </Link>
  )
}
