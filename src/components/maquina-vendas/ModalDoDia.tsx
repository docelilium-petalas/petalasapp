'use client'

/**
 * O DIA INTEIRO NUM MODAL — o que saiu, o que está agendado, o que a campanha
 * ainda vai pôr na fila, o texto, quem recebe e o ritmo que vale para o dia.
 *
 * Três origens, sempre separadas na tela:
 *   · SAÍRAM: `MvMensagem` ENVIADA (com prova de entrega/leitura) e ERRO;
 *   · AGENDADAS: `MvMensagem` AGENDADA — já está na fila;
 *   · PREVISTAS: a onda da campanha que só entra na fila às 09:00 do dia. Não
 *     existe no banco ainda; horário é estimativa (o relógio real só atrasa).
 *
 * Só leitura. Nada aqui envia, agenda ou cancela.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, CalendarDays, CheckCheck, Clock, Search, Send, Sparkles, X } from 'lucide-react'
import { getDetalheDoDia, type DetalheDoDia, type ItemPrevisto, type ItemProgramado } from '@/app/actions/maquina-vendas'
import { BOTAO, BOTAO_ICONE, CAMPO, Carregando, Chip, ErroDeCarga, ROTULO_STATUS_MSG, TOM_STATUS_MSG, Vazio, erroDe, type TomDl } from './comum'

export type VistaDaProgramacao = 'tudo' | 'sairam' | 'programadas'

export const VISTAS: { id: VistaDaProgramacao; rotulo: string }[] = [
  { id: 'tudo', rotulo: 'Tudo' },
  { id: 'sairam', rotulo: 'Saíram' },
  { id: 'programadas', rotulo: 'Programadas' },
]

const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const semana = (d: string) => SEMANA[new Date(`${d}T12:00:00Z`).getUTCDay()]
const horaDe = (iso: string) => new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const TOM_TEMPLATE: Record<string, TomDl> = { APPROVED: 'positivo', PENDING: 'alerta', REJECTED: 'negativo', PAUSED: 'alerta', DISABLED: 'negativo' }

/** Linha única para as três origens — a lista é uma só, ordenada por hora. */
type Linha = {
  id: string
  origem: 'saiu' | 'erro' | 'agendada' | 'prevista'
  hora: string
  nome: string
  telefone: string
  inscricaoId: string | null
  grupo: string
  toque: number | null
  status: string
  texto: string | null
  entregue?: boolean
  lida?: boolean
  codigoErro?: string | null
  aviso?: string | null
  cabe?: boolean
}

function deItem(i: ItemProgramado): Linha {
  return {
    id: i.id,
    origem: i.status === 'ENVIADA' ? 'saiu' : i.status === 'ERRO' ? 'erro' : 'agendada',
    hora: i.hora,
    nome: i.nome,
    telefone: i.telefone,
    inscricaoId: i.inscricaoId,
    grupo: i.cadenciaNome,
    toque: i.etapaOrdem,
    status: i.status,
    texto: i.texto ?? null,
    entregue: i.entregue,
    lida: i.lida,
    codigoErro: i.codigoErro,
  }
}

function dePrevista(p: ItemPrevisto): Linha {
  return {
    id: p.id,
    origem: 'prevista',
    hora: p.hora,
    nome: p.nome,
    telefone: p.telefone,
    inscricaoId: null,
    grupo: p.cadenciaNome,
    toque: 1,
    status: 'PREVISTA',
    texto: p.texto,
    aviso: p.aviso,
    cabe: p.cabe,
  }
}

const naVista = (l: Linha, v: VistaDaProgramacao) =>
  v === 'tudo' || (v === 'sairam' ? l.origem === 'saiu' || l.origem === 'erro' : l.origem === 'agendada' || l.origem === 'prevista')

