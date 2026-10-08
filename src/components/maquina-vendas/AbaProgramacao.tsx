'use client'

/**
 * PROGRAMAÇÃO — o que sai em cada dia, e se cabe.
 *
 * O mês mostra, por dia, quantas saíram e quantas estão agendadas contra o que
 * o relógio consegue mandar (o menor entre o teto diário e a capacidade da
 * janela). Dia que não cabe é marcado: a sobra escorrega para o dia seguinte, e
 * quem programa uma coleção precisa ver isso ANTES, não no WhatsApp.
 *
 * Desde 08/10/2026 o mês mostra também as PREVISTAS: a onda da campanha datada
 * que só entra na fila às 09:00 do próprio dia (sem isso a véspera e o
 * lançamento apareciam vazios). O filtro Saíram / Programadas recorta o mês e o
 * modal; clicar num dia abre o modal com tudo daquele dia.
 *
 * Abaixo de 640px o calendário vira lista de dias com movimento.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { getProgramacao, type ProgramacaoDaTela } from '@/app/actions/maquina-vendas'
import { BOTAO_ICONE, CABECALHO_PAINEL, Carregando, Chip, ErroDeCarga, PAINEL, Vazio, erroDe } from './comum'
import { FiltroDeVista, ModalDoDia, type VistaDaProgramacao } from './ModalDoDia'

const DIAS_DA_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (a: number, m: number, d: number) => `${a}-${pad(m + 1)}-${pad(d)}`

function diasDoMes(ano: number, mes: number) {
  return new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate()
}

/** O que a célula mostra, já recortado pela vista. */
type Resumo = { enviadas: number; erros: number; agendadas: number; previstas: number; previstasForaDoDia: number; primeiraPrevista: string | null; cabe: boolean; horas: string[] }

