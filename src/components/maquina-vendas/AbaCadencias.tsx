'use client'

/**
 * CADÊNCIAS — cada régua da Máquina, o que ela manda e se está viva.
 *
 * Três tipos convivem aqui, e a tela diz qual é qual:
 *  · régua da LOJA (carrinho, pedido, pós-venda…) — nasce no código, com
 *    template aprovado; liga/desliga por aqui, mas não se edita;
 *  · CAMPANHA com data (drop 10.10) — calendário próprio, intocável pela tela;
 *  · cadência de COLUNA do funil — criada, editada e apagada por aqui.
 *
 * O rótulo do botão é a SITUAÇÃO (de `situacao.ts`), não só ligado/desligado:
 * "ligada e muda" e "desligada sem motivo" são os dois estados que pedem ação.
 *
 * O texto que sai é o do template APROVADO na Meta (lido sob demanda, com cache
 * de 1 h no servidor) — a copy livre aparece rotulada, porque só sai com a
 * janela de 24 h aberta.
 */

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BarChart3, Lock, Pencil, Plus, Trash2, Workflow } from 'lucide-react'
import { confirmar } from '@/components/ui/ConfirmSheet'
import {
  alternarCadencia, excluirCadencia, getDesempenhoPorToque, getMvCadencias, getTemplatesDasCadencias, preverEstoqueDaCadencia,
  type TemplateDaEtapaNaTela,
} from '@/app/actions/maquina-vendas'
import type { DesempenhoPorToque } from '@/lib/maquina-vendas/desempenho-toque'
import { rotuloDelay } from '@/lib/maquina-vendas/modelos'
import { ConfigCadenciaModal, type CadenciaEmEdicao } from './ConfigCadenciaModal'
import { BOTAO, BOTAO_ICONE, BOTAO_PRIMARIO, Carregando, Chip, ErroDeCarga, PAINEL, Vazio, erroDe, type TomDl } from './comum'

type Cadencia = Awaited<ReturnType<typeof getMvCadencias>>[number]
type Templates = Awaited<ReturnType<typeof getTemplatesDasCadencias>>

const SITUACAO: Record<string, { rotulo: string; tom: TomDl; caixa: string }> = {
  ligada: { rotulo: 'Ligada', tom: 'positivo', caixa: '' },
  ligada_muda: { rotulo: 'Ligada e muda', tom: 'negativo', caixa: 'border-destructive/30 bg-destructive/5' },
  desligada_sem_motivo: { rotulo: 'Desligada · sem motivo', tom: 'alerta', caixa: 'border-warning/30 bg-warning/10' },
  desligada_por_decisao: { rotulo: 'Desligada por decisão', tom: undefined, caixa: 'border-border bg-muted/40' },
  aposentada: { rotulo: 'Aposentada', tom: undefined, caixa: 'border-border bg-muted/30' },
}

