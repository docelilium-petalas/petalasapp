import { useState, useEffect, useCallback, useMemo } from 'react'
import { crmService } from '@/lib/services'
import { MockActivity, MockContact, MockDeal } from '@/lib/mockData'
import { ActivityStatus } from '@prisma/client'

export interface EnrichedActivity extends MockActivity {
  contact?: {
    id: string
    nome: string
    sobrenome?: string
  }
  deal?: {
    id: string
    titulo: string
  }
}

export function useActivities() {
  const [activities, setActivities] = useState<EnrichedActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      const [rawActivities, contacts, deals] = await Promise.all([
        crmService.getActivities(),
        crmService.getContacts(),
        crmService.getAllDeals()
      ])

      const enriched: EnrichedActivity[] = rawActivities.map(act => {
        const contact = contacts.find((c: MockContact) => c.id === act.contactId)
        const deal = deals.find((d: MockDeal) => d.id === act.dealId)
        return {
          ...act,
          contact: contact ? { id: contact.id, nome: contact.nome, sobrenome: contact.sobrenome } : undefined,
          deal: deal ? { id: deal.id, titulo: deal.titulo } : undefined
        }
      })

      enriched.sort((a, b) => {
        if (!a.dueAt) return 1
        if (!b.dueAt) return -1
        return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime()
      })

      setActivities(enriched)
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
      window.addEventListener('crm-activities-updated', handle)
      window.addEventListener('crm-contacts-updated', handle)
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-activities-updated', handle)
        window.removeEventListener('crm-contacts-updated', handle)
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { activities, loading, error, mutate }
}

export function useTodayActivities() {
  const { activities, loading, error, mutate } = useActivities()

  const todayActivities = useMemo(() => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const todayEnd = new Date()
    todayEnd.setHours(23, 59, 59, 999)

    return activities.filter(act => {
      if (act.status !== 'OPEN') return false
      if (!act.dueAt) return false
      const dueTime = new Date(act.dueAt).getTime()
      return dueTime >= todayStart.getTime() && dueTime <= todayEnd.getTime()
    })
  }, [activities])

  return { todayActivities, loading, error, mutate }
}

export function useCreateActivity() {
  const [loading, setLoading] = useState(false)

  const execute = async (data: {
    tipo: string
    titulo: string
    descricao?: string
    dealId?: string
    contactId?: string
    dueAt: string
    status?: ActivityStatus
  }) => {
    try {
      setLoading(true)
      const activity = await crmService.createActivity({
        ...data,
        status: data.status ?? ActivityStatus.OPEN
      })

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-activities-updated'))
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
      return activity
    } finally {
      setLoading(false)
    }
  }

  return { execute, loading }
}

export function useUpdateActivity() {
  const [loading, setLoading] = useState(false)

  const execute = async (id: string, data: Partial<MockActivity>) => {
    try {
      setLoading(true)
      const activity = await crmService.updateActivity(id, data)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-activities-updated'))
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
      return activity
    } finally {
      setLoading(false)
    }
  }

  return { execute, loading }
}

export function useCompleteActivity() {
  const [loading, setLoading] = useState(false)

  const execute = async (id: string) => {
    try {
      setLoading(true)
      const activity = await crmService.updateActivity(id, {
        status: ActivityStatus.DONE,
        doneAt: new Date().toISOString()
      })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-activities-updated'))
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
      return activity
    } finally {
      setLoading(false)
    }
  }

  return { execute, loading }
}

export function useDeleteActivity() {
  const [loading, setLoading] = useState(false)

  const execute = async (id: string) => {
    try {
      setLoading(true)
      await crmService.deleteActivity(id)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('crm-activities-updated'))
        window.dispatchEvent(new Event('crm-contacts-updated'))
      }
    } finally {
      setLoading(false)
    }
  }

  return { execute, loading }
}
