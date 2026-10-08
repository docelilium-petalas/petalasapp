import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { HUMANO_HORAS } from '@/lib/atendimento/conversa'
import { passarParaMarilia } from '@/lib/atendimento/passar-para-marilia'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `chamar_atendente`: a IA sai da conversa por 12h e o pedido fica
 * nos Logs da Máquina como AVISO, com o resumo — para a Marília abrir já
 * sabendo o assunto, sem ler a conversa inteira. O que acontece na passagem
 * mora em `passarParaMarilia` (a busca e a foto também passam, por estoque).
 */
export async function POST(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: string; motivo?: string; resumo?: string }
  const telefone = telefoneDaRequisicao(corpo.telefone)
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })

  const passagem = await passarParaMarilia(telefone, String(corpo.motivo ?? ''), String(corpo.resumo ?? ''))

  return NextResponse.json({
    ok: true,
    ja_estava_com_a_equipe: passagem.jaEstava,
    dica: `Pronto: a equipe foi avisada e você fica fora desta conversa por ${HUMANO_HORAS}h. Diga numa frase que a Marília vai responder por aqui. Não prometa horário.`,
  })
}
