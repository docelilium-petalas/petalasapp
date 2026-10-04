'use client'

/**
 * CADÊNCIA DE COLUNA — quem entrar numa coluna do funil recebe estas mensagens.
 *
 * Fora da janela de 24h só chega template aprovado na Meta, e um card do funil
 * só sabe o NOME da cliente. Por isso a lista de templates oferecida aqui vem
 * de `templatesParaColuna()` — a mesma regra que o servidor aplica ao salvar —
 * e o que não cabe aparece com o motivo, em vez de sumir calado.
 *
 * Réguas da loja (carrinho, pós-venda, reativação…) nascem no código, com
 * gatilho próprio; elas não se criam por aqui. Campanha com data, menos ainda.
 *
 * Nasce DESLIGADA: ligar é um segundo ato, depois de ver o estoque da coluna.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, CheckCircle2, ChevronDown, Loader2, Plus, Trash2, X } from 'lucide-react'
import {
  atualizarCadencia, criarCadencia, getColunasParaAcompanhamento, validarEtapasCadencia,
  type CadenciaInput, type EtapaInput,
} from '@/app/actions/maquina-vendas'
import { templatesParaColuna } from '@/lib/maquina-vendas/catalogo-templates'
import { OPCOES_DELAY, slugificar } from '@/lib/maquina-vendas/modelos'
import { BOTAO, BOTAO_ICONE, BOTAO_PRIMARIO, CAMPO, Chip, erroDe } from './comum'

type Colunas = Awaited<ReturnType<typeof getColunasParaAcompanhamento>>
type Validacao = Awaited<ReturnType<typeof validarEtapasCadencia>>

/** Igual ao TETO_POR_CADENCIA do servidor. */
const MAX_ETAPAS = 5

export type CadenciaEmEdicao = {
  id: string
  nome: string
  gatilho: string
  pipelineId: string
  stageId: string
  etapas: Array<{ ordem: number; delayMinutos: number; templateBase: string; templateNome: string | null }>
}

const { cabem: TEMPLATES_QUE_CABEM, naoCabem: TEMPLATES_QUE_NAO_CABEM } = templatesParaColuna()

function etapaInicial(ordem: number): EtapaInput {
  const t = TEMPLATES_QUE_CABEM[0]
  return { ordem, delayMinutos: ordem === 1 ? 0 : 2880, templateBase: '', templateNome: t?.nome ?? null }
}

