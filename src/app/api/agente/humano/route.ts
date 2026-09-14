import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { HUMANO_HORAS, marcarHumano } from '@/lib/atendimento/conversa'
import prisma from '@/lib/prisma'
import { funilSemFalhar } from '@/lib/atendimento/funil'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `chamar_atendente`: a IA sai da conversa por 12h e o pedido fica
 * nos Logs da Máquina como AVISO, com o resumo — para a Marília abrir já
 * sabendo o assunto, sem ler a conversa inteira.
 */
export async function POST(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: string; motivo?: string; resumo?: string }
  const telefone = telefoneDaRequisicao(corpo.telefone)
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })

  await marcarHumano(telefone)
  await prisma.logEvento
    .create({
      data: {
        origem: 'atendimento',
        nivel: 'AVISO',
        tipo: 'atendimento_humano',
        titulo: `Cliente precisa de atendimento: ${String(corpo.motivo ?? 'sem motivo').slice(0, 80)}`,
        detalhe: String(corpo.resumo ?? '').slice(0, 1500),
        dados: JSON.stringify({ telefone, motivo: corpo.motivo }).slice(0, 1000),
      },
    })
    .catch(() => undefined)

  await funilSemFalhar({
    e164: telefone,
    etapa: 'humano',
    atividade: `Passou para atendente: ${String(corpo.motivo ?? '')} — ${String(corpo.resumo ?? '')}`,
  })

  return NextResponse.json({
    ok: true,
    dica: `Pronto: a equipe foi avisada e você fica fora desta conversa por ${HUMANO_HORAS}h. Diga numa frase que a Marília vai responder por aqui. Não prometa horário.`,
  })
}
