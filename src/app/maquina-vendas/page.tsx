'use client'

/**
 * MÁQUINA DE VENDAS — a tela do que VAI acontecer.
 *
 * Estrutura em abas, no modelo da CarBoss (decisão da reunião de 09/09/2026):
 *
 *   Mensagens programadas · Por conversa · Cadências · Ritmo e limites
 *
 * A CarBoss tem três dessas; "Por conversa" é acréscimo pedido na mesma
 * reunião, e resolve um problema real da aba plana: ordenada por horário, a
 * fila mistura pessoas, e quem olha não consegue responder "o que exatamente
 * essa cliente vai receber?". Agrupada por pessoa, essa pergunta tem resposta.
 *
 * O texto mostrado é o MESMO que vai sair — congelado na inscrição. Nenhum LLM
 * reescreve nada no caminho, justamente para que esta tela não prometa uma
 * coisa e o WhatsApp entregue outra.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Rocket, Play, Pause, Clock, Users, Send, MessageSquare, ShoppingBag,
  UserMinus, AlertTriangle, Loader2, Save, TrendingUp, Database, Bot,
  SlidersHorizontal, ChevronDown, ChevronRight, CheckCircle2,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { getEstadoMaquina, alternarPausa, salvarAjustes, type EstadoMaquina } from '@/app/actions/maquina-vendas'

type Aba = 'tabela' | 'conversa' | 'cadencias' | 'ritmo'

const ABAS = [
  { id: 'tabela' as const, nome: 'Mensagens programadas', Icone: MessageSquare },
  { id: 'conversa' as const, nome: 'Por conversa', Icone: Users },
  { id: 'cadencias' as const, nome: 'Cadências', Icone: Bot },
  { id: 'ritmo' as const, nome: 'Ritmo e limites', Icone: SlidersHorizontal },
]

const GATILHO_ROTULO: Record<string, string> = {
  carrinho_abandonado: 'Carrinho abandonado',
  pedido_pago: 'Pedido pago',
  pos_entrega: 'Pós-entrega',
  reativacao: 'Reativação',
  nao_agendou: 'Sem agendamento',
}

const ORIGEM_ROTULO: Record<string, string> = {
  carrinho: 'Carrinho',
  pedido: 'Pedido',
  pipeline: 'Funil',
}

function quandoLegivel(iso: string): string {
  const d = new Date(iso)
  const min = Math.round((d.getTime() - Date.now()) / 60000)
  if (min < -60 * 24) return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  if (min < 0) return 'vencida'
  if (min < 60) return `em ${min} min`
  if (min < 60 * 24) return `em ${Math.round(min / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export default function MaquinaDeVendasPage() {
  const [estado, setEstado] = useState<EstadoMaquina | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [aba, setAba] = useState<Aba>('tabela')
  const [abertas, setAbertas] = useState<Set<string>>(new Set())
  const [form, setForm] = useState({ tetoDiario: 40, intervaloMinMinutos: 3, intervaloMaxMinutos: 12, janelaInicio: '09:00', janelaFim: '20:00' })

  const carregar = useCallback(async () => {
    try {
      const e = await getEstadoMaquina()
      setEstado(e)
      setForm({
        tetoDiario: e.ajustes.tetoDiario,
        intervaloMinMinutos: e.ajustes.intervaloMinMinutos,
        intervaloMaxMinutos: e.ajustes.intervaloMaxMinutos,
        janelaInicio: e.ajustes.janelaInicio,
        janelaFim: e.ajustes.janelaFim,
      })
    } catch {
      toast.error('Não foi possível carregar a Máquina.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { void carregar() }, [carregar])

  /** Agrupa a fila por INSCRIÇÃO — uma conversa por pessoa, com a sequência inteira. */
  const conversas = useMemo(() => {
    const m = new Map<string, { nome: string; telefone: string; cadencia: string; origem: string; msgs: EstadoMaquina['proximas'] }>()
    for (const p of estado?.proximas ?? []) {
      const atual = m.get(p.inscricaoId)
      if (atual) atual.msgs.push(p)
      else m.set(p.inscricaoId, { nome: p.nome, telefone: p.telefone, cadencia: p.cadencia, origem: p.origem, msgs: [p] })
    }
    return [...m.entries()].map(([id, v]) => ({ id, ...v }))
  }, [estado?.proximas])

  const agendadas = useMemo(() => (estado?.proximas ?? []).filter((p) => p.status === 'AGENDADA'), [estado?.proximas])

  const pausar = async (proximo: boolean) => {
    const r = await alternarPausa(proximo)
    if (!r.ok) return toast.error('Módulo ainda não migrado.')
    toast.success(proximo ? 'Máquina pausada. Nada sai até religar.' : 'Máquina liberada.')
    void carregar()
  }

  const gravar = async () => {
    setSalvando(true)
    try {
      const r = await salvarAjustes(form)
      if (!r.ok) toast.error('Módulo ainda não migrado.')
      else { toast.success('Ritmo atualizado.'); void carregar() }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar.')
    } finally {
      setSalvando(false)
    }
  }

  const alternarConversa = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })

  /** Quantas mensagens cabem por hora, na média do intervalo sorteado. */
  const porHora = Math.round(60 / ((form.intervaloMinMinutos + form.intervaloMaxMinutos) / 2))

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground select-none overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto space-y-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
                <Rocket className="w-3.5 h-3.5" />
                <span>Automação comercial</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Máquina de Vendas</h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Recupera carrinho abandonado, acompanha pedido e reativa quem sumiu — no ritmo e na janela que você definir.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link href="/maquina-vendas/templates"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors">
                <MessageSquare className="w-3.5 h-3.5" />
                Mensagens
              </Link>
              <Link href="/resultados"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors">
                <TrendingUp className="w-3.5 h-3.5" />
                Resultados
              </Link>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : !estado ? null : (
            <>
              {!estado.migrado && (
                <div className="rounded-2xl border border-warning/35 bg-warning/8 p-5 flex items-start gap-3">
                  <Database className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">O módulo ainda não foi migrado no banco.</p>
                    <p className="text-muted-foreground mt-1">
                      As abas já estão prontas e os números aparecem sozinhos assim que as tabelas existirem.
                    </p>
                  </div>
                </div>
              )}

              {/* Estado do envio */}
              <div className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${estado.ajustes.envioPausado ? 'bg-muted-foreground' : 'bg-success'}`} />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {estado.ajustes.envioPausado ? 'Envio pausado' : 'Envio liberado'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Janela {estado.ajustes.janelaInicio}–{estado.ajustes.janelaFim} ·{' '}
                        {estado.janelaAberta ? 'aberta agora' : 'fechada agora'} · teto de {estado.ajustes.tetoDiario}/dia
                      </p>
                    </div>
                  </div>
                  <button onClick={() => pausar(!estado.ajustes.envioPausado)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                      estado.ajustes.envioPausado
                        ? 'bg-primary text-primary-foreground hover:opacity-95'
                        : 'border border-border bg-card text-foreground hover:bg-accent'
                    }`}>
                    {estado.ajustes.envioPausado ? <><Play className="w-3.5 h-3.5" />Liberar envio</> : <><Pause className="w-3.5 h-3.5" />Pausar</>}
                  </button>
                </div>
              </div>

              {/* Indicadores */}
              <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
                {([
                  { rot: 'Na fila', val: estado.indicadores.naFila, Icon: Clock, tom: '' },
                  { rot: 'Inscrições ativas', val: estado.indicadores.inscricoesAtivas, Icon: Users, tom: '' },
                  { rot: 'Enviadas hoje', val: estado.indicadores.enviadasHoje, Icon: Send, tom: '' },
                  { rot: 'Responderam', val: estado.indicadores.responderam, Icon: MessageSquare, tom: 'text-info' },
                  { rot: 'Compraram', val: estado.indicadores.converteram, Icon: ShoppingBag, tom: 'text-success' },
                  { rot: 'Saíram', val: estado.indicadores.optOuts, Icon: UserMinus, tom: 'text-muted-foreground' },
                ]).map(({ rot, val, Icon, tom }) => (
                  <div key={rot} className="rounded-xl border border-border bg-card px-4 py-3">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
                      <Icon className="w-3.5 h-3.5" />
                      <span className="ocr-label">{rot}</span>
                    </div>
                    <span className={`text-xl font-semibold tabular ${tom || 'text-foreground'}`}>{val}</span>
                  </div>
                ))}
              </div>

              {/* ── ABAS ─────────────────────────────────────────────────── */}
              <div className="flex gap-1 border-b border-border overflow-x-auto hide-scrollbar">
                {ABAS.map(({ id, nome, Icone }) => (
                  <button key={id} onClick={() => setAba(id)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer ${
                      aba === id
                        ? 'border-primary text-foreground'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    }`}>
                    <Icone className="w-3.5 h-3.5" />
                    {nome}
                  </button>
                ))}
              </div>

              {/* ── MENSAGENS PROGRAMADAS ────────────────────────────────── */}
              {aba === 'tabela' && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/60 flex items-center justify-between">
                    <span className="ocr-label">Ordenadas por horário de saída</span>
                    <span className="text-[11px] text-muted-foreground">{agendadas.length} agendadas</span>
                  </div>
                  {agendadas.length === 0 ? (
                    <div className="py-16 text-center">
                      <Clock className="w-7 h-7 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-foreground">Nada agendado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        A fila enche quando o observador encontrar carrinho abandonado ou pedido novo.
                      </p>
                    </div>
                  ) : (
                    agendadas.map((m) => (
                      <div key={m.id} className="px-5 py-3.5 border-b border-border-subtle last:border-b-0 hover:bg-muted/40 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground">{m.nome}</span>
                            <span className="text-xs text-muted-foreground ml-2">{m.telefone}</span>
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0 tabular">{quandoLegivel(m.quando)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line line-clamp-3">{m.texto}</p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="dl-chip text-[10px]">{m.cadencia}</span>
                          <span className="dl-chip text-[10px]">toque {m.etapa}</span>
                          <span className="dl-chip text-[10px]">{ORIGEM_ROTULO[m.origem] ?? m.origem}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── POR CONVERSA ─────────────────────────────────────────── */}
              {aba === 'conversa' && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/60 flex items-center justify-between">
                    <span className="ocr-label">Uma linha por pessoa, com a sequência inteira</span>
                    <span className="text-[11px] text-muted-foreground">{conversas.length} conversas</span>
                  </div>
                  {conversas.length === 0 ? (
                    <div className="py-16 text-center">
                      <Users className="w-7 h-7 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-foreground">Nenhuma conversa em andamento</p>
                    </div>
                  ) : (
                    conversas.map((c) => {
                      const aberta = abertas.has(c.id)
                      const enviadas = c.msgs.filter((m) => m.status === 'ENVIADA').length
                      return (
                        <div key={c.id} className="border-b border-border-subtle last:border-b-0">
                          <button onClick={() => alternarConversa(c.id)}
                            className="w-full text-left px-5 py-3.5 flex items-center gap-3 hover:bg-muted/40 transition-colors cursor-pointer">
                            {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                            <div className="min-w-0 flex-1">
                              <span className="text-sm font-medium text-foreground">{c.nome}</span>
                              <span className="text-xs text-muted-foreground ml-2">{c.telefone}</span>
                              <div className="flex items-center gap-1.5 mt-1">
                                <span className="dl-chip text-[10px]">{c.cadencia}</span>
                                <span className="dl-chip text-[10px]">{ORIGEM_ROTULO[c.origem] ?? c.origem}</span>
                              </div>
                            </div>
                            <span className="text-[11px] text-muted-foreground shrink-0 tabular">
                              {enviadas}/{c.msgs.length} enviadas
                            </span>
                          </button>

                          {aberta && (
                            <div className="px-5 pb-4 pl-12 space-y-2">
                              {c.msgs.map((m) => (
                                <div key={m.id} className="rounded-xl border border-border-subtle bg-muted/30 px-4 py-3">
                                  <div className="flex items-center justify-between gap-3 mb-1.5">
                                    <span className="text-[11px] font-medium text-foreground flex items-center gap-1.5">
                                      {m.status === 'ENVIADA'
                                        ? <><CheckCircle2 className="w-3 h-3 text-success" />Toque {m.etapa} · enviada</>
                                        : <><Clock className="w-3 h-3 text-muted-foreground" />Toque {m.etapa} · {quandoLegivel(m.quando)}</>}
                                    </span>
                                    <span className="text-[10px] text-muted-foreground tabular">{horaCurta(m.quando)}</span>
                                  </div>
                                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-line">{m.texto}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}

              {/* ── CADÊNCIAS ────────────────────────────────────────────── */}
              {aba === 'cadencias' && (
                <div className="rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="hidden md:grid grid-cols-[minmax(0,1fr)_10rem_6rem_7rem_6rem] gap-3 items-center px-5 py-2.5 border-b border-border bg-muted/60">
                    <span className="ocr-label">Régua</span>
                    <span className="ocr-label">Gatilho</span>
                    <span className="ocr-label text-right">Toques</span>
                    <span className="ocr-label text-right">Inscritos</span>
                    <span className="ocr-label text-right">Estado</span>
                  </div>
                  {estado.cadencias.length === 0 ? (
                    <div className="py-16 text-center">
                      <AlertTriangle className="w-7 h-7 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-foreground">Nenhuma régua configurada</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Sem régua ativa, o observador não inscreve ninguém — a Máquina fica parada mesmo liberada.
                      </p>
                    </div>
                  ) : (
                    estado.cadencias.map((c) => (
                      <div key={c.id} className="grid md:grid-cols-[minmax(0,1fr)_10rem_6rem_7rem_6rem] gap-3 items-center px-5 py-3.5 border-b border-border-subtle last:border-b-0 hover:bg-muted/40 transition-colors">
                        <span className="text-sm font-medium text-foreground truncate">{c.nome}</span>
                        <span className="hidden md:block text-xs text-muted-foreground truncate">{GATILHO_ROTULO[c.gatilho] ?? c.gatilho}</span>
                        <span className="hidden md:block text-right text-sm text-foreground tabular">{c.etapas}</span>
                        <span className="hidden md:block text-right text-sm text-foreground tabular">{c.inscricoes}</span>
                        <div className="flex md:justify-end">
                          <span className="dl-chip text-[10px]" data-tom={c.ativo ? 'positivo' : undefined}>
                            {c.ativo ? 'Ativa' : 'Pausada'}
                          </span>
                        </div>
                        <div className="md:hidden flex flex-wrap gap-1.5">
                          <span className="dl-chip text-[10px]">{GATILHO_ROTULO[c.gatilho] ?? c.gatilho}</span>
                          <span className="dl-chip text-[10px]">{c.etapas} toques</span>
                          <span className="dl-chip text-[10px]">{c.inscricoes} inscritos</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── RITMO E LIMITES ──────────────────────────────────────── */}
              {aba === 'ritmo' && (
                <div className="rounded-2xl border border-border bg-card p-5 max-w-2xl">
                  <p className="text-sm text-foreground font-medium">Ritmo e limites</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-5">
                    Com {form.intervaloMinMinutos}–{form.intervaloMaxMinutos} min entre envios saem cerca de{' '}
                    <strong className="text-foreground">{porHora} mensagens por hora</strong>, e o teto de{' '}
                    <strong className="text-foreground">{form.tetoDiario}/dia</strong> é o que impede a fila de sair
                    toda de uma vez. Espaçamento não é educação: é o que separa follow-up de disparo em massa.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block sm:col-span-2">
                      <span className="text-[11px] text-muted-foreground">Teto por dia</span>
                      <input type="number" min={1} max={1000} value={form.tetoDiario}
                        onChange={(e) => setForm({ ...form, tetoDiario: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted-foreground">Intervalo mínimo (min)</span>
                      <input type="number" min={1} value={form.intervaloMinMinutos}
                        onChange={(e) => setForm({ ...form, intervaloMinMinutos: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted-foreground">Intervalo máximo (min)</span>
                      <input type="number" min={1} value={form.intervaloMaxMinutos}
                        onChange={(e) => setForm({ ...form, intervaloMaxMinutos: Number(e.target.value) })}
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted-foreground">Janela abre</span>
                      <input type="time" value={form.janelaInicio}
                        onChange={(e) => setForm({ ...form, janelaInicio: e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                    <label className="block">
                      <span className="text-[11px] text-muted-foreground">Janela fecha</span>
                      <input type="time" value={form.janelaFim}
                        onChange={(e) => setForm({ ...form, janelaFim: e.target.value })}
                        className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                    </label>
                  </div>
                  <button onClick={gravar} disabled={salvando}
                    className="mt-4 inline-flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer">
                    {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    Salvar ritmo
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
