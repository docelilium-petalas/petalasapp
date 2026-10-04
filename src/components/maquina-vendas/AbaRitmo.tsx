'use client'

/**
 * RITMO E LIMITES — quanto a Máquina manda por dia, em que horário e com que
 * espaçamento. A conta embaixo dos campos é refeita enquanto se digita, com a
 * MESMA função do servidor (`capacidadeDoDia`): o teto não pode virar número de
 * enfeite (escrever 500 e receber 91 sem a tela avisar).
 *
 * Só administradora salva. O cupom aparece só para leitura: a única oferta é o
 * MINHADL, e só com carrinho abandonado vivo — não é coisa de ajuste de tela.
 */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Clock, Loader2, Lock, Pause, Save, Ticket } from 'lucide-react'
import { getMvAjustes, salvarMvAjustes } from '@/app/actions/maquina-vendas'
import { CRON_MINUTOS, MENSAGENS_POR_TIQUE, TETO_DIARIO_MAXIMO, capacidadeDoDia, parseJanela } from '@/lib/maquina-vendas/janela'
import { BOTAO_PRIMARIO, CAMPO, Carregando, ErroDeCarga, PAINEL, erroDe } from './comum'

type Ajustes = Awaited<ReturnType<typeof getMvAjustes>>

function contaAoVivo(a: Ajustes) {
  try {
    const janela = parseJanela(a.janelaInicio, a.janelaFim)
    const c = capacidadeDoDia({
      janela,
      cronMinutos: CRON_MINUTOS,
      intervaloMinMinutos: a.intervaloMinMinutos,
      intervaloMaxMinutos: a.intervaloMaxMinutos,
      mensagensPorTick: MENSAGENS_POR_TIQUE,
    })
    return {
      ...c,
      horas: (janela.fimMin - janela.inicioMin) / 60,
      efetivo: Math.min(a.tetoDiario, c.mensagens),
      tetoInalcancavel: a.tetoDiario > c.mensagens,
      erro: null as string | null,
    }
  } catch (e) {
    return { tiques: 0, passoMinutos: 0, mensagens: 0, horas: 0, efetivo: 0, tetoInalcancavel: false, erro: erroDe(e) }
  }
}

