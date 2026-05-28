import { useState, useEffect, useCallback } from 'react'
import * as crmActions from '@/app/actions/crm'

type StageRow = {
  stageId: string
  stageNome: string
  cor: string
  probabilidade: number
  countCurrent: number
  valueCurrent: number
  entradas: number
  permanenciaMediaHoras: number
}

type SellerRow = {
  sellerId: string
  sellerNome: string
  leadsAtribuidos: number
  dealsGanhos: number
  valorGanho: number
  dealsPerdidos: number
  conversao: number
  movimentacoesEtapa: number
}

type TimelineRow = {
  data: string
  criados: number
  ganhos: number
  perdidos: number
}

type AssignmentRow = {
  pipelineId: string
  pipelineNome: string
  avgAssignmentHours: number
  totalDeals: number
  distribuicaoPercent: number
}

// Helper to filter dates
function isWithinRange(dateStr: string | Date, range: { start?: Date | null; end?: Date | null }) {
  const d = new Date(dateStr)
  if (range.start && d < range.start) return false
  if (range.end && d > range.end) return false
  return true
}

// Helper to filter sellers
function matchesOwners(ownerId: string | null | undefined, ownerIds?: string[] | null) {
  if (!ownerIds || ownerIds.length === 0) return true
  if (!ownerId) return false
  return ownerIds.includes(ownerId)
}

export function useReportOverview(
  pipelineId: string | null,
  range: { start?: Date | null; end?: Date | null },
  ownerIds: string[] | null
) {
  const [data, setData] = useState({
    created: 0,
    won: 0,
    lost: 0,
    receitaEmAberto: 0,
    ticketMedio: 0,
    taxaConversao: 0,
    avgAssignmentHours: 0
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!pipelineId) return
    try {
      const deals = await crmActions.getDeals(pipelineId)

      const filtered = deals.filter(d =>
        isWithinRange(d.createdAt, range) &&
        matchesOwners(d.ownerUserId, ownerIds)
      )

      let created = 0
      let won = 0
      let lost = 0
      let wonSum = 0
      let openSum = 0
      let assignmentSum = 0
      let assignmentCount = 0

      filtered.forEach(d => {
        created++
        if (d.status === 'WON') {
          won++
          wonSum += d.valorEstimado
        } else if (d.status === 'LOST') {
          lost++
        } else if (d.status === 'OPEN') {
          openSum += d.valorEstimado
        }

        if (d.ownerUserId) {
          const createdTime = new Date(d.createdAt).getTime()
          const dExt = d as typeof d & { ownerAssignedAt?: string }
          const assignedTime: number = dExt.ownerAssignedAt
            ? new Date(dExt.ownerAssignedAt).getTime()
            : createdTime + 10 * 60 * 1000

          assignmentSum += Math.max(0, assignedTime - createdTime)
          assignmentCount++
        }
      })

      const ticketMedio = won > 0 ? wonSum / won : 0
      const totalClosed = won + lost
      const taxaConversao = totalClosed > 0 ? (won / totalClosed) * 100 : 0
      const avgAssignmentHours = assignmentCount > 0 ? (assignmentSum / assignmentCount) / (1000 * 60 * 60) : 0

      setData({ created, won, lost, receitaEmAberto: openSum, ticketMedio, taxaConversao, avgAssignmentHours })
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [pipelineId, range, ownerIds])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { data, loading, error, mutate }
}

export function useReportStageFunnel(
  pipelineId: string | null,
  range: { start?: Date | null; end?: Date | null },
  ownerIds: string[] | null
) {
  const [data, setData] = useState<StageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!pipelineId) return
    try {
      const [stages, deals, history] = await Promise.all([
        crmActions.getStages(pipelineId),
        crmActions.getDeals(pipelineId),
        crmActions.getAllHistory()
      ])

      const filteredDeals = deals.filter(d =>
        isWithinRange(d.createdAt, range) &&
        matchesOwners(d.ownerUserId, ownerIds)
      )
      const dealIdsSet = new Set(filteredDeals.map(d => d.id))

      const filteredHistory = history.filter(h =>
        dealIdsSet.has(h.dealId) &&
        isWithinRange(h.mudouEm, range)
      )

      type HistoryChunk = typeof filteredHistory
      const historyChunks: HistoryChunk[] = []
      for (let i = 0; i < filteredHistory.length; i += 200) {
        historyChunks.push(filteredHistory.slice(i, i + 200))
      }

      const dealHistoryMap: Record<string, typeof filteredHistory> = {}
      historyChunks.flat().forEach(h => {
        if (!dealHistoryMap[h.dealId]) dealHistoryMap[h.dealId] = []
        dealHistoryMap[h.dealId].push(h)
      })

      Object.keys(dealHistoryMap).forEach(dealId => {
        dealHistoryMap[dealId].sort((a, b) => new Date(a.mudouEm).getTime() - new Date(b.mudouEm).getTime())
      })

      const stageDurations: Record<string, { totalMs: number; count: number }> = {}
      stages.forEach(s => { stageDurations[s.id] = { totalMs: 0, count: 0 } })

      const nowTime = Date.now()

      filteredDeals.forEach(deal => {
        const dealHistory = dealHistoryMap[deal.id] || []
        const createdTime = new Date(deal.createdAt).getTime()

        if (dealHistory.length === 0) {
          const duration = nowTime - createdTime
          if (stageDurations[deal.stageId]) {
            stageDurations[deal.stageId].totalMs += duration
            stageDurations[deal.stageId].count += 1
          }
        } else {
          let currentStage = stages[0]?.id ?? ''
          let stageEnterTime = createdTime

          dealHistory.forEach(h => {
            const transitionTime = new Date(h.mudouEm).getTime()
            const duration = Math.max(0, transitionTime - stageEnterTime)

            if (stageDurations[currentStage]) {
              stageDurations[currentStage].totalMs += duration
              stageDurations[currentStage].count += 1
            }

            currentStage = h.paraStageId
            stageEnterTime = transitionTime

            const isClosing = h.fonte === 'fechamento_ganho' || h.fonte === 'fechamento_perdido'
            if (isClosing) currentStage = ''
          })

          if (currentStage && deal.status === 'OPEN') {
            const duration = Math.max(0, nowTime - stageEnterTime)
            if (stageDurations[currentStage]) {
              stageDurations[currentStage].totalMs += duration
              stageDurations[currentStage].count += 1
            }
          }
        }
      })

      const currentDealsGrouped = filteredDeals.filter(d => d.status === 'OPEN')

      const stageData: StageRow[] = stages.map(s => {
        const currentInStage = currentDealsGrouped.filter(d => d.stageId === s.id)
        const countCurrent = currentInStage.length
        const valueCurrent = currentInStage.reduce((sum, d) => sum + d.valorEstimado, 0)
        const entries = filteredHistory.filter(h => h.paraStageId === s.id).length
        const dur = stageDurations[s.id]
        const permanenciaMediaHoras = dur && dur.count > 0 ? (dur.totalMs / dur.count) / (1000 * 60 * 60) : 0

        return { stageId: s.id, stageNome: s.nome, cor: s.cor, probabilidade: s.probabilidade, countCurrent, valueCurrent, entradas: entries, permanenciaMediaHoras }
      })

      setData(stageData)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [pipelineId, range, ownerIds])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { data, loading, error, mutate }
}