export function ModalDoDia({ dia, vistaInicial, onClose }: { dia: string; vistaInicial: VistaDaProgramacao; onClose: () => void }) {
  const [dados, setDados] = useState<DetalheDoDia | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaDaProgramacao>(vistaInicial)
  const [busca, setBusca] = useState('')

  const carregar = useCallback(async () => {
    try {
      setDados(await getDetalheDoDia(dia))
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    }
  }, [dia])

  useEffect(() => {
    // Busca ao abrir: o setState acontece depois do await. Mesma supressão justificada de AbaProgramacao.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onClose])

  const todas = useMemo(
    () => (dados ? [...dados.itens.map(deItem), ...dados.previstas.map(dePrevista)].sort((a, b) => a.hora.localeCompare(b.hora)) : []),
    [dados],
  )
  const contagem = useMemo(() => {
    const c = { saiu: 0, entregue: 0, lida: 0, erro: 0, agendada: 0, prevista: 0, previstaForaDoDia: 0 }
    for (const l of todas) {
      c[l.origem]++
      if (l.origem === 'saiu' && l.entregue) c.entregue++
      if (l.origem === 'saiu' && l.lida) c.lida++
      if (l.origem === 'prevista' && l.cabe === false) c.previstaForaDoDia++
    }
    return c
  }, [todas])

  const termo = busca.trim().toLowerCase()
  const linhas = todas.filter((l) => naVista(l, vista) && (!termo || l.nome.toLowerCase().includes(termo) || l.telefone.includes(termo)))

  /** A mensagem de cada grupo (cadência · toque), com quantas pessoas recebem. */
  const mensagens = useMemo(() => {
    const m = new Map<string, { grupo: string; toque: number | null; texto: string | null; total: number; origens: Set<Linha['origem']> }>()
    for (const l of todas) {
      if (!naVista(l, vista)) continue
      const k = `${l.grupo}·${l.toque ?? ''}`
      const g = m.get(k) ?? { grupo: l.grupo, toque: l.toque, texto: l.texto, total: 0, origens: new Set() }
      g.total++
      g.origens.add(l.origem)
      if (!g.texto && l.texto) g.texto = l.texto
      m.set(k, g)
    }
    return [...m.values()]
  }, [todas, vista])

  const passado = !!dados && dia < dados.hoje
  const ehHoje = !!dados && dia === dados.hoje

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-sm animate-fade-in max-md:items-end max-md:p-0"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Programação de ${br(dia)}`}
        className="w-full max-w-4xl rounded-3xl border border-border bg-card shadow-2xl flex flex-col max-h-[92vh] overflow-hidden max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-3xl max-md:h-[92vh]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground capitalize">
              {semana(dia)}, {br(dia)}
              {ehHoje ? ' · hoje' : passado ? ' · passou' : ''}
            </h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">O que saiu, o que está na fila e o que a campanha ainda vai pôr nela — com texto, contatos e ritmo.</p>
          </div>
          <button onClick={onClose} className={BOTAO_ICONE} aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
          {erro ? (
            <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
          ) : !dados ? (
            <Carregando texto="Montando o dia…" />
          ) : (
            <>
              {/* Totais */}
              <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                <Total rotulo="Saíram" valor={contagem.saiu} tom="text-success" Icone={Send} />
                <Total rotulo="Entregues" valor={contagem.entregue} tom="text-success" Icone={CheckCheck} detalhe={contagem.saiu ? `${contagem.lida} lidas` : undefined} />
                <Total rotulo="Com erro" valor={contagem.erro} tom="text-destructive" Icone={AlertTriangle} />
                <Total rotulo="Agendadas" valor={contagem.agendada} tom="text-info" Icone={Clock} detalhe="já na fila" />
                <Total rotulo="Previstas" valor={contagem.prevista} tom="text-primary" Icone={Sparkles} detalhe="campanha, entra 09:00" />
                <Total rotulo="Programadas" valor={contagem.agendada + contagem.prevista} tom="text-foreground" Icone={CalendarDays} detalhe={`cabem ${dados.config.tetoEfetivo}/dia`} />
              </section>

              {contagem.agendada + contagem.prevista > dados.config.tetoEfetivo && (
                <p className="text-xs text-warning flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Passa da capacidade do dia ({dados.config.tetoEfetivo}) — a sobra escorrega para o dia seguinte.
                </p>
              )}

              {/* Campanha do dia */}
              {dados.ondas.length > 0 && (
                <section className="space-y-2">
                  <h3 className="ocr-label">Campanha deste dia</h3>
                  {dados.ondas.map((o) => (
                    <div key={o.id} className="rounded-2xl border border-border p-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground mr-1">{o.nome}</span>
                        {o.semeadaEm ? (
                          <Chip tom="positivo">entrou na fila {horaDe(o.semeadaEm)}</Chip>
                        ) : (
                          <Chip tom="marca">entra na fila às {horaDe(o.abreEm)}</Chip>
                        )}
                        <Chip>{o.total} pessoa(s)</Chip>
                        {!o.semeadaEm && o.semNome > 0 && <Chip tom="alerta">{o.semNome} sem nome ficam de fora</Chip>}
                        {!o.semeadaEm && o.optOut > 0 && <Chip tom="alerta">{o.optOut} pediram para sair</Chip>}
                        <Chip>{o.cadenciaAtiva ? 'cadência ligada' : 'cadência desligada'}</Chip>
                      </div>
                      {o.impedimento && (
                        <p className="text-xs text-warning flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {o.impedimento}</p>
                      )}
                      {!o.semeadaEm && (
                        <p className="text-[11px] text-muted-foreground">
                          Quem recebe: quem recebeu a onda anterior. Horários abaixo são estimativa pelo ritmo atual — carrinho e pedido passam na frente, então só podem atrasar.
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {/* Filtro + busca */}
              <section className="flex flex-wrap items-center justify-between gap-2">
                <FiltroDeVista vista={vista} onChange={setVista} />
                <label className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato" className={`${CAMPO} pl-8 h-9 w-56`} />
                </label>
              </section>

              {/* Mensagens */}
              {mensagens.length > 0 && (
                <section className="space-y-2">
                  <h3 className="ocr-label">Mensagem programada</h3>
                  {mensagens.map((g) => (
                    <div key={`${g.grupo}·${g.toque}`} className="rounded-2xl border border-border p-3 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-medium text-foreground mr-1">{g.grupo}</span>
                        {g.toque != null && <Chip>toque {g.toque}</Chip>}
                        <Chip tom="info">{g.total} contato(s)</Chip>
                        {g.origens.has('prevista') && <Chip tom="marca">prevista</Chip>}
                      </div>
                      {g.texto ? (
                        <p className="text-xs text-foreground/90 whitespace-pre-line bg-muted/50 rounded-xl px-3 py-2">{g.texto}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Sem texto montado.</p>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">O texto acima é o de um dos contatos — o nome e a variação mudam por pessoa; o de cada um está na lista.</p>
                </section>
              )}

              {/* Contatos */}
              <section className="space-y-2">
                <h3 className="ocr-label">Contatos ({linhas.length})</h3>
                {linhas.length === 0 ? (
                  <Vazio Icone={CalendarDays} titulo={vista === 'sairam' ? 'Nada saiu neste dia' : vista === 'programadas' ? 'Nada programado neste dia' : 'Nenhuma mensagem neste dia'} />
                ) : (
                  <div className="rounded-2xl border border-border overflow-hidden">
                    {linhas.map((l) => (
                      <details key={l.id} className="group border-b border-border-subtle last:border-b-0">
                        <summary className="list-none cursor-pointer px-3 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-muted/40">
                          <span className="min-w-0 flex items-center gap-2">
                            <span className="text-xs tabular text-foreground w-11 shrink-0">{l.origem === 'prevista' ? `~${l.hora}` : l.hora}</span>
                            {l.inscricaoId ? (
                              <Link href={`/maquina-vendas/contato/${l.inscricaoId}`} className="text-sm font-medium text-foreground hover:underline truncate" onClick={(e) => e.stopPropagation()}>
                                {l.nome}
                              </Link>
                            ) : (
                              <span className="text-sm font-medium text-foreground truncate">{l.nome}</span>
                            )}
                            <span className="text-[11px] text-muted-foreground">{l.telefone}</span>
                          </span>
                          <span className="flex flex-wrap items-center gap-1">
                            <Chip>{l.grupo}{l.toque != null ? ` · ${l.toque}` : ''}</Chip>
                            <SeloDaLinha l={l} />
                          </span>
                        </summary>
                        <div className="px-3 pb-3 pl-16 space-y-1">
                          {l.aviso && <p className="text-[11px] text-warning">⚠ {l.aviso}</p>}
                          {l.codigoErro && <p className="text-[11px] text-destructive">Meta recusou: código {l.codigoErro}</p>}
                          <p className="text-xs text-muted-foreground whitespace-pre-line">{l.texto ?? 'Sem texto montado.'}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                )}
              </section>

              {/* Configuração */}
              <section className="space-y-2">
                <h3 className="ocr-label">Configuração que vale para o dia</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  <Par k="Envio" v={dados.config.envioPausado ? 'PAUSADO — nada sai até liberar' : 'liberado'} alerta={dados.config.envioPausado} />
                  <Par k="Capacidade de fato" v={`${dados.config.tetoEfetivo}/dia`} />
                  <Par k="Teto diário · relógio" v={`${dados.config.tetoDiario}/dia · ${dados.config.capacidadeDoRelogio}/dia`} />
                  <Par k="Intervalo entre envios" v={`${dados.config.intervaloMin}–${dados.config.intervaloMax} min`} />
                  <Par k="Janela" v={`${dados.config.janelaInicio}–${dados.config.janelaFim}`} />
                  <Par k="Campanha 10.10" v={dados.config.campanhaArmada ? 'armada' : 'NÃO armada'} alerta={!dados.config.campanhaArmada} />
                </div>
                {dados.cadencias.length > 0 && (
                  <div className="rounded-2xl border border-border divide-y divide-border-subtle">
                    {dados.cadencias.map((c) => (
                      <div key={c.id} className="px-3 py-2 flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-foreground mr-1">{c.nome}</span>
                        <Chip tom={c.ativo ? 'positivo' : 'alerta'}>{c.ativo ? 'ligada' : 'desligada'}</Chip>
                        <Chip>{c.etapas} etapa(s)</Chip>
                        {c.templates.map((t) => (
                          <Chip key={t.nome} tom={t.status ? TOM_TEMPLATE[t.status] : undefined} title="Status do template na Meta">
                            {t.nome}: {t.status ?? (dados.config.templatesMedidos ? 'não existe' : 'não medido')}
                          </Chip>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border shrink-0 flex justify-end">
          <button className={BOTAO} onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  )
}

export function FiltroDeVista({ vista, onChange }: { vista: VistaDaProgramacao; onChange: (v: VistaDaProgramacao) => void }) {
  return (
    <div role="radiogroup" aria-label="O que mostrar" className="inline-flex rounded-xl border border-border bg-muted/40 p-0.5">
      {VISTAS.map((v) => (
        <button
          key={v.id}
          role="radio"
          aria-checked={vista === v.id}
          onClick={() => onChange(v.id)}
          className={`px-3 h-8 text-xs rounded-lg transition-colors cursor-pointer ${vista === v.id ? 'bg-card text-foreground font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
        >
          {v.rotulo}
        </button>
      ))}
    </div>
  )
}

function SeloDaLinha({ l }: { l: Linha }) {
  if (l.origem === 'prevista') return <Chip tom={l.cabe === false ? 'alerta' : 'marca'}>{l.cabe === false ? 'prevista · passa do dia' : 'prevista'}</Chip>
  if (l.origem === 'saiu') return <Chip tom="positivo">{l.lida ? 'lida' : l.entregue ? 'entregue' : 'enviada'}</Chip>
  return <Chip tom={TOM_STATUS_MSG[l.status]}>{ROTULO_STATUS_MSG[l.status] ?? l.status}</Chip>
}

function Total({ rotulo, valor, tom, Icone, detalhe }: { rotulo: string; valor: number; tom: string; Icone: typeof Send; detalhe?: string }) {
  return (
    <div className="rounded-2xl border border-border px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Icone className="w-3.5 h-3.5" /> {rotulo}</div>
      <div className={`text-xl font-semibold tabular ${valor ? tom : 'text-muted-foreground'}`}>{valor}</div>
      {detalhe && <div className="text-[10px] text-muted-foreground">{detalhe}</div>}
    </div>
  )
}

function Par({ k, v, alerta }: { k: string; v: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border-subtle py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className={alerta ? 'text-warning font-medium' : 'text-foreground'}>{v}</span>
    </div>
  )
}
