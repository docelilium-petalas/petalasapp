'use client'

/**
 * NOVO / EDITAR CONTATO — o modal da CarBoss (`ClientModal`), no vocabulário da loja.
 *
 * Uma tela só, em vez das três abas da versão OCR: nome, telefone, e-mail,
 * origem e tags rápidas logo de cara, que é o que a Marília preenche; CPF,
 * nascimento e endereço ficam num bloco que abre quando precisa.
 *
 * Os campos customizados e as UTMs não são editados aqui, mas também não são
 * apagados: o update manda de volta o que o contato já tinha.
 */

import { useState } from 'react'
import { X, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { ContactInput } from '@/app/actions/crm'
import { useCreateContact, useUpdateContact } from '@/hooks/useContacts'
import { useCategories } from '@/lib/categories'

export type ContatoEditavel = {
  id: string
  nome: string
  sobrenome?: string
  email?: string
  telefone: string
  cidade?: string
  estado?: string
  documento?: string
  dataNascimento?: string
  origem?: string
  consentimentoLgpd?: boolean
  tags?: string[]
  enderecoCompleto?: Record<string, string | undefined>
  camposCustomizados?: Record<string, unknown>
}

/** (62) 99999-9999 enquanto digita; guarda só os dígitos. */
export function mascaraTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '')
  if (d.startsWith('55') && d.length > 11) d = d.slice(2)
  d = d.slice(0, 11)
  if (d.length <= 2) return d ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

const UFS = 'AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO'.split(' ')

