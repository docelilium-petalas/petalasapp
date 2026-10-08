'use client'

/**
 * MÁQUINA DE VENDAS — a tela do que VAI acontecer, e da prova do que aconteceu.
 *
 * Porte da tela da CarBoss (paridade de 04/10/2026) com a identidade da Doce
 * Lilium. Abas:
 *
 *   Mensagens · Programação · Por conversa · Cadências · Ritmo e limites
 *   · Atenção · Prontidão (só administradora)
 *
 * A ordem do topo é argumento, igual na origem:
 *  1. a FAIXA DO CANAL — se a confirmação de entrega não chega, "sem
 *     confirmação" em todas as linhas é notícia sobre nós, não sobre a cliente;
 *  2. os AVISOS — desligado e mudo é indistinguível de quebrado;
 *  3. o PERÍODO — um filtro só para cartões e tabela (padrão: hoje). Avisos
 *     e faixa do canal ficam fora dele de propósito: são sempre do agora;
 *  4. os INDICADORES em grupos (o que vai sair, chegou, voltou, travou). Cada
 *     cartão é um recorte da tabela de Mensagens: o número e o filtro saem do
 *     mesmo objeto (`lib/maquina-vendas/indicadores.ts`).
 *
 * O texto mostrado é o MESMO que sai: congelado na inscrição, e o que foi de
 * fato entregue fica carimbado em `textoEntregue`. Nenhum LLM reescreve nada
 * no caminho.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  AlertTriangle, Bot, CalendarDays, CheckCheck, Clock, FlaskConical, Inbox, MessageSquare,
  RefreshCw, Rocket, ShieldCheck, SlidersHorizontal, TrendingUp, Users,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { getMvDashboard, getSouAdmin, rodarObservadorManual } from '@/app/actions/maquina-vendas'
import { GRUPOS_DE_INDICADORES } from '@/lib/maquina-vendas/grupos'
import { AbaTabela } from '@/components/maquina-vendas/AbaTabela'
import { AbaProgramacao } from '@/components/maquina-vendas/AbaProgramacao'
import { AbaConversas } from '@/components/maquina-vendas/AbaConversas'
import { AbaCadencias } from '@/components/maquina-vendas/AbaCadencias'
import { AbaRitmo } from '@/components/maquina-vendas/AbaRitmo'
import { AbaAtencao } from '@/components/maquina-vendas/AbaAtencao'
import { AbaProntidao } from '@/components/maquina-vendas/AbaProntidao'
import { CartaoIndicador, EsqueletoDeCartoes, TituloDoBloco, colunasPara } from '@/components/maquina-vendas/cartoes'
import { erroDe } from '@/components/maquina-vendas/comum'
import { FiltroDePeriodo, hojeSP, periodoDaUrl, periodoParaUrl, type PeriodoDias } from '@/components/maquina-vendas/FiltroDePeriodo'
import { ModalDoDia } from '@/components/maquina-vendas/ModalDoDia'

type Dashboard = Awaited<ReturnType<typeof getMvDashboard>>
type Aba = 'tabela' | 'programacao' | 'conversas' | 'cadencias' | 'ritmo' | 'atencao' | 'prontidao'

const ABAS: { id: Aba; nome: string; Icone: typeof MessageSquare; soAdmin?: boolean }[] = [
  { id: 'tabela', nome: 'Mensagens', Icone: MessageSquare },
  { id: 'programacao', nome: 'Programação', Icone: CalendarDays },
  { id: 'conversas', nome: 'Por conversa', Icone: Users },
  { id: 'cadencias', nome: 'Cadências', Icone: Bot },
  { id: 'ritmo', nome: 'Ritmo e limites', Icone: SlidersHorizontal },
  { id: 'atencao', nome: 'Atenção', Icone: Inbox },
  { id: 'prontidao', nome: 'Prontidão', Icone: ShieldCheck, soAdmin: true },
]
const IDS_DE_ABA = ABAS.map((a) => a.id) as string[]

const FAIXA: Record<'critico' | 'atencao' | 'info' | 'ok', string> = {
  critico: 'bg-destructive/10 border-destructive/30',
  atencao: 'bg-warning/10 border-warning/30',
  info: 'bg-info/10 border-info/30',
  ok: 'bg-success/10 border-success/30',
}

function Faixa({ nivel, Icone, titulo, detalhe }: { nivel: keyof typeof FAIXA; Icone: typeof AlertTriangle; titulo: string; detalhe: string }) {
  const corIcone = nivel === 'critico' ? 'text-destructive' : nivel === 'atencao' ? 'text-warning' : nivel === 'ok' ? 'text-success' : 'text-info'
  return (
    <div className={`flex items-start gap-2 px-3 py-2 rounded-xl border text-[13px] text-foreground ${FAIXA[nivel]}`} role={nivel === 'critico' ? 'alert' : undefined}>
      <Icone className={`w-4 h-4 mt-0.5 shrink-0 ${corIcone}`} />
      <span><strong>{titulo}.</strong> {detalhe}</span>
    </div>
  )
}

export default function MaquinaDeVendasPage() {
  const [aba, setAba] = useState<Aba>('tabela')
  const [dashboard, setDashboard] = useState<Dashboard | null>(null)
  const [erroCarga, setErroCarga] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  const [atualizando, setAtualizando] = useState(false)
  /** Recorte vindo do cartão clicado. Vazio = tabela inteira. */
  const [indicador, setIndicador] = useState('')
  /**
   * Período do painel. `undefined` só até ler a URL no primeiro efeito — o
   * "hoje" de São Paulo é do navegador, e calculá-lo na renderização do
   * servidor daria divergência de hidratação perto da meia-noite.
   */
  const [periodo, setPeriodo] = useState<PeriodoDias | undefined>(undefined)
  const [hoje, setHoje] = useState('')
  const [carregandoPeriodo, setCarregandoPeriodo] = useState(false)
  /** Troca rápida de período: só a última resposta pinta a tela. */
  const pedido = useRef(0)
  /** Dia aberto no modal a partir do aviso de campanha prevista. */
  const [diaDoModal, setDiaDoModal] = useState<string | null>(null)
  const fecharModal = useCallback(() => setDiaDoModal(null), [])

  const carregarPainel = useCallback(async () => {
    if (periodo === undefined) return
    const meu = ++pedido.current
    setCarregandoPeriodo(true)
    try {
      const d = await getMvDashboard(periodo)
      if (meu !== pedido.current) return
      setDashboard(d)
      setErroCarga(null)
    } catch (e) {
      if (meu === pedido.current) setErroCarga(erroDe(e))
    } finally {
      if (meu === pedido.current) setCarregandoPeriodo(false)
    }
  }, [periodo])

  const mudarPeriodo = (p: PeriodoDias) => {
    setPeriodo(p)
    periodoParaUrl(p, hoje || hojeSP())
  }

  useEffect(() => {
    /**
     * `?aba=programacao` abre direto na aba pedida (é assim que o cartão do
     * Dashboard chega aqui). Lido de `window.location` no efeito e não com
     * `useSearchParams`: a rota é pré-renderizada e `useSearchParams` exigiria
     * um limite de Suspense. Mesmo motivo da origem.
     */
    const pedida = new URLSearchParams(window.location.search).get('aba')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (pedida && IDS_DE_ABA.includes(pedida)) setAba(pedida as Aba)
    const h = hojeSP()
    setHoje(h)
    setPeriodo(periodoDaUrl(h))
    getSouAdmin().then(setAdmin).catch(() => setAdmin(false))
  }, [])

  useEffect(() => {
    // Recarrega a cada troca de período; o setState acontece depois do await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregarPainel()
  }, [carregarPainel])

  const atualizar = async () => {
    setAtualizando(true)
    try {
      const r = await rodarObservadorManual()
      if (r.inicializado) toast.success('Observador do funil iniciado. A partir de agora ele acompanha as colunas.')
      else if (r.inscricoesCriadas > 0) toast.success(`${r.inscricoesCriadas} cliente(s) entraram na Máquina.`)
      else toast.info('Nada novo: nenhum carrinho abandonado nem cliente nova nas colunas.')
      if (r.inscricoesComErro > 0) toast.warning(`${r.inscricoesComErro} cliente(s) com problema — veja na aba Mensagens.`)
      if (r.paradas > 0) toast.info(`${r.paradas} cadência(s) pararam (cliente respondeu, comprou ou pediu para sair).`)
      await carregarPainel()
    } catch (e) {
      toast.error(erroDe(e))
    } finally {
      setAtualizando(false)
    }
  }

  const abasVisiveis = ABAS.filter((a) => !a.soAdmin || admin)
  const abaAtual = aba === 'prontidao' && !admin ? 'tabela' : aba

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto space-y-4">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
                <Rocket className="w-3.5 h-3.5" />
                <span>Automação comercial</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Máquina de Vendas</h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                Recupera carrinho abandonado, acompanha pedido, reativa quem sumiu e segue as colunas do funil — no ritmo e na janela definidos. Ela observa: nunca move a cliente de coluna.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link href="/maquina-vendas/templates"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors">
                <MessageSquare className="w-3.5 h-3.5" /> Templates
              </Link>
              <Link href="/resultados"
                className="inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors">
                <TrendingUp className="w-3.5 h-3.5" /> Resultados
              </Link>
              {admin && (
                <button onClick={atualizar} disabled={atualizando}
                  className="inline-flex items-center gap-1.5 px-3.5 min-h-10 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-95 disabled:opacity-50 cursor-pointer"
                  title="Roda os observadores agora (carrinho e colunas). Não envia nada.">
                  <RefreshCw className={`w-3.5 h-3.5 ${atualizando ? 'animate-spin' : ''}`} /> Atualizar
                </button>
              )}
            </div>
          </div>

          {erroCarga && <Faixa nivel="critico" Icone={AlertTriangle} titulo="Não consegui carregar o painel" detalhe={erroCarga} />}

          {dashboard?.pulso && (
            <Faixa nivel={dashboard.pulso.nivel} Icone={dashboard.pulso.nivel === 'ok' ? CheckCheck : AlertTriangle}
              titulo={dashboard.pulso.titulo} detalhe={dashboard.pulso.detalhe} />
          )}
          {dashboard?.avisos.map((a) => (
            <Faixa key={a.titulo} nivel={a.nivel} Icone={a.nivel === 'info' ? FlaskConical : AlertTriangle} titulo={a.titulo} detalhe={a.detalhe} />
          ))}
          {dashboard && dashboard.esperaMinutos > 0 && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-xl border border-border bg-muted/50 text-[13px] text-foreground">
              <Clock className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
              <span>
                <strong>Espaçamento ativo.</strong> Próximo envio liberado em ~{dashboard.esperaMinutos} min. Sai uma mensagem por vez,
                com intervalo sorteado entre {dashboard.intervaloMin} e {dashboard.intervaloMax} min — é o que protege o número de bloqueio.
              </span>
            </div>
          )}

          {periodo !== undefined && hoje && (
            <FiltroDePeriodo periodo={periodo} hoje={hoje} onChange={mudarPeriodo} carregando={carregandoPeriodo} />
          )}

          {/* A campanha só entra na fila às 09:00 do dia: até lá os cartões ficam zerados. Esta faixa diz o que vem. */}
          {dashboard && dashboard.previstas.total > 0 && (
            <div className="flex flex-wrap items-start gap-2 px-3 py-2 rounded-xl border border-primary/30 bg-primary/5 text-[13px] text-foreground">
              <CalendarDays className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
              <span className="flex-1 min-w-60">
                <strong>{dashboard.previstas.total} mensagem(ns) da campanha previstas {dashboard.periodo.de ? `em ${dashboard.periodo.rotulo}` : 'nos próximos dias'}.</strong>{' '}
                Ainda não estão nos cartões: cada onda entra na fila às 09:00 do próprio dia e só então vira agendada.
                {dashboard.previstas.cabem < dashboard.previstas.total && ` ${dashboard.previstas.total - dashboard.previstas.cabem} passam da capacidade do dia e escorregam.`}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {dashboard.previstas.ondas.map((o) => (
                  <button key={o.id} onClick={() => setDiaDoModal(o.dia)}
                    className="inline-flex items-center gap-1 px-2.5 min-h-8 rounded-lg border border-border bg-card text-xs font-medium hover:bg-accent cursor-pointer"
                    title={o.impedimento ?? 'Abrir o dia: texto, contatos e configuração'}>
                    {o.dia.slice(8)}/{o.dia.slice(5, 7)} · {o.nome} · ~{o.total}
                    {o.impedimento && <AlertTriangle className="w-3 h-3 text-warning" />}
                  </button>
                ))}
              </span>
            </div>
          )}

          <div className={`space-y-4 transition-opacity ${carregandoPeriodo && dashboard ? 'opacity-60' : ''}`}>
            {!dashboard && !erroCarga && GRUPOS_DE_INDICADORES.map((g) => (
              <section key={g.id} className="space-y-2">
                <TituloDoBloco titulo={g.titulo} legenda={g.legenda} />
                <EsqueletoDeCartoes quantos={4} />
              </section>
            ))}
            {dashboard && GRUPOS_DE_INDICADORES.map((g) => {
              const doGrupo = dashboard.indicadores.filter((c) => c.grupo === g.id)
              if (doGrupo.length === 0) return null
              return (
                <section key={g.id} className="space-y-2">
                  <TituloDoBloco titulo={g.titulo} legenda={g.legenda} />
                  <div className={`grid gap-2 ${colunasPara(doGrupo.length)}`}>
                    {doGrupo.map((c) => {
                      const base = c.base ? dashboard.indicadores.find((x) => x.id === c.base) : null
                      return (
                        <CartaoIndicador
                          key={c.id}
                          rotulo={c.rotulo}
                          valor={c.id === 'enviadasHoje' && dashboard.periodo.umDia ? `${c.valor}/${dashboard.tetoDiario}` : c.valor}
                          tom={c.tom}
                          ativo={indicador === c.id}
                          ajuda={c.ajuda}
                          selo={c.retrato && !dashboard.periodo.ehHoje ? 'agora' : undefined}
                          proporcao={base ? { parte: c.valor, total: base.valor, rotuloBase: base.rotulo.toLowerCase() } : null}
                          onClick={() => {
                            setIndicador(indicador === c.id ? '' : c.id)
                            setAba('tabela')
                          }}
                        />
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>

          <div className="flex gap-1 border-b border-border overflow-x-auto hide-scrollbar" role="tablist">
            {abasVisiveis.map(({ id, nome, Icone }) => (
              <button key={id} onClick={() => setAba(id)} role="tab" aria-selected={abaAtual === id}
                className={`inline-flex items-center gap-1.5 px-4 min-h-10 text-xs font-medium border-b-2 -mb-px transition-colors whitespace-nowrap cursor-pointer ${
                  abaAtual === id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}>
                <Icone className="w-3.5 h-3.5" />
                {nome}
              </button>
            ))}
          </div>

          {abaAtual === 'tabela' && periodo !== undefined && (
            <AbaTabela indicador={indicador} periodo={periodo} limparIndicador={() => setIndicador('')}
              verTudo={() => mudarPeriodo(null)} aoMudar={carregarPainel} />
          )}
          {abaAtual === 'programacao' && <AbaProgramacao />}
          {abaAtual === 'conversas' && <AbaConversas />}
          {abaAtual === 'cadencias' && <AbaCadencias podeEditar={admin} aoMudar={carregarPainel} />}
          {abaAtual === 'ritmo' && <AbaRitmo vencidas={dashboard?.vencidas ?? 0} podeEditar={admin} />}
          {abaAtual === 'atencao' && <AbaAtencao />}
          {abaAtual === 'prontidao' && admin && <AbaProntidao />}
          {diaDoModal && <ModalDoDia key={diaDoModal} dia={diaDoModal} vistaInicial="tudo" onClose={fecharModal} />}
        </div>
      </div>
    </AppLayout>
  )
}
