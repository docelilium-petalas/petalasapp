'use client'

/**
 * LOGS — o que as automações têm a dizer. Porte do `PainelDeLogs` da CarBoss,
 * com a pele da Doce Lilium (só tokens de `globals.css`).
 *
 * A rota existe porque o texto do sistema MANDA a pessoa vir para cá: o
 * briefing escreve "veja /logs" quando alguma mensagem falha, e a aba Ritmo
 * promete que toda alteração de limite fica registrada.
 *
 * Abrir um evento é lê-lo — marcar por clique explícito seria tarefa a mais
 * para quem já está olhando o problema.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCheck, ChevronDown, ChevronRight, FileText, Info, RefreshCw, Search, Trash2, TriangleAlert } from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { CartaoIndicador, colunasPara } from '@/components/maquina-vendas/cartoes'
import { BOTAO, CAMPO, PAINEL, ErroDeCarga, erroDe, type TomDl } from '@/components/maquina-vendas/comum'
import { getLogs, getLogsResumo, limparAntigos, marcarLido, marcarTodosLidos, type LogFiltros } from '@/app/actions/logs'

type Pagina = Awaited<ReturnType<typeof getLogs>>
type Linha = Pagina['itens'][number]
type Resumo = Awaited<ReturnType<typeof getLogsResumo>>

const TOM_NIVEL: Record<string, TomDl> = { ERRO: 'negativo', AVISO: 'alerta', INFO: 'info' }
const ICONE_NIVEL: Record<string, typeof Info> = { ERRO: AlertTriangle, AVISO: TriangleAlert, INFO: Info }
const ROTULO_NIVEL: Record<string, string> = { ERRO: 'Erro', AVISO: 'Aviso', INFO: 'Info' }

/** Horas sem nenhum evento. Acima disto a tela avisa que o silêncio é suspeito. */
const SILENCIO_SUSPEITO_H = 36