export function AbaRitmo({ vencidas, podeEditar }: { vencidas: number; podeEditar: boolean }) {
  const [a, setA] = useState<Ajustes | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = () =>
    getMvAjustes()
      .then((r) => {
        setA(r)
        setErro(null)
      })
      .catch((e) => setErro(erroDe(e)))

  useEffect(() => {
    void carregar()
  }, [])

  const conta = useMemo(() => (a ? contaAoVivo(a) : null), [a])

  if (erro) return <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
  if (!a || !conta) return <Carregando texto="Carregando os limites…" />

  const campo = <K extends keyof Ajustes>(k: K, v: Ajustes[K]) => setA({ ...a, [k]: v })
  const diasParaDrenar = conta.efetivo > 0 ? Math.ceil(vencidas / conta.efetivo) : null
  const intervaloColado = a.intervaloMinMinutos === a.intervaloMaxMinutos

  async function salvar() {
    if (!a) return
    setSalvando(true)
    try {
      await salvarMvAjustes({
        tetoDiario: a.tetoDiario,
        intervaloMinMinutos: a.intervaloMinMinutos,
        intervaloMaxMinutos: a.intervaloMaxMinutos,
        janelaInicio: a.janelaInicio,
        janelaFim: a.janelaFim,
        envioPausado: a.envioPausado,
      })
      toast.success('Ritmo atualizado.')
      setA(await getMvAjustes())
    } catch (e) {
      toast.error(erroDe(e))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      {a.vindoDoPadrao && (
        <div className="flex gap-2 p-3 rounded-xl bg-warning/10 border border-warning/30 text-xs">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" aria-hidden />
          <p className="leading-relaxed text-foreground">
            Estes são os valores de fábrica. Ao salvar, a tela passa a mandar — e mudar deixa de exigir deploy.
          </p>
        </div>
      )}
      {!podeEditar && (
        <div className="flex gap-2 p-3 rounded-xl bg-muted border border-border text-xs">
          <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <p className="leading-relaxed text-foreground">Só administradoras mudam o ritmo. Você vê os números, mas não salva.</p>
        </div>
      )}

      <div className={`${PAINEL} p-4 sm:p-5 space-y-4`}>
        <fieldset disabled={!podeEditar} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="space-y-1.5">
            <span className="ocr-label">Teto por dia</span>
            <input type="number" inputMode="numeric" min={1} max={TETO_DIARIO_MAXIMO} value={a.tetoDiario}
              onChange={(e) => campo('tetoDiario', Number(e.target.value))} className={CAMPO} />
            <span className="block text-[11px] text-muted-foreground">
              Só a Máquina de Vendas. Atendimento da IA e avisos de pedido não entram nesta conta.
            </span>
          </label>

          <div className="space-y-1.5">
            <span className="ocr-label">Janela de envio (horário de Brasília)</span>
            <div className="flex items-center gap-2">
              <input type="time" value={a.janelaInicio} onChange={(e) => campo('janelaInicio', e.target.value)} className={CAMPO} aria-label="Início da janela" />
              <span className="text-muted-foreground text-xs">até</span>
              <input type="time" value={a.janelaFim} onChange={(e) => campo('janelaFim', e.target.value)} className={CAMPO} aria-label="Fim da janela" />
            </div>
            <span className="block text-[11px] text-muted-foreground">Mensagem da marca fora disso incomoda — e cliente incomodada bloqueia.</span>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <span className="ocr-label">Espaçamento entre mensagens (minutos)</span>
            <div className="flex items-center gap-2">
              <input type="number" inputMode="numeric" min={1} max={240} value={a.intervaloMinMinutos}
                onChange={(e) => campo('intervaloMinMinutos', Number(e.target.value))} className={`${CAMPO} w-24`} aria-label="Intervalo mínimo" />
              <span className="text-muted-foreground text-xs">a</span>
              <input type="number" inputMode="numeric" min={1} max={240} value={a.intervaloMaxMinutos}
                onChange={(e) => campo('intervaloMaxMinutos', Number(e.target.value))} className={`${CAMPO} w-24`} aria-label="Intervalo máximo" />
            </div>
            <span className="block text-[11px] text-muted-foreground">
              Sorteado a cada envio. Quem dá o ritmo é a LARGURA entre os dois — encostar um no outro vira metrônomo, o padrão que derruba número.
            </span>
            {intervaloColado && <span className="block text-[11px] text-warning">Mínimo igual ao máximo: o servidor recusa. Deixe uma folga.</span>}
          </div>
        </fieldset>

        {/* A conta, para o número não virar chute. */}
        <div className="dl-panel p-3 text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <Clock className="w-3.5 h-3.5" aria-hidden /> O que esses números fazem
          </div>
          {conta.erro ? (
            <p className="text-destructive">{conta.erro}</p>
          ) : (
            <p className="text-muted-foreground leading-relaxed">
              <strong className="text-foreground tabular">{conta.tiques}</strong> tiques na janela de {conta.horas.toFixed(1)} h, um a cada{' '}
              <strong className="text-foreground tabular">{conta.passoMinutos}</strong> min · cabem{' '}
              <strong className="text-foreground tabular">{conta.mensagens}</strong> mensagens no dia · o teto corta em{' '}
              <strong className="text-foreground tabular">{a.tetoDiario}</strong> · <strong className="text-foreground">saem {conta.efetivo}</strong>
            </p>
          )}
          {conta.tetoInalcancavel && (
            <p className="text-warning leading-relaxed">
              O teto de <strong>{a.tetoDiario}</strong> não é alcançável com este espaçamento — o gargalo é o intervalo, não o teto. Para subir de verdade, encurte o
              intervalo (abaixo de {CRON_MINUTOS} min não adianta: o tique anda de {CRON_MINUTOS} em {CRON_MINUTOS}).
            </p>
          )}
          {vencidas > 0 && diasParaDrenar !== null && (
            <p className="text-muted-foreground">
              Com <strong className="text-foreground tabular">{vencidas}</strong> mensagem(ns) vencida(s) na fila, esvazia em ~
              <strong className="text-foreground tabular">{diasParaDrenar}</strong> {diasParaDrenar === 1 ? 'dia' : 'dias'}.
            </p>
          )}
        </div>

        <label className={`flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border-subtle ${podeEditar ? 'cursor-pointer' : 'opacity-70'}`}>
          <input type="checkbox" checked={a.envioPausado} disabled={!podeEditar}
            onChange={(e) => campo('envioPausado', e.target.checked)} className="mt-0.5 w-5 h-5 accent-destructive" />
          <span className="text-xs leading-relaxed">
            <strong className="flex items-center gap-1.5 text-foreground"><Pause className="w-3.5 h-3.5" aria-hidden /> Pausar todos os envios</strong>
            <span className="text-muted-foreground">
              Fecha a porta sem apagar régua nem cancelar mensagem: elas continuam agendadas e saem quando despausar. O vigia também puxa este freio sozinho se o
              canal adoecer.
            </span>
          </span>
        </label>

        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-muted/40 border border-border-subtle text-xs">
          <Ticket className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" aria-hidden />
          <p className="leading-relaxed text-muted-foreground">
            Cupom do carrinho: <strong className="text-foreground">{a.cupomCarrinho ?? '—'}</strong>
            {a.descontoCarrinho ? ` (${a.descontoCarrinho}% não cumulativo)` : ''}. É a única oferta, e só sai para quem tem carrinho abandonado vivo. A validade é
            conferida direto na Nuvemshop.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-[11px] text-muted-foreground">
            {a.atualizadoEm
              ? `Última mudança: ${new Date(a.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}${a.atualizadoPor ? ` por ${a.atualizadoPor}` : ''}`
              : 'Nunca alterado por aqui.'}
          </span>
          {podeEditar && (
            <button onClick={salvar} disabled={salvando || !!conta.erro || intervaloColado} className={BOTAO_PRIMARIO}>
              {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Salvar
            </button>
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed max-w-2xl">
        Toda alteração fica registrada no histórico (Logs), com o valor antigo, o novo e quem mudou. O teto máximo aceito é {TETO_DIARIO_MAXIMO}/dia de propósito.
      </p>
    </div>
  )
}