function EtapaDaCadencia({ etapa, template: t, carregandoTemplates }: {
  etapa: Cadencia['etapas'][number]
  template: TemplateDaEtapaNaTela | null
  carregandoTemplates: boolean
}) {
  const quando = etapa.delayMinutos === 0
    ? (etapa.ancoradaEm === 'gatilho' ? 'Na hora do gatilho' : 'Logo depois da anterior')
    : `${rotuloDelay(etapa.delayMinutos)} ${etapa.ancoradaEm === 'gatilho' ? 'do gatilho' : 'da mensagem anterior chegar'}`
  return (
    <div className={`flex gap-2.5 ${etapa.foraDoTeto ? 'opacity-60' : ''}`}>
      <span className={`w-6 h-6 shrink-0 rounded-full border flex items-center justify-center text-[10px] font-bold tabular ${etapa.foraDoTeto ? 'bg-destructive/10 border-destructive/30 text-destructive' : 'bg-primary/10 border-primary/30 text-primary'}`}>
        {etapa.ordem}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="text-[11px] text-muted-foreground">
          {quando}{etapa.ehUltima ? ' · última' : ''}
          {t?.papel && <span className="text-foreground"> · {t.papel}</span>}
        </p>
        {etapa.foraDoTeto && <p className="text-[11px] font-medium text-destructive">Esta mensagem NÃO é agendada — passa do teto de mensagens por cadência.</p>}
        {!t && carregandoTemplates && <p className="text-[11px] text-muted-foreground">Buscando o template na Meta…</p>}
        {!t && !carregandoTemplates && (
          <p className="text-[11px] font-medium text-warning">
            Sem template aprovado nesta etapa. Com a janela de 24 h fechada ela fica agendada esperando a cliente falar — não é erro, é regra da Meta.
          </p>
        )}
        {t && (
          <div className="dl-panel p-2.5 space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-success">texto entregue · {t.nome}</span>
              {t.status && <Chip tom={t.status === 'APPROVED' ? 'positivo' : 'negativo'}>{t.status}</Chip>}
              {t.categoria && (
                <Chip tom={t.categoria === 'MARKETING' ? 'alerta' : 'info'}
                  title={t.categoria === 'MARKETING' ? 'Custa mais, tem limite por destinatário (131049) e é a categoria que mais gera bloqueio.' : undefined}>
                  {t.categoria}
                </Chip>
              )}
            </div>
            {t.corpo ? (
              <p className="text-xs text-foreground whitespace-pre-line">{t.corpo}</p>
            ) : (
              <p className="text-[11px] text-warning">Não consegui ler o corpo aprovado na Meta agora. O nome acima é o que sai; o texto abaixo é a copy livre e NÃO é o que a cliente recebe.</p>
            )}
            {t.botoes.length > 0 && <p className="text-[11px] text-muted-foreground">{t.botoes.map((b) => `[botão: ${b}]`).join(' ')}</p>}
            {t.porque && <p className="text-[11px] text-muted-foreground italic">{t.porque}</p>}
          </div>
        )}
        {/* Sempre por último e sempre rotulado: só sai com a janela de 24 h aberta, e ela abre
            justamente quando a cliente responde — que é quando a cadência para. */}
        <div>
          <span className="block text-[11px] font-medium text-muted-foreground">texto livre — só sai se a janela de 24 h estiver aberta</span>
          <p className="text-xs text-muted-foreground whitespace-pre-line">{etapa.templateBase}</p>
        </div>
      </div>
    </div>
  )
}

