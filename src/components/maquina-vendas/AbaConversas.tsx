'use client'

/**
 * POR CONVERSA — uma linha por cliente, com a régua inteira dentro: o que saiu
 * (e se chegou), o que ela respondeu, quando a equipe assumiu, o pedido, e o
 * que ainda vai sair. Responde "o que exatamente essa cliente recebeu e vai
 * receber?" sem abrir o WhatsApp.
 *
 * Carrega os próprios dados: a consulta só interessa a quem abriu esta aba.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, Search, Users, FileText, Send, Undo2, MessageCircle, UserCheck, ShoppingBag, Clock } from 'lucide-react'
import { getMvConversas } from '@/app/actions/maquina-vendas'
import {
  BOTAO, BOTAO_ICONE, CABECALHO_PAINEL, CAMPO, Carregando, Chip, ErroDeCarga, PAINEL, ROTULO_STATUS_INSC, SeloDeProva,
  TOM_STATUS_INSC, Vazio, erroDe, horaCurta, quandoLegivel,
} from './comum'

type Dados = Awaited<ReturnType<typeof getMvConversas>>
type Evento = Dados['conversas'][number]['eventos'][number]

const POR_PAGINA = 20

const ICONE_DO_EVENTO = {
  envio: Send,
  devolucao: Undo2,
  resposta: MessageCircle,
  equipe: UserCheck,
  pedido: ShoppingBag,
  programada: Clock,
} as const

function LinhaDoEvento({ e, agora }: { e: Evento; agora: number }) {
  const Icone = ICONE_DO_EVENTO[e.tipo] ?? Clock
  const daCliente = e.tipo === 'resposta'
  return (
    <div className={`flex gap-3 ${e.futuro ? 'opacity-75' : ''}`}>
      <span className={`mt-0.5 shrink-0 ${daCliente ? 'text-primary' : 'text-muted-foreground'}`}><Icone className="w-4 h-4" aria-hidden /></span>
      <div className={`flex-1 min-w-0 rounded-xl border px-3 py-2 ${daCliente ? 'border-primary/30 bg-primary/5' : 'border-border-subtle bg-muted/30'} ${e.futuro ? 'border-dashed' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-foreground">{e.titulo}</span>
          <span className="flex items-center gap-1.5">
            {e.prova && <SeloDeProva prova={e.prova} />}
            <span className="text-[11px] text-muted-foreground tabular" title={horaCurta(e.quando)}>{e.futuro ? quandoLegivel(e.quando, agora) : horaCurta(e.quando)}</span>
          </span>
        </div>
        {e.texto && <p className="text-xs text-foreground leading-relaxed whitespace-pre-line mt-1">{e.texto}</p>}
        {e.detalhe && <p className="text-[11px] text-muted-foreground mt-1">{e.detalhe}</p>}
      </div>
    </div>
  )
}

export function AbaConversas() {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [chaveCarregada, setChaveCarregada] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [buscaAplicada, setBuscaAplicada] = useState('')
  const [pagina, setPagina] = useState(1)
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const carregando = chaveCarregada !== `${buscaAplicada}|${pagina}`

  const carregar = useCallback(async () => {
    try {
      setDados(await getMvConversas({ busca: buscaAplicada || undefined, pagina, porPagina: POR_PAGINA }))
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setChaveCarregada(`${buscaAplicada}|${pagina}`)
    }
  }, [buscaAplicada, pagina])

  useEffect(() => {
    // Busca reagindo aos filtros: o setState acontece depois do await, nao no corpo do
    // efeito. Mesmo padrao (e mesma supressao justificada) de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const alternar = (id: string) =>
    setAbertas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // O "agora" vem do servidor junto com os dados: a tela não consulta o relógio ao renderizar.
  const agora = dados ? new Date(dados.agora).getTime() : 0
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1

  return (
    <div className="space-y-3">
      <form className="relative" onSubmit={(e) => { e.preventDefault(); setPagina(1); setBuscaAplicada(busca) }}>
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar cliente por nome ou telefone"
          className={`${CAMPO} pl-9`} aria-label="Buscar cliente" />
      </form>

      {erro ? (
        <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
      ) : (
        <div className={`${PAINEL} overflow-hidden`}>
          <div className={CABECALHO_PAINEL}>
            <span className="ocr-label">Uma linha por cliente, com a régua inteira</span>
            <span className="text-[11px] text-muted-foreground">{dados ? `${dados.total} conversa(s)` : ''}</span>
          </div>
          {carregando && !dados ? (
            <Carregando />
          ) : !dados || dados.conversas.length === 0 ? (
            <Vazio Icone={Users} titulo="Nenhuma conversa encontrada" />
          ) : (
            dados.conversas.map((c) => {
              const aberta = abertas.has(c.inscricaoId)
              return (
                <div key={c.inscricaoId} className="border-b border-border-subtle last:border-b-0">
                  <div className="flex items-stretch">
                    <button onClick={() => alternar(c.inscricaoId)} aria-expanded={aberta}
                      className="flex-1 min-w-0 text-left px-4 sm:px-5 py-3 flex items-center gap-3 hover:bg-muted/40 transition-colors cursor-pointer min-h-10">
                      {aberta ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">
                          {c.nome} <span className="text-xs font-normal text-muted-foreground">{c.telefone}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          <Chip>{c.cadencia}</Chip>
                          <Chip tom={TOM_STATUS_INSC[c.status]}>{ROTULO_STATUS_INSC[c.status] ?? c.status}</Chip>
                          {c.respondeu && <Chip tom="positivo">respondeu</Chip>}
                          {c.ultimoSinal && <span className="text-[11px] text-muted-foreground">último sinal {quandoLegivel(c.ultimoSinal, agora)}</span>}
                        </div>
                      </div>
                      <span className="text-[11px] text-muted-foreground tabular shrink-0 hidden sm:inline">
                        {c.entregues}/{c.enviadas} chegaram
                      </span>
                    </button>
                    <div className="flex items-center pr-3">
                      <Link href={`/maquina-vendas/contato/${c.inscricaoId}`} className={BOTAO_ICONE} aria-label={`Dossiê de ${c.nome}`} title="Abrir o dossiê">
                        <FileText className="w-4 h-4" />
                      </Link>
                    </div>
                  </div>
                  {aberta && (
                    <div className="px-4 sm:px-5 pb-4 sm:pl-12 space-y-2">
                      {c.eventos.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Nada aconteceu nesta régua ainda.</p>
                      ) : (
                        c.eventos.map((e, i) => <LinhaDoEvento key={`${c.inscricaoId}-${i}`} e={e} agora={agora} />)
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
          {dados && totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t border-border">
              <button className={BOTAO} disabled={pagina <= 1 || carregando} onClick={() => setPagina(pagina - 1)}>Anterior</button>
              <span className="text-xs text-muted-foreground tabular">página {pagina} de {totalPaginas}</span>
              <button className={BOTAO} disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(pagina + 1)}>Próxima</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
