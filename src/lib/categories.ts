'use client'

import { useState, useEffect, useCallback } from 'react'

// ─── Default values ─────────────────────────────────────────────────────────

export const DEFAULT_PRODUCTS = [
  'Sistema/CRM',
  'Automação Comercial',
  'Consultoria',
]

export const DEFAULT_ORIGINS = [
  'Meta Ads',
  'Google Ads',
  'WhatsApp',
  'Indicação',
  'Orgânico',
]

export const DEFAULT_TAGS = [
  { label: 'Decisor', color: '#00E676' },
  { label: 'PME', color: '#60A5FA' },
  { label: 'Corporativo', color: '#a855f7' },
  { label: 'Agronegócio', color: '#FFB300' },
  { label: 'Tecnologia', color: '#FF5722' },
]

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TagCategory {
  label: string
  color: string
}

export interface Categories {
  products: string[]
  origins: string[]
  tags: TagCategory[]
}

const STORAGE_KEY = 'ocr_categories'

function loadFromStorage(): Categories {
  if (typeof window === 'undefined') {
    return { products: DEFAULT_PRODUCTS, origins: DEFAULT_ORIGINS, tags: DEFAULT_TAGS }
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { products: DEFAULT_PRODUCTS, origins: DEFAULT_ORIGINS, tags: DEFAULT_TAGS }
    const parsed = JSON.parse(raw) as Partial<Categories>
    return {
      products: parsed.products?.length ? parsed.products : DEFAULT_PRODUCTS,
      origins: parsed.origins?.length ? parsed.origins : DEFAULT_ORIGINS,
      tags: parsed.tags?.length ? parsed.tags : DEFAULT_TAGS,
    }
  } catch {
    return { products: DEFAULT_PRODUCTS, origins: DEFAULT_ORIGINS, tags: DEFAULT_TAGS }
  }
}

function saveToStorage(data: Categories) {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  window.dispatchEvent(new Event('crm-categories-updated'))
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useCategories() {
  const [categories, setCategories] = useState<Categories>(() => loadFromStorage())

  // Sync across tabs / components
  useEffect(() => {
    const handle = () => setCategories(loadFromStorage())
    window.addEventListener('crm-categories-updated', handle)
    window.addEventListener('storage', handle)
    return () => {
      window.removeEventListener('crm-categories-updated', handle)
      window.removeEventListener('storage', handle)
    }
  }, [])

  const update = useCallback((next: Categories) => {
    setCategories(next)
    saveToStorage(next)
  }, [])

  // ── Products ──
  const addProduct = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategories(prev => {
      if (prev.products.includes(trimmed)) return prev
      const next = { ...prev, products: [...prev.products, trimmed] }
      saveToStorage(next)
      return next
    })
  }, [])

  const removeProduct = useCallback((name: string) => {
    setCategories(prev => {
      const next = { ...prev, products: prev.products.filter(p => p !== name) }
      saveToStorage(next)
      return next
    })
  }, [])

  const renameProduct = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCategories(prev => {
      const next = { ...prev, products: prev.products.map(p => p === oldName ? trimmed : p) }
      saveToStorage(next)
      return next
    })
  }, [])

  // ── Origins ──
  const addOrigin = useCallback((name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    setCategories(prev => {
      if (prev.origins.includes(trimmed)) return prev
      const next = { ...prev, origins: [...prev.origins, trimmed] }
      saveToStorage(next)
      return next
    })
  }, [])

  const removeOrigin = useCallback((name: string) => {
    setCategories(prev => {
      const next = { ...prev, origins: prev.origins.filter(o => o !== name) }
      saveToStorage(next)
      return next
    })
  }, [])

  const renameOrigin = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return
    setCategories(prev => {
      const next = { ...prev, origins: prev.origins.map(o => o === oldName ? trimmed : o) }
      saveToStorage(next)
      return next
    })
  }, [])

  // ── Tags ──
  const addTag = useCallback((tag: TagCategory) => {
    if (!tag.label.trim()) return
    setCategories(prev => {
      if (prev.tags.some(t => t.label === tag.label)) return prev
      const next = { ...prev, tags: [...prev.tags, tag] }
      saveToStorage(next)
      return next
    })
  }, [])

  const removeTag = useCallback((label: string) => {
    setCategories(prev => {
      const next = { ...prev, tags: prev.tags.filter(t => t.label !== label) }
      saveToStorage(next)
      return next
    })
  }, [])

  const updateTag = useCallback((oldLabel: string, tag: TagCategory) => {
    setCategories(prev => {
      const next = { ...prev, tags: prev.tags.map(t => t.label === oldLabel ? tag : t) }
      saveToStorage(next)
      return next
    })
  }, [])

  const resetToDefaults = useCallback(() => {
    const defaults = { products: DEFAULT_PRODUCTS, origins: DEFAULT_ORIGINS, tags: DEFAULT_TAGS }
    update(defaults)
  }, [update])

  return {
    categories,
    // products
    addProduct, removeProduct, renameProduct,
    // origins
    addOrigin, removeOrigin, renameOrigin,
    // tags
    addTag, removeTag, updateTag,
    // reset
    resetToDefaults,
  }
}
