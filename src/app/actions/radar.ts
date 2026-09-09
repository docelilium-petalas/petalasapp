'use server'

import { cookies } from 'next/headers'
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'
import { verifyToken } from '@/lib/auth'
import { getTeamScope } from '@/app/actions/crm'
import { DDD_INFO, DDDS_POR_UF, ESTADOS, extractDDD, type Regiao } from '@/lib/ddd'

async function requireAuth() {
  const cookieStore = await cookies()
  const token = cookieStore.get('ocr_auth_token')?.value
  if (!token) throw new Error('Unauthorized')
  return await verifyToken(token)
}

export interface RadarFilters {
  regiao?: Regiao | null
  origem?: string | null
  periodoDias?: number | null
}

// ─────────────────────────────────────────────────────────────────────────────
// Cache em memória (dados mudam pouco; evita reagregar toda a base a cada clique)
// ─────────────────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 60_000
const cache = new Map<string, { at: number; value: unknown }>()

async function withCache<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

function filterKey(userId: string, filters: RadarFilters, extra = ''): string {
  return `${userId}|${filters.regiao ?? ''}|${filters.origem ?? ''}|${filters.periodoDias ?? ''}|${extra}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrega contatos do escopo aplicando filtros comuns (região/origem/período)
// ─────────────────────────────────────────────────────────────────────────────
async function loadScopedContacts(scope: string[], filters: RadarFilters) {
  const where: Prisma.ContactWhereInput = { OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }] }
  if (filters.origem) where.firstUtmSource = filters.origem
  if (filters.periodoDias) {
    const since = new Date(Date.now() - filters.periodoDias * 86400000)
    where.createdAt = { gte: since }
  }
  const contacts = await prisma.contact.findMany({
    where,
    select: { id: true, nome: true, sobrenome: true, telefone: true, cidade: true, estado: true, createdAt: true },
  })

  // Classifica cada contato por DDD; aplica o filtro de região neste ponto
  // (região é derivada do DDD, não é coluna própria do Contact).
  return contacts
    .map((c) => {
      const ddd = extractDDD(c.telefone)
      const info = ddd ? DDD_INFO[ddd] : null
      return { ...c, ddd, info }
    })
    .filter((c) => !filters.regiao || c.info?.regiao === filters.regiao)
}

export interface RadarEstadoAgg {
  uf: string
  estado: string
  regiao: Regiao
  total: number
  pct: number
}

export interface RadarOverview {
  totalContatos: number
  totalIdentificados: number
  naoIdentificados: number
  porEstado: RadarEstadoAgg[]
  top: RadarEstadoAgg | null
}

/** Visão nacional: contagem de contatos por estado (via DDD do telefone). */
export async function getRadarOverview(filters: RadarFilters = {}): Promise<RadarOverview> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return withCache(filterKey(auth.userId, filters, 'overview'), async () => {
    const contacts = await loadScopedContacts(scope, filters)
    const naoIdentificados = contacts.filter((c) => !c.info).length
    const identificados = contacts.filter((c) => c.info)

    const byUf = new Map<string, number>()
    identificados.forEach((c) => {
      const uf = c.info!.uf
      byUf.set(uf, (byUf.get(uf) ?? 0) + 1)
    })

    const totalIdentificados = identificados.length
    const porEstado: RadarEstadoAgg[] = Object.keys(ESTADOS)
      .map((uf) => {
        const total = byUf.get(uf) ?? 0
        return {
          uf,
          estado: ESTADOS[uf].nome,
          regiao: ESTADOS[uf].regiao,
          total,
          pct: totalIdentificados > 0 ? Math.round((total / totalIdentificados) * 1000) / 10 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    const top = porEstado.find((e) => e.total > 0) ?? null

    return {
      totalContatos: contacts.length,
      totalIdentificados,
      naoIdentificados,
      porEstado,
      top,
    }
  })
}

export interface RadarDddAgg {
  ddd: string
  cidadeRef: string
  lat: number
  lng: number
  total: number
  pct: number
}

export interface RadarEstadoDetalhe {
  uf: string
  estado: string
  total: number
  top: RadarDddAgg | null
  porDdd: RadarDddAgg[]
}

/** Drill-down de um estado: contagem por DDD (cidade-polo de cada DDD). */
export async function getRadarEstadoDetalhe(uf: string, filters: RadarFilters = {}): Promise<RadarEstadoDetalhe> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return withCache(filterKey(auth.userId, filters, `estado:${uf}`), async () => {
    const contacts = await loadScopedContacts(scope, filters)
    const doEstado = contacts.filter((c) => c.info?.uf === uf)

    const byDdd = new Map<string, number>()
    doEstado.forEach((c) => byDdd.set(c.ddd!, (byDdd.get(c.ddd!) ?? 0) + 1))

    const total = doEstado.length
    const porDdd: RadarDddAgg[] = (DDDS_POR_UF[uf] ?? [])
      .map((ddd) => {
        const info = DDD_INFO[ddd]
        const count = byDdd.get(ddd) ?? 0
        return {
          ddd,
          cidadeRef: info.cidadeRef,
          lat: info.lat,
          lng: info.lng,
          total: count,
          pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
        }
      })
      .sort((a, b) => b.total - a.total)

    return {
      uf,
      estado: ESTADOS[uf]?.nome ?? uf,
      total,
      top: porDdd.find((d) => d.total > 0) ?? null,
      porDdd,
    }
  })
}

export interface RadarCidadeAgg {
  cidade: string
  total: number
  pct: number
}

export interface RadarDddDetalhe {
  ddd: string
  cidadeRef: string
  total: number
  porCidade: RadarCidadeAgg[]
  temDadosDeCidade: boolean
}

/**
 * Drill-down de um DDD: contagem por cidade informada no cadastro do contato.
 * Como a maioria da base não tem "cidade" preenchida (campo livre e opcional),
 * `temDadosDeCidade=false` sinaliza para a UI mostrar uma mensagem em vez de
 * um nível de mapa vazio.
 */
export async function getRadarDddDetalhe(ddd: string, filters: RadarFilters = {}): Promise<RadarDddDetalhe> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return withCache(filterKey(auth.userId, filters, `ddd:${ddd}`), async () => {
    const contacts = await loadScopedContacts(scope, filters)
    const doDdd = contacts.filter((c) => c.ddd === ddd)
    const total = doDdd.length

    const byCidade = new Map<string, number>()
    doDdd.forEach((c) => {
      const nome = c.cidade?.trim()
      if (nome) byCidade.set(nome, (byCidade.get(nome) ?? 0) + 1)
    })

    const porCidade: RadarCidadeAgg[] = Array.from(byCidade.entries())
      .map(([cidade, count]) => ({ cidade, total: count, pct: total > 0 ? Math.round((count / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.total - a.total)

    return {
      ddd,
      cidadeRef: DDD_INFO[ddd]?.cidadeRef ?? ddd,
      total,
      porCidade,
      temDadosDeCidade: porCidade.length > 0,
    }
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Lista de contatos de um estado com a situação comercial de cada um
// (na pipeline + coluna, arquivado ganho/perdido) e telefone para o WhatsApp.
// ─────────────────────────────────────────────────────────────────────────────
export type RadarContatoSituacao = 'pipeline' | 'ganho' | 'perdido' | 'sem_negocio'

export interface RadarContato {
  id: string
  nome: string
  telefone: string
  ddd: string
  cidadeRef: string
  situacao: RadarContatoSituacao
  stageNome: string | null
  pipelineNome: string | null
  dealTitulo: string | null
  valorEstimado: number | null
  motivoPerda: string | null
}

export interface RadarEstadoContatos {
  uf: string
  estado: string
  total: number
  contatos: RadarContato[]
}

/**
 * Lista os contatos identificados em um estado (via DDD do telefone), com a
 * situação de cada um derivada dos seus deals:
 *  - `pipeline`: tem deal em aberto → mostra a coluna (stage) e a pipeline.
 *  - `ganho` / `perdido`: só tem deal(s) fechado(s) → arquivado.
 *  - `sem_negocio`: contato sem deal.
 * Prioriza deal aberto; na ausência, o fechamento mais recente (ganho tem
 * precedência sobre perdido quando ambos existem).
 */
export async function getRadarEstadoContatos(uf: string, filters: RadarFilters = {}): Promise<RadarEstadoContatos> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  return withCache(filterKey(auth.userId, filters, `contatos:${uf}`), async () => {
    const contacts = await loadScopedContacts(scope, filters)
    const doEstado = contacts.filter((c) => c.info?.uf === uf)
    const ids = doEstado.map((c) => c.id)

    // Deals dos contatos do estado, com stage e pipeline, mais recentes primeiro.
    const deals = ids.length
      ? await prisma.deal.findMany({
          where: { contactId: { in: ids } },
          select: {
            contactId: true, titulo: true, status: true, valorEstimado: true,
            motivoPerda: true, updatedAt: true,
            stage: { select: { nome: true } },
            pipeline: { select: { nome: true } },
          },
          orderBy: { updatedAt: 'desc' },
        })
      : []

    const dealsByContact = new Map<string, typeof deals>()
    for (const d of deals) {
      const arr = dealsByContact.get(d.contactId) ?? []
      arr.push(d)
      dealsByContact.set(d.contactId, arr)
    }

    const contatos: RadarContato[] = doEstado
      .map((c) => {
        const list = dealsByContact.get(c.id) ?? []
        const aberto = list.find((d) => d.status === 'OPEN')
        const ganho = list.find((d) => d.status === 'WON')
        const perdido = list.find((d) => d.status === 'LOST')
        const chosen = aberto ?? ganho ?? perdido ?? null

        let situacao: RadarContatoSituacao = 'sem_negocio'
        if (aberto) situacao = 'pipeline'
        else if (ganho) situacao = 'ganho'
        else if (perdido) situacao = 'perdido'

        const nomeCompleto = `${c.nome ?? ''}${c.sobrenome ? ' ' + c.sobrenome : ''}`.trim()

        return {
          id: c.id,
          nome: nomeCompleto || 'Sem nome',
          telefone: c.telefone ?? '',
          ddd: c.ddd ?? '',
          cidadeRef: c.info?.cidadeRef ?? '',
          situacao,
          stageNome: aberto ? (chosen?.stage?.nome ?? null) : null,
          pipelineNome: chosen?.pipeline?.nome ?? null,
          dealTitulo: chosen?.titulo ?? null,
          valorEstimado: chosen?.valorEstimado ?? null,
          motivoPerda: perdido ? (perdido.motivoPerda ?? null) : null,
        }
      })
      // Ordena: em pipeline primeiro, depois ganhos, perdidos, e sem negócio por fim.
      .sort((a, b) => {
        const rank: Record<RadarContatoSituacao, number> = { pipeline: 0, ganho: 1, perdido: 2, sem_negocio: 3 }
        if (rank[a.situacao] !== rank[b.situacao]) return rank[a.situacao] - rank[b.situacao]
        return a.nome.localeCompare(b.nome)
      })

    return { uf, estado: ESTADOS[uf]?.nome ?? uf, total: contatos.length, contatos }
  })
}

/** Lista de origens (UTM) presentes na base, para popular o filtro. */
export async function getRadarOrigens(): Promise<string[]> {
  const auth = await requireAuth()
  const scope = await getTeamScope(auth.userId)
  const rows = await prisma.contact.findMany({
    where: { OR: [{ userId: { in: scope } }, { ownerUserId: { in: scope } }], NOT: { firstUtmSource: null } },
    select: { firstUtmSource: true },
    distinct: ['firstUtmSource'],
  })
  return rows.map((r) => r.firstUtmSource!).filter(Boolean).sort()
}
