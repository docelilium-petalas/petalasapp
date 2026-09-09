'use client'

/**
 * RESULTADOS — uma linha por PESSOA.
 *
 * A Máquina de Vendas responde "o que vai acontecer". Esta tela responde a
 * pergunta que paga a conta: "o que aconteceu com quem a gente abordou".
 *
 * ⚠️ A distinção que os dois projetos de origem aprenderam na prática: contar
 * esforço (mensagens enviadas) é fácil e não significa nada. O que importa é
 * desfecho — respondeu, comprou, saiu. Por isso as colunas de desfecho vêm
 * antes das de esforço, e a taxa é calculada sobre PESSOAS, não sobre envios.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  TrendingUp, Loader2, Database, MessageSquare, ShoppingBag, Send, Users, Rocket,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { getResultados, type LinhaResultado } from '@/app/actions/maquina-vendas'

const PERIODOS = [
  { rot: '7 dias', dias: 7 },
  { rot: '30 dias', dias: 30 },
  { rot: '90 dias', dias: 90 },
]

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'

const ORIGEM_ROTULO: Record<string, string> = {
  carrinho: 'Carrinho',
  pedido: 'Pedido',
  pipeline: 'Funil',
}

export default function ResultadosPage() {
  const [dias, setDias] = useState(30)
  const [dados, setDados] = useState<{ migrado: boolean; linhas: LinhaResultado[] } | null>(null)
  const [carregando, setCarregando] = useState(true)

  const carregar = useCallback(async (d: number) => {
    setCarregando(true)
    try { setDados(await getResultados(d)) } finally { setCarregando(false) }
  }, [])

  useEffect(() => { void carregar(dias) }, [carregar, dias])

  const linhas = dados?.linhas ?? []
  const abordadas = linhas.length
  const responderam = linhas.filter((l) => l.respondeuEm).length
  const converteram = linhas.filter((l) => l.converteuEm).length
  const receita = linhas.reduce((s, l) => s + (l.valor ?? 0), 0)
  const pct = (n: number) => (abordadas ? `${Math.round((n / abordadas) * 100)}%` : '—')

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground select-none overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto space-y-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Desfecho</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Resultados</h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                O que aconteceu com cada pessoa que a Máquina abordou — não quantas mensagens saíram.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
                {PERIODOS.map((p) => (
                  <button key={p.dias} onClick={() => setDias(p.dias)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      dias === p.dias ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {p.rot}
                  </button>
                ))}
              </div>
              <Link href="/maquina-vendas"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors">
                <Rocket className="w-3.5 h-3.5" />
                A Máquina
              </Link>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : (
            <>
              {dados && !dados.migrado && (
                <div className="rounded-2xl border border-warning/35 bg-warning/8 p-5 flex items-start gap-3">
                  <Database className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">O módulo ainda não foi migrado no banco.</p>
                    <p className="text-muted-foreground mt-1">Os números aparecem sozinhos assim que as tabelas existirem.</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {([
                  { rot: 'Pessoas abordadas', val: String(abordadas), sub: `últimos ${dias} dias`, Icon: Users, tom: '' },
                  { rot: 'Responderam', val: String(responderam), sub: pct(responderam), Icon: MessageSquare, tom: 'text-info' },
                  { rot: 'Compraram', val: String(converteram), sub: pct(converteram), Icon: ShoppingBag, tom: 'text-success' },
                  { rot: 'Receita atribuída', val: receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }), sub: 'na janela', Icon: Send, tom: 'text-success' },
                ]).map(({ rot, val, sub, Icon, tom }) => (
                  <div key={rot} className="rounded-xl border border-border bg-card px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1.5">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="ocr-label">{rot}</span>
                    </div>
                    <span className={`text-2xl font-semibold tabular block ${tom || 'text-foreground'}`}>{val}</span>
                    <span className="text-[11px] text-muted-foreground">{sub}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-2xl border border-border bg-card overflow-hidden">
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_7rem_6rem_5.5rem_6rem_6rem_7rem] gap-3 items-center px-5 py-2.5 border-b border-border bg-muted/60">
                  <span className="ocr-label">Pessoa</span>
                  <span className="ocr-label">Régua</span>
                  <span className="ocr-label">Origem</span>
                  <span className="ocr-label text-right">Envios</span>
                  <span className="ocr-label text-right">Respondeu</span>
                  <span className="ocr-label text-right">Comprou</span>
                  <span className="ocr-label text-right">Valor</span>
                </div>

                {linhas.length === 0 ? (
                  <div className="py-16 text-center">
                    <TrendingUp className="w-7 h-7 mx-auto text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-foreground">Ninguém abordado ainda</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      As linhas aparecem quando a Máquina começar a inscrever gente.
                    </p>
                  </div>
                ) : (
                  linhas.map((l) => (
                    <div key={l.id}
                      className="grid md:grid-cols-[minmax(0,1fr)_7rem_6rem_5.5rem_6rem_6rem_7rem] gap-3 items-center px-5 py-3 border-b border-border-subtle last:border-b-0 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground block truncate">{l.nome}</span>
                        <span className="text-[11px] text-muted-foreground">{l.telefone}</span>
                      </div>
                      <span className="hidden md:block text-xs text-muted-foreground truncate">{l.cadencia}</span>
                      <span className="hidden md:block text-xs text-muted-foreground">{ORIGEM_ROTULO[l.origem] ?? l.origem}</span>
                      <span className="hidden md:block text-right text-sm text-foreground tabular">{l.enviadas}</span>
                      <span className={`hidden md:block text-right text-sm tabular ${l.respondeuEm ? 'text-info font-medium' : 'text-muted-foreground'}`}>
                        {dataCurta(l.respondeuEm)}
                      </span>
                      <span className={`hidden md:block text-right text-sm tabular ${l.converteuEm ? 'text-success font-medium' : 'text-muted-foreground'}`}>
                        {dataCurta(l.converteuEm)}
                      </span>
                      <span className="hidden md:block text-right text-sm text-foreground tabular">
                        {l.valor ? l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}
                      </span>

                      <div className="md:hidden flex flex-wrap gap-1.5">
                        <span className="dl-chip text-[10px]">{l.cadencia}</span>
                        <span className="dl-chip text-[10px]">{l.enviadas} envios</span>
                        {l.respondeuEm && <span className="dl-chip text-[10px]" data-tom="info">respondeu {dataCurta(l.respondeuEm)}</span>}
                        {l.converteuEm && <span className="dl-chip text-[10px]" data-tom="positivo">comprou {dataCurta(l.converteuEm)}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