export function ConfigCadenciaModal({
  edicao,
  onClose,
  onSaved,
}: {
  edicao?: CadenciaEmEdicao | null
  onClose: () => void
  onSaved: (mensagem: string) => void
}) {
  const editando = !!edicao
  const [colunas, setColunas] = useState<Colunas>([])
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  const [nome, setNome] = useState(edicao?.nome ?? '')
  const [pipelineId, setPipelineId] = useState(edicao?.pipelineId ?? '')
  const [stageId, setStageId] = useState(edicao?.stageId ?? '')
  const [etapas, setEtapas] = useState<EtapaInput[]>(
    edicao?.etapas.map((e) => ({ ordem: e.ordem, delayMinutos: e.delayMinutos, templateBase: e.templateNome ? '' : e.templateBase, templateNome: e.templateNome }))
      ?? [etapaInicial(1)],
  )
  const [validacao, setValidacao] = useState<Validacao>([])
  const [validando, setValidando] = useState(false)

  useEffect(() => {
    getColunasParaAcompanhamento()
      .then((lista) => {
        setColunas(lista)
        if (!editando && lista[0]) setPipelineId((p) => p || lista[0].id)
      })
      .catch((e) => setErro(erroDe(e)))
      .finally(() => setCarregando(false))
  }, [editando])

  const funil = useMemo(() => colunas.find((p) => p.id === pipelineId), [colunas, pipelineId])
  const coluna = useMemo(() => funil?.stages.find((s) => s.id === stageId), [funil, stageId])

  const revalidar = useCallback(async (lista: EtapaInput[]) => {
    setValidando(true)
    try {
      setValidacao(await validarEtapasCadencia(lista))
    } catch (e) {
      setValidacao([])
      setErro(erroDe(e))
    } finally {
      setValidando(false)
    }
  }, [])

  // A prévia é refeita 600 ms depois da última edição (o servidor lê a Meta).
  useEffect(() => {
    const t = setTimeout(() => void revalidar(etapas), 600)
    return () => clearTimeout(t)
  }, [etapas, revalidar])

  const mudarEtapa = (i: number, patch: Partial<EtapaInput>) => setEtapas((prev) => prev.map((e, k) => (k === i ? { ...e, ...patch } : e)))
  const removerEtapa = (i: number) => setEtapas((prev) => prev.filter((_, k) => k !== i).map((e, k) => ({ ...e, ordem: k + 1 })))
  const adicionarEtapa = () => setEtapas((prev) => (prev.length >= MAX_ETAPAS ? prev : [...prev, etapaInicial(prev.length + 1)]))

  const tudoValido = validacao.length === etapas.length && validacao.length > 0 && validacao.every((v) => v.ok)

  const salvar = async () => {
    setErro('')
    if (!nome.trim()) return setErro('Dê um nome à cadência.')
    if (!stageId) return setErro('Escolha a coluna que dispara a cadência.')
    if (!tudoValido) return setErro('Corrija as mensagens marcadas antes de salvar.')
    const input: CadenciaInput = {
      nome: nome.trim(),
      pipelineId,
      stageId,
      // Um gatilho por cadência: duas na mesma coluna precisam ser distintas (a tela avisa do custo).
      gatilho: edicao?.gatilho ?? `funil_${slugificar(nome)}`,
      etapas,
    }
    setSalvando(true)
    try {
      if (editando && edicao) {
        const r = await atualizarCadencia(edicao.id, input)
        if (r.avisos.length > 0) onSaved(`Cadência atualizada, mas a fila NÃO acompanhou: ${r.avisos[0]}`)
        else if (r.mensagensRealinhadas > 0) onSaved(`Cadência atualizada. ${r.mensagensRealinhadas} mensagem(ns) agendada(s) foram reescritas com o texto novo.`)
        else onSaved('Cadência atualizada.')
      } else {
        await criarCadencia(input)
        onSaved('Cadência criada — desligada. Ligue quando quiser começar.')
      }
    } catch (e) {
      setErro(erroDe(e))
      setSalvando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-sm animate-fade-in max-md:items-end max-md:p-0">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={editando ? 'Editar cadência' : 'Nova cadência de coluna'}
        className="w-full max-w-2xl rounded-3xl border border-border bg-card shadow-2xl flex flex-col max-h-[92vh] overflow-hidden max-md:max-w-none max-md:rounded-b-none max-md:rounded-t-3xl max-md:h-[92vh]"
      >
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-bold text-foreground">{editando ? 'Editar cadência' : 'Nova cadência de coluna'}</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Quem entrar na coluna escolhida recebe estas mensagens, nesta ordem.</p>
          </div>
          <button onClick={onClose} className={BOTAO_ICONE} aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 py-4 space-y-5 overflow-y-auto flex-1 scrollbar-thin">
          {carregando ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-8 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" /> Carregando os funis…
            </div>
          ) : (
            <>
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="ocr-label">Funil</span>
                  <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStageId('') }} className={CAMPO}>
                    {colunas.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="ocr-label">Coluna que dispara</span>
                  <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={CAMPO}>
                    <option value="">— Escolha a coluna —</option>
                    {(funil?.stages ?? []).map((s) => <option key={s.id} value={s.id}>{s.nome} ({s.abertos} em aberto)</option>)}
                  </select>
                </label>
              </section>

              {coluna && (
                <div className={`p-3 rounded-xl border text-[11px] leading-relaxed text-foreground ${coluna.abertos > 0 ? 'bg-warning/10 border-warning/30' : 'bg-muted/50 border-border-subtle'}`}>
                  {coluna.abertos > 0 ? (
                    <>
                      <strong>{coluna.nome}</strong> tem <strong className="tabular">{coluna.abertos}</strong> cliente(s) em aberto agora. Ao <strong>ligar</strong> esta cadência,
                      todas entram na programação — inclusive quem já estava na coluna antes. Quem entrar depois entra sozinha.
                    </>
                  ) : (
                    <><strong>{coluna.nome}</strong> está vazia. Quem entrar nela — arrastando o card ou por importação — passa a receber estas mensagens.</>
                  )}
                  {coluna.cadencias.filter((c) => c.id !== edicao?.id).length > 0 && (
                    <p className="mt-1.5 text-warning font-medium">
                      Esta coluna já tem {coluna.cadencias.filter((c) => c.id !== edicao?.id).length} cadência(s). Duas cadências na mesma coluna mandam duas mensagens para a mesma cliente.
                    </p>
                  )}
                </div>
              )}

              <label className="block space-y-1.5">
                <span className="ocr-label">Nome</span>
                <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Retorno de quem pediu orçamento" className={CAMPO} />
              </label>

              {/* O que cabe numa coluna — a regra do servidor, à vista. */}
              <details className="dl-panel px-3 py-2.5 text-[11px] group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-2 min-h-10">
                  <span className="text-foreground">
                    <strong>{TEMPLATES_QUE_CABEM.length}</strong> template(s) aprovado(s) cabem numa coluna:{' '}
                    {TEMPLATES_QUE_CABEM.map((t) => <Chip key={t.nome} tom="marca">{t.nome}</Chip>)}
                  </span>
                  <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="text-muted-foreground mt-2">
                  Um card do funil só sabe o nome da cliente. Os outros {TEMPLATES_QUE_NAO_CABEM.length} pedem dado que o card não tem (peça, pedido, prazo, coleção), são da campanha do drop ou de uso
                  interno — mandar quebraria na hora do envio:
                </p>
                <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
                  {TEMPLATES_QUE_NAO_CABEM.map((t) => <li key={t.nome}>· {t.motivo}</li>)}
                </ul>
                <p className="text-muted-foreground mt-2">Para uma mensagem nova para coluna, crie o template (versão _v2 se for de um que já existe) e mande para aprovação na tela de Templates.</p>
              </details>

              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground">
                    Mensagens <span className="font-normal text-muted-foreground">({etapas.length} de {MAX_ETAPAS})</span>
                  </p>
                  {validando && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" aria-label="Conferindo" />}
                </div>

                {etapas.map((etapa, i) => {
                  const v = validacao[i]
                  const erros = [...new Set((v?.previas ?? []).flatMap((p) => p.erros))]
                  const bloqueantes = erros.filter((e) => !e.startsWith('Sem template:'))
                  const previa = v?.previas[0]
                  const livre = !etapa.templateNome
                  return (
                    <div key={i} className={`p-3 rounded-xl border space-y-2 ${bloqueantes.length > 0 ? 'bg-destructive/5 border-destructive/30' : 'bg-muted/30 border-border-subtle'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-primary/10 border border-primary/30 text-primary text-[10px] flex items-center justify-center tabular">{i + 1}</span>
                          Mensagem {i + 1}
                          {i === etapas.length - 1 && <span className="ocr-label">· última</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          {v && bloqueantes.length === 0 && <CheckCircle2 className="w-4 h-4 text-success" aria-label="Pronta" />}
                          {etapas.length > 1 && (
                            <button type="button" onClick={() => removerEtapa(i)} className={BOTAO_ICONE} aria-label={`Remover mensagem ${i + 1}`}>
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select value={etapa.delayMinutos} onChange={(e) => mudarEtapa(i, { delayMinutos: Number(e.target.value) })} className={CAMPO} aria-label={`Quando enviar a mensagem ${i + 1}`}>
                          {OPCOES_DELAY.map((o) => <option key={o.minutos} value={o.minutos}>{o.minutos === 0 ? 'Assim que entrar na coluna' : o.rotulo}</option>)}
                        </select>
                        <select
                          value={etapa.templateNome ?? ''}
                          onChange={(e) => mudarEtapa(i, { templateNome: e.target.value || null })}
                          className={CAMPO}
                          aria-label={`Template da mensagem ${i + 1}`}
                        >
                          {TEMPLATES_QUE_CABEM.map((t) => <option key={t.nome} value={t.nome}>{t.nome}</option>)}
                          <option value="">Texto livre (só dentro de 24h)</option>
                        </select>
                      </div>

                      {livre && (
                        <textarea value={etapa.templateBase} onChange={(e) => mudarEtapa(i, { templateBase: e.target.value })} rows={4}
                          placeholder="Escreva a mensagem. Use {{primeiro_nome}}." className={`${CAMPO} font-mono leading-relaxed`} />
                      )}

                      {bloqueantes.length > 0 ? (
                        <ul className="text-[11px] text-destructive space-y-0.5">{bloqueantes.map((e, k) => <li key={k}>• {e}</li>)}</ul>
                      ) : previa?.texto ? (
                        <div className="p-2.5 rounded-lg bg-success/5 border border-success/30">
                          <p className="ocr-label mb-1">Como a cliente vê</p>
                          <p className="text-[11px] text-foreground whitespace-pre-line">{previa.texto}</p>
                        </div>
                      ) : null}
                      {livre && erros.some((e) => e.startsWith('Sem template:')) && (
                        <p className="text-[11px] text-warning">Texto livre só chega a quem falou com a loja nas últimas 24h. Para as demais, a mensagem é pulada.</p>
                      )}
                    </div>
                  )
                })}

                {etapas.length < MAX_ETAPAS && (
                  <button type="button" onClick={adicionarEtapa}
                    className="w-full min-h-10 rounded-xl border border-dashed border-border-strong text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 flex items-center justify-center gap-1.5 cursor-pointer">
                    <Plus className="w-4 h-4" /> Adicionar mensagem
                  </button>
                )}
              </section>

              {erro && (
                <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl text-xs" role="alert">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                  <span>{erro}</span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end gap-2 shrink-0 max-md:pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <button onClick={onClose} disabled={salvando} className={BOTAO}>Cancelar</button>
          <button onClick={salvar} disabled={salvando || carregando || !tudoValido || !stageId || !nome.trim()} className={BOTAO_PRIMARIO}>
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Criar desligada'}
          </button>
        </div>
      </div>
    </div>
  )
}