export function AbaProgramacao() {
  const hojeSP = useMemo(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), [])
  const [ano, setAno] = useState(() => Number(hojeSP.slice(0, 4)))
  const [mes, setMes] = useState(() => Number(hojeSP.slice(5, 7)) - 1)
  const [dados, setDados] = useState<ProgramacaoDaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [mesCarregado, setMesCarregado] = useState<string | null>(null)
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [vista, setVista] = useState<VistaDaProgramacao>('tudo')

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

  const fecharDia = useCallback(() => setDiaAberto(null), [])

  const mudarMes = (delta: number) => {
    const d = new Date(Date.UTC(ano, mes + delta, 1))
    setAno(d.getUTCFullYear())
    setMes(d.getUTCMonth())
    setDiaAberto(null)
  }

  const resumos = useMemo(() => {
    const m = new Map<string, Resumo>()
    if (!dados) return m
    const mostraSaidas = vista !== 'programadas'
    const mostraFila = vista !== 'sairam'
    const pegar = (dia: string) => {
      let r = m.get(dia)
      if (!r) {
        r = { enviadas: 0, erros: 0, agendadas: 0, previstas: 0, previstasForaDoDia: 0, primeiraPrevista: null, cabe: true, horas: [] }
        m.set(dia, r)
      }
      return r
    }
    for (const d of dados.dias) {
      const r = pegar(d.dia)
      if (mostraSaidas) {
        r.enviadas = d.enviadas
        r.erros = d.erros
      }
      if (mostraFila) {
        r.agendadas = d.agendadas
        r.cabe = d.cabe
      }
      r.horas = d.amostra.filter((a) => (a.status === 'AGENDADA' ? mostraFila : mostraSaidas)).map((a) => a.hora)
    }
    if (mostraFila) {
      for (const [dia, p] of Object.entries(dados.previstas)) {
        const r = pegar(dia)
        r.previstas = p.quantidade
        r.previstasForaDoDia = p.quantidade - p.cabem
        r.primeiraPrevista = p.primeira
        // O total do dia (fila + prevista) contra a capacidade — é o que o relógio vai enfrentar.
        if (r.agendadas + r.previstas > dados.tetoEfetivo) r.cabe = false
      }
    }
    return m
  }, [dados, vista])

  const totaisDoMes = useMemo(() => {
    let enviadas = 0, erros = 0, agendadas = 0, previstas = 0
    for (const r of resumos.values()) {
      enviadas += r.enviadas
      erros += r.erros
      agendadas += r.agendadas
      previstas += r.previstas
    }
    return { enviadas, erros, agendadas, previstas }
  }, [resumos])

  const temMovimento = (r: Resumo | undefined) => !!r && r.enviadas + r.erros + r.agendadas + r.previstas > 0

  const primeiroDiaSemana = new Date(Date.UTC(ano, mes, 1)).getUTCDay()
  const total = diasDoMes(ano, mes)
  const celulas: Array<string | null> = [...Array(primeiroDiaSemana).fill(null), ...Array.from({ length: total }, (_, i) => ymd(ano, mes, i + 1))]
  const comMovimento = [...resumos.entries()].filter(([, r]) => temMovimento(r)).sort(([a], [b]) => a.localeCompare(b))

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
            <FiltroDeVista vista={vista} onChange={setVista} />
          </div>

          {dados && (
            <div className="px-4 sm:px-5 py-2 border-b border-border-subtle flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>No mês:</span>
              {vista !== 'programadas' && <Chip tom="positivo">{totaisDoMes.enviadas} saíram</Chip>}
              {vista !== 'programadas' && totaisDoMes.erros > 0 && <Chip tom="negativo">{totaisDoMes.erros} com erro</Chip>}
              {vista !== 'sairam' && <Chip tom="info">{totaisDoMes.agendadas} agendadas</Chip>}
              {vista !== 'sairam' && <Chip tom="marca">{totaisDoMes.previstas} previstas (campanha)</Chip>}
              <span className="ml-auto">clique num dia para ver tudo dele</span>
            </div>
          )}

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
                  const r = resumos.get(dia)
                  const ehHoje = dia === dados?.hoje
                  const passado = !!dados && dia < dados.hoje
                  return (
                    <button key={dia} onClick={() => setDiaAberto(dia)} onDoubleClick={() => setDiaAberto(dia)}
                      className={`bg-card min-h-24 p-2 text-left flex flex-col gap-1 hover:bg-muted/40 transition-colors cursor-pointer ${diaAberto === dia ? 'ring-2 ring-inset ring-primary' : ''}`}
                      aria-label={`${dia}: ${r?.enviadas ?? 0} saíram, ${r?.agendadas ?? 0} agendadas, ${r?.previstas ?? 0} previstas`}>
                      <span className={`text-xs tabular ${ehHoje ? 'font-semibold text-primary' : passado ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {Number(dia.slice(8))}{ehHoje ? ' · hoje' : ''}
                      </span>
                      {r && r.enviadas > 0 && <span className="text-[11px] text-success tabular">{r.enviadas} saíram</span>}
                      {r && r.agendadas > 0 && (
                        <span className={`text-[11px] tabular ${r.cabe ? 'text-info' : 'text-warning font-medium'}`}>
                          {r.agendadas} agendada(s){r.cabe ? '' : ' · não cabe'}
                        </span>
                      )}
                      {r && r.previstas > 0 && (
                        <span className={`text-[11px] tabular ${r.cabe ? 'text-primary' : 'text-warning font-medium'}`} title="Campanha: entra na fila às 09:00 do dia">
                          ~{r.previstas} previstas · {r.primeiraPrevista}
                          {r.previstasForaDoDia > 0 ? ` · ${r.previstasForaDoDia} passam do dia` : ''}
                        </span>
                      )}
                      {r && r.erros > 0 && <span className="text-[11px] text-destructive tabular">{r.erros} com erro</span>}
                      {r && r.horas.length > 0 && <span className="text-[10px] text-muted-foreground truncate">{r.horas.join(' · ')}</span>}
                    </button>
                  )
                })}
              </div>

              {/* <640px: lista de dias com movimento */}
              <div className="sm:hidden">
                {comMovimento.length === 0 ? (
                  <Vazio Icone={CalendarDays} titulo={vista === 'sairam' ? 'Nada saiu neste mês' : 'Nada programado neste mês'} />
                ) : (
                  comMovimento.map(([dia, r]) => (
                    <button key={dia} onClick={() => setDiaAberto(dia)}
                      className="w-full min-h-10 px-4 py-3 border-b border-border-subtle last:border-b-0 text-left flex items-center justify-between gap-2 hover:bg-muted/40 cursor-pointer">
                      <span className="text-sm text-foreground tabular">
                        {dia.slice(8)}/{dia.slice(5, 7)}{dia === dados?.hoje ? ' · hoje' : ''}
                      </span>
                      <span className="flex flex-wrap justify-end gap-1">
                        {r.enviadas > 0 && <Chip tom="positivo">{r.enviadas} saíram</Chip>}
                        {r.agendadas > 0 && <Chip tom={r.cabe ? 'info' : 'alerta'}>{r.agendadas} agendada(s){r.cabe ? '' : ' · não cabe'}</Chip>}
                        {r.previstas > 0 && <Chip tom="marca">~{r.previstas} previstas</Chip>}
                        {r.erros > 0 && <Chip tom="negativo">{r.erros} erro(s)</Chip>}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {diaAberto && <ModalDoDia key={diaAberto} dia={diaAberto} vistaInicial={vista} onClose={fecharDia} />}
    </div>
  )
}