export function useReportSellerPerformance(
  pipelineId: string | null,
  range: { start?: Date | null; end?: Date | null },
  ownerIds: string[] | null
) {
  const [data, setData] = useState<SellerRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!pipelineId) return
    try {
      const [deals, history] = await Promise.all([
        crmActions.getDeals(pipelineId),
        crmActions.getAllHistory()
      ])

      const sellersList = [
        { id: 'usr-admin-123', nome: 'Diretor Comercial' },
        { id: 'usr-seller-1', nome: 'Aline Ferreira' },
        { id: 'usr-seller-2', nome: 'Bruno Gomes' }
      ]

      const filteredSellers = sellersList.filter(s =>
        !ownerIds || ownerIds.length === 0 || ownerIds.includes(s.id)
      )

      const result: SellerRow[] = filteredSellers.map(seller => {
        const sellerDeals = deals.filter(d =>
          d.ownerUserId === seller.id &&
          isWithinRange(d.createdAt, range)
        )

        const leadsAtribuidos = sellerDeals.length
        const wonDeals = sellerDeals.filter(d => d.status === 'WON')
        const dealsGanhos = wonDeals.length
        const valorGanho = wonDeals.reduce((sum, d) => sum + d.valorEstimado, 0)
        const dealsPerdidos = sellerDeals.filter(d => d.status === 'LOST').length
        const conversao = leadsAtribuidos > 0 ? (dealsGanhos / leadsAtribuidos) * 100 : 0

        const sellerNames = [seller.nome.toLowerCase(), seller.id]
        const movimentacoesEtapa = history.filter(h => {
          const author = (h.mudouPor || '').toLowerCase()
          return sellerNames.some(name => author.includes(name)) && isWithinRange(h.mudouEm, range)
        }).length

        return { sellerId: seller.id, sellerNome: seller.nome, leadsAtribuidos, dealsGanhos, valorGanho, dealsPerdidos, conversao, movimentacoesEtapa }
      })

      setData(result)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [pipelineId, range, ownerIds])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { data, loading, error, mutate }
}

