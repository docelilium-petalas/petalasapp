import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { paraE164 } from '@/lib/maquina-vendas/telefone'
import { assumirConversa } from '@/lib/atendimento/atendente'

export const dynamic = 'force-dynamic'

/**
 * A LOJA RESPONDEU PELO CHATWOOT — o segundo caminho da mesma regra.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O primeiro caminho é o eco do WhatsApp (`webhook/whatsapp`): a Marília
 * digita no celular, a Meta devolve `smb_message_echoes`, a IA se cala.
 *
 * Só que quem responde pelo Chatwoot NÃO gera eco nenhum. Medido em
 * 29/09/2026: resposta enviada da conversa 7 chegou no WhatsApp da cliente,
 * e nenhum evento voltou pelo webhook da Datafy — nem com
 * `smb_message_echoes` assinado. A IA continuaria respondendo por cima.
 *
 * Aqui o Chatwoot avisa direto: `message_created` de saída.
 *
 * ── Como separar gente de robô ────────────────────────────────────────────
 * Tudo que a Datafy ESPELHA no Chatwoot (resposta da IA, template da
 * Máquina de Vendas, fala da Marília pelo celular) chega com
 * `content_attributes.from_echo = true`. Medido nas mensagens 48–81 da
 * conversa 7. Esses ficam de fora — o que é de gente já foi tratado pelo
 * eco do WhatsApp, e o que é de robô não pode calar a IA.
 *
 * Sobra o que alguém digitou no painel: `outgoing`, não privado, sem
 * `from_echo`, remetente que não é bot nem contato.
 *
 * ── Segurança: falha fechada ──────────────────────────────────────────────
 * O Chatwoot não assina webhook. A prova é `?token=` na URL, derivado do
 * `CRON_SECRET` (HMAC com um rótulo próprio), para que:
 *   · não exista mais uma env para esquecer de configurar;
 *   · a URL guardada no Chatwoot não seja o próprio `CRON_SECRET`, que abre
 *     todas as rotas do agente.
 * ══════════════════════════════════════════════════════════════════════════
 */

const ROTULO = 'webhook-chatwoot'

export async function POST(request: Request) {
  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) return NextResponse.json({ erro: 'CRON_SECRET não configurado.' }, { status: 503 })

  const informado = new URL(request.url).searchParams.get('token')?.trim() ?? ''
  const esperado = createHmac('sha256', segredo).update(ROTULO).digest('hex')
  const a = Buffer.from(informado)
  const b = Buffer.from(esperado)
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  let corpo: EventoChatwoot
  try {
    corpo = (await request.json()) as EventoChatwoot
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 })
  }

  const motivo = descartar(corpo)
  if (motivo) return NextResponse.json({ ok: true, assumida: false, motivo })

  const e164 = paraE164(corpo.conversation?.meta?.sender?.phone_number ?? corpo.contact?.phone_number ?? null)
  if (!e164) return NextResponse.json({ ok: true, assumida: false, motivo: 'sem telefone' })

  // Idempotência: o Chatwoot re-tenta webhook que falha, e reassumir a cada
  // reentrega reiniciaria o prazo de silêncio sem ninguém ter falado.
  if (corpo.id != null) {
    const marca = `chatwoot:msg:${corpo.id}`
    try {
      const visto = await prisma.eventIngestLog.findFirst({ where: { source: marca }, select: { id: true } })
      if (visto) return NextResponse.json({ ok: true, assumida: false, motivo: 'repetido' })
      await prisma.eventIngestLog.create({ data: { source: marca, payload: '', status: 'received' } })
    } catch {
      // sem o log a rota ainda funciona; perde só a proteção contra repetição
    }
  }

  try {
    const quando = corpo.created_at ? new Date(typeof corpo.created_at === 'number' ? corpo.created_at * 1000 : corpo.created_at) : new Date()
    await assumirConversa({
      e164,
      texto: corpo.content ?? '',
      quando: Number.isNaN(quando.getTime()) ? new Date() : quando,
      wamid: null,
    })
  } catch (e) {
    await prisma.logEvento
      .create({
        data: {
          origem: 'atendimento',
          nivel: 'ERRO',
          tipo: 'chatwoot_assumir_falhou',
          titulo: 'Falha ao pausar a IA por resposta do Chatwoot',
          dados: JSON.stringify(e instanceof Error ? e.message : e).slice(0, 4000),
        },
      })
      .catch(() => undefined)
    // 200 mesmo assim: reentrega não conserta erro nosso.
    return NextResponse.json({ ok: false, assumida: false })
  }

  return NextResponse.json({ ok: true, assumida: true })
}

/** Por que este evento NÃO é uma pessoa da loja falando. `null` = é. */
function descartar(c: EventoChatwoot): string | null {
  if (c.event !== 'message_created') return 'evento ignorado'
  if (c.message_type !== 'outgoing' && c.message_type !== 1) return 'não é saída'
  if (c.private) return 'nota privada'
  if (c.content_attributes?.from_echo) return 'espelho da Datafy'
  const tipo = String(c.sender?.type ?? '').toLowerCase()
  if (tipo === 'agent_bot' || tipo === 'contact' || tipo === 'agentbot') return 'remetente automático'
  return null
}

type EventoChatwoot = {
  event?: string
  id?: number | string
  content?: string | null
  created_at?: number | string
  message_type?: string | number
  private?: boolean
  content_attributes?: { from_echo?: boolean } | null
  sender?: { type?: string } | null
  contact?: { phone_number?: string | null } | null
  conversation?: { meta?: { sender?: { phone_number?: string | null } } } | null
}