const quando = (iso: string, agora: number) => {
  const d = new Date(iso)
  const min = Math.round((agora - d.getTime()) / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min} min atrás`
  if (min < 1440) return `${Math.round(min / 60)} h atrás`
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })
}

function Filtro({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={ativo}
      className={`px-3 min-h-10 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
        ativo ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent'
      }`}>
      {children}
    </button>
  )
}

export default function LogsPage() {
  const [dados, setDados] = useState<Pagina | null>(null)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [filtros, setFiltros] = useState<LogFiltros>({})
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    try {
      const [p, r] = await Promise.all([getLogs(filtros, pagina), getLogsResumo()])
      setDados(p)
      setResumo(r)
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setCarregando(false)
    }
  }, [filtros, pagina])

  // Carga e recarga por filtro; o setState acontece depois do await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])

  const agora = resumo ? new Date(resumo.agora).getTime() : 0

  const aplicar = (mudanca: Partial<LogFiltros>) => {
    setPagina(1)
    setFiltros((f) => {
      const novo = { ...f, ...mudanca }
      for (const k of Object.keys(novo) as (keyof LogFiltros)[]) {
        if (novo[k] === '' || novo[k] === false || novo[k] === undefined) delete novo[k]
      }
      return novo
    })
  }
  const temFiltro = Object.keys(filtros).length > 0

  const abrir = async (l: Linha) => {
    const proximo = aberto === l.id ? null : l.id
    setAberto(proximo)
    if (proximo && !l.lido) {
      try {
        await marcarLido(l.id)
        setDados((d) => d && { ...d, itens: d.itens.map((i) => (i.id === l.id ? { ...i, lido: true } : i)) })
        setResumo((r) => r && { ...r, naoLidos: Math.max(0, r.naoLidos - 1) })
      } catch { /* marcar como lido nunca pode atrapalhar a leitura */ }
    }
  }

  const tudoLido = async () => {
    try {
      const r = await marcarTodosLidos()
      toast.success(`${r.marcados} evento(s) marcados como lidos.`)
      await carregar()
    } catch (e) {
      toast.error(erroDe(e))
    }
  }

  const limpar = async () => {
    const ok = await confirmar({
      titulo: 'Apagar logs com mais de 30 dias?',
      descricao: 'Some do banco e não dá para desfazer. O histórico de ajustes da Máquina é mantido.',
      confirmar: 'Apagar antigos',
      destrutivo: true,
    })
    if (!ok) return
    try {
      const r = await limparAntigos(30)
      toast.success(`${r.apagados} evento(s) apagados.`)
      await carregar()
    } catch (e) {
      toast.error(erroDe(e))
    }
  }

  const silencioSuspeito = !!resumo?.ultimoEm && agora - new Date(resumo.ultimoEm).getTime() > SILENCIO_SUSPEITO_H * 3600_000

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1100px] w-full mx-auto space-y-5">

          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
                <FileText className="w-3.5 h-3.5" /><span>Operação</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Logs</h1>
              <p className="text-xs text-muted-foreground mt-1">O que as automações têm a dizer. Fica aqui, não no WhatsApp de ninguém.</p>
            </div>
            <button onClick={() => void carregar()} disabled={carregando} className={BOTAO}>
              <RefreshCw className={`w-3.5 h-3.5 ${carregando ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>

          {erro && <ErroDeCarga erro={erro} tentarDeNovo={() => void carregar()} />}

          {resumo && (
            <>
              <div className={`grid gap-2 ${colunasPara(4)}`}>
                <CartaoIndicador rotulo="Erros (24 h)" valor={resumo.erros24h} tom="ruim"
                  ativo={filtros.nivel === 'ERRO'} onClick={() => aplicar({ nivel: filtros.nivel === 'ERRO' ? undefined : 'ERRO' })} />
                <CartaoIndicador rotulo="Avisos (24 h)" valor={resumo.avisos24h} tom="alerta"
                  ativo={filtros.nivel === 'AVISO'} onClick={() => aplicar({ nivel: filtros.nivel === 'AVISO' ? undefined : 'AVISO' })} />
                <CartaoIndicador rotulo="Não lidos" valor={resumo.naoLidos}
                  ativo={!!filtros.naoLidos} onClick={() => aplicar({ naoLidos: !filtros.naoLidos })} />
                <CartaoIndicador rotulo="Último evento" valor={resumo.ultimoEm ? quando(resumo.ultimoEm, agora) : '—'} />
              </div>
              {/* Silêncio absoluto não é boa notícia: pode ser que ninguém esteja mandando nada. */}
              {silencioSuspeito && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-warning/35 bg-warning/8 text-sm text-foreground">
                  <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-warning" />
                  <span>Nenhum evento há mais de {SILENCIO_SUSPEITO_H} h. Pode ser calmaria — ou as automações pararam de reportar.</span>
                </div>
              )}
            </>
          )}

          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); aplicar({ busca }) }}>
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no título, detalhe ou origem…"
                className={`${CAMPO} pl-8`} aria-label="Buscar nos logs" />
            </div>
            {temFiltro && (
              <button type="button" onClick={() => { setFiltros({}); setBusca(''); setPagina(1) }} className={BOTAO}>Limpar</button>
            )}
          </form>

          {resumo && (resumo.tipos.length > 0 || resumo.origens.length > 0) && (
            <div className={`${PAINEL} p-4 space-y-3`}>
              {resumo.tipos.length > 0 && (
                <div>
                  <p className="ocr-label mb-1.5">Tipo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resumo.tipos.map((t) => (
                      <Filtro key={t.valor} ativo={filtros.tipo === t.valor} onClick={() => aplicar({ tipo: filtros.tipo === t.valor ? undefined : t.valor })}>
                        {t.valor} <span className="tabular opacity-70">{t.total}</span>
                      </Filtro>
                    ))}
                  </div>
                </div>
              )}
              {resumo.origens.length > 0 && (
                <div>
                  <p className="ocr-label mb-1.5">Origem</p>
                  <div className="flex flex-wrap gap-1.5">
                    {resumo.origens.map((o) => (
                      <Filtro key={o.valor} ativo={filtros.origem === o.valor} onClick={() => aplicar({ origem: filtros.origem === o.valor ? undefined : o.valor })}>
                        {o.valor} <span className="tabular opacity-70">{o.total}</span>
                      </Filtro>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            {carregando && !dados && [0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-[68px] rounded-xl border border-border bg-muted/50 animate-pulse" aria-hidden />
            ))}

            {dados && dados.itens.length === 0 && (
              <div className={`${PAINEL} p-8 text-center`}>
                <FileText className="w-7 h-7 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-foreground">{temFiltro ? 'Nenhum evento com esses filtros.' : 'Nenhum evento registrado ainda.'}</p>
                {!temFiltro && <p className="text-xs text-muted-foreground mt-1">As automações escrevem aqui quando algo acontece.</p>}
              </div>
            )}

            {dados?.itens.map((l) => {
              const Icone = ICONE_NIVEL[l.nivel] ?? Info
              const expandido = aberto === l.id
              return (
                <div key={l.id} className={`rounded-xl border bg-card overflow-hidden ${l.lido ? 'border-border' : 'border-primary/40'}`}>
                  <button onClick={() => void abrir(l)} aria-expanded={expandido}
                    className="w-full flex items-start gap-3 p-3 min-h-10 text-left hover:bg-accent transition-colors cursor-pointer">
                    <span className="dl-chip shrink-0 mt-0.5" data-tom={TOM_NIVEL[l.nivel] ?? 'info'} title={ROTULO_NIVEL[l.nivel] ?? l.nivel}>
                      <Icone className="w-3.5 h-3.5" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className={`text-sm text-foreground ${l.lido ? 'font-medium' : 'font-semibold'} break-words`}>{l.titulo}</span>
                        {!l.lido && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" aria-label="não lido" />}
                      </span>
                      <span className="flex items-center gap-2 flex-wrap mt-1 text-[11px] text-muted-foreground">
                        <span className="dl-chip text-[10px]">{l.tipo}</span>
                        <span className="truncate max-w-[45vw] md:max-w-none">{l.origem}</span>
                        <span aria-hidden>·</span>
                        <span>{quando(l.createdAt, agora)}</span>
                      </span>
                    </span>
                    <span className="shrink-0 text-muted-foreground mt-1">
                      {expandido ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                  </button>
                  {expandido && (
                    <div className="px-3 pb-3 sm:pl-[52px] space-y-2">
                      {l.detalhe && <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-words font-sans">{l.detalhe}</pre>}
                      {l.dados && (
                        <pre className="ocr-mono text-[11px] text-muted-foreground bg-muted/50 rounded-lg p-2 border border-border-subtle max-h-64 overflow-auto">{l.dados}</pre>
                      )}
                      {!l.detalhe && !l.dados && <p className="text-xs text-muted-foreground">Sem detalhe adicional.</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {dados && dados.totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={dados.pagina <= 1} className={BOTAO}>Anterior</button>
              <span className="text-xs text-muted-foreground tabular">{dados.pagina} de {dados.totalPaginas} · {dados.total} evento(s)</span>
              <button onClick={() => setPagina((p) => Math.min(dados.totalPaginas, p + 1))} disabled={dados.pagina >= dados.totalPaginas} className={BOTAO}>Próxima</button>
            </div>
          )}

          {dados && dados.total > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button onClick={() => void tudoLido()} className={BOTAO}><CheckCheck className="w-3.5 h-3.5" /> Marcar tudo como lido</button>
              <button onClick={() => void limpar()} className={BOTAO}><Trash2 className="w-3.5 h-3.5" /> Limpar +30 dias</button>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
