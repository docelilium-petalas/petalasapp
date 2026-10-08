'use client'

/**
 * MENSAGENS — cada linha é uma mensagem da régua, com a prova de que chegou.
 *
 * Abre no recorte "na régua" (o que já saiu e o que vai sair) e DIZ quantas
 * linhas ficaram de fora — filtro que esconde sem avisar vira "sumiu mensagem".
 * O clique num cartão de indicador do painel chega aqui como `indicador`: o
 * número e o filtro saem do mesmo objeto (`lib/maquina-vendas/indicadores.ts`).
 *
 * Abaixo de 640px a tabela vira lista de cartões.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, Pause, Play, Search, X, Ban, MessageSquare, FileText } from 'lucide-react'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { cancelarInscricao, getMvTabela, pausarInscricao, retomarInscricao } from '@/app/actions/maquina-vendas'
import { FILTRO_MSG_REGUA } from '@/lib/maquina-vendas/filtros'
import {
  BOTAO, BOTAO_ICONE, CABECALHO_PAINEL, CAMPO, Carregando, Chip, ErroDeCarga, PAINEL, ROTULO_STATUS_INSC,
  ROTULO_STATUS_MSG, SeloDeProva, SeloDoTexto, TOM_STATUS_INSC, TOM_STATUS_MSG, Vazio, erroDe, horaCurta, quandoLegivel,
} from './comum'

type Tabela = Awaited<ReturnType<typeof getMvTabela>>
type Linha = Tabela['linhas'][number]

export function AbaTabela({
  indicador,
  periodo,
  limparIndicador,
  verTudo,
  aoMudar,
}: {
  indicador: string
  /** O período do painel — a tabela segue o mesmo filtro que os cartões. `null` = tudo. */
  periodo: { de: string; ate: string } | null
  limparIndicador: () => void
  /** Troca o período do painel para "tudo". */
  verTudo: () => void
  /** O painel de cima recarrega depois de pausar/retomar/cancelar. */
  aoMudar: () => void
}) {
  const [dados, setDados] = useState<Tabela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** Chave da última consulta que voltou — "carregando" é derivado, não guardado. */
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [filtroMsg, setFiltroMsg] = useState<string>(FILTRO_MSG_REGUA)
  const [filtroInsc, setFiltroInsc] = useState('')
  const [pagina, setPagina] = useState(1)
  const [aberta, setAberta] = useState<string | null>(null)
  const [agindo, setAgindo] = useState<string | null>(null)

  // Trocar de recorte ou de período volta para a página 1 (ajuste durante a renderização, sem efeito).
  const periodoChave = periodo ? `${periodo.de}|${periodo.ate}` : 'tudo'
  const [recorteVisto, setRecorteVisto] = useState(`${indicador}#${periodoChave}`)
  if (recorteVisto !== `${indicador}#${periodoChave}`) {
    setRecorteVisto(`${indicador}#${periodoChave}`)
    setPagina(1)
  }

  const chave = JSON.stringify([buscaAplicada, filtroMsg, filtroInsc, indicador, periodoChave, pagina])
  const carregando = chaveCarregada !== chave

  const carregar = useCallback(async () => {
    const minhaChave = JSON.stringify([buscaAplicada, filtroMsg, filtroInsc, indicador, periodoChave, pagina])
    try {
      const t = await getMvTabela(
        {
          busca: buscaAplicada,
          statusMensagem: filtroMsg,
          statusInscricao: filtroInsc,
          indicador: indicador || undefined,
          periodo: periodoChave === 'tudo' ? null : { de: periodoChave.split('|')[0], ate: periodoChave.split('|')[1] },
        },
        pagina,
      )
      setDados(t)
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setChaveCarregada(minhaChave)
    }
  }, [buscaAplicada, filtroMsg, filtroInsc, indicador, periodoChave, pagina])

  useEffect(() => {
    // Busca reagindo aos filtros: o setState acontece depois do await, nao no corpo do
    // efeito. Mesmo padrao (e mesma supressao justificada) de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const agir = async (id: string, fn: () => Promise<void>, msg: string) => {
    setAgindo(id)
    try {
      await fn()
      toast.success(msg)
      await carregar()
      aoMudar()
    } catch (e) {
      toast.error(erroDe(e))
    } finally {
      setAgindo(null)
    }
  }

  const cancelar = async (l: Linha) => {
    const ok = await confirmar({
      titulo: `Tirar ${l.cliente} da régua?`,
      descricao:
        'As mensagens que ainda não saíram são canceladas e não dá para desfazer. Se for algo temporário, pausar é melhor — dá para retomar depois.',
      confirmar: 'Tirar da régua',
      destrutivo: true,
    })
    if (ok) await agir(l.id, () => cancelarInscricao(l.inscricaoId), 'Cliente tirada da régua.')
  }

  const Acoes = ({ l }: { l: Linha }) => (
    <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
      {l.statusInscricao === 'ATIVA' && (
        <button className={BOTAO_ICONE} disabled={agindo === l.id} title="Pausar esta cliente" aria-label="Pausar esta cliente"
          onClick={() => agir(l.id, () => pausarInscricao(l.inscricaoId), 'Régua pausada para esta cliente.')}>
          <Pause className="w-4 h-4" />
        </button>
      )}
      {l.statusInscricao === 'PAUSADA' && (
        <button className={BOTAO_ICONE} disabled={agindo === l.id} title="Retomar (o que venceu é redistribuído na janela)" aria-label="Retomar"
          onClick={() => agir(l.id, () => retomarInscricao(l.inscricaoId), 'Régua retomada.')}>
          <Play className="w-4 h-4" />
        </button>
      )}
      {['ATIVA', 'PAUSADA', 'ERRO'].includes(l.statusInscricao) && (
        <button className={BOTAO_ICONE} disabled={agindo === l.id} title="Tirar da régua" aria-label="Tirar da régua" onClick={() => cancelar(l)}>
          <Ban className="w-4 h-4" />
        </button>
      )}
      <Link href={`/maquina-vendas/contato/${l.inscricaoId}`} className={BOTAO_ICONE} title="Abrir o dossiê da cliente" aria-label="Abrir o dossiê da cliente">
        <FileText className="w-4 h-4" />
      </Link>
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault()
            setPagina(1)
            setBuscaAplicada(busca)
          }}
        >
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar por nome ou telefone"
            className={`${CAMPO} pl-9`} aria-label="Buscar por nome ou telefone" />
        </form>
        <select value={filtroMsg} onChange={(e) => { setFiltroMsg(e.target.value); setPagina(1) }} className={`${CAMPO} sm:w-52`} aria-label="Situação da mensagem">
          <option value={FILTRO_MSG_REGUA}>Enviadas e agendadas</option>
          <option value="">Todas as mensagens</option>
          {Object.entries(ROTULO_STATUS_MSG).filter(([k]) => k !== 'ENVIANDO').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filtroInsc} onChange={(e) => { setFiltroInsc(e.target.value); setPagina(1) }} className={`${CAMPO} sm:w-48`} aria-label="Situação da cliente">
          <option value="">Toda situação da cliente</option>
          {Object.entries(ROTULO_STATUS_INSC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* O recorte em palavras */}
      {dados?.recorte && (
        <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 flex items-start justify-between gap-3">
          <div className="text-xs min-w-0">
            <p className="text-foreground">
              Recorte: <strong>{dados.recorte.rotulo}</strong>
              {dados.recorte.retrato ? ' · agora' : ` · ${dados.periodo.rotulo}`} · {dados.total}{' '}
              {dados.recorte.unidade === 'pessoa' ? 'mensagem(ns) das clientes deste recorte' : 'mensagem(ns)'}
            </p>
            <p className="text-muted-foreground mt-0.5">{dados.recorte.ajuda}</p>
          </div>
          <button className={BOTAO} onClick={limparIndicador}>
            <X className="w-3.5 h-3.5" /> Tirar recorte
          </button>
        </div>
      )}
      {dados && !dados.recorte && dados.periodo.de && (
        <p className="text-xs text-muted-foreground">
          Mostrando as mensagens que saíram ou estavam marcadas para <strong className="text-foreground">{dados.periodo.rotulo}</strong>.{' '}
          <button className="underline text-foreground cursor-pointer min-h-10" onClick={verTudo}>
            Ver todo o período
          </button>
        </p>
      )}
      {filtroMsg === FILTRO_MSG_REGUA && (dados?.ocultas ?? 0) > 0 && (
        <p className="text-xs text-muted-foreground">
          {dados?.ocultas} mensagem(ns) canceladas, puladas ou com erro estão fora deste recorte.{' '}
          <button className="underline text-foreground cursor-pointer min-h-10" onClick={() => { setFiltroMsg(''); setPagina(1) }}>
            Mostrar todas
          </button>
        </p>
      )}

      {erro ? (
        <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
      ) : (
        <div className={`${PAINEL} overflow-hidden`}>
          <div className={CABECALHO_PAINEL}>
            <span className="ocr-label">Mensagens da régua</span>
            <span className="text-[11px] text-muted-foreground">{dados ? `${dados.total} no total` : ''}</span>
          </div>

          {/* Cabeçalho de colunas: só a partir de 640px */}
          <div className="hidden sm:grid grid-cols-[1.25rem_minmax(0,1.3fr)_minmax(0,1fr)_5rem_7rem_minmax(0,1fr)_auto] gap-3 px-5 py-2 border-b border-border-subtle">
            <span />
            <span className="ocr-label">Cliente</span>
            <span className="ocr-label">Régua</span>
            <span className="ocr-label">Toque</span>
            <span className="ocr-label">Quando</span>
            <span className="ocr-label">Situação</span>
            <span className="ocr-label text-right">Ações</span>
          </div>

          {carregando && !dados ? (
            <Carregando />
          ) : !dados || dados.linhas.length === 0 ? (
            <Vazio Icone={MessageSquare} titulo="Nenhuma mensagem neste recorte"
              detalhe="A régua enche quando o observador encontra carrinho abandonado, pedido novo ou uma cliente entra numa coluna acompanhada." />
          ) : (
            dados.linhas.map((l) => {
              const expandida = aberta === l.id
              return (
                <div key={l.id} className={`border-b border-border-subtle last:border-b-0 ${carregando ? 'opacity-60' : ''}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setAberta(expandida ? null : l.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAberta(expandida ? null : l.id) } }}
                    className="px-4 sm:px-5 py-3 hover:bg-muted/40 transition-colors cursor-pointer sm:grid sm:grid-cols-[1.25rem_minmax(0,1.3fr)_minmax(0,1fr)_5rem_7rem_minmax(0,1fr)_auto] sm:gap-3 sm:items-center"
                    aria-expanded={expandida}
                  >
                    {/* ≥640px: colunas */}
                    <span className="hidden sm:block text-muted-foreground">
                      {expandida ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </span>
                    <div className="hidden sm:block min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{l.cliente}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{l.telefone} · {l.origem}</p>
                    </div>
                    <span className="hidden sm:block text-xs text-muted-foreground truncate">{l.cadencia}</span>
                    <span className="hidden sm:block text-xs text-foreground tabular">{l.etapa}</span>
                    <span className="hidden sm:block text-xs text-muted-foreground tabular" title={horaCurta(l.quando)}>{quandoLegivel(l.quando)}</span>
                    <div className="hidden sm:flex flex-wrap gap-1">
                      <Chip tom={TOM_STATUS_MSG[l.statusMensagem]}>{ROTULO_STATUS_MSG[l.statusMensagem] ?? l.statusMensagem}</Chip>
                      {l.statusMensagem === 'ENVIADA' && <SeloDeProva prova={l.prova} />}
                      {l.statusInscricao !== 'ATIVA' && (
                        <Chip tom={TOM_STATUS_INSC[l.statusInscricao]}>{ROTULO_STATUS_INSC[l.statusInscricao] ?? l.statusInscricao}</Chip>
                      )}
                    </div>
                    <div className="hidden sm:flex justify-end"><Acoes l={l} /></div>

                    {/* <640px: cartão */}
                    <div className="sm:hidden space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-foreground">{l.cliente}</p>
                          <p className="text-[11px] text-muted-foreground">{l.telefone} · {l.origem}</p>
                        </div>
                        <span className="text-[11px] text-muted-foreground tabular shrink-0">{quandoLegivel(l.quando)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        <Chip>{l.cadencia} · toque {l.etapa}</Chip>
                        <Chip tom={TOM_STATUS_MSG[l.statusMensagem]}>{ROTULO_STATUS_MSG[l.statusMensagem] ?? l.statusMensagem}</Chip>
                        {l.statusMensagem === 'ENVIADA' && <SeloDeProva prova={l.prova} />}
                        {l.statusInscricao !== 'ATIVA' && (
                          <Chip tom={TOM_STATUS_INSC[l.statusInscricao]}>{ROTULO_STATUS_INSC[l.statusInscricao] ?? l.statusInscricao}</Chip>
                        )}
                      </div>
                      <Acoes l={l} />
                    </div>
                  </div>

                  {expandida && (
                    <div className="px-4 sm:px-5 pb-4 sm:pl-12 space-y-2">
                      <div className="dl-panel px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5 mb-2">
                          <SeloDoTexto origem={l.texto.origem} aviso={l.texto.aviso} />
                          {l.template && <Chip tom="marca">{l.template}</Chip>}
                          <span className="text-[11px] text-muted-foreground tabular">{horaCurta(l.quando)}</span>
                        </div>
                        <p className="text-xs text-foreground leading-relaxed whitespace-pre-line">{l.texto.corpo}</p>
                        {l.texto.aviso && <p className="text-[11px] text-muted-foreground mt-2">{l.texto.aviso}</p>}
                      </div>
                      {l.statusMensagem === 'ENVIADA' && l.prova && (
                        <p className="text-[11px] text-muted-foreground">Entrega: {l.prova.detalhe}</p>
                      )}
                      {l.erro && <p className="text-[11px] text-destructive break-words">Erro: {l.erro}</p>}
                      {l.motivoParada && <p className="text-[11px] text-muted-foreground">Por que parou: {l.motivoParada}</p>}
                      <p className="text-[11px] text-muted-foreground">Enviadas para ela até agora: {l.enviadas}</p>
                    </div>
                  )}
                </div>
              )
            })
          )}

          {dados && dados.totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border">
              <button className={BOTAO} disabled={dados.pagina <= 1 || carregando} onClick={() => setPagina(dados.pagina - 1)}>Anterior</button>
              <span className="text-xs text-muted-foreground tabular">página {dados.pagina} de {dados.totalPaginas}</span>
              <button className={BOTAO} disabled={dados.pagina >= dados.totalPaginas || carregando} onClick={() => setPagina(dados.pagina + 1)}>Próxima</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
