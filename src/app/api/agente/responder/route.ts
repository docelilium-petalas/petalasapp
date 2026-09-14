import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { enviarMensagemLivre } from '@/lib/maquina-vendas/canal'
import { registrarTurno, ultimaMensagem } from '@/lib/atendimento/conversa'
import prisma from '@/lib/prisma'
import { funilSemFalhar, temLinkDaLoja } from '@/lib/atendimento/funil'

export const dynamic = 'force-dynamic'

/** Balões: o agente separa por linha em branco. No máximo 3 — mais que isso é textão picado. */
function emBaloes(texto: string): string[] {
  return texto
    .replace(/\r/g, '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 3)
}

/**
 * A última etapa do agente: o texto final vai para a cliente.
 *
 * Se ela escreveu de novo enquanto a IA pensava, a resposta ainda sai — ela
 * responde ao que foi perguntado — e a mensagem nova já está na fila do
 * próximo turno.
 */
export async function POST(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: string; texto?: string; msg_id?: string }
  const telefone = telefoneDaRequisicao(corpo.telefone)
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })

  const baloes = emBaloes(String(corpo.texto ?? ''))
  if (!baloes.length) return NextResponse.json({ enviadas: 0 })

  let enviadas = 0
  for (const [i, balao] of baloes.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200))
    try {
      await enviarMensagemLivre(telefone, { tipo: 'texto', texto: balao })
      await registrarTurno(telefone, { em: new Date().toISOString(), de: 'loja', texto: balao })
      enviadas++
    } catch (e) {
      await prisma.logEvento
        .create({
          data: {
            origem: 'atendimento',
            nivel: 'ERRO',
            tipo: 'resposta_falhou',
            titulo: 'Resposta da IA não saiu',
            dados: JSON.stringify({ telefone, erro: e instanceof Error ? e.message : String(e) }).slice(0, 2000),
          },
        })
        .catch(() => undefined)
      break
    }
  }

  if (enviadas) {
    const dito = baloes.slice(0, enviadas).join('\n\n')
    await funilSemFalhar({ e164: telefone, etapa: temLinkDaLoja(dito) ? 'link' : 'novo', atividade: `IA: ${dito}` })
  }

  const nova = corpo.msg_id && (await ultimaMensagem(telefone)) !== corpo.msg_id
  return NextResponse.json({ enviadas, chegou_mensagem_nova: !!nova })
}
