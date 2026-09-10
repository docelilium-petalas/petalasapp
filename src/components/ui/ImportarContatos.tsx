'use client'

import React, { useMemo, useRef, useState } from 'react'
import { Upload, X, ArrowRight, CheckCircle2, AlertTriangle, Loader2, FileSpreadsheet } from 'lucide-react'
import { toast } from 'sonner'
import { lerCsv, chaveDeCabecalho } from '@/lib/csv'
import { analisar, executar } from '@/app/actions/importar'
import { CAMPOS_IMPORTAVEIS, type LinhaImportada, type Relatorio } from '@/lib/importar-contatos'

/**
 * IMPORTAR CONTATOS DE PLANILHA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Três passos, e o do meio é o que justifica existir uma tela em vez de um
 * botão: **a pessoa vê o que vai acontecer antes de acontecer.**
 *
 *   1. o arquivo   arrastar, escolher, ou colar direto do Excel
 *   2. conferir    de qual coluna sai cada campo, e o veredito de cada linha
 *   3. o resultado o que entrou, o que foi completado, o que ficou de fora
 *
 * O passo 2 chama `analisar()`, que não escreve nada. Só o botão do fim
 * escreve. É a diferença entre "importei e deu ruim" e "não era isso, deixa
 * eu arrumar a planilha".
 *
 * ── COLAR TAMBÉM VALE ─────────────────────────────────────────────────────
 * Salvar como CSV é o passo em que a maioria desiste: o Excel pergunta sobre
 * codificação, avisa que vai perder formatação, e a pessoa fecha. Copiar as
 * células e colar aqui produz um texto separado por TAB, que o leitor
 * reconhece — sem sair da planilha.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** Nomes de coluna que costumam aparecer, por campo. Já normalizados. */
const SINONIMOS: Record<string, string[]> = {
  nome: ['nome', 'primeironome', 'nomecompleto', 'cliente', 'contato', 'name', 'fullname'],
  sobrenome: ['sobrenome', 'ultimonome', 'lastname', 'surname'],
  telefone: ['telefone', 'celular', 'fone', 'whatsapp', 'whats', 'tel', 'phone', 'contato1', 'numero'],
  email: ['email', 'mail', 'correio', 'endereco'],
  cidade: ['cidade', 'municipio', 'city'],
  estado: ['estado', 'uf', 'state'],
  documento: ['documento', 'cpf', 'cnpj', 'cpfcnpj', 'doc'],
  origem: ['origem', 'fonte', 'canal', 'source', 'comoconheceu'],
}

function adivinharMapa(cabecalho: string[]): Record<string, number> {
  const mapa: Record<string, number> = {}
  const usadas = new Set<number>()
  for (const campo of CAMPOS_IMPORTAVEIS) {
    const nomes = SINONIMOS[campo.chave] ?? [campo.chave]
    const i = cabecalho.findIndex((h, idx) => !usadas.has(idx) && nomes.includes(chaveDeCabecalho(h)))
    if (i >= 0) {
      mapa[campo.chave] = i
      usadas.add(i)
    }
  }
  return mapa
}

type Passo = 'arquivo' | 'conferir' | 'resultado'

