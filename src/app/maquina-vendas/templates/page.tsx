'use client'

/**
 * REVISÃO DAS MENSAGENS — a tela onde a dona da marca decide.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Não é tela de configuração: quem lê é quem responde pela voz da marca, e o
 * que ela julga é o TEXTO. Por isso a mensagem aparece num balão de conversa,
 * com as variáveis já preenchidas — mostrar `{{1}}` transferiria para ela um
 * trabalho de tradução mental que é nosso.
 *
 * ── O que a tela protege ──────────────────────────────────────────────────
 * Ela pode reescrever, e é bom que possa. Mas o texto é um template da Meta,
 * com regras invisíveis: não pode começar com campo variável, não pode perder
 * um campo, não pode inventar outro. Apagar um `{{2}}` sem querer faria a
 * submissão ser recusada dias depois, sem ninguém entender por quê.
 *
 * O editor valida a cada tecla e diz o problema em português, com o que fazer.
 * O erro nunca chega como código da Meta.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  MessageSquare, ShoppingBag, Package, Sparkles, Heart, Rocket, Check,
  CheckCircle2, AlertTriangle, ArrowLeft, Pencil, RotateCcw, X, Loader2, Database, Undo2,
} from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { AppToaster } from '@/components/ui/AppToaster'
import { CATALOGO, VARIAVEIS, type TemplateMeta } from '@/lib/maquina-vendas/catalogo-templates'
import { getRevisoes, salvarRevisao, validarEdicao, restaurarOriginal, type Revisao } from '@/app/actions/templates'

/** Medido contra a loja real em 09/09/2026 — 62 pedidos e 9 carrinhos. */
const BLOQUEIOS: Record<string, string> = {
  dl_carrinho_ultimo_v1: 'Depende de cupom, e o CRM não gera cupom. Exigiria permissão de escrita na loja, que tiramos de propósito.',
  dl_pix_pendente_v1: 'A API de pedido da Nuvemshop não devolve a validade do PIX.',
  dl_pedido_enviado_v1: 'Os 62 pedidos dos últimos 60 dias estão com o código de rastreio VAZIO. Não é limite da API — é preenchimento. Se a loja informar o código, destrava sozinho.',
  dl_reativacao_60d_v1: 'O CRM ainda não lê as coleções da loja.',
  dl_colecao_nova_v1: 'O CRM ainda não lê as coleções da loja.',
}

const TRILHAS = [
  { id: 'carrinho', nome: 'Carrinho abandonado', Icone: ShoppingBag, sobre: 'Quem montou o carrinho e não finalizou. Três toques, e o terceiro se anuncia como último.' },
  { id: 'pedido', nome: 'Pedido', Icone: Package, sobre: 'Acompanha a compra do recebimento à entrega.' },
  { id: 'pagamento', nome: 'Pagamento', Icone: MessageSquare, sobre: 'Avisa sobre pagamento pendente ou aprovado.' },
  { id: 'pos_venda', nome: 'Pós-venda', Icone: Heart, sobre: 'Depois que a peça chegou — opinião e troca.' },
  { id: 'reativacao', nome: 'Reativação e novidades', Icone: Sparkles, sobre: 'Quem já comprou e sumiu, e quem quer saber da coleção nova.' },
] as const

const preencher = (corpo: string, t: TemplateMeta) =>
  corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => t.exemplos[Number(n) - 1] ?? '…')

