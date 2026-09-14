'use client'

/**
 * FICHA DO CONTATO — a `ClientDetailPage` da CarBoss, com o que a loja tem.
 *
 * Na CarBoss a ficha é uma página própria (voltar, título, editar; duas colunas
 * de cartões). Lá os cartões são veículos e planos; aqui são o que existe numa
 * loja de roupa: negócios em cada funil (atendimento, carrinho, pós-venda),
 * histórico de compras e a linha do tempo — onde a conversa com a IA e cada
 * mensagem da Máquina de Vendas aparecem.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Pencil, Trash2, Merge, MessageCircle, ShoppingBag, Layers, Clock, MapPin, Tag, Globe, Search, Check, X, AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import * as crmActions from '@/app/actions/crm'
import { useContacts, useDeleteContact, useMergeContacts } from '@/hooks/useContacts'
import { nomeDeExibicao, iniciais, telefoneDeExibicao, temNome } from '@/lib/contato-exibicao'
import { statusDoContato, COR_STATUS } from '@/lib/contato-status'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { ContatoModal } from '@/components/contatos/ContatoModal'

type Ficha = NonNullable<Awaited<ReturnType<typeof crmActions.getFichaContato>>>

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '—')
const dataHora = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

function Linha({ rotulo, valor, forte }: { rotulo: string; valor?: string | null; forte?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5 text-sm">
      <span className="shrink-0 text-muted-foreground">{rotulo}</span>
      <span className={`text-right text-foreground ${forte ? 'font-bold' : 'font-medium'} break-all`}>{valor || '—'}</span>
    </div>
  )
}

function Cartao({ titulo, icone, acao, children }: { titulo: string; icone?: React.ReactNode; acao?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border-subtle bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          {icone} {titulo}
        </h3>
        {acao}
      </div>
      {children}
    </div>
  )
}

const STATUS_NEGOCIO: Record<string, { rotulo: string; classe: string }> = {
  OPEN: { rotulo: 'Em andamento', classe: 'border-info/40 bg-info/10 text-info' },
  WON: { rotulo: 'Ganho', classe: 'border-success/40 bg-success/10 text-success' },
  LOST: { rotulo: 'Perdido', classe: 'border-destructive/40 bg-destructive/10 text-destructive' },
}

export default function FichaContatoPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [ficha, setFicha] = useState<Ficha | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [editando, setEditando] = useState(false)
  const [juntando, setJuntando] = useState(false)
  const [buscaJuntar, setBuscaJuntar] = useState('')
  const [alvoJuntar, setAlvoJuntar] = useState('')
  const excluir = useDeleteContact()
  const juntar = useMergeContacts()
  const { contacts } = useContacts()

  const carregar = useCallback(async () => {
    try {
      setFicha(await crmActions.getFichaContato(id))
    } catch (e) {
      toast.error('Erro ao carregar a ficha: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => {
    Promise.resolve().then(() => carregar())
    const h = () => { void carregar() }
    window.addEventListener('crm-contacts-updated', h)
    window.addEventListener('crm-deals-updated', h)
    window.addEventListener('crm-activities-updated', h)
    return () => {
      window.removeEventListener('crm-contacts-updated', h)
      window.removeEventListener('crm-deals-updated', h)
      window.removeEventListener('crm-activities-updated', h)
    }
  }, [carregar])

  const derivados = useMemo(() => {
    if (!ficha) return null
    const n = ficha.negocios
    const ganhos = n.filter((d) => d.status === 'WON')
    return {
      ganhos,
      totalGasto: ganhos.reduce((s, d) => s + (d.valorEstimado || 0), 0),
      status: statusDoContato({
        abertos: n.filter((d) => d.status === 'OPEN').length,
        ganhos: ganhos.length,
        perdidos: n.filter((d) => d.status === 'LOST').length,
      }),
    }
  }, [ficha])

  const candidatosJuntar = useMemo(() => {
    const q = buscaJuntar.trim().toLowerCase()
    return contacts
      .filter((c) => c.id !== id)
      .filter((c) => !q || `${c.nome} ${c.sobrenome ?? ''} ${c.telefone}`.toLowerCase().includes(q))
      .slice(0, 30)
  }, [contacts, id, buscaJuntar])

  if (carregando) {
    return (
      <AppLayout>
        <div className="flex h-full items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </AppLayout>
    )
  }

  if (!ficha || !derivados) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-3xl px-6 py-10 text-center">
          <p className="text-lg font-bold text-foreground">Contato não encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ele pode ter sido excluído ou juntado a outro.</p>
          <button onClick={() => router.push('/contacts')} className="mt-4 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            Voltar para Contatos
          </button>
        </div>
      </AppLayout>
    )
  }

  const c = ficha.contato
  const end = (c.enderecoCompleto ?? {}) as Record<string, string | undefined>
  const temEndereco = Object.values(end).some(Boolean)
  const st = derivados.status
  const digitos = (c.telefone ?? '').replace(/\D/g, '')

  async function excluirContato() {
    const ok = await confirmar({
      titulo: 'Excluir este contato para sempre?',
      alvo: nomeDeExibicao(c),
      descricao: 'Os negócios ligados a ele vão junto. Não dá para desfazer.',
      confirmar: 'Excluir',
    })
    if (!ok) return
    try {
      await excluir.execute(c.id)
      toast.success('Contato excluído')
      router.push('/contacts')
    } catch (e) {
      toast.error('Erro ao excluir: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function confirmarJuntar() {
    if (!alvoJuntar) return
    const ok = await confirmar({
      titulo: 'Juntar os dois contatos?',
      descricao: 'O contato escolhido deixa de existir, e os negócios e atividades dele passam para este. Não dá para separar depois.',
      confirmar: 'Juntar',
    })
    if (!ok) return
    try {
      await juntar.execute(c.id, alvoJuntar)
      toast.success('Contatos juntados')
      setJuntando(false)
      setAlvoJuntar('')
      void carregar()
    } catch (e) {
      toast.error('Erro ao juntar: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
          <button onClick={() => router.push('/contacts')} className="mb-4 flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>

          {/* ── Cabeçalho ─────────────────────────────────────────────── */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-ink text-xl font-bold text-white">{iniciais(c)}</div>
              <div className="min-w-0">
                <h1 className={`truncate text-2xl font-bold tracking-tight ${temNome(c) ? 'text-foreground' : 'italic text-muted-foreground'}`}>
                  {nomeDeExibicao(c)}
                  {c.sobrenome && temNome(c) ? ` ${c.sobrenome}` : ''}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide ${COR_STATUS[st].texto} ${COR_STATUS[st].borda} ${COR_STATUS[st].fundo}`}>{st}</span>
                  <span className="text-sm text-muted-foreground">{c.documento ? `CPF ${c.documento}` : telefoneDeExibicao(c.telefone) || 'Contato'}</span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {digitos && (
                <a href={`https://wa.me/${digitos}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 rounded-xl border border-success/40 px-3 py-2 text-sm font-semibold text-success hover:bg-success/10">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              )}
              <button onClick={() => setJuntando(true)} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
                <Merge className="h-4 w-4" /> Juntar
              </button>
              <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted">
                <Pencil className="h-4 w-4" /> Editar
              </button>
              <button onClick={excluirContato} className="rounded-xl border border-destructive/40 p-2 text-destructive hover:bg-destructive/10" title="Excluir">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
            {/* ── Coluna esquerda ───────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <Cartao titulo="Dados pessoais">
                <Linha rotulo="Telefone" valor={telefoneDeExibicao(c.telefone)} />
                <Linha rotulo="E-mail" valor={c.email} />
                <Linha rotulo="CPF" valor={c.documento} />
                <Linha rotulo="Nascimento" valor={c.dataNascimento ? data(c.dataNascimento) : null} />
                <Linha rotulo="Cidade" valor={[c.cidade || end.cidade, c.estado || end.estado].filter(Boolean).join(' - ')} />
                <Linha rotulo="Origem" valor={c.origem || c.firstUtmSource} />
                <Linha rotulo="Contato desde" valor={data(c.createdAt)} />
                <Linha rotulo="Total comprado" valor={brl(derivados.totalGasto)} forte />
                <div className="mt-3 flex items-center gap-2">
                  <span className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold ${c.consentimentoLgpd ? 'border-success/30 bg-success/10 text-success' : 'border-warning/30 bg-warning/10 text-warning'}`}>
                    {c.consentimentoLgpd ? 'Aceita mensagens (LGPD)' : 'Consentimento LGPD não registrado'}
                  </span>
                </div>
              </Cartao>

              <Cartao titulo="Tags" icone={<Tag className="h-4 w-4 text-primary" />}>
                {(c.tags ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma tag. Use Editar para marcar.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {(c.tags ?? []).map((t: string) => (
                      <span key={t} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">{t}</span>
                    ))}
                  </div>
                )}
              </Cartao>

              {temEndereco && (
                <Cartao titulo="Endereço" icone={<MapPin className="h-4 w-4 text-primary" />}>
                  <p className="text-sm text-foreground">
                    {[end.rua, end.numero].filter(Boolean).join(', ')}
                    {end.complemento ? ` · ${end.complemento}` : ''}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[end.bairro, [end.cidade, end.estado].filter(Boolean).join(' - '), end.cep].filter(Boolean).join(' · ')}
                  </p>
                </Cartao>
              )}

              {(c.firstUtmSource || c.lastUtmSource) && (
                <Cartao titulo="De onde veio" icone={<Globe className="h-4 w-4 text-primary" />}>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      { t: 'Primeiro toque', s: c.firstUtmSource, m: c.firstUtmMedium, k: c.firstUtmCampaign, q: c.firstUtmAt },
                      { t: 'Último toque', s: c.lastUtmSource, m: c.lastUtmMedium, k: c.lastUtmCampaign, q: c.lastUtmAt },
                    ].map((u) => (
                      <div key={u.t}>
                        <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{u.t}</p>
                        <Linha rotulo="Origem" valor={u.s} />
                        <Linha rotulo="Mídia" valor={u.m} />
                        <Linha rotulo="Campanha" valor={u.k} />
                        <Linha rotulo="Quando" valor={u.q ? data(u.q) : null} />
                      </div>
                    ))}
                  </div>
                </Cartao>
              )}
            </div>

            {/* ── Coluna direita ────────────────────────────────────── */}
            <div className="flex flex-col gap-4">
              <Cartao
                titulo="Negócios"
                icone={<Layers className="h-4 w-4 text-primary" />}
                acao={<span className="text-xs font-semibold text-muted-foreground">{ficha.negocios.length}</span>}
              >
                {ficha.negocios.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum negócio. Ele entra no funil quando conversa no WhatsApp, abandona um carrinho ou compra.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {ficha.negocios.map((d) => (
                      <button
                        key={d.id}
                        onClick={() => router.push(`/pipeline?dealId=${d.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-border-subtle bg-background px-3 py-2.5 text-left hover:border-primary/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold text-foreground">{d.titulo}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                            <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: d.etapaCor ?? '#94a3b8' }} />
                            {d.funilNome ?? 'Funil'} · {d.etapaNome ?? '—'} · {data(d.criadoEm)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_NEGOCIO[d.status]?.classe ?? ''}`}>{STATUS_NEGOCIO[d.status]?.rotulo ?? d.status}</span>
                          {d.valorEstimado > 0 && <span className="text-xs font-semibold text-foreground">{brl(d.valorEstimado)}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Cartao>

              <Cartao titulo="Histórico de compras" icone={<ShoppingBag className="h-4 w-4 text-primary" />}>
                {derivados.ganhos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma compra registrada.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-subtle text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="py-2 pr-3 font-bold">Data</th>
                          <th className="py-2 pr-3 font-bold">Compra</th>
                          <th className="py-2 text-right font-bold">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {derivados.ganhos.map((d) => (
                          <tr key={d.id} className="border-b border-border-subtle/60 last:border-0">
                            <td className="py-2 pr-3 text-muted-foreground">{data(d.fechadoEm ?? d.criadoEm)}</td>
                            <td className="py-2 pr-3 text-foreground">
                              {d.titulo}
                              {d.produtoInteresse && <span className="block text-xs text-muted-foreground">{d.produtoInteresse}</span>}
                            </td>
                            <td className="py-2 text-right font-semibold text-foreground">{brl(d.valorEstimado)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Cartao>

              <Cartao
                titulo="Linha do tempo"
                icone={<Clock className="h-4 w-4 text-primary" />}
                acao={<span className="text-xs font-semibold text-muted-foreground">{ficha.atividades.length}</span>}
              >
                {ficha.atividades.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nada registrado ainda.</p>
                ) : (
                  <ol className="relative ml-2 border-l border-border-subtle">
                    {ficha.atividades.map((a) => {
                      const texto = (a.descricao ?? '').replace(/\s*\S*\s*\[mv:[0-9a-f-]{36}\]\s*$/i, '').trim()
                      return (
                        <li key={a.id} className="mb-4 ml-4 last:mb-0">
                          <span className={`absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-card ${a.tipo === 'WhatsApp' ? 'bg-success' : a.status === 'DONE' ? 'bg-muted-foreground' : 'bg-warning'}`} />
                          <p className="text-[11px] font-semibold text-muted-foreground">
                            {dataHora(a.doneAt ?? a.dueAt ?? a.createdAt)} · {a.tipo}
                            {a.status !== 'DONE' ? ' · pendente' : ''}
                          </p>
                          <p className="text-sm font-semibold text-foreground">{a.titulo}</p>
                          {texto && texto !== a.titulo && <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground line-clamp-4">{texto}</p>}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </Cartao>
            </div>
          </div>
        </div>
      </div>

      {editando && (
        <ContatoModal
          contato={c as never}
          onClose={() => setEditando(false)}
          onSaved={() => { setEditando(false); void carregar() }}
        />
      )}

      {juntando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={() => setJuntando(false)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-border bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold text-foreground"><Merge className="h-5 w-5 text-primary" /> Juntar contatos</h3>
              <button onClick={() => setJuntando(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex gap-2 rounded-xl border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Fica <b className="text-foreground">{nomeDeExibicao(c)}</b>. Os negócios e a linha do tempo do contato escolhido passam para ele.</span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input value={buscaJuntar} onChange={(e) => setBuscaJuntar(e.target.value)} placeholder="Buscar por nome ou telefone..." className="h-9 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm focus:border-primary focus:outline-none" />
            </div>
            <div className="max-h-56 divide-y divide-border-subtle overflow-y-auto rounded-xl border border-border-subtle">
              {candidatosJuntar.map((o) => (
                <button key={o.id} onClick={() => setAlvoJuntar(o.id)} className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm ${alvoJuntar === o.id ? 'bg-primary/10 text-primary' : 'text-foreground hover:bg-muted'}`}>
                  <span>
                    <span className="font-semibold">{nomeDeExibicao(o)}</span>
                    <span className="block text-xs text-muted-foreground">{telefoneDeExibicao(o.telefone)}</span>
                  </span>
                  {alvoJuntar === o.id && <Check className="h-4 w-4" />}
                </button>
              ))}
              {candidatosJuntar.length === 0 && <p className="p-3 text-center text-xs text-muted-foreground">Nenhum outro contato encontrado.</p>}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setJuntando(false)} className="flex-1 rounded-xl border border-border py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">Cancelar</button>
              <button onClick={confirmarJuntar} disabled={!alvoJuntar} className="flex-1 rounded-xl bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-40">Juntar</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  )
}
