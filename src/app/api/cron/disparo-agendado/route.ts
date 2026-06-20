import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { dispararListaInternal } from '@/app/actions/crm'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  const pendentes = await prisma.listaDisparo.findMany({
    where: {
      status: 'AGENDADA',
      dataAgendamento: { lte: now }
    },
    select: { id: true, userId: true, nomeLista: true }
  })

  if (pendentes.length === 0) {
    return NextResponse.json({ dispatched: 0 })
  }

  const results: Array<{ id: string; nome: string; status: string; error?: string }> = []

  for (const lista of pendentes) {
    try {
      await dispararListaInternal(lista.id, lista.userId)
      results.push({ id: lista.id, nome: lista.nomeLista, status: 'dispatched' })
    } catch (e: any) {
      results.push({ id: lista.id, nome: lista.nomeLista, status: 'error', error: e.message })
    }
  }

  return NextResponse.json({ dispatched: results.length, results })
}