export function ContatoModal({
  contato,
  onClose,
  onSaved,
}: {
  contato?: ContatoEditavel | null
  onClose: () => void
  onSaved: (id: string) => void
}) {
  const { categories } = useCategories()
  const criar = useCreateContact()
  const atualizar = useUpdateContact()
  const [salvando, setSalvando] = useState(false)
  const [maisDados, setMaisDados] = useState(
    Boolean(contato?.documento || contato?.dataNascimento || contato?.enderecoCompleto?.rua || contato?.cidade),
  )
  const end = contato?.enderecoCompleto ?? {}
  const [form, setForm] = useState({
    nome: contato?.nome ?? '',
    sobrenome: contato?.sobrenome ?? '',
    telefone: contato?.telefone ? mascaraTelefone(contato.telefone) : '',
    email: contato?.email ?? '',
    origem: contato?.origem ?? '',
    tags: contato?.tags ?? [],
    tagLivre: '',
    documento: contato?.documento ?? '',
    dataNascimento: contato?.dataNascimento?.slice(0, 10) ?? '',
    cidade: contato?.cidade ?? end.cidade ?? '',
    estado: contato?.estado ?? end.estado ?? '',
    cep: end.cep ?? '',
    rua: end.rua ?? '',
    numero: end.numero ?? '',
    complemento: end.complemento ?? '',
    bairro: end.bairro ?? '',
    consentimentoLgpd: contato?.consentimentoLgpd ?? true,
  })
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const alternarTag = (tag: string) =>
    set('tags', form.tags.includes(tag) ? form.tags.filter((t) => t !== tag) : [...form.tags, tag])

  async function salvar() {
    const nome = form.nome.trim()
    const digitos = form.telefone.replace(/\D/g, '')
    if (nome.length < 2) return toast.error('Informe o nome (pelo menos 2 letras).')
    if (digitos.length < 10) return toast.error('Informe o telefone com DDD.')
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) return toast.error('E-mail inválido.')

    const extras = form.tagLivre
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const payload: ContactInput = {
      nome,
      sobrenome: form.sobrenome.trim() || undefined,
      telefone: digitos,
      email: form.email.trim() || undefined,
      origem: form.origem || undefined,
      tags: [...new Set([...form.tags, ...extras])],
      documento: form.documento.trim() || undefined,
      dataNascimento: form.dataNascimento || undefined,
      cidade: form.cidade.trim() || undefined,
      estado: form.estado || undefined,
      consentimentoLgpd: form.consentimentoLgpd,
      enderecoCompleto: {
        cep: form.cep || undefined,
        rua: form.rua || undefined,
        numero: form.numero || undefined,
        complemento: form.complemento || undefined,
        bairro: form.bairro || undefined,
        cidade: form.cidade || undefined,
        estado: form.estado || undefined,
      },
      camposCustomizados: contato?.camposCustomizados ?? {},
    }

    setSalvando(true)
    try {
      if (contato) {
        await atualizar.execute(contato.id, payload)
        toast.success('Contato atualizado')
        onSaved(contato.id)
      } else {
        const novo = await criar.execute(payload)
        toast.success('Contato criado')
        onSaved(novo.id)
      }
    } catch (e) {
      toast.error('Não foi possível salvar: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSalvando(false)
    }
  }

  const campo = 'w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground focus:border-primary focus:outline-none'
  const rotulo = 'mb-1 block text-xs font-semibold text-muted-foreground'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 className="text-lg font-bold text-foreground">{contato ? 'Editar contato' : 'Novo contato'}</h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Nome</label>
              <input className={campo} value={form.nome} onChange={(e) => set('nome', e.target.value)} autoFocus />
            </div>
            <div>
              <label className={rotulo}>Sobrenome</label>
              <input className={campo} value={form.sobrenome} onChange={(e) => set('sobrenome', e.target.value)} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={rotulo}>Telefone</label>
              <input
                className={campo}
                value={form.telefone}
                onChange={(e) => set('telefone', mascaraTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
            <div>
              <label className={rotulo}>E-mail</label>
              <input className={campo} type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
            </div>
          </div>

          <div>
            <label className={rotulo}>Origem / canal</label>
            <select className={campo} value={form.origem} onChange={(e) => set('origem', e.target.value)}>
              <option value="">Desconhecida</option>
              {[...new Set([...categories.origins, ...(form.origem ? [form.origem] : [])])].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={rotulo}>Tags rápidas</label>
            <div className="flex flex-wrap gap-1.5">
              {[...new Set([...categories.tags.map((t) => t.label), ...form.tags])].map((tag) => {
                const ativa = form.tags.includes(tag)
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => alternarTag(tag)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      ativa ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground hover:border-primary/60'
                    }`}
                  >
                    {ativa && <Check className="mr-1 inline h-3 w-3" />}
                    {tag}
                  </button>
                )
              })}
            </div>
            <input
              className={`${campo} mt-2`}
              placeholder="Ou digite novas tags separadas por vírgula..."
              value={form.tagLivre}
              onChange={(e) => set('tagLivre', e.target.value)}
            />
          </div>

          <button
            type="button"
            onClick={() => setMaisDados((v) => !v)}
            className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {maisDados ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} CPF, nascimento e endereço
          </button>

          {maisDados && (
            <div className="space-y-3 rounded-xl border border-border-subtle bg-background/60 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={rotulo}>CPF</label>
                  <input className={campo} value={form.documento} onChange={(e) => set('documento', e.target.value)} />
                </div>
                <div>
                  <label className={rotulo}>Nascimento</label>
                  <input className={campo} type="date" value={form.dataNascimento} onChange={(e) => set('dataNascimento', e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
                <div>
                  <label className={rotulo}>CEP</label>
                  <input className={campo} value={form.cep} onChange={(e) => set('cep', e.target.value)} />
                </div>
                <div>
                  <label className={rotulo}>Rua</label>
                  <input className={campo} value={form.rua} onChange={(e) => set('rua', e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className={rotulo}>Número</label>
                  <input className={campo} value={form.numero} onChange={(e) => set('numero', e.target.value)} />
                </div>
                <div className="sm:col-span-2">
                  <label className={rotulo}>Complemento</label>
                  <input className={campo} value={form.complemento} onChange={(e) => set('complemento', e.target.value)} />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-[2fr_2fr_1fr]">
                <div>
                  <label className={rotulo}>Bairro</label>
                  <input className={campo} value={form.bairro} onChange={(e) => set('bairro', e.target.value)} />
                </div>
                <div>
                  <label className={rotulo}>Cidade</label>
                  <input className={campo} value={form.cidade} onChange={(e) => set('cidade', e.target.value)} />
                </div>
                <div>
                  <label className={rotulo}>UF</label>
                  <select className={campo} value={form.estado} onChange={(e) => set('estado', e.target.value)}>
                    <option value="">—</option>
                    {UFS.map((uf) => (
                      <option key={uf}>{uf}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={form.consentimentoLgpd}
              onChange={(e) => set('consentimentoLgpd', e.target.checked)}
              className="h-4 w-4 accent-[hsl(var(--primary))]"
            />
            Consentiu receber mensagens (LGPD)
          </label>
        </div>

        <div className="flex justify-end gap-2 border-t border-border-subtle px-5 py-3">
          <button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  )
}
