import { useState, useEffect, useCallback } from 'react'
import { classifyContact } from '@/lib/lead-classification'
import * as crmActions from '@/app/actions/crm'
import type { ContactInput } from '@/app/actions/crm'
import type { MockContact, MockDeal } from '@/lib/mockData'

// SerializedContact is what comes back from the server actions
// (same shape as MockContact, produced by serializeContact in crm.ts)
type SerializedContact = MockContact & { dataNascimento?: string; origem?: string; updatedAt?: string }
type ClassifiedContact = ReturnType<typeof classifyContact>

// ─── Helpers ─────────────────────────────────────────────────────────────────

// The server's getAllDeals returns Prisma Deal objects (with nested contact, stage)
// We only need the fields used by classifyContact / contacts page.
function toDealForClassification(d: {
  id: string
  contactId: string
  status: string
  titulo: string
  valorEstimado: number
  prioridade?: string
  utmSource?: string | null
  utmCampaign?: string | null
  createdAt: Date | string
  updatedAt: Date | string
  fechadoEm?: Date | string | null
}): MockDeal {
  return {
    id: d.id,
    contactId: d.contactId,
    status: d.status as MockDeal['status'],
    titulo: d.titulo,
    valorEstimado: d.valorEstimado,
    prioridade: (d.prioridade ?? 'MEDIA') as MockDeal['prioridade'],
    pipelineId: '',
    stageId: '',
    userId: '',
    utmSource: d.utmSource ?? undefined,
    utmCampaign: d.utmCampaign ?? undefined,
    aiScore: 0,
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : d.createdAt.toISOString(),
    updatedAt: typeof d.updatedAt === 'string' ? d.updatedAt : d.updatedAt.toISOString(),
  }
}

// ─── useContacts ─────────────────────────────────────────────────────────────

export function useContacts() {
  const [contacts, setContacts] = useState<ClassifiedContact[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      const [rawContacts, rawDeals] = await Promise.all([
        crmActions.getContacts(),
        crmActions.getAllDeals(),
      ])

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allDeals = (rawDeals as any[]).map(toDealForClassification)

      const classified = (rawContacts as SerializedContact[]).map((c) => {
        const contactDeals = allDeals.filter((d) => d.contactId === c.id)
        return classifyContact(c as unknown as MockContact, contactDeals)
      })

      setContacts(classified)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-contacts-updated', handle)
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-contacts-updated', handle)
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { contacts, loading, error, mutate }
}

// ─── useContact (single) ──────────────────────────────────────────────────────

export function useContact(id: string | null) {
  const [contact, setContact] = useState<ClassifiedContact | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!id) { setContact(null); return }
    try {
      const [rawContacts, rawDeals] = await Promise.all([
        crmActions.getContacts(),
        crmActions.getAllDeals(),
      ])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allDeals = (rawDeals as any[]).map(toDealForClassification)
      const found = (rawContacts as SerializedContact[]).find((c) => c.id === id)
      if (found) {
        const contactDeals = allDeals.filter((d) => d.contactId === id)
        setContact(classifyContact(found as unknown as MockContact, contactDeals))
      } else {
        setContact(null)
      }
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [id])

  const mutate = useCallback(() => { setLoading(true); load() }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-contacts-updated', handle)
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-contacts-updated', handle)
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { contact, loading, error, mutate }
}

// ─── useContactStats ──────────────────────────────────────────────────────────

export function useContactStats(contactId: string | null) {
  const [stats, setStats] = useState<{
    wonDealsCount: number
    totalValue: number
    dealsCount: number
    activitiesCount: number
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!contactId) { setStats(null); return }
    try {
      const data = await crmActions.getContactStats(contactId)
      setStats(data)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [contactId])

  const mutate = useCallback(() => { setLoading(true); load() }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-contacts-updated', handle)
      window.addEventListener('crm-deals-updated', handle)
      window.addEventListener('crm-activities-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-contacts-updated', handle)
        window.removeEventListener('crm-deals-updated', handle)
        window.removeEventListener('crm-activities-updated', handle)
      }
    }
  }, [load])

  return { stats, loading, error, mutate }
}

// ─── useCreateContact ─────────────────────────────────────────────────────────

export function useCreateContact() {
  const [loading, setLoading] = useState(false)
  const execute = async (data: ContactInput) => {
    try {
      setLoading(true)
      const contact = await crmActions.createContact(data)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
      return contact
    } finally {
      setLoading(false)
    }
  }
  return { execute, loading }
}

// ─── useUpdateContact ─────────────────────────────────────────────────────────

export function useUpdateContact() {
  const [loading, setLoading] = useState(false)
  const execute = async (id: string, data: Partial<ContactInput>) => {
    try {
      setLoading(true)
      const contact = await crmActions.updateContact(id, data)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
      return contact
    } finally {
      setLoading(false)
    }
  }
  return { execute, loading }
}

// ─── useDeleteContact ─────────────────────────────────────────────────────────

export function useDeleteContact() {
  const [loading, setLoading] = useState(false)
  const execute = async (id: string) => {
    try {
      setLoading(true)
      await crmActions.deleteContact(id)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-contacts-updated'))
        window.dispatchEvent(new Event('crm-deals-updated'))
        window.dispatchEvent(new Event('crm-activities-updated'))
      }
    } finally {
      setLoading(false)
    }
  }
  return { execute, loading }
}

// ─── useDeleteContacts ────────────────────────────────────────────────────────

export function useDeleteContacts() {
  const [loading, setLoading] = useState(false)
  const execute = async (ids: string[]) => {
    try {
      setLoading(true)
      await crmActions.deleteContacts(ids)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-contacts-updated'))
        window.dispatchEvent(new Event('crm-deals-updated'))
        window.dispatchEvent(new Event('crm-activities-updated'))
      }
    } finally {
      setLoading(false)
    }
  }
  return { execute, loading }
}

// ─── useMergeContacts ─────────────────────────────────────────────────────────

export function useMergeContacts() {
  const [loading, setLoading] = useState(false)
  const execute = async (primaryId: string, secondaryId: string) => {
    try {
      setLoading(true)
      const merged = await crmActions.mergeContacts(primaryId, secondaryId)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-contacts-updated'))
        window.dispatchEvent(new Event('crm-deals-updated'))
        window.dispatchEvent(new Event('crm-activities-updated'))
      }
      return merged
    } finally {
      setLoading(false)
    }
  }
  return { execute, loading }
}
