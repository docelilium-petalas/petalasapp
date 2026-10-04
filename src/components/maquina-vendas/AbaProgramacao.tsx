'use client'

/**
 * PROGRAMAÇÃO — o que sai em cada dia, e se cabe.
 *
 * O mês mostra, por dia, quantas saíram e quantas estão agendadas contra o que
 * o relógio consegue mandar (o menor entre o teto diário e a capacidade da
 * janela). Dia que não cabe é marcado: a sobra escorrega para o dia seguinte, e
 * quem programa uma coleção precisa ver isso ANTES, não no WhatsApp.
 *
 * Abaixo de 640px o calendário vira lista de dias com movimento.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, CalendarDays, AlertTriangle, X } from 'lucide-react'
import { getProgramacao, getProgramacaoDoDia, type ItemProgramado, type ProgramacaoDaTela } from '@/app/actions/maquina-vendas'
import { BOTAO, BOTAO_ICONE, CABECALHO_PAINEL, Carregando, Chip, ErroDeCarga, PAINEL, ROTULO_STATUS_MSG, TOM_STATUS_MSG, Vazio, erroDe } from './comum'

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (a: number, m: number, d: number) => `${a}-${pad(m + 1)}-${pad(d)}`

function diasDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
}

export function AbaProgramacao() {
  const hojeSP = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), [])
  const [ano, setAno] = useState(() => Number(hojeSP.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(hojeSP.slice(5, 7)) - 1)
  const [dados, setDados] = useState<ProgramacaoDaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mesCarregado, setMesCarregado] = useState<string | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [itens, setItens] = useState<ItemProgramado[] | null>(null)
  const [erroDia, setErroDia] = useState<string | null>(null)

  const carregando = mesCarregado !== `${ano}-${mes}`

  const carregar = useCallback(async () => {
    try {
      const de = ymd(ano, mes, 1)
      const ate = ymd(ano, mes, diasDoMes(ano, mes))
      setDados(await getProgramacao(de, ate))
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    } finally {
      setMesCarregado(`${ano}-${mes}`)
    }
  }, [ano, mes])

  useEffect(() => {
    // Busca reagindo aos filtros: o setState acontece depois do await, nao no corpo do
    // efeito. Mesmo padrao (e mesma supressao justificada) de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
  }, [carregar])

  const abrirDia = async (dia: string) => {
    setDiaAberto(dia)
    setItens(null)
    setErroDia(null)
    try {
      setItens(await getProgramacaoDoDia(dia))
    } catch (e) {
      setErroDia(erroDe(e))
    }
  }

  const mudarMes = (delta: number) => {
    const d = new Date(Date.UTC(ano, mes + delta, 1))
    setAno(d.getUTCFullYear())
    setMes(d.getUTCMonth())
    setDiaAberto(null)
  }

  const porDia = useMemo(() => new Map((dados?.dias ?? []).map((d) => [d.dia, d])), [dados])
  const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay()
  const total = diasDoMes(ano, mes)
  const celulas: Array<string | null> = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: total }, (_, i) => ymd(ano, mes, i + 1))]
  const comMovimento = (dados?.dias ?? []).filter((d) => d.agendadas + d.enviadas + d.erros > 0)

  return (
    <div className="space-y-3">
      {dados && (
        <div className="flex flex-wrap gap-1.5">
          <Chip tom="info">até {dados.tetoEfetivo}/dia de fato</Chip>
          <Chip>teto {dados.tetoDiario}/dia · relógio {dados.capacidadeDoRelogio}/dia</Chip>
          <Chip>janela {dados.janelaInicio}–{dados.janelaFim}</Chip>
          {dados.envioPausado && <Chip tom="alerta">envio pausado: nada disto sai até liberar</Chip>}
          {dados.atrasadas > 0 && <Chip tom="alerta">{dados.atrasadas} atrasada(s) de dias passados saem primeiro</Chip>}
        </div>
      )}

      {erro ? (
        <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
      ) : (
        <div className={`${PAINEL} overflow-hidden`}>
          <div className={CABECALHO_PAINEL}>
            <div className="flex items-center gap-1">
              <button className={BOTAO_ICONE} onClick={() => mudarMes(-1)} aria-label="Mês anterior"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-sm font-medium text-foreground capitalize min-w-36 text-center">{MESES[mes]} {ano}</span>
              <button className={BOTAO_ICONE} onClick={() => mudarMes(1)} aria-label="Próximo mês"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <span className="text-[11px] text-muted-foreground">toque num dia para ver quem recebe</span>
          </div>

          {carregando && !dados ? (
            <Carregando />
          ) : (
            <>
              {/* ≥640px: calendário */}
              <div className="hidden sm:grid grid-cols-7 gap-px bg-border-subtle">
                {DIAS_DA_SEMANA.map((d) => (
                  <div key={d} className="bg-muted/60 px-2 py-1.5 ocr-label text-center">{d}</div>
                ))}
                {celulas.map((dia, i) => {
                  if (!dia) return <div key={`v${i}`} className="bg-card min-h-24" />
                  const d = porDia.get(dia)
                  const ehHoje = dia === dados?.hoje
                  const passado = !!dados && dia < dados.hoje
                  return (
                    <button key={dia} onClick={() => abrirDia(dia)}
                      className={`bg-card min-h-24 p-2 text-left flex flex-col gap-1 hover:bg-muted/40 transition-colors cursor-pointer ${diaAberto === dia ? 'ring-2 ring-inset ring-primary' : ''}`}
                      aria-label={`${dia}: ${d?.agendadas ?? 0} agendadas, ${d?.enviadas ?? 0} enviadas`}>
                      <span className={`text-xs tabular ${ehHoje ? 'font-semibold text-primary' : passado ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {Number(dia.slice(8))}{ehHoje ? ' · hoje' : ''}
                      </span>
                      {d && d.enviadas > 0 && <span className="text-[11px] text-success tabular">{d.enviadas} saíram</span>}
                      {d && d.agendadas > 0 && (
                        <span className={`text-[11px] tabular ${d.cabe ? 'text-info' : 'text-warning font-medium'}`}>
                          {d.agendadas} agendada(s){d.cabe ? '' : ' · não cabe'}
                        </span>
                      )}
                      {d && d.erros > 0 && <span className="text-[11px] text-destructive tabular">{d.erros} com erro</span>}
                      {d && d.amostra.length > 0 && (
                        <span className="text-[10px] text-muted-foreground truncate">{d.amostra.map((a) => a.hora).join(' · ')}</span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* <640px: lista de dias com movimento */}
              <div className="sm:hidden">
                {comMovimento.length === 0 ? (
                  <Vazio Icone={CalendarDays} titulo="Nada programado neste mês" />
                ) : (
                  comMovimento.map((d) => (
                    <button key={d.dia} onClick={() => abrirDia(d.dia)}
                      className="w-full min-h-10 px-4 py-3 border-b border-border-subtle last:border-b-0 text-left flex items-center justify-between gap-2 hover:bg-muted/40 cursor-pointer">
                      <span className="text-sm text-foreground tabular">
                        {d.dia.slice(8)}/{d.dia.slice(5, 7)}{d.dia === dados?.hoje ? ' · hoje' : ''}
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {d.enviadas > 0 && <Chip tom="positivo">{d.enviadas} saíram</Chip>}
                        {d.agendadas > 0 && <Chip tom={d.cabe ? 'info' : 'alerta'}>{d.agendadas} agendada(s){d.cabe ? '' : ' · não cabe'}</Chip>}
                        {d.erros > 0 && <Chip tom="negativo">{d.erros} erro(s)</Chip>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Detalhe do dia */}
      {diaAberto && (
        <div className={`${PAINEL} overflow-hidden`}>
          <div className={CABECALHO_PAINEL}>
            <span className="ocr-label">{diaAberto.slice(8)}/{diaAberto.slice(5, 7)} — quem recebe</span>
            <button className={BOTAO_ICONE} onClick={() => setDiaAberto(null)} aria-label="Fechar o dia"><X className="w-4 h-4" /></button>
          </div>
          {(() => {
            const d = porDia.get(diaAberto)
            return d && d.porCadencia.length > 0 ? (
              <div className="px-4 sm:px-5 py-3 border-b border-border-subtle flex flex-wrap gap-1.5">
                {d.porCadencia.map((f) => <Chip key={f.cadenciaId}>{f.nome}: {f.total}</Chip>)}
                {!d.cabe && (
                  <Chip tom="alerta"><AlertTriangle className="w-3 h-3" /> passa da capacidade do dia — a sobra vai para o dia seguinte</Chip>
                )}
              </div>
            ) : null
          })()}
          {erroDia ? (
            <div className="p-4"><ErroDeCarga erro={erroDia} tentarDeNovo={() => abrirDia(diaAberto)} /></div>
          ) : itens === null ? (
            <Carregando />
          ) : itens.length === 0 ? (
            <Vazio Icone={CalendarDays} titulo="Nenhuma mensagem neste dia" />
          ) : (
            itens.map((it) => (
              <div key={it.id} className="px-4 sm:px-5 py-3 border-b border-border-subtle last:border-b-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/maquina-vendas/contato/${it.inscricaoId}`} className="text-sm font-medium text-foreground hover:underline">
                      {it.nome}
                    </Link>
                    <span className="text-[11px] text-muted-foreground ml-2">{it.telefone}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-xs tabular text-foreground">{it.hora}</span>
                    <Chip>{it.cadenciaNome} · toque {it.etapaOrdem}</Chip>
                    <Chip tom={TOM_STATUS_MSG[it.status]}>{ROTULO_STATUS_MSG[it.status] ?? it.status}</Chip>
                  </div>
                </div>
                {it.texto && <p className="text-xs text-muted-foreground mt-1.5 whitespace-pre-line line-clamp-4">{it.texto}</p>}
              </div>
            ))
          )}
          <div className="px-4 sm:px-5 py-3 border-t border-border">
            <button className={BOTAO} onClick={() => setDiaAberto(null)}>Fechar</button>
          </div>
        </div>
      )}
    </div>
  )
}
