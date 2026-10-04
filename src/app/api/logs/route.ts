import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Ingestão de alerta operacional das automações (n8n) — porte da CarBoss.
 *
 * O que chega aqui aparece em /logs, na tela de quem quiser olhar, e não no
 * WhatsApp de alguém às 3h da manhã.
 *
 * Contrato: `{ origem, nivel?, tipo, titulo, detalhe?, dados? }`, ou o formato
 * legado `{ number, text }` dos nós que mandavam aviso por WhatsApp.
 *
 * ⚠️ Endpoint de log é convite a entupir o banco e a virar porta aberta:
 *    secret obrigatório (fail-closed), teto de tamanho, nível por lista fechada.
 */

const NIVEIS = new Set(['INFO', 'AVISO', 'ERRO'])
const LIMITE_TITULO = 200
const LIMITE_TEXTO = 8_000

const cortar = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

export async function POST(req: NextRequest) {
  // Env ausente FECHA a porta. Nunca `if (secret) {...}`: sem a env, esse
  // padrão deixa qualquer um escrever no banco.
  const secret = process.env.WEBHOOK_CALLBACK_SECRET
  if (!secret) {
    console.error('[api/logs] WEBHOOK_CALLBACK_SECRET ausente — rota desabilitada')
    return NextResponse.json({ ok: false, error: 'Rota não configurada.' }, { status: 503 })
  }
  const enviado = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (enviado !== secret) return NextResponse.json({ ok: false, error: 'Não autorizado.' }, { status: 401 })

  let corpo: Record<string, unknown>
  try {
    corpo = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ ok: false, error: 'JSON inválido.' }, { status: 400 })
  }

  const textoLegado = cortar(corpo.text, LIMITE_TEXTO)
  const origem = cortar(corpo.origem, 120) ?? cortar(req.headers.get('x-log-origem'), 120)
  const tipo = cortar(corpo.tipo, 60) ?? cortar(req.headers.get('x-log-tipo'), 60)
  const titulo = cortar(corpo.titulo, LIMITE_TITULO) ?? cortar(textoLegado?.split('\n')[0], LIMITE_TITULO)
  if (!origem || !tipo || !titulo) {
    return NextResponse.json({ ok: false, error: 'origem, tipo e titulo (ou text) são obrigatórios.' }, { status: 400 })
  }

  // Avisos legados vinham marcados por emoji — 🔴 erro, 🟠/🟡/⚠️ aviso.
  const inferido = textoLegado?.startsWith('🔴') ? 'ERRO' : /^(🟠|🟡|⚠️)/u.test(textoLegado ?? '') ? 'AVISO' : null
  const nivelBruto = String(corpo.nivel ?? req.headers.get('x-log-nivel') ?? inferido ?? 'INFO').toUpperCase()
  const nivel = NIVEIS.has(nivelBruto) ? nivelBruto : 'INFO'

  let dados: string | null = null
  if (corpo.dados !== undefined && corpo.dados !== null) {
    try {
      dados = (typeof corpo.dados === 'string' ? corpo.dados : JSON.stringify(corpo.dados)).slice(0, LIMITE_TEXTO)
    } catch {
      dados = null // objeto circular: perder o anexo é melhor que perder o log
    }
  }

  const log = await prisma.logEvento.create({
    data: { origem, nivel, tipo, titulo, detalhe: cortar(corpo.detalhe, LIMITE_TEXTO) ?? textoLegado, dados },
    select: { id: true, createdAt: true },
  })
  return NextResponse.json({ ok: true, id: log.id, em: log.createdAt })
}