function Desempenho({ cadenciaId }: { cadenciaId: string }) {
  const [d, setD] = useState<DesempenhoPorToque | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => {
    getDesempenhoPorToque(60, cadenciaId).then(setD).catch((e) => setErro(erroDe(e)))
  }, [cadenciaId])
  if (erro) return <p className="text-[11px] text-destructive">{erro}</p>
  if (!d) return <Carregando texto="Medindo os toques…" />
  const linhas = d.linhas.filter((l) => l.enviadas > 0 || l.respostas > 0)
  if (linhas.length === 0) return <p className="text-[11px] text-muted-foreground">Nenhum toque saiu nos últimos 60 dias.</p>
  const pct = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('pt-BR')}%`)
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] tabular">
          <thead>
            <tr className="text-left">
              {['Toque', 'Saíram', 'Chegaram', 'Lidas', 'Respostas', 'Pedidos', 'Resposta', 'Pedido'].map((h) => <th key={h} className="ocr-label py-1 pr-3 font-normal">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.toque} className="border-t border-border-subtle">
                <td className="py-1 pr-3 text-foreground">{l.toque === 0 ? 'antes do 1º' : l.toque}</td>
                <td className="py-1 pr-3">{l.enviadas}</td>
                <td className="py-1 pr-3">{l.entregues}</td>
                <td className="py-1 pr-3">{l.lidas}</td>
                <td className="py-1 pr-3">{l.respostas}</td>
                <td className="py-1 pr-3">{l.pedidos}{l.receita > 0 ? ` · ${l.receita.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}` : ''}</td>
                <td className={`py-1 pr-3 ${l.temVeredito ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{pct(l.taxaResposta)}</td>
                <td className={`py-1 pr-3 ${l.temVeredito ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{pct(l.taxaPedido)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Taxas sobre as que CHEGARAM. Abaixo de {d.minimoParaVeredito} entregas o número fica apagado: ainda é sorte, não veredito. A resposta conta para o último toque que saiu antes dela.
      </p>
    </div>
  )
}

export function AbaCadencias({ podeEditar, aoMudar }: { podeEditar: boolean; aoMudar: () => void }) {
  const [cadencias, setCadencias] = useState<Cadencia[] | null>(null)
  const [templates, setTemplates] = useState<Templates | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [agindo, setAgindo] = useState<string | null>(null)
  const [emEdicao, setEmEdicao] = useState<CadenciaEmEdicao | null>(null)
  const [configAberta, setConfigAberta] = useState(false)
  const [desempenhoAberto, setDesempenhoAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      setCadencias(await getMvCadencias())
      setErro(null)
    } catch (e) {
      setErro(erroDe(e))
    }
  }, [])

  const carregarTemplates = useCallback(() => {
    // Lê a Meta: só quando esta aba abre, e uma vez.
    getTemplatesDasCadencias().then(setTemplates).catch((e) => {
      toast.error(`Não consegui ler os templates na Meta: ${erroDe(e)}`)
      setTemplates({})
    })
  }, [])

  useEffect(() => {
    // Busca inicial da aba: o setState acontece depois do await. Mesmo padrão de app/radar/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar()
    carregarTemplates()
  }, [carregar, carregarTemplates])

  const agir = async (id: string, fn: () => Promise<unknown>, msg: string) => {
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

  const alternar = async (c: Cadencia) => {
    if (!c.ativo) {
      const p = c.stageId ? await preverEstoqueDaCadencia(c.id).catch(() => null) : null
      const ok = await confirmar({
        titulo: `Ligar "${c.nome}"?`,
        descricao: !c.stageId
          ? 'A régua volta a inscrever clientes a partir do próximo tique. Quem já foi inscrita e pausou não volta sozinha.'
          : p && p.novos > 0
            ? `${p.novos} cliente(s) que já estão na coluna "${c.coluna}" entram na programação — ${p.mensagens} mensagens no total (${p.etapasPorCliente} por cliente). No teto de ${p.tetoDiario}/dia, a primeira rodada leva ~${p.diasParaEsvaziar} dia(s). Quem entrar depois entra sozinha.`
            : `A coluna "${c.coluna}" está vazia agora. Quem entrar nela passa a receber as mensagens.`,
        confirmar: 'Ligar',
      })
      if (!ok) return
    } else {
      const ok = await confirmar({
        titulo: `Desligar "${c.nome}"?`,
        descricao: 'Ninguém novo entra. As mensagens já agendadas continuam na fila — para tirar alguém, use a aba Mensagens.',
        confirmar: 'Desligar',
        destrutivo: true,
      })
      if (!ok) return
    }
    await agir(c.id, () => alternarCadencia(c.id, !c.ativo), c.ativo ? 'Cadência desligada.' : 'Cadência ligada.')
  }

  const abrirNova = () => { setEmEdicao(null); setConfigAberta(true) }

  if (erro) return <ErroDeCarga erro={erro} tentarDeNovo={carregar} />
  if (!cadencias) return <Carregando texto="Carregando as cadências…" />

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3">
        <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
          Cada cadência é uma régua: um gatilho (carrinho abandonado, pedido, coluna do funil, campanha) e as mensagens que saem depois dele, na ordem.
          <span className="block mt-1">
            As respostas da IA no atendimento saem pelo n8n e <strong className="text-foreground">não aparecem aqui</strong>.
          </span>
        </p>
        {podeEditar && (
          <button onClick={abrirNova} className={`${BOTAO_PRIMARIO} shrink-0`}>
            <Plus className="w-4 h-4" /> Nova cadência de coluna
          </button>
        )}
      </div>

      {cadencias.length === 0 ? (
        <div className={PAINEL}>
          <Vazio Icone={Workflow} titulo="Nenhuma cadência cadastrada" detalhe="As réguas da loja são criadas pelo semeador; cadência de coluna se cria aqui." />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cadencias.map((c) => {
            const s = SITUACAO[c.situacao.estado] ?? SITUACAO.desligada_por_decisao
            const deColuna = !!c.stageId
            return (
              <div key={c.id} className={`${PAINEL} p-4 space-y-3`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground truncate">{c.nome}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {deColuna ? `Coluna: ${c.coluna}` : c.origem} · {c.inscricoes} cliente(s) no histórico
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {podeEditar && deColuna && !c.protegida && (
                      <button className={BOTAO_ICONE} title="Editar mensagens e coluna" aria-label={`Editar ${c.nome}`} disabled={agindo === c.id}
                        onClick={() => {
                          setEmEdicao({
                            id: c.id, nome: c.nome, gatilho: c.gatilho, pipelineId: c.pipelineId ?? '', stageId: c.stageId ?? '',
                            etapas: c.etapas.map((e) => ({ ordem: e.ordem, delayMinutos: e.delayMinutos, templateBase: e.templateBase, templateNome: e.templateNome })),
                          })
                          setConfigAberta(true)
                        }}>
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}
                    {podeEditar && deColuna && !c.protegida && c.inscricoes === 0 && (
                      <button className={BOTAO_ICONE} title="Apagar" aria-label={`Apagar ${c.nome}`} disabled={agindo === c.id}
                        onClick={async () => {
                          const ok = await confirmar({
                            titulo: `Apagar "${c.nome}"?`,
                            descricao: 'Nenhuma cliente passou por ela ainda, então nenhum histórico se perde.',
                            confirmar: 'Apagar',
                            destrutivo: true,
                          })
                          if (ok) await agir(c.id, () => excluirCadencia(c.id), 'Cadência apagada.')
                        }}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {c.protegida ? (
                      <Chip tom="marca" title="Campanha com data: calendário próprio, não liga nem desliga pela tela.">
                        <Lock className="w-3 h-3" /> {c.ativo ? 'Campanha · no calendário' : 'Campanha · desligada'}
                      </Chip>
                    ) : podeEditar ? (
                      <button onClick={() => alternar(c)} disabled={agindo === c.id} className={`${BOTAO} !px-2.5`} title={c.ativo ? 'Desligar' : 'Ligar'}>
                        <Chip tom={s.tom}>{s.rotulo}</Chip>
                      </button>
                    ) : (
                      <Chip tom={s.tom}>{s.rotulo}</Chip>
                    )}
                  </div>
                </div>

                {c.situacao.estado !== 'ligada' && (
                  <div className={`rounded-lg border px-3 py-2 text-[11px] leading-relaxed text-foreground ${s.caixa}`}>
                    <p>{c.situacao.resumo}</p>
                    {c.situacao.oQueFazer && <p className="mt-1 text-muted-foreground">{c.situacao.oQueFazer}</p>}
                  </div>
                )}

                <div className="space-y-2.5">
                  {c.etapas.map((e) => (
                    <EtapaDaCadencia key={e.ordem} etapa={e} template={templates?.[c.id]?.[e.ordem] ?? null} carregandoTemplates={templates === null} />
                  ))}
                </div>

                <div className="pt-1 border-t border-border-subtle">
                  <button className="min-h-10 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={() => setDesempenhoAberto(desempenhoAberto === c.id ? null : c.id)} aria-expanded={desempenhoAberto === c.id}>
                    <BarChart3 className="w-4 h-4" /> {desempenhoAberto === c.id ? 'Esconder' : 'Qual toque funciona'} (60 dias)
                  </button>
                  {desempenhoAberto === c.id && <Desempenho cadenciaId={c.id} />}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {configAberta && (
        <ConfigCadenciaModal
          edicao={emEdicao}
          onClose={() => setConfigAberta(false)}
          onSaved={async (msg) => {
            setConfigAberta(false)
            toast.success(msg)
            setTemplates(null)
            carregarTemplates()
            await carregar()
            aoMudar()
          }}
        />
      )}
    </>
  )
}
