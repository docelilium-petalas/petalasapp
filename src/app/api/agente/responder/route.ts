import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { enviarMensagemLivre } from '@/lib/maquina-vendas/canal'
import { registrarTurno, ultimaMensagem } from '@/lib/atendimento/conversa'
import prisma from '@/lib/prisma'
import { funilSemFalhar, temLinkDaLoja } from '@/lib/atendimento/funil'
import { baloesPermitidos, estadoDaConversa } from '@/lib/atendimento/trava-pos-passagem'

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

  const doModelo = emBaloes(String(corpo.texto ?? ''))
  if (!doModelo.length) return NextResponse.json({ enviadas: 0 })

  // Conversa com a Marília: quem decide o que sai é o back-end, não o modelo
  // (`trava-pos-passagem.ts`, E2E de 08/10/2026). Erro de leitura = livre:
  // a trava nunca pode calar uma conversa que não foi passada.
  const estado = await estadoDaConversa(telefone).catch(() => ({ humano: false, desde: null, motivo: null }))
  const { baloes, trava } = baloesPermitidos(doModelo, estado)
  if (trava !== 'livre') {
    await prisma.logEvento
      .create({
        data: {
          origem: 'atendimento',
          nivel: 'INFO',
          tipo: 'resposta_travada',
          titulo: trava === 'humano' ? 'IA segurada: a conversa está com a Marília' : `Resposta da IA trocada depois da passagem (${trava})`,
          detalhe: doModelo.join('\n\n').slice(0, 1500),
          dados: JSON.stringify({ telefone, trava, saiu: baloes }).slice(0, 2000),
        },
      })
      .catch(() => undefined)
  }
  if (!baloes.length) return NextResponse.json({ enviadas: 0, trava })

  let enviadas = 0
  for (const [i, balao] of baloes.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1200))
    try {
      // ⚠️ O `idExterno` NÃO é detalhe de auditoria: ele é o que faz a IA
      // reconhecer o próprio eco quando ele volta pelo webhook. Sem gravar
      // aqui, `ecoENosso()` nunca casa, todo eco da IA é lido como "a
      // atendente digitou no celular" — e a IA se cala sozinha depois da
      // primeira resposta que dá. Um cadeado que se tranca por dentro.
      const { idExterno } = await enviarMensagemLivre(telefone, { tipo: 'texto', texto: balao })
      await registrarTurno(telefone, { em: new Date().toISOString(), de: 'loja', texto: balao, id: idExterno })
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
    // Depois da passagem o negócio fica em "Atendimento humano": a fala da IA
    // entra só como atividade, sem tentar mover etapa.
    await funilSemFalhar({ e164: telefone, etapa: trava === 'livre' && temLinkDaLoja(dito) ? 'link' : 'novo', atividade: `IA: ${dito}` })
  }

  const nova = corpo.msg_id && (await ultimaMensagem(telefone)) !== corpo.msg_id
  return NextResponse.json({ enviadas, trava, chegou_mensagem_nova: !!nova })
}
