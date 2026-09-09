'use client'

/**
 * MÁQUINA DE VENDAS — a tela do que VAI acontecer.
 *
 * Ela responde três perguntas, nesta ordem, porque é nesta ordem que a
 * operação pergunta:
 *
 *   1. a Máquina está ligada, e pode falar agora?
 *   2. o que sai a seguir, e com que texto exatamente?
 *   3. quais réguas existem e quanta gente está em cada uma?
 *
 * O texto mostrado é o MESMO que vai sair — congelado na inscrição. Nenhum
 * LLM reescreve nada no caminho, justamente para que esta tela não prometa
 * uma coisa e o WhatsApp entregue outra.
 *
 * "Resultados" é a tela irmã, e responde a pergunta oposta: o que JÁ aconteceu.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  Rocket, Play, Pause, Clock, Users, Send, MessageSquare, ShoppingBag,
  UserMinus, AlertTriangle, Loader2, Save, TrendingUp, Database,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { AppToaster } from '@/components/ui/AppToaster'
import { getEstadoMaquina, alternarPausa, salvarAjustes, type EstadoMaquina } from '@/app/actions/maquina-vendas'

const GATILHO_ROTULO: Record<string, string> = {
  carrinho_abandonado: 'Carrinho abandonado',
  pedido_pago: 'Pedido pago',
  pos_entrega: 'Pós-entrega',
  reativacao: 'Reativação',
  nao_agendou: 'Sem agendamento',
}

function quandoLegivel(iso: string): string {
  const d = new Date(iso)
  const min = Math.round((d.getTime() - Date.now()) / 60000)
  if (min < 0) return 'vencida'
  if (min < 60) return `em ${min} min`
  if (min < 60 * 24) return `em ${Math.round(min / 60)} h`
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

export default function MaquinaDeVendasPage() {
  const [estado, setEstado] = useState<EstadoMaquina | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
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

  /** Quantas mensagens cabem por hora, na média do intervalo sorteado. */
  const porHora = Math.round(60 / ((form.intervaloMinMinutos + form.intervaloMaxMinutos) / 2))

  return (
    <AppLayout>
      <AppToaster />
      <div className="flex flex-col h-full bg-background text-foreground select-none overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto space-y-6">

          {/* Cabeçalho */}
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
            <Link
              href="/resultados"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors shrink-0"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Ver resultados
            </Link>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : !estado ? null : (
            <>
              {/* Módulo ainda sem tabelas */}
              {!estado.migrado && (
                <div className="rounded-2xl border border-warning/35 bg-warning/8 p-5 flex items-start gap-3">
                  <Database className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">O módulo ainda não foi migrado no banco.</p>
                    <p className="text-muted-foreground mt-1">
                      A tela já está pronta e os números aparecem sozinhos assim que as tabelas existirem.
                      Falta rodar a migration <code className="font-mono text-xs">20260909000001_maquina_vendas</code> em produção.
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
                  <button
                    onClick={() => pausar(!estado.ajustes.envioPausado)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-colors shrink-0 cursor-pointer ${
                      estado.ajustes.envioPausado
                        ? 'bg-primary text-primary-foreground hover:opacity-95'
                        : 'border border-border bg-card text-foreground hover:bg-accent'
                    }`}
                  >
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
                  { rot: 'Converteram', val: estado.indicadores.converteram, Icon: ShoppingBag, tom: 'text-success' },
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

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                {/* Fila */}
                <div className="lg:col-span-2 rounded-2xl border border-border bg-card overflow-hidden">
                  <div className="px-5 py-3 border-b border-border bg-muted/60 flex items-center justify-between">
                    <span className="ocr-label">O que sai a seguir</span>
                    <span className="text-[11px] text-muted-foreground">{estado.proximas.length} de {estado.indicadores.naFila}</span>
                  </div>
                  {estado.proximas.length === 0 ? (
                    <div className="py-14 text-center">
                      <Clock className="w-7 h-7 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-foreground">Nada agendado</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        A fila enche quando o observador encontrar carrinho abandonado ou pedido novo.
                      </p>
                    </div>
                  ) : (
                    estado.proximas.map((m) => (
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
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-6">
                  {/* Ritmo */}
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <span className="ocr-label">Ritmo e limites</span>
                    <p className="text-[11px] text-muted-foreground mt-1 mb-4">
                      Com {form.intervaloMinMinutos}–{form.intervaloMaxMinutos} min entre envios, saem cerca de{' '}
                      <strong className="text-foreground">{porHora} por hora</strong>. É a conta que evita disparo em massa.
                    </p>
                    <div className="space-y-3">
                      <label className="block">
                        <span className="text-[11px] text-muted-foreground">Teto por dia</span>
                        <input type="number" min={1} max={1000} value={form.tetoDiario}
                          onChange={(e) => setForm({ ...form, tetoDiario: Number(e.target.value) })}
                          className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-muted-foreground">Intervalo mín.</span>
                          <input type="number" min={1} value={form.intervaloMinMinutos}
                            onChange={(e) => setForm({ ...form, intervaloMinMinutos: Number(e.target.value) })}
                            className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-muted-foreground">Intervalo máx.</span>
                          <input type="number" min={1} value={form.intervaloMaxMinutos}
                            onChange={(e) => setForm({ ...form, intervaloMaxMinutos: Number(e.target.value) })}
                            className="w-full mt-1 px-3 py-2 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        </label>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
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
                        className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-95 disabled:opacity-50 transition-opacity cursor-pointer">
                        {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                        Salvar ritmo
                      </button>
                    </div>
                  </div>

                  {/* Cadências */}
                  <div className="rounded-2xl border border-border bg-card overflow-hidden">
                    <div className="px-5 py-3 border-b border-border bg-muted/60">
                      <span className="ocr-label">Réguas</span>
                    </div>
                    {estado.cadencias.length === 0 ? (
                      <div className="py-10 px-5 text-center">
                        <AlertTriangle className="w-6 h-6 mx-auto text-muted-foreground/50 mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Nenhuma régua configurada. Sem régua ativa, o observador não inscreve ninguém.
                        </p>
                      </div>
                    ) : (
                      estado.cadencias.map((c) => (
                        <div key={c.id} className="px-5 py-3 border-b border-border-subtle last:border-b-0 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="text-sm font-medium text-foreground block truncate">{c.nome}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {GATILHO_ROTULO[c.gatilho] ?? c.gatilho} · {c.etapas} toques · {c.inscricoes} inscritos
                            </span>
                          </div>
                          <span className="dl-chip text-[10px] shrink-0" data-tom={c.ativo ? 'positivo' : undefined}>
                            {c.ativo ? 'Ativa' : 'Pausada'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
