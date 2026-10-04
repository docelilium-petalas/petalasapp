'use client'

/**
 * RESULTADOS — uma linha por CLIENTE.
 *
 * A Máquina de Vendas responde "o que vai acontecer". Esta tela responde a
 * pergunta que paga a conta: "o que aconteceu com quem a gente abordou".
 *
 * Fusão da tela que a Doce Lilium já tinha (4 números de topo, período,
 * receita) com a da CarBoss (baldes de desfecho clicáveis, janela de
 * atribuição dita em palavras, marcação manual com desfazer, desempenho por
 * toque). Só tokens da DL.
 *
 * ⚠️ Contar esforço (mensagens enviadas) é fácil e não significa nada. O que
 *    importa é desfecho — respondeu, comprou, saiu. Por isso a taxa é sobre
 *    CLIENTES alcançadas, não sobre envios.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { TrendingUp, Database, Rocket, Search, Undo2, UserX, EyeOff, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { CartaoIndicador, TituloDoBloco, colunasPara, EsqueletoDeCartoes } from '@/components/maquina-vendas/cartoes'
import { BOTAO, BOTAO_ICONE, CAMPO, PAINEL, CABECALHO_PAINEL, Chip, Vazio, ErroDeCarga, erroDe, type TomDl } from '@/components/maquina-vendas/comum'
import { GRUPOS_DE_BALDES } from '@/lib/maquina-vendas/resultado'
import {
  getRelatorioDeResultados,
  marcarResultado,
  type RelatorioDeResultados,
  type LinhaDoRelatorio,
} from '@/app/actions/resultados'

const PERIODOS = [
  { rot: '7 dias', dias: 7 },
  { rot: '30 dias', dias: 30 },
  { rot: '90 dias', dias: 90 },
]

const TOM_DL: Record<LinhaDoRelatorio['tom'], TomDl> = {
  bom: 'positivo',
  alerta: 'alerta',
  ruim: 'negativo',
  neutro: undefined,
}

const dataCurta = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'
const reais = (n: number, casas = 0) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: casas })

export default function ResultadosPage() {
  const [dias, setDias] = useState(30)
  const [cadenciaId, setCadenciaId] = useState('')
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [balde, setBalde] = useState('')
  const [dados, setDados] = useState<RelatorioDeResultados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [marcando, setMarcando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro(null)
    try {
      const de = new Date(Date.now() - dias * 24 * 3600_000).toISOString()
      setDados(await getRelatorioDeResultados({
        de,
        cadenciaId: cadenciaId || undefined,
        busca: buscaAplicada || undefined,
        balde: balde || undefined,
      }))
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setCarregando(false)
    }
  }, [dias, cadenciaId, buscaAplicada, balde])

  // Recarrega quando um filtro muda; o setState acontece depois do await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void carregar() }, [carregar])

  const marcar = async (l: LinhaDoRelatorio, marca: 'CONTATO_ERRADO' | 'DESCONSIDERAR' | null) => {
    if (marca) {
      const ok = await confirmar({
        titulo: marca === 'CONTATO_ERRADO' ? 'Marcar como contato errado?' : 'Tirar do relatório?',
        descricao: `${l.nome} sai da taxa de pedidos. Não apaga nada e não mexe na régua — dá para desfazer depois.`,
        confirmar: 'Marcar',
      })
      if (!ok) return
    }
    setMarcando(l.id)
    try {
      await marcarResultado(l.id, marca)
      toast.success(marca ? 'Marcação gravada.' : 'Marcação desfeita.')
      await carregar()
    } catch (e) {
      toast.error(erroDe(e))
    } finally {
      setMarcando(null)
    }
  }

  const desempenho = dados?.desempenhoPorToque
  const linhasDoToque = desempenho?.linhas.filter((t) => t.enviadas > 0) ?? []

  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[1400px] w-full mx-auto space-y-6">

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Desfecho</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Resultados</h1>
              <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
                O que aconteceu com cada cliente que a Máquina abordou — não quantas mensagens saíram.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-secondary border border-border">
                {PERIODOS.map((p) => (
                  <button key={p.dias} onClick={() => setDias(p.dias)} aria-pressed={dias === p.dias}
                    className={`px-3 min-h-10 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                      dias === p.dias ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    }`}>
                    {p.rot}
                  </button>
                ))}
              </div>
              <Link href="/maquina-vendas" className={BOTAO}>
                <Rocket className="w-3.5 h-3.5" />
                A Máquina
              </Link>
            </div>
          </div>

          {erro ? (
            <ErroDeCarga erro={erro} tentarDeNovo={() => void carregar()} />
          ) : !dados && carregando ? (
            <EsqueletoDeCartoes quantos={4} />
          ) : dados && !dados.migrado ? (
            <div className="rounded-2xl border border-warning/35 bg-warning/8 p-5 flex items-start gap-3">
              <Database className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-foreground">O módulo ainda não foi migrado no banco.</p>
                <p className="text-muted-foreground mt-1">Os números aparecem sozinhos assim que as tabelas existirem.</p>
              </div>
            </div>
          ) : dados ? (
            <>
              {/* ── Os quatro números de topo (os que a DL já tinha) ── */}
              <div className={`grid gap-2 ${colunasPara(4)}`}>
                <CartaoIndicador rotulo="Clientes abordadas" valor={dados.total} ajuda={`primeira mensagem nos últimos ${dias} dias`} />
                <CartaoIndicador rotulo="Alcançadas" valor={dados.alcancadas} ajuda="entram na taxa — tirando quem ainda não recebeu e as marcadas à mão"
                  proporcao={{ parte: dados.alcancadas, total: dados.total, rotuloBase: 'abordadas' }} />
                <CartaoIndicador rotulo="Fizeram pedido" valor={dados.sucessos} tom="bom"
                  proporcao={{ parte: dados.sucessos, total: dados.alcancadas, rotuloBase: 'alcançadas' }} />
                <CartaoIndicador rotulo="Receita atribuída" valor={reais(dados.receita)} tom="bom" ajuda="soma dos pedidos dentro da janela" />
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                Taxa de pedido: <strong className="text-foreground tabular">{dados.taxaSucesso.toLocaleString('pt-BR')}%</strong> das alcançadas.
                {dados.janelaAberta > 0 && (
                  <> {' '}<strong className="text-foreground tabular">{dados.janelaAberta}</strong> cliente{dados.janelaAberta === 1 ? '' : 's'} ainda
                    pode{dados.janelaAberta === 1 ? '' : 'm'} virar pedido — a janela de {dados.janelaDias} dias depois do último toque está aberta.
                    Este número pode crescer para o mesmo período.</>
                )}
              </p>

              {/* ── Baldes de desfecho, clicáveis ── */}
              {GRUPOS_DE_BALDES.map((g) => {
                const doGrupo = dados.baldes.filter((b) => b.grupo === g.id)
                return (
                  <section key={g.id} className="space-y-2">
                    <TituloDoBloco titulo={g.titulo} legenda={g.legenda} />
                    <div className={`grid gap-2 ${colunasPara(doGrupo.length)}`}>
                      {doGrupo.map((b) => (
                        <CartaoIndicador key={b.id} rotulo={b.rotulo} valor={b.valor} tom={b.tom} ajuda={b.acao}
                          ativo={balde === b.id} onClick={() => setBalde(balde === b.id ? '' : b.id)} />
                      ))}
                    </div>
                  </section>
                )
              })}

              {/* ── Tabela ── */}
              <div className={`${PAINEL} overflow-hidden`}>
                <div className={CABECALHO_PAINEL}>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-medium text-foreground">Clientes</span>
                    <span className="text-xs text-muted-foreground tabular">{dados.linhas.length}</span>
                    {balde && (
                      <button onClick={() => setBalde('')} className="dl-chip text-[10px] cursor-pointer" data-tom="marca">
                        {dados.baldes.find((b) => b.id === balde)?.rotulo} · limpar
                      </button>
                    )}
                  </div>
                  <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); setBuscaAplicada(busca.trim()) }}>
                    <select value={cadenciaId} onChange={(e) => setCadenciaId(e.target.value)} className={`${CAMPO} !w-auto max-w-[14rem]`} aria-label="Régua">
                      <option value="">Todas as réguas</option>
                      {dados.cadencias.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                    </select>
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou telefone"
                        className={`${CAMPO} !w-48 pl-8`} aria-label="Buscar cliente" />
                    </div>
                  </form>
                </div>

                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_9rem_6rem_4.5rem_5.5rem_5.5rem_6.5rem_minmax(0,11rem)_5.5rem] gap-3 items-center px-5 py-2.5 border-b border-border bg-muted/40">
                  <span className="ocr-label">Cliente</span>
                  <span className="ocr-label">Régua</span>
                  <span className="ocr-label">Origem</span>
                  <span className="ocr-label text-right">Envios</span>
                  <span className="ocr-label text-right">Respondeu</span>
                  <span className="ocr-label text-right">Pedido</span>
                  <span className="ocr-label text-right">Valor</span>
                  <span className="ocr-label">Desfecho</span>
                  <span className="ocr-label text-right">Marcar</span>
                </div>

                {carregando && dados.linhas.length === 0 ? (
                  <div className="p-5"><EsqueletoDeCartoes quantos={2} /></div>
                ) : dados.linhas.length === 0 ? (
                  <Vazio Icone={TrendingUp} titulo="Ninguém neste recorte"
                    detalhe={balde || buscaAplicada || cadenciaId ? 'Tire um filtro para ver mais clientes.' : 'As linhas aparecem quando a Máquina começar a falar com clientes.'} />
                ) : (
                  dados.linhas.map((l) => (
                    <div key={l.id}
                      className="grid md:grid-cols-[minmax(0,1fr)_9rem_6rem_4.5rem_5.5rem_5.5rem_6.5rem_minmax(0,11rem)_5.5rem] gap-2 md:gap-3 items-center px-4 md:px-5 py-3 border-b border-border-subtle last:border-b-0 hover:bg-muted/40 transition-colors">
                      <div className="min-w-0">
                        <Link href={`/maquina-vendas/contato/${l.id}`} className="text-sm font-medium text-foreground block truncate hover:underline">{l.nome}</Link>
                        <span className="text-[11px] text-muted-foreground ocr-mono">{l.telefone}</span>
                      </div>
                      <span className="hidden md:block text-xs text-muted-foreground truncate" title={l.cadencia}>{l.cadencia}</span>
                      <span className="hidden md:block text-xs text-muted-foreground truncate">{l.origem}</span>
                      <span className="hidden md:block text-right text-sm text-foreground tabular">{l.enviadas}</span>
                      <span className={`hidden md:block text-right text-sm tabular ${l.respondeuEm ? 'text-info font-medium' : 'text-muted-foreground'}`}>{dataCurta(l.respondeuEm)}</span>
                      <span className={`hidden md:block text-right text-sm tabular ${l.pedidoEm ? 'text-success font-medium' : 'text-muted-foreground'}`}>{dataCurta(l.pedidoEm)}</span>
                      <span className="hidden md:block text-right text-sm text-foreground tabular">{l.valor ? reais(l.valor, 2) : '—'}</span>
                      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                        <Chip tom={TOM_DL[l.tom]}>{l.rotuloBalde}</Chip>
                        {l.janelaAberta && !l.pedidoEm && (
                          <span className="text-[10px] text-muted-foreground" title={`A janela fecha em ${dataCurta(l.janelaFechaEm)}`}>janela até {dataCurta(l.janelaFechaEm)}</span>
                        )}
                        {/* No celular, o que a tabela mostra em colunas vira chips. */}
                        <span className="md:hidden contents">
                          <Chip>{l.cadencia}</Chip>
                          <Chip>{l.enviadas} envio{l.enviadas === 1 ? '' : 's'}</Chip>
                          {l.pedidoEm && <Chip tom="positivo">pedido {dataCurta(l.pedidoEm)}{l.valor ? ` · ${reais(l.valor)}` : ''}</Chip>}
                        </span>
                      </div>
                      <div className="flex md:justify-end gap-1">
                        {l.resultadoManual ? (
                          <button onClick={() => void marcar(l, null)} disabled={marcando === l.id} className={BOTAO} title="Desfazer a marcação">
                            <Undo2 className="w-3.5 h-3.5" /><span className="md:hidden">Desfazer</span>
                          </button>
                        ) : (
                          <>
                            <button onClick={() => void marcar(l, 'CONTATO_ERRADO')} disabled={marcando === l.id}
                              className={BOTAO_ICONE} title="Não é a cliente — contato errado" aria-label="Marcar contato errado">
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => void marcar(l, 'DESCONSIDERAR')} disabled={marcando === l.id}
                              className={BOTAO_ICONE} title="Tirar do relatório" aria-label="Desconsiderar">
                              <EyeOff className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* ── Desempenho por toque ── */}
              {desempenho && (
                <section className="space-y-2">
                  <TituloDoBloco titulo="Desempenho por toque" legenda="qual mensagem da régua fez a cliente responder ou comprar" />
                  {linhasDoToque.length === 0 ? (
                    <div className={PAINEL}><Vazio Icone={BarChart3} titulo="Nenhum envio no período" /></div>
                  ) : (
                    <div className={`${PAINEL} overflow-x-auto`}>
                      <table className="w-full text-sm min-w-[560px]">
                        <thead>
                          <tr className="border-b border-border bg-muted/40 text-left">
                            {['Toque', 'Enviadas', 'Entregues', 'Lidas', 'Respostas', 'Pedidos', 'Receita'].map((h, i) => (
                              <th key={h} className={`ocr-label px-4 py-2.5 ${i ? 'text-right' : ''}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {linhasDoToque.map((t) => (
                            <tr key={t.toque} className="border-b border-border-subtle last:border-b-0">
                              <td className="px-4 py-2.5 text-foreground font-medium">{t.toque}º toque</td>
                              <td className="px-4 py-2.5 text-right tabular">{t.enviadas}</td>
                              <td className="px-4 py-2.5 text-right tabular">{t.entregues}</td>
                              <td className="px-4 py-2.5 text-right tabular">{t.lidas}</td>
                              <td className="px-4 py-2.5 text-right tabular">
                                {t.respostas}{t.taxaResposta !== null && <span className="text-muted-foreground text-xs"> · {t.taxaResposta}%</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular">
                                {t.pedidos}{t.taxaPedido !== null && <span className="text-muted-foreground text-xs"> · {t.taxaPedido}%</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular">{t.receita ? reais(t.receita) : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="px-4 py-2.5 text-[11px] text-muted-foreground border-t border-border-subtle">
                        Abaixo de {desempenho.minimoParaVeredito} entregas um toque não recebe veredito — é cedo para concluir.
                        {desempenho.semToque > 0 && <> {desempenho.semToque} cliente{desempenho.semToque === 1 ? '' : 's'} falou antes do primeiro toque.</>}
                      </p>
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>
    </AppLayout>
  )
}