export default function TemplatesPage() {
  const [revisoes, setRevisoes] = useState<Map<string, Revisao>>(new Map())
  const [migrado, setMigrado] = useState(true)
  const [carregando, setCarregando] = useState(true)
  const [filtro, setFiltro] = useState<'todos' | 'PENDENTE' | 'APROVADO' | 'AJUSTAR'>('todos')
  const [editando, setEditando] = useState<string | null>(null)
  const [rascunho, setRascunho] = useState('')
  const [comentario, setComentario] = useState('')
  const [erros, setErros] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await getRevisoes()
      setMigrado(r.migrado)
      setRevisoes(new Map(r.revisoes.map((x) => [x.nome, x])))
    } catch {
      toast.error('Não foi possível carregar a revisão.')
    } finally {
      setCarregando(false)
    }
  }, [])
  useEffect(() => { void carregar() }, [carregar])

  const rev = (nome: string) => revisoes.get(nome)
  const statusDe = (nome: string) => rev(nome)?.status ?? 'PENDENTE'
  const corpoDe = (t: TemplateMeta) => rev(t.nome)?.corpoRevisado ?? t.corpo

  const contagem = useMemo(() => {
    const c = { APROVADO: 0, AJUSTAR: 0, PENDENTE: 0 }
    for (const t of CATALOGO) c[statusDe(t.nome)]++
    return c
  }, [revisoes])

  const abrirEditor = (t: TemplateMeta) => {
    setEditando(t.nome)
    setRascunho(corpoDe(t))
    setComentario(rev(t.nome)?.comentario ?? '')
    setErros([])
  }

  const aoDigitar = async (t: TemplateMeta, texto: string) => {
    setRascunho(texto)
    setErros(await validarEdicao(t.nome, texto))
  }

  const decidir = async (t: TemplateMeta, status: Revisao['status'], comCorpo = false) => {
    setSalvando(true)
    try {
      const r = await salvarRevisao({
        nome: t.nome,
        status,
        corpoRevisado: comCorpo ? rascunho : (rev(t.nome)?.corpoRevisado ?? null),
        comentario: comCorpo ? comentario : (rev(t.nome)?.comentario ?? null),
      })
      if (!r.ok) { setErros(r.erros ?? ['Não foi possível salvar.']); return }
      toast.success(
        status === 'APROVADO' ? 'Mensagem aprovada.'
          : status === 'AJUSTAR' ? 'Marcada para ajuste.'
          : 'Marcação removida — a mensagem voltou para "não lida".',
      )
      setEditando(null)
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  const desfazer = async (nome: string) => {
    await restaurarOriginal(nome)
    toast.success('Texto original restaurado.')
    setEditando(null)
    await carregar()
  }

  const porTrilha = TRILHAS.map((tr) => ({
    ...tr,
    itens: CATALOGO.filter((t) => t.trilha === tr.id && (filtro === 'todos' || statusDe(t.nome) === filtro)),
  })).filter((tr) => tr.itens.length)

  return (
    <AppLayout>
      <AppToaster />
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <div className="px-4 sm:px-6 lg:px-8 py-6 max-w-[900px] w-full mx-auto space-y-6">

          <div>
            <Link href="/maquina-vendas" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-3">
              <ArrowLeft className="w-3.5 h-3.5" /> Máquina de Vendas
            </Link>
            <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wider font-medium mb-1">
              <Rocket className="w-3.5 h-3.5" /><span>Para aprovação</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">Mensagens da Doce Lilium</h1>
            <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
              São as mensagens que o WhatsApp vai enviar sozinho. Leia cada uma como a sua cliente vai ler,
              e <strong className="text-foreground">aprove ou reescreva</strong>. Nada foi enviado nem publicado ainda.
            </p>
          </div>

          {!migrado && (
            <div className="rounded-2xl border border-warning/35 bg-warning/8 p-5 flex items-start gap-3">
              <Database className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <p className="text-sm text-foreground">
                O banco ainda não foi migrado, então aprovações e edições <strong>não serão salvas</strong>.
                Pode ler, mas não decida ainda.
              </p>
            </div>
          )}

          {/* Placar */}
          <div className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center gap-2">
              {([
                { id: 'todos' as const, rot: `Todas (${CATALOGO.length})`, tom: '' },
                { id: 'APROVADO' as const, rot: `Aprovadas (${contagem.APROVADO})`, tom: 'positivo' },
                { id: 'AJUSTAR' as const, rot: `A ajustar (${contagem.AJUSTAR})`, tom: 'alerta' },
                { id: 'PENDENTE' as const, rot: `Não lidas (${contagem.PENDENTE})`, tom: '' },
              ]).map((f) => (
                <button key={f.id} onClick={() => setFiltro(f.id)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
                    filtro === f.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-accent'
                  }`}>
                  {f.rot}
                </button>
              ))}
            </div>
            {contagem.PENDENTE === 0 && (
              <p className="text-xs text-success mt-3 flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Todas as mensagens foram lidas.
              </p>
            )}
          </div>

          {carregando ? (
            <div className="flex items-center justify-center py-24 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Carregando…
            </div>
          ) : porTrilha.map(({ id, nome, Icone, sobre, itens }) => (
            <section key={id} className="space-y-3">
              <div className="flex items-start gap-2.5 pt-2">
                <Icone className="w-4 h-4 text-brand-ink shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-base font-semibold text-foreground">{nome}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{sobre}</p>
                </div>
              </div>

              {itens.map((t) => {
                const bloqueio = BLOQUEIOS[t.nome]
                const r = rev(t.nome)
                const st = statusDe(t.nome)
                const editado = !!r?.corpoRevisado
                const emEdicao = editando === t.nome
                const campos = VARIAVEIS[t.nome] ?? []

                return (
                  <div key={t.nome} className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
                    st === 'APROVADO' ? 'border-success/40' : st === 'AJUSTAR' ? 'border-warning/45' : 'border-border'
                  }`}>
                    <div className="px-5 py-3 border-b border-border-subtle bg-muted/50 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground flex-1 min-w-0">{t.quando.split('.')[0]}.</span>
                      {editado && <span className="dl-chip text-[10px]"><Pencil className="w-3 h-3" />Reescrita</span>}
                      {st === 'APROVADO' && <span className="dl-chip text-[10px]" data-tom="positivo"><Check className="w-3 h-3" />Aprovada</span>}
                      {st === 'AJUSTAR' && <span className="dl-chip text-[10px]" data-tom="alerta"><AlertTriangle className="w-3 h-3" />A ajustar</span>}
                      {bloqueio && <span className="dl-chip text-[10px]">Depende de ajuste técnico</span>}
                    </div>

                    {!emEdicao ? (
                      <>
                        <div className="px-5 py-5 bg-muted/25">
                          <div className="max-w-[26rem] rounded-2xl rounded-tl-sm bg-card border border-border-subtle px-4 py-3 shadow-sm">
                            <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{preencher(corpoDe(t), t)}</p>
                            {t.rodape && <p className="text-[11px] text-muted-foreground mt-2">{t.rodape}</p>}
                            {t.botoes?.length ? (
                              <div className="mt-3 pt-2.5 border-t border-border-subtle flex flex-wrap gap-1.5">
                                {t.botoes.map((b) => (
                                  <span key={b.texto} className="text-[11px] font-medium text-info px-2.5 py-1 rounded-lg border border-border-subtle bg-muted/60">{b.texto}</span>
                                ))}
                              </div>
                            ) : null}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-2 ml-1">
                            Nome e peça acima são exemplo — na hora do envio vêm do carrinho real.
                          </p>
                        </div>

                        {r?.comentario && (
                          <div className="px-5 py-3 border-t border-border-subtle bg-muted/30">
                            <p className="text-xs text-muted-foreground"><strong className="text-foreground">Observação:</strong> {r.comentario}</p>
                          </div>
                        )}

                        <div className="px-5 py-3 border-t border-border-subtle flex flex-wrap items-center gap-2">
                          <button onClick={() => decidir(t, 'APROVADO')} disabled={salvando || !migrado}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                              st === 'APROVADO' ? 'bg-success/12 text-success border border-success/35' : 'bg-primary text-primary-foreground hover:opacity-95'
                            }`}>
                            <Check className="w-3.5 h-3.5" />{st === 'APROVADO' ? 'Aprovada' : 'Aprovar'}
                          </button>
                          <button onClick={() => decidir(t, 'AJUSTAR')} disabled={salvando || !migrado}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40">
                            <AlertTriangle className="w-3.5 h-3.5" />Preciso ajustar
                          </button>
                          <button onClick={() => abrirEditor(t)} disabled={!migrado}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent transition-colors cursor-pointer disabled:opacity-40">
                            <Pencil className="w-3.5 h-3.5" />Reescrever
                          </button>
                          {st !== 'PENDENTE' && (
                            <button onClick={() => decidir(t, 'PENDENTE')} disabled={salvando || !migrado}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-40"
                              title="Volta a mensagem para 'não lida', sem apagar o que voce escreveu">
                              <Undo2 className="w-3.5 h-3.5" />Tirar marcação
                            </button>
                          )}
                          {editado && (
                            <button onClick={() => desfazer(t.nome)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                              <RotateCcw className="w-3.5 h-3.5" />Voltar ao texto original
                            </button>
                          )}
                        </div>
                      </>
                    ) : (
                      /* ── EDITOR ─────────────────────────────────────────── */
                      <div className="px-5 py-5 space-y-3">
                        <div>
                          <label className="ocr-label">Sua versão da mensagem</label>
                          <textarea value={rascunho} onChange={(e) => void aoDigitar(t, e.target.value)} rows={6}
                            className="w-full mt-1.5 px-4 py-3 rounded-xl border border-border bg-card text-sm text-foreground leading-relaxed focus:outline-none focus:ring-1 focus:ring-ring resize-y" />
                          <p className="text-[11px] text-muted-foreground mt-1.5">{rascunho.trim().length} de 1024 caracteres</p>
                        </div>

                        <div className="rounded-xl border border-border-subtle bg-muted/40 px-4 py-3">
                          <p className="text-[11px] text-muted-foreground mb-1.5">
                            <strong className="text-foreground">Os campos entre chaves são preenchidos pelo sistema</strong> —
                            precisam continuar no texto, e não podem virar outros:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {campos.map((c, i) => (
                              <span key={c} className="dl-chip text-[10px]">{`{{${i + 1}}}`} = {c.replace(/_/g, ' ')}</span>
                            ))}
                          </div>
                        </div>

                        {erros.length > 0 && (
                          <div className="rounded-xl border border-destructive/35 bg-destructive/8 px-4 py-3 space-y-1.5">
                            {erros.map((e, i) => (
                              <p key={i} className="text-xs text-foreground flex items-start gap-2">
                                <AlertTriangle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />{e}
                              </p>
                            ))}
                          </div>
                        )}

                        {erros.length === 0 && rascunho.trim() && (
                          <div>
                            <span className="ocr-label">Como vai chegar</span>
                            <div className="mt-1.5 max-w-[26rem] rounded-2xl rounded-tl-sm bg-card border border-border-subtle px-4 py-3 shadow-sm">
                              <p className="text-sm text-foreground leading-relaxed whitespace-pre-line">{preencher(rascunho, t)}</p>
                            </div>
                          </div>
                        )}

                        <div>
                          <label className="ocr-label">Observação (opcional)</label>
                          <input value={comentario} onChange={(e) => setComentario(e.target.value)}
                            placeholder="Algo que você queira registrar sobre esta mensagem"
                            className="w-full mt-1.5 px-4 py-2.5 rounded-xl border border-border bg-card text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring" />
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button onClick={() => decidir(t, 'APROVADO', true)} disabled={salvando || erros.length > 0}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-medium hover:opacity-95 disabled:opacity-40 transition-opacity cursor-pointer">
                            {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Salvar e aprovar
                          </button>
                          <button onClick={() => decidir(t, 'AJUSTAR', true)} disabled={salvando || erros.length > 0}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-border bg-card text-xs font-medium text-foreground hover:bg-accent disabled:opacity-40 transition-colors cursor-pointer">
                            Salvar sem aprovar
                          </button>
                          <button onClick={() => setEditando(null)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">
                            <X className="w-3.5 h-3.5" />Cancelar
                          </button>
                        </div>
                      </div>
                    )}

                    {bloqueio && !emEdicao && (
                      <div className="px-5 py-3 border-t border-border-subtle bg-warning/8">
                        <p className="text-xs text-foreground"><strong>Nota técnica:</strong> {bloqueio}</p>
                      </div>
                    )}

                    <div className="px-5 py-2.5 border-t border-border-subtle flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                      <span className="ocr-mono">{t.nome}</span>
                      <span>{t.categoria === 'MARKETING' ? 'Marketing — precisa de autorização da cliente' : 'Utilidade — ligada a um pedido existente'}</span>
                      {r?.revisadoEm && (
                        <span className="ml-auto">
                          revisada em {new Date(r.revisadoEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </section>
          ))}

          <div className="rounded-2xl border border-border-subtle bg-muted/40 p-5 text-xs text-muted-foreground leading-relaxed">
            <p className="text-foreground font-medium mb-1.5">O que acontece depois</p>
            Quando todas estiverem aprovadas aqui, elas são enviadas ao WhatsApp para revisão da Meta —
            que leva de algumas horas a alguns dias. Só então a Máquina pode começar a falar com clientes.
            O nome de cada mensagem não muda depois de aprovado pela Meta, e por isso a leitura de agora importa.
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