export function useReportTimeline(
  pipelineId: string | null,
  range: { start?: Date | null; end?: Date | null },
  ownerIds: string[] | null
) {
  const [data, setData] = useState<TimelineRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    if (!pipelineId) return
    try {
      const deals = await crmActions.getDeals(pipelineId)

      const filtered = deals.filter(d =>
        isWithinRange(d.createdAt, range) &&
        matchesOwners(d.ownerUserId, ownerIds)
      )

      const dailyMap: Record<string, { criados: number; ganhos: number; perdidos: number }> = {}

      const start = range.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      const end = range.end || new Date()
      const current = new Date(start)
      while (current <= end) {
        const key = current.toISOString().split('T')[0]
        dailyMap[key] = { criados: 0, ganhos: 0, perdidos: 0 }
        current.setDate(current.getDate() + 1)
      }

      filtered.forEach(d => {
        const dateKey = (d.createdAt as string).split('T')[0]
        if (!dailyMap[dateKey]) dailyMap[dateKey] = { criados: 0, ganhos: 0, perdidos: 0 }
        dailyMap[dateKey].criados++

        if (d.status === 'WON' && d.fechadoEm) {
          const closeKey = (d.fechadoEm as string).split('T')[0]
          if (!dailyMap[closeKey]) dailyMap[closeKey] = { criados: 0, ganhos: 0, perdidos: 0 }
          dailyMap[closeKey].ganhos++
        } else if (d.status === 'LOST' && d.fechadoEm) {
          const closeKey = (d.fechadoEm as string).split('T')[0]
          if (!dailyMap[closeKey]) dailyMap[closeKey] = { criados: 0, ganhos: 0, perdidos: 0 }
          dailyMap[closeKey].perdidos++
        }
      })

      const timelineData = Object.entries(dailyMap)
        .map(([dataStr, counts]) => ({ data: dataStr, ...counts }))
        .sort((a, b) => a.data.localeCompare(b.data))

      setData(timelineData)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [pipelineId, range, ownerIds])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { data, loading, error, mutate }
}

export function useReportAssignmentByPipeline(
  range: { start?: Date | null; end?: Date | null }
) {
  const [data, setData] = useState<AssignmentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async () => {
    try {
      const [pipelines, allDeals] = await Promise.all([
        crmActions.getPipelines(),
        crmActions.getAllDeals()
      ])

      const filteredDeals = allDeals.filter(d => isWithinRange(d.createdAt, range))
      const grandTotalDeals = filteredDeals.length

      const result: AssignmentRow[] = pipelines.map(pipe => {
        const pipeDeals = filteredDeals.filter(d => d.pipelineId === pipe.id)

        let assignmentSum = 0
        let assignmentCount = 0

        pipeDeals.forEach(d => {
          if (d.ownerUserId) {
            const createdTime = new Date(d.createdAt).getTime()
            const dExt = d as typeof d & { ownerAssignedAt?: string }
            const assignedTime: number = dExt.ownerAssignedAt
              ? new Date(dExt.ownerAssignedAt).getTime()
              : createdTime + 10 * 60 * 1000

            assignmentSum += Math.max(0, assignedTime - createdTime)
            assignmentCount++
          }
        })

        const avgAssignmentHours = assignmentCount > 0 ? (assignmentSum / assignmentCount) / (1000 * 60 * 60) : 0
        const totalDeals = pipeDeals.length
        const distribuicaoPercent = grandTotalDeals > 0 ? (totalDeals / grandTotalDeals) * 100 : 0

        return { pipelineId: pipe.id, pipelineNome: pipe.nome, avgAssignmentHours, totalDeals, distribuicaoPercent }
      })

      setData(result)
      setError(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e : new Error(String(e)))
    } finally {
      setLoading(false)
    }
  }, [range])

  const mutate = useCallback(() => {
    setLoading(true)
    load()
  }, [load])

  useEffect(() => {
    Promise.resolve().then(() => load())
    const handle = () => { load() }
    if (typeof window !== 'undefined') {
      window.addEventListener('crm-deals-updated', handle)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('crm-deals-updated', handle)
      }
    }
  }, [load])

  return { data, loading, error, mutate }
}