export function ImportarContatos({ aberto, aoFechar, aoConcluir }: {
  aberto: boolean
  aoFechar: () => void
  aoConcluir?: () => void
}) {
  const [passo, setPasso] = useState<Passo>('arquivo')
  const [texto, setTexto] = useState('')
  const [mapa, setMapa] = useState<Record<string, number>>({})
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null)
  const [erros, setErros] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [arrastando, setArrastando] = useState(false)
  const inputArquivo = useRef<HTMLInputElement>(null)

  const grade = useMemo(() => (texto.trim() ? lerCsv(texto) : []), [texto])
  const cabecalho = grade[0] ?? []
  const corpo = useMemo(() => grade.slice(1), [grade])

  const linhas: LinhaImportada[] = useMemo(
    () =>
      corpo.map((l) => {
        const obj: LinhaImportada = {}
        for (const campo of CAMPOS_IMPORTAVEIS) {
          const i = mapa[campo.chave]
          if (i !== undefined && l[i] !== undefined) {
            ;(obj as Record<string, string>)[campo.chave] = l[i]
          }
        }
        return obj
      }),
    [corpo, mapa],
  )

  const faltaObrigatorio = CAMPOS_IMPORTAVEIS.filter((c) => c.obrigatorio && mapa[c.chave] === undefined)

  function receberTexto(t: string) {
    const g = lerCsv(t)
    if (g.length < 2) {
      toast.error('Não achei nem cabeçalho nem linhas nesse conteúdo.')
      return
    }
    setTexto(t)
    setMapa(adivinharMapa(g[0]))
    setPasso('conferir')
    setRelatorio(null)
  }

  function receberArquivo(f: File) {
    const leitor = new FileReader()
    leitor.onload = () => receberTexto(String(leitor.result ?? ''))
    leitor.onerror = () => toast.error('Não consegui ler o arquivo.')
    // UTF-8 cobre o que sai do Google Planilhas e do Excel moderno. Arquivo
    // antigo em Windows-1252 aparece com acento trocado — visível na prévia,
    // que é justamente onde a pessoa consegue perceber e salvar de novo.
    leitor.readAsText(f, 'utf-8')
  }

  async function conferir() {
    setOcupado(true)
    try {
      setRelatorio(await analisar(linhas))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao analisar.')
    } finally {
      setOcupado(false)
    }
  }

  async function gravar() {
    setOcupado(true)
    try {
      const r = await executar(linhas)
      setRelatorio(r)
      setErros(r.erros)
      setPasso('resultado')
      aoConcluir?.()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao importar.')
    } finally {
      setOcupado(false)
    }
  }

  function fechar() {
    setPasso('arquivo')
    setTexto('')
    setMapa({})
    setRelatorio(null)
    setErros([])
    aoFechar()
  }

  if (!aberto) return null

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-foreground/45 backdrop-blur-sm max-md:items-end max-md:p-0" onClick={fechar}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl border border-border bg-card shadow-2xl max-md:max-w-none max-md:rounded-b-none max-md:max-h-[92vh]"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle shrink-0">
          <div className="flex items-center gap-2.5">
            <FileSpreadsheet className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-sm font-bold text-foreground">Importar contatos</h2>
          </div>
          <button onClick={fechar} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors" aria-label="Fechar">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {passo === 'arquivo' && (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setArrastando(true) }}
                onDragLeave={() => setArrastando(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setArrastando(false)
                  const f = e.dataTransfer.files?.[0]
                  if (f) receberArquivo(f)
                }}
                onClick={() => inputArquivo.current?.click()}
                className={`rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors ${
                  arrastando ? 'border-brand-solid bg-secondary' : 'border-border hover:border-border-strong'
                }`}
              >
                <Upload className="w-6 h-6 mx-auto mb-3 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Solte o arquivo aqui, ou clique para escolher</p>
                <p className="text-xs text-muted-foreground mt-1">.csv ou .txt</p>
                <input
                  ref={inputArquivo}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) receberArquivo(f) }}
                />
              </div>

              <div className="flex items-center gap-3 my-5">
                <div className="h-px flex-1 bg-border-subtle" />
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">ou cole da planilha</span>
                <div className="h-px flex-1 bg-border-subtle" />
              </div>

              <textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onPaste={(e) => {
                  const t = e.clipboardData.getData('text')
                  if (t.includes('\n')) { e.preventDefault(); receberTexto(t) }
                }}
                rows={5}
                placeholder={'Nome\tTelefone\tE-mail\nMaria Silva\t62999630120\tmaria@exemplo.com'}
                className="w-full rounded-2xl border border-border bg-secondary px-4 py-3 text-xs text-foreground placeholder:text-muted-foreground font-mono focus:outline-none focus:ring-1 focus:ring-brand-solid resize-none"
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Selecione as células no Excel ou no Google Planilhas e cole aqui — inclusive a linha de cabeçalho.
              </p>
              {texto.trim() && (
                <button onClick={() => receberTexto(texto)} className="dl-btn-rose mt-4 w-full py-2.5 rounded-xl text-xs font-bold">
                  Continuar
                </button>
              )}
            </>
          )}

          {passo === 'conferir' && (
            <>
              <p className="text-xs text-muted-foreground mb-4">
                {corpo.length} {corpo.length === 1 ? 'linha' : 'linhas'} na planilha. Confira de qual coluna sai cada campo.
              </p>

              <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
                {CAMPOS_IMPORTAVEIS.map((campo) => (
                  <label key={campo.chave} className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold text-foreground">
                      {campo.rotulo}
                      {campo.obrigatorio && <span className="text-destructive"> *</span>}
                    </span>
                    <select
                      value={mapa[campo.chave] ?? ''}
                      onChange={(e) => {
                        const v = e.target.value
                        setMapa((m) => {
                          const n = { ...m }
                          if (v === '') delete n[campo.chave]
                          else n[campo.chave] = Number(v)
                          return n
                        })
                        setRelatorio(null)
                      }}
                      className="rounded-xl border border-border bg-secondary px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand-solid"
                    >
                      <option value="">— não importar —</option>
                      {cabecalho.map((h, i) => (
                        <option key={i} value={i}>{h || `coluna ${i + 1}`}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>

              {faltaObrigatorio.length > 0 && (
                <p className="mt-4 flex items-center gap-2 text-xs text-destructive">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Escolha a coluna de {faltaObrigatorio.map((c) => c.rotulo.toLowerCase()).join(' e ')}.
                </p>
              )}

              {relatorio && (
                <div className="mt-5 rounded-2xl border border-border-subtle bg-secondary p-4">
                  <div className="flex flex-wrap gap-4 text-xs">
                    <span className="text-foreground"><b className="text-success">{relatorio.criar}</b> contatos novos</span>
                    <span className="text-foreground"><b className="text-info">{relatorio.atualizar}</b> completados</span>
                    <span className="text-foreground"><b className="text-muted-foreground">{relatorio.ignorar}</b> fora</span>
                  </div>
                  {relatorio.ignorar > 0 && (
                    <div className="mt-3 max-h-40 overflow-y-auto space-y-1 border-t border-border-subtle pt-3">
                      {relatorio.vereditos.filter((v) => v.acao === 'ignorar').slice(0, 40).map((v) => (
                        <p key={v.linha} className="text-[11px] text-muted-foreground">
                          <span className="tabular font-semibold text-foreground">linha {v.linha}</span>
                          {v.nome ? ` · ${v.nome}` : ''} — {v.motivo}
                        </p>
                      ))}
                      {relatorio.ignorar > 40 && (
                        <p className="text-[11px] text-muted-foreground italic">e mais {relatorio.ignorar - 40}…</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {passo === 'resultado' && relatorio && (
            <div className="text-center py-6">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-4 text-success" />
              <p className="text-sm font-bold text-foreground">Importação concluída</p>
              <p className="text-xs text-muted-foreground mt-2">
                {relatorio.criar} {relatorio.criar === 1 ? 'contato novo' : 'contatos novos'} ·{' '}
                {relatorio.atualizar} {relatorio.atualizar === 1 ? 'completado' : 'completados'} ·{' '}
                {relatorio.ignorar} fora
              </p>
              {erros.length > 0 && (
                <div className="mt-5 text-left rounded-2xl border border-destructive/25 bg-destructive/5 p-4">
                  <p className="text-xs font-semibold text-destructive mb-2">Estas linhas não entraram:</p>
                  {erros.slice(0, 10).map((e, i) => (
                    <p key={i} className="text-[11px] text-muted-foreground">{e}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle shrink-0">
          {passo === 'conferir' && (
            <>
              <button onClick={() => setPasso('arquivo')} className="px-4 py-2.5 rounded-xl border border-border text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all">
                Voltar
              </button>
              {!relatorio ? (
                <button
                  onClick={conferir}
                  disabled={ocupado || faltaObrigatorio.length > 0}
                  className="dl-btn-rose px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 disabled:opacity-40"
                >
                  {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
                  Ver o que vai acontecer
                </button>
              ) : (
                <button
                  onClick={gravar}
                  disabled={ocupado || relatorio.criar + relatorio.atualizar === 0}
                  className="dl-btn-rose px-5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center gap-2 disabled:opacity-40"
                >
                  {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Importar {relatorio.criar + relatorio.atualizar}
                </button>
              )}
            </>
          )}
          {passo === 'resultado' && (
            <button onClick={fechar} className="dl-btn-rose px-5 py-2.5 rounded-xl text-xs font-bold">Fechar</button>
          )}
        </div>
      </div>
    </div>
  )
}
