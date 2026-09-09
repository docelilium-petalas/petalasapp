'use server'

/**
 * Server actions da Máquina de Vendas.
 *
 * ⚠️ TUDO resiliente à ausência de tabela, de propósito. A migration é ato de
 * produção e pode ainda não ter rodado quando alguém abrir a tela; nesse caso
 * a página tem de DIZER isso, e não explodir com erro de Prisma. `migrado:
 * false` é a resposta honesta — a tela mostra o que falta em vez de uma
 * página branca.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { obterAjustes, dentroDaJanela, type Ajustes } from '@/lib/maquina-vendas/config'
import { formatarExibicao } from '@/lib/maquina-vendas/telefone'

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

/** `true` quando o erro é "a tabela não existe" — Postgres 42P01. */
function tabelaAusente(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('42P01') || msg.includes('does not exist')
}

export type EstadoMaquina = {
  migrado: boolean
  ajustes: Ajustes
  janelaAberta: boolean
  indicadores: {
    cadenciasAtivas: number
    inscricoesAtivas: number
    naFila: number
    enviadasHoje: number
    responderam: number
    converteram: number
    optOuts: number
  }
  proximas: {
    id: string
    nome: string
    telefone: string
    etapa: number
    quando: string
    texto: string
    cadencia: string
  }[]
  cadencias: {
    id: string
    nome: string
    gatilho: string
    ativo: boolean
    etapas: number
    inscricoes: number
  }[]
}

const ESTADO_VAZIO = (ajustes: Ajustes): EstadoMaquina => ({
  migrado: false,
  ajustes,
  janelaAberta: dentroDaJanela(ajustes),
  indicadores: {
    cadenciasAtivas: 0, inscricoesAtivas: 0, naFila: 0,
    enviadasHoje: 0, responderam: 0, converteram: 0, optOuts: 0,
  },
  proximas: [],
  cadencias: [],
})

export async function getEstadoMaquina(): Promise<EstadoMaquina> {
  await exigirAuth()
  const ajustes = await obterAjustes()

  try {
    const inicioDoDia = new Date()
    inicioDoDia.setHours(0, 0, 0, 0)

    // Uma ação só, com o paralelismo AQUI dentro: o Next despacha server
    // actions uma por vez por cliente, então três chamadas da tela virariam
    // três idas e voltas em fila.
    const [cadencias, inscricoesAtivas, naFila, enviadasHoje, responderam, converteram, optOuts, proximas] =
      await Promise.all([
        prisma.mvCadencia.findMany({
          include: { _count: { select: { etapas: true, inscricoes: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.mvInscricao.count({ where: { status: 'ATIVA' } }),
        prisma.mvMensagem.count({ where: { status: 'AGENDADA' } }),
        prisma.mvMensagem.count({ where: { status: 'ENVIADA', enviadaEm: { gte: inicioDoDia } } }),
        prisma.mvInscricao.count({ where: { respondeuEm: { not: null } } }),
        prisma.mvInscricao.count({ where: { converteuEm: { not: null } } }),
        prisma.mvOptOut.count(),
        prisma.mvMensagem.findMany({
          where: { status: 'AGENDADA' },
          orderBy: { agendadaPara: 'asc' },
          take: 25,
          include: { inscricao: { include: { cadencia: { select: { nome: true } } } } },
        }),
      ])

    return {
      migrado: true,
      ajustes,
      janelaAberta: dentroDaJanela(ajustes),
      indicadores: {
        cadenciasAtivas: cadencias.filter((c) => c.ativo).length,
        inscricoesAtivas, naFila, enviadasHoje, responderam, converteram, optOuts,
      },
      proximas: proximas.map((m) => ({
        id: m.id,
        nome: m.inscricao.nomeSnapshot,
        telefone: formatarExibicao(m.inscricao.telefoneE164),
        etapa: m.etapaOrdem,
        quando: m.agendadaPara.toISOString(),
        texto: m.mensagemFinal,
        cadencia: m.inscricao.cadencia.nome,
      })),
      cadencias: cadencias.map((c) => ({
        id: c.id,
        nome: c.nome,
        gatilho: c.gatilho,
        ativo: c.ativo,
        etapas: c._count.etapas,
        inscricoes: c._count.inscricoes,
      })),
    }
  } catch (e) {
    if (tabelaAusente(e)) return ESTADO_VAZIO(ajustes)
    throw e
  }
}

/** O freio de mão. Fecha a porta sem apagar cadência nenhuma. */
export async function alternarPausa(pausar: boolean): Promise<{ ok: boolean; envioPausado: boolean }> {
  const auth = await exigirAuth()
  const atual = await obterAjustes()
  try {
    await prisma.mvAjustes.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...atual, envioPausado: pausar, atualizadoPor: auth.email },
      update: { envioPausado: pausar, atualizadoPor: auth.email },
    })
    revalidatePath('/maquina-vendas')
    return { ok: true, envioPausado: pausar }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false, envioPausado: atual.envioPausado }
    throw e
  }
}

/** Ritmo e limites — editável por quem responde pelo número, não por quem faz deploy. */
export async function salvarAjustes(dados: Partial<Ajustes>): Promise<{ ok: boolean }> {
  const auth = await exigirAuth()
  const atual = await obterAjustes()
  const novo = { ...atual, ...dados }

  if (novo.intervaloMinMinutos > novo.intervaloMaxMinutos) {
    throw new Error('O intervalo mínimo não pode ser maior que o máximo.')
  }
  if (novo.tetoDiario < 1 || novo.tetoDiario > 1000) {
    throw new Error('O teto diário precisa estar entre 1 e 1000.')
  }

  try {
    await prisma.mvAjustes.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...novo, atualizadoPor: auth.email },
      update: { ...novo, atualizadoPor: auth.email },
    })
    revalidatePath('/maquina-vendas')
    return { ok: true }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false }
    throw e
  }
}

export type LinhaResultado = {
  id: string
  nome: string
  telefone: string
  cadencia: string
  origem: string
  entrouEm: string
  enviadas: number
  respondeuEm: string | null
  converteuEm: string | null
  valor: number | null
  status: string
}

/** Uma linha por PESSOA — o que aconteceu com quem a Máquina abordou. */
export async function getResultados(dias = 30): Promise<{ migrado: boolean; linhas: LinhaResultado[] }> {
  await exigirAuth()
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  try {
    const inscricoes = await prisma.mvInscricao.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        cadencia: { select: { nome: true } },
        _count: { select: { mensagens: true } },
      },
    })
    return {
      migrado: true,
      linhas: inscricoes.map((i) => ({
        id: i.id,
        nome: i.nomeSnapshot,
        telefone: formatarExibicao(i.telefoneE164),
        cadencia: i.cadencia.nome,
        origem: i.origem,
        entrouEm: i.createdAt.toISOString(),
        enviadas: i.tentativas,
        respondeuEm: i.respondeuEm?.toISOString() ?? null,
        converteuEm: i.converteuEm?.toISOString() ?? null,
        valor: i.valorConvertido ? Number(i.valorConvertido) : null,
        status: i.status,
      })),
    }
  } catch (e) {
    if (tabelaAusente(e)) return { migrado: false, linhas: [] }
    throw e
  }
}
