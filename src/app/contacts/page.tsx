'use client'

/**
 * CONTATOS — a tela da CarBoss (`client/src/pages/Clients/ClientsPage.tsx`).
 *
 * Reunião de 14/09/2026 (15h23): "tem que refazer essa tela de contatos, que
 * está desde a versão do OCR… puxar da CarBoss pra cá". A estrutura é a de lá:
 *
 *   cabeçalho com ação  ·  cartões de status que filtram  ·  busca larga
 *   filtros de Tags e Origem em lista suspensa  ·  tabela Identidade | Status
 *   | Canal | Logs | Tags | Ações  ·  cartões no celular  ·  a linha abre a
 *   FICHA do contato numa página própria (`/contacts/[id]`), e não num modal.
 *
 * O que é da Doce Lilium e não existe na CarBoss: status CLIENTE (quem comprou),
 * importação de planilha e as ações em lote (lista de disparo, cadência,
 * excluir), que ficam atrás do botão "Selecionar".
 *
 * O status vem de `getResumoContatos()`, contado sobre TODOS os negócios. A
 * tela antiga contava sobre os 100 mais recentes e classificava errado.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Search, X, Tag, Globe, Edit2, Upload, CheckSquare, Square, Trash2, ChevronDown, Check, Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { AppLayout } from '@/components/AppLayout'
import { useContacts, useDeleteContacts } from '@/hooks/useContacts'
import * as crmActions from '@/app/actions/crm'
import { nomeDeExibicao, iniciais, telefoneDeExibicao, temNome } from '@/lib/contato-exibicao'
import { useCategories } from '@/lib/categories'
import { confirmar } from '@/components/ui/ConfirmSheet'
import { ImportarContatos } from '@/components/ui/ImportarContatos'
import { MobileActionSelect } from '@/components/ui/MobileActionSelect'
import { useIsMobile } from '@/hooks/useIsMobile'
import { ContatoModal } from '@/components/contatos/ContatoModal'
import { statusDoContato, COR_STATUS, type StatusContato } from '@/lib/contato-status'

type Resumo = Awaited<ReturnType<typeof crmActions.getResumoContatos>>

const POR_PAGINA = 50

/** Lista suspensa com várias escolhas — o `CustomMultiSelect` da CarBoss. */
function MultiSelecao({
  opcoes, escolhidas, aoMudar, vazio,
}: { opcoes: string[]; escolhidas: string[]; aoMudar: (v: string[]) => void; vazio: string }) {
  const [aberto, setAberto] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const rotulo = escolhidas.length === 0 ? vazio : escolhidas.length === 1 ? escolhidas[0] : `${escolhidas.length} selecionadas`
  return (
    <div ref={ref} className="relative flex-1">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className={`flex h-10 w-full items-center justify-between rounded-xl border bg-card px-3 text-sm ${
          escolhidas.length ? 'border-primary/60 text-foreground' : 'border-border text-muted-foreground'
        }`}
      >
        <span className="truncate">{rotulo}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${aberto ? 'rotate-180' : ''}`} />
      </button>
      {aberto && (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-xl">
          {escolhidas.length > 0 && (
            <button onClick={() => aoMudar([])} className="w-full rounded-lg px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted">
              Limpar seleção
            </button>
          )}
          {opcoes.map((o) => {
            const on = escolhidas.includes(o)
            return (
              <button
                key={o}
                onClick={() => aoMudar(on ? escolhidas.filter((x) => x !== o) : [...escolhidas, o])}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-muted"
              >
                <span className={`flex h-4 w-4 items-center justify-center rounded border ${on ? 'border-primary bg-primary' : 'border-border'}`}>
                  {on && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                {o}
              </button>
            )
          })}
          {opcoes.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">Nada para escolher.</p>}
        </div>
      )}
    </div>
  )
}

export default function ContactsPage() {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { categories } = useCategories()
  const { contacts, loading, mutate } = useContacts()
  const excluirVarios = useDeleteContacts()

  const [resumo, setResumo] = useState<Resumo>({})
  const [busca, setBusca] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [origens, setOrigens] = useState<string[]>([])
  const [status, setStatus] = useState<'' | StatusContato>('')
  const [pagina, setPagina] = useState(1)
  const [criando, setCriando] = useState(false)
  const [importando, setImportando] = useState(false)

  const [selecionando, setSelecionando] = useState(false)
  const [marcados, setMarcados] = useState<Record<string, boolean>>({})
  const [listas, setListas] = useState<{ id: string; nomeLista: string }[]>([])
  const [cadencias, setCadencias] = useState<{ id: string; nome: string }[]>([])
  const [listaAlvo, setListaAlvo] = useState('')
  const [cadenciaAlvo, setCadenciaAlvo] = useState('')

  // Links antigos (`/contacts?id=` e `?contactId=`) abrem a ficha nova.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const id = q.get('id') || q.get('contactId')
    if (id) router.replace(`/contacts/${id}`)
  }, [router])

  useEffect(() => {
    const carregar = () => { crmActions.getResumoContatos().then(setResumo).catch(() => undefined) }
    carregar()
    window.addEventListener('crm-deals-updated', carregar)
    window.addEventListener('crm-contacts-updated', carregar)
    const novo = () => setCriando(true)
    window.addEventListener('trigger-add-contact', novo)
    return () => {
      window.removeEventListener('crm-deals-updated', carregar)
      window.removeEventListener('crm-contacts-updated', carregar)
      window.removeEventListener('trigger-add-contact', novo)
    }
  }, [])

  useEffect(() => {
    if (!selecionando || listas.length || cadencias.length) return
    Promise.all([crmActions.getListasDisparo(), crmActions.getCadencias()])
      .then(([l, c]) => { setListas(l as never); setCadencias(c as never) })
      .catch(() => undefined)
  }, [selecionando, listas.length, cadencias.length])

  // Filtro novo volta para a primeira página — no ato, e não num efeito depois.
  const filtrar = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPagina(1) }

  const comStatus = useMemo(
    () => contacts.map((c) => ({ c, st: statusDoContato(resumo[c.id]) })),
    [contacts, resumo],
  )

  const metricas = useMemo(() => {
    const m = { total: comStatus.length, LEAD: 0, CLIENTE: 0, RECUPERAR: 0, PERDIDO: 0 }
    for (const { st } of comStatus) m[st]++
    return m
  }, [comStatus])

  const origensDisponiveis = useMemo(
    () => [...new Set([...categories.origins, ...contacts.map((c) => c.derivedOrigem).filter(Boolean)])].sort(),
    [categories.origins, contacts],
  )
  const tagsDisponiveis = useMemo(
    () => [...new Set([...categories.tags.map((t) => t.label), ...contacts.flatMap((c) => c.tags ?? [])])].sort(),
    [categories.tags, contacts],
  )

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const qDigitos = q.replace(/\D/g, '')
    return comStatus.filter(({ c, st }) => {
      if (status && st !== status) return false
      if (tags.length && !tags.some((t) => c.tags?.includes(t))) return false
      if (origens.length && !origens.includes(c.derivedOrigem)) return false
      if (!q) return true
      return (
        `${c.nome ?? ''} ${c.sobrenome ?? ''}`.toLowerCase().includes(q) ||
        (c.email ?? '').toLowerCase().includes(q) ||
        (qDigitos.length >= 3 && (c.telefone ?? '').includes(qDigitos))
      )
    })
  }, [comStatus, busca, tags, origens, status])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const visiveis = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const idsMarcados = Object.keys(marcados).filter((id) => marcados[id])

  const abrir = (id: string) => router.push(`/contacts/${id}`)
  const alternar = (id: string) => setMarcados((m) => ({ ...m, [id]: !m[id] }))
  const todosMarcados = visiveis.length > 0 && visiveis.every(({ c }) => marcados[c.id])
  const alternarTodos = () =>
    setMarcados((m) => {
      const n = { ...m }
      for (const { c } of visiveis) n[c.id] = !todosMarcados
      return n
    })
  const sairDaSelecao = () => { setMarcados({}); setSelecionando(false) }

  async function excluirMarcados() {
    if (!idsMarcados.length) return
    const ok = await confirmar({
      titulo: `Excluir ${idsMarcados.length} ${idsMarcados.length === 1 ? 'contato' : 'contatos'} para sempre?`,
      descricao: 'Os negócios e o histórico de cada um vão junto. Não dá para desfazer.',
      confirmar: 'Excluir',
    })
    if (!ok) return
    try {
      await excluirVarios.execute(idsMarcados)
      toast.success(`${idsMarcados.length} contatos excluídos`)
      sairDaSelecao()
    } catch (e) {
      toast.error('Erro ao excluir: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function adicionarALista() {
    if (!listaAlvo || !idsMarcados.length) return
    try {
      const n = await crmActions.addLeadsToListaDisparo(listaAlvo, idsMarcados, 'contact')
      toast.success(`${n} contatos adicionados à lista de disparo`)
      sairDaSelecao()
      setListaAlvo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar à lista')
    }
  }

  async function adicionarACadencia() {
    if (!cadenciaAlvo || !idsMarcados.length) return
    try {
      const n = await crmActions.addLeadsToCadence(cadenciaAlvo, idsMarcados, 'contact')
      toast.success(`${n} contatos adicionados à cadência`)
      sairDaSelecao()
      setCadenciaAlvo('')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erro ao adicionar à cadência')
    }
  }

  const cartoes: { chave: '' | StatusContato; rotulo: string; valor: number; cor: string; ativa: string }[] = [
    { chave: '', rotulo: 'Total', valor: metricas.total, cor: 'text-foreground', ativa: 'border-foreground/40' },
    { chave: 'LEAD', rotulo: 'Leads', valor: metricas.LEAD, cor: 'text-success', ativa: 'border-success/60' },
    { chave: 'CLIENTE', rotulo: 'Clientes', valor: metricas.CLIENTE, cor: 'text-primary', ativa: 'border-primary/60' },
    { chave: 'RECUPERAR', rotulo: 'Recuperar', valor: metricas.RECUPERAR, cor: 'text-warning', ativa: 'border-warning/60' },
    { chave: 'PERDIDO', rotulo: 'Perdidos', valor: metricas.PERDIDO, cor: 'text-destructive', ativa: 'border-destructive/60' },
  ]

  const Avatar = ({ c, grande }: { c: (typeof contacts)[number]; grande?: boolean }) => (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl bg-brand-ink font-bold text-white ${
        grande ? 'h-11 w-11 text-base' : 'h-11 w-11 text-sm'
      }`}
    >
      {iniciais(c)}
    </div>
  )

  const Selo = ({ st }: { st: StatusContato }) => (
    <span className={`inline-block rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${COR_STATUS[st].texto} ${COR_STATUS[st].borda} ${COR_STATUS[st].fundo}`}>
      {st}
    </span>
  )

  return (
    <AppLayout>
      <div className="h-full overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6">
          {/* ── Cabeçalho ─────────────────────────────────────────────── */}
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">Contatos</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Base unificada de leads e clientes da Doce Lilium</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => (selecionando ? sairDaSelecao() : setSelecionando(true))}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold ${
                  selecionando ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                <CheckSquare className="h-4 w-4" /> <span className="max-sm:hidden">Selecionar</span>
              </button>
              <button
                onClick={() => setImportando(true)}
                className="flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
              >
                <Upload className="h-4 w-4" /> <span className="max-sm:hidden">Importar</span>
              </button>
              <button
                onClick={() => setCriando(true)}
                className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-sm active:scale-95"
              >
                <Plus className="h-4 w-4" /> Novo contato
              </button>
            </div>
          </div>

          {/* ── Cartões de status ─────────────────────────────────────── */}
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cartoes.map((k) => {
              const ativo = status === k.chave
              return (
                <button
                  key={k.rotulo}
                  onClick={() => filtrar(setStatus)(k.chave)}
                  className={`rounded-2xl border bg-card px-3 py-4 text-center transition-all ${
                    ativo ? `${k.ativa} opacity-100 shadow-sm` : 'border-border-subtle opacity-70 hover:opacity-100'
                  } ${k.chave === '' ? 'max-sm:col-span-2' : ''}`}
                >
                  <div className={`mb-1 text-[11px] font-extrabold uppercase tracking-widest ${k.chave ? k.cor : 'text-muted-foreground'}`}>{k.rotulo}</div>
                  <div className={`text-2xl font-extrabold ${k.cor}`}>{k.valor}</div>
                </button>
              )
            })}
          </div>

          {/* ── Título da lista, busca e filtros ─────────────────────── */}
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xl font-extrabold text-foreground">Contatos</span>
            <span className="rounded-full border border-border-subtle bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground">
              {filtrados.length}
            </span>
          </div>

          <div className="relative mb-4">
            <Search className="absolute left-4 top-3 h-4 w-4 text-muted-foreground" />
            <input
              className="h-10 w-full rounded-xl border border-border bg-card pl-11 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              placeholder="Buscar por nome, telefone ou e-mail..."
              value={busca}
              onChange={(e) => filtrar(setBusca)(e.target.value)}
            />
            {busca && (
              <button onClick={() => filtrar(setBusca)('')} className="absolute right-3 top-2.5 rounded-full p-1 hover:bg-muted" aria-label="Limpar busca">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="mb-6 flex flex-col gap-3 sm:flex-row">
            <div className="flex flex-1 items-center gap-2">
              <span className="flex w-[78px] shrink-0 items-center text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                <Tag className="mr-1 h-3.5 w-3.5" /> Tags:
              </span>
              <MultiSelecao opcoes={tagsDisponiveis} escolhidas={tags} aoMudar={filtrar(setTags)} vazio="Todas as tags" />
            </div>
            <div className="flex flex-1 items-center gap-2">
              <span className="flex w-[78px] shrink-0 items-center text-[11px] font-extrabold uppercase tracking-widest text-muted-foreground">
                <Globe className="mr-1 h-3.5 w-3.5" /> Origem:
              </span>
              <MultiSelecao opcoes={origensDisponiveis} escolhidas={origens} aoMudar={filtrar(setOrigens)} vazio="Todas as origens" />
            </div>
          </div>

          {/* ── Lista ─────────────────────────────────────────────────── */}
          {loading && contacts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground">Carregando contatos...</span>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center text-muted-foreground">
              <Users className="mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm font-semibold">Nenhum contato encontrado com esses filtros.</p>
            </div>
          ) : isMobile ? (
            <div className="mb-6 flex flex-col gap-3">
              {visiveis.map(({ c, st }) => (
                <div
                  key={c.id}
                  onClick={() => (selecionando ? alternar(c.id) : abrir(c.id))}
                  className={`flex cursor-pointer items-center justify-between rounded-2xl border bg-card p-4 ${
                    marcados[c.id] ? 'border-primary' : 'border-border-subtle'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {selecionando && (marcados[c.id] ? <CheckSquare className="h-5 w-5 shrink-0 text-primary" /> : <Square className="h-5 w-5 shrink-0 text-muted-foreground" />)}
                    <Avatar c={c} grande />
                    <div className="flex min-w-0 flex-col">
                      <span className={`truncate text-[15px] font-extrabold ${temNome(c) ? 'text-foreground' : 'italic text-muted-foreground'}`}>{nomeDeExibicao(c)}</span>
                      <span className="truncate text-xs font-semibold text-muted-foreground">{telefoneDeExibicao(c.telefone) || c.email || 'Sem contato'}</span>
                    </div>
                  </div>
                  <div className="pl-3"><Selo st={st} /></div>
                </div>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto pb-6">
              <div className="flex min-w-[960px] flex-col">
                <div className={`grid ${selecionando ? 'grid-cols-[28px_2.5fr_1fr_1.5fr_1fr_1.5fr_auto]' : 'grid-cols-[2.5fr_1fr_1.5fr_1fr_1.5fr_auto]'} gap-4 border-b border-border-subtle px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground`}>
                  {selecionando && (
                    <button onClick={alternarTodos} aria-label="Marcar todos">
                      {todosMarcados ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4" />}
                    </button>
                  )}
                  <div>Identidade</div>
                  <div>Status</div>
                  <div>Canal</div>
                  <div>Logs</div>
                  <div>Tags</div>
                  <div className="text-right">Ações</div>
                </div>

                <div className="mt-3 flex flex-col gap-2">
                  {visiveis.map(({ c, st }) => {
                    const origem = c.derivedOrigem || ''
                    const ultimo = resumo[c.id]?.ultimoNegocio || (c as { updatedAt?: string }).updatedAt || c.createdAt
                    return (
                      <div
                        key={c.id}
                        onClick={() => (selecionando ? alternar(c.id) : abrir(c.id))}
                        className={`grid ${selecionando ? 'grid-cols-[28px_2.5fr_1fr_1.5fr_1fr_1.5fr_auto]' : 'grid-cols-[2.5fr_1fr_1.5fr_1fr_1.5fr_auto]'} cursor-pointer items-center gap-4 rounded-2xl border bg-card px-5 py-3 transition-all hover:border-primary/40 hover:shadow-sm ${
                          marcados[c.id] ? 'border-primary' : 'border-border-subtle'
                        }`}
                      >
                        {selecionando && (marcados[c.id] ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-muted-foreground" />)}

                        <div className="flex min-w-0 items-center gap-3">
                          <Avatar c={c} />
                          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                            <span className={`truncate text-sm font-bold ${temNome(c) ? 'text-foreground' : 'italic text-muted-foreground'}`}>{nomeDeExibicao(c)}</span>
                            <span className="truncate text-xs text-muted-foreground">{telefoneDeExibicao(c.telefone) || c.email || 'Sem contato'}</span>
                          </div>
                        </div>

                        <div><Selo st={st} /></div>

                        <div className="flex min-w-0 items-center gap-1.5">
                          <div className="rounded-md border border-border-subtle bg-background px-2 py-1">
                            <span className="text-[11px] font-extrabold text-foreground">{origem ? origem.charAt(0).toUpperCase() : '-'}</span>
                          </div>
                          <span className="truncate text-xs font-bold uppercase text-muted-foreground">{origem || 'Direto'}</span>
                        </div>

                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs font-semibold text-muted-foreground">Criado em:</span>
                          <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString('pt-BR')}</span>
                          {ultimo && ultimo !== c.createdAt && (
                            <span className="text-[11px] text-muted-foreground/90">Mexido {new Date(ultimo).toLocaleDateString('pt-BR')}</span>
                          )}
                        </div>

                        <div className="flex flex-wrap gap-1">
                          {(c.tags ?? []).length ? (
                            (c.tags ?? []).slice(0, 4).map((t) => (
                              <span key={t} className="rounded-xl border border-border-subtle bg-background px-2 py-0.5 text-[11px] font-bold text-foreground">{t}</span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground">-</span>
                          )}
                          {(c.tags ?? []).length > 4 && <span className="text-[11px] text-muted-foreground">+{(c.tags ?? []).length - 4}</span>}
                        </div>

                        <div className="flex justify-end">
                          <button
                            onClick={(e) => { e.stopPropagation(); abrir(c.id) }}
                            className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                            title="Abrir ficha"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {totalPaginas > 1 && (
            <div className="mb-24 flex items-center justify-between rounded-2xl border border-border-subtle bg-card p-3">
              <button disabled={pagina === 1} onClick={() => setPagina((p) => p - 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                Anterior
              </button>
              <span className="text-xs text-muted-foreground">Página {pagina} de {totalPaginas}</span>
              <button disabled={pagina === totalPaginas} onClick={() => setPagina((p) => p + 1)} className="rounded-lg bg-muted px-3 py-1.5 text-xs font-semibold disabled:opacity-40">
                Próxima
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Ações em lote ──────────────────────────────────────────────── */}
      {selecionando && idsMarcados.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-40 flex w-[95%] max-w-4xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-2xl max-md:bottom-20">
          <p className="text-sm font-bold text-foreground">{idsMarcados.length} selecionados</p>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MobileActionSelect
              label="Lista de disparo"
              value={listaAlvo}
              onChange={setListaAlvo}
              options={listas.map((l) => ({ value: l.id, label: l.nomeLista }))}
              placeholder="Lista de disparo..."
              className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
            <button onClick={adicionarALista} disabled={!listaAlvo} className="rounded-xl bg-success px-3 py-1.5 font-semibold text-white disabled:opacity-40">Adicionar</button>
            <MobileActionSelect
              label="Cadência"
              value={cadenciaAlvo}
              onChange={setCadenciaAlvo}
              options={cadencias.map((c) => ({ value: c.id, label: c.nome }))}
              placeholder="Cadência..."
              className="rounded-xl border border-border bg-card px-2.5 py-1.5 text-xs text-foreground"
            />
            <button onClick={adicionarACadencia} disabled={!cadenciaAlvo} className="rounded-xl bg-primary px-3 py-1.5 font-semibold text-primary-foreground disabled:opacity-40">Adicionar</button>
            <button onClick={excluirMarcados} className="flex items-center gap-1 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-1.5 font-bold text-destructive">
              <Trash2 className="h-3.5 w-3.5" /> Excluir
            </button>
            <button onClick={sairDaSelecao} className="px-1 font-bold text-muted-foreground hover:text-foreground">Limpar</button>
          </div>
        </div>
      )}

      {criando && (
        <ContatoModal
          onClose={() => setCriando(false)}
          onSaved={(id) => { setCriando(false); mutate(); router.push(`/contacts/${id}`) }}
        />
      )}

      <ImportarContatos aberto={importando} aoFechar={() => setImportando(false)} aoConcluir={() => { void mutate() }} />
    </AppLayout>
  )
}
