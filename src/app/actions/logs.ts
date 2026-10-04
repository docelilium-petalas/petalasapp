'use server'

/**
 * Server actions da tela de Logs — porte de `actions/logs.ts` da CarBoss,
 * ligado no `LogEvento` que a Doce Lilium já tem.
 *
 * Ler é para qualquer pessoa logada: saber que a automação quebrou não é
 * privilégio de admin. Apagar é só ADMIN.
 *
 * ⚠️ Diferença da origem: a limpeza NUNCA apaga `mv_ajustes`. Esse tipo é o
 *    histórico de quem mudou o ritmo da Máquina, e a aba Ritmo promete que a
 *    alteração "fica registrada". Trilho de auditoria não vence em 30 dias.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'

const POR_PAGINA = 50
/** Tipos que a limpeza não toca — ver o cabeçalho. */
const TIPOS_PERMANENTES = ['mv_ajustes']

async function exigirUsuario() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

async function exigirAdmin() {
  const auth = await exigirUsuario()
  const roles = await prisma.userRole.findMany({ where: { userId: auth.userId }, select: { role: true } })
  if (!roles.some((r) => r.role === 'ADMIN')) throw new Error('Apagar logs é só para administradoras.')
  return auth
}

export type LogFiltros = {
  nivel?: string
  tipo?: string
  origem?: string
  /** só os não lidos */
  naoLidos?: boolean
  busca?: string
}

function montarWhere(f: LogFiltros) {
  const where: Record<string, unknown> = {}
  if (f.nivel) where.nivel = f.nivel
  if (f.tipo) where.tipo = f.tipo
  if (f.origem) where.origem = f.origem
  if (f.naoLidos) where.lidoEm = null
  if (f.busca?.trim()) {
    const q = f.busca.trim()
    where.OR = [
      { titulo: { contains: q, mode: 'insensitive' } },
      { detalhe: { contains: q, mode: 'insensitive' } },
      { origem: { contains: q, mode: 'insensitive' } },
    ]
  }
  return where
}

export async function getLogs(filtros: LogFiltros = {}, pagina = 1) {
  await exigirUsuario()
  const where = montarWhere(filtros)
  const p = Math.max(1, pagina)
  const [total, itens] = await Promise.all([
    prisma.logEvento.count({ where }),
    prisma.logEvento.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (p - 1) * POR_PAGINA, take: POR_PAGINA }),
  ])
  return {
    itens: itens.map((l) => ({
      id: l.id,
      origem: l.origem,
      nivel: l.nivel,
      tipo: l.tipo,
      titulo: l.titulo,
      detalhe: l.detalhe,
      dados: l.dados,
      lido: l.lidoEm !== null,
      createdAt: l.createdAt.toISOString(),
    })),
    total,
    pagina: p,
    totalPaginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
  }
}

/** Cabeçalho da tela: o que precisa de olho agora. */
export async function getLogsResumo() {
  await exigirUsuario()
  const agora = new Date()
  const h24 = new Date(agora.getTime() - 24 * 3600_000)
  const [erros24h, avisos24h, naoLidos, ultimo, tipos, origens] = await Promise.all([
    prisma.logEvento.count({ where: { nivel: 'ERRO', createdAt: { gte: h24 } } }),
    prisma.logEvento.count({ where: { nivel: 'AVISO', createdAt: { gte: h24 } } }),
    prisma.logEvento.count({ where: { lidoEm: null } }),
    prisma.logEvento.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
    prisma.logEvento.groupBy({ by: ['tipo'], _count: { _all: true }, orderBy: { _count: { tipo: 'desc' } }, take: 20 }),
    prisma.logEvento.groupBy({ by: ['origem'], _count: { _all: true }, orderBy: { _count: { origem: 'desc' } }, take: 20 }),
  ])
  return {
    erros24h,
    avisos24h,
    naoLidos,
    ultimoEm: ultimo?.createdAt.toISOString() ?? null,
    /** O "agora" do servidor: a tela calcula tempo relativo sem `Date.now()` no render. */
    agora: agora.toISOString(),
    tipos: tipos.map((t) => ({ valor: t.tipo, total: t._count._all })),
    origens: origens.map((o) => ({ valor: o.origem, total: o._count._all })),
  }
}

export async function marcarLido(id: string) {
  await exigirUsuario()
  await prisma.logEvento.update({ where: { id }, data: { lidoEm: new Date() } })
  revalidatePath('/logs')
  return { ok: true }
}

export async function marcarTodosLidos() {
  await exigirUsuario()
  const r = await prisma.logEvento.updateMany({ where: { lidoEm: null }, data: { lidoEm: new Date() } })
  revalidatePath('/logs')
  return { ok: true, marcados: r.count }
}

/**
 * Limpa log antigo. Sem isto a tabela cresce para sempre. Padrão de 30 dias,
 * e nunca o histórico de ajustes da Máquina.
 */
export async function limparAntigos(dias = 30) {
  await exigirAdmin()
  if (!Number.isInteger(dias) || dias < 7) throw new Error('Período inválido — o mínimo é 7 dias.')
  const corte = new Date(Date.now() - dias * 24 * 3600_000)
  const r = await prisma.logEvento.deleteMany({ where: { createdAt: { lt: corte }, tipo: { notIn: TIPOS_PERMANENTES } } })
  revalidatePath('/logs')
  return { ok: true, apagados: r.count }
}
