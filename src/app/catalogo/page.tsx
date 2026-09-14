'use client'

/**
 * CATÁLOGO — a vitrine da loja vista de dentro do CRM.
 *
 * É o mesmo catálogo que a IA do WhatsApp consulta (lib/nuvemshop/catalogo.ts):
 * se uma peça não aparece aqui, a IA também não oferece; se aparece "esgotada",
 * é assim que ela vai dizer. A tela serve para a equipe conferir isso antes de
 * uma cliente perguntar — não para editar produto, que continua sendo na loja.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Loader2, RefreshCw, Search, ShoppingBag } from 'lucide-react'
import { AppLayout } from '@/components/AppLayout'
import { getCatalogo, type EstadoCatalogo } from '@/app/actions/catalogo'
import type { ProdutoCatalogo } from '@/lib/nuvemshop/catalogo'

const brl = (v: number | null) => (v === null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dobrar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function Cartao({ p }: { p: ProdutoCatalogo }) {
  const [foto, setFoto] = useState(0)
  return (
    <article className="rounded-2xl border border-border bg-card overflow-hidden flex flex-col">
      <div className="relative aspect-[3/4] bg-muted">
        {p.fotos[foto] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.fotos[foto]} alt={p.nome} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">sem foto</div>
        )}
        {!p.disponivel && (
          <span className="absolute top-2 left-2 rounded-full bg-background/90 px-2.5 py-0.5 text-xs font-medium">Esgotada</span>
        )}
        {p.fotos.length > 1 && (
          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1.5">
            {p.fotos.slice(0, 6).map((_, i) => (
              <button
                key={i}
                onClick={() => setFoto(i)}
                aria-label={`Foto ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === foto ? 'w-5 bg-primary' : 'w-1.5 bg-background/80'}`}
              />
            ))}
          </div>
        )}
      </div>
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium leading-tight">{p.nome}</h3>
          <a href={p.link} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Abrir na loja">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
        <div className="text-sm">
          {p.precoCheio && <span className="text-muted-foreground line-through mr-2">{brl(p.precoCheio)}</span>}
          <span className="font-semibold">{brl(p.preco)}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {p.tamanhos.map((t) => (
            <span
              key={t.nome}
              className={`rounded-md border px-1.5 py-0.5 text-xs ${t.disponivel ? 'border-border' : 'border-dashed text-muted-foreground line-through'}`}
            >
              {t.nome}
            </span>
          ))}
        </div>
        {p.categorias.length > 0 && <p className="text-xs text-muted-foreground mt-auto">{p.categorias.join(' · ')}</p>}
      </div>
    </article>
  )
}

export default function CatalogoPage() {
  const [estado, setEstado] = useState<EstadoCatalogo | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  const [categoria, setCategoria] = useState('')

  const carregar = useCallback(async (forcar = false) => {
    setCarregando(true)
    setEstado(await getCatalogo(forcar))
    setCarregando(false)
  }, [])

  useEffect(() => {
    let vivo = true
    getCatalogo().then((e) => {
      if (!vivo) return
      setEstado(e)
      setCarregando(false)
    })
    return () => {
      vivo = false
    }
  }, [])

  const produtos = useMemo(() => (estado?.ok ? estado.produtos : []), [estado])
  const categorias = useMemo(() => [...new Set(produtos.flatMap((p) => p.categorias))].sort(), [produtos])
  const visiveis = useMemo(() => {
    const q = dobrar(busca.trim())
    return produtos.filter(
      (p) => (!categoria || p.categorias.includes(categoria)) && (!q || dobrar(`${p.nome} ${p.categorias.join(' ')}`).includes(q)),
    )
  }, [produtos, busca, categoria])

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <ShoppingBag className="w-5 h-5" /> Catálogo da loja
            </h1>
            <p className="text-sm text-muted-foreground">
              O que a IA do WhatsApp enxerga na Nuvemshop: peças publicadas, fotos, tamanhos com estoque e preço.
            </p>
          </div>
          <button
            onClick={() => carregar(true)}
            disabled={carregando}
            className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
          >
            {carregando ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Atualizar da loja
          </button>
        </header>

        <div className="flex flex-col sm:flex-row gap-2">
          <label className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar peça"
              className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm"
            />
          </label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {estado && !estado.ok && (
          <div className="rounded-xl border border-border p-4 text-sm">A loja não respondeu: {estado.erro}</div>
        )}

        {carregando && !produtos.length ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border overflow-hidden">
                <div className="aspect-[3/4] bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-3/4 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-1/3 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              {visiveis.length} de {produtos.length} peças · {produtos.filter((p) => p.disponivel).length} com estoque
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {visiveis.map((p) => (
                <Cartao key={p.id} p={p} />
              ))}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  )
}
