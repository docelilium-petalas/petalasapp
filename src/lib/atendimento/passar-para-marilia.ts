/**
 * PASSAR A CONVERSA PARA A MARÍLIA — o único jeito de a IA sair de cena.
 *
 * Antes morava dentro de `/api/agente/humano` (a IA pede). Desde 08/10/2026 a
 * busca de catálogo e o envio de foto também passam, sozinhos, quando o que a
 * cliente quer está sem estoque — e os três caminhos têm de fazer EXATAMENTE a
 * mesma coisa:
 *
 *   1. `marcarHumano`  — a IA fica fora por 12 h (é isto que a cala)
 *   2. `LogEvento` AVISO `atendimento_humano` — o motivo e o resumo nos Logs
 *   3. funil na etapa `humano`, com a dona padrão (`usuarioPadrao`)
 *   4. nota privada no Chatwoot — é o que a Marília lê ao abrir a conversa
 *   5. aviso no WhatsApp da equipe (`aviso-equipe.ts`), melhor-esforço
 *
 * Idempotente: se a conversa já está com gente, não duplica log, atividade,
 * nota nem aviso. Só 1 é obrigatório; 2–5 nunca derrubam a passagem.
 */

import prisma from '@/lib/prisma'
import { humanoAtendendo, marcarHumano } from './conversa'
import { funilSemFalhar } from './funil'
import { usuarioPadrao } from './atendente'
import { avisarEquipe, textoDoAvisoDePassagem, type ResultadoDoAviso } from './aviso-equipe'
import { configChatwoot, conversaDoTelefone, notaPrivada } from '@/lib/maquina-vendas/chatwoot-api'

/** A frase aprovada pelo Owner em 08/10/2026 para a passagem por estoque. */
export const DICA_PASSOU_POR_ESTOQUE =
  'Já passei a conversa para a Marília. Diga numa frase, com carinho, que essa peça está sem estoque e que a Marília vai te atender pessoalmente por aqui. Não ofereça outra peça, não mande foto nem link, e pare.'

export type Passagem = {
  /** A conversa já estava com gente: nada foi refeito. */
  jaEstava: boolean
  logId: string | null
  aviso: ResultadoDoAviso | null
}

export async function passarParaMarilia(telefone: string, motivo: string, resumo: string): Promise<Passagem> {
  if (await humanoAtendendo(telefone).catch(() => false)) return { jaEstava: true, logId: null, aviso: null }

  const m = motivo.trim().slice(0, 80) || 'sem motivo'
  const r = resumo.trim().slice(0, 1500)
  await marcarHumano(telefone)

  const log = await prisma.logEvento
    .create({
      data: {
        origem: 'atendimento',
        nivel: 'AVISO',
        tipo: 'atendimento_humano',
        titulo: `Cliente precisa de atendimento: ${m}`,
        detalhe: r,
        dados: JSON.stringify({ telefone, motivo: m }).slice(0, 1000),
      },
      select: { id: true },
    })
    .catch(() => null)

  // Os dois caminhos que tiram a IA da conversa — este (passagem) e o eco do
  // celular (a pessoa assume) — entregam a conversa à MESMA dona.
  await funilSemFalhar({
    e164: telefone,
    etapa: 'humano',
    atividade: `Passou para atendente: ${m} — ${r}`,
    responsavelId: await usuarioPadrao().catch(() => null),
  })

  const cfg = configChatwoot()
  if (cfg) {
    try {
      const conv = await conversaDoTelefone(cfg, telefone)
      if (conv) await notaPrivada(cfg, conv, `🙋 A IA passou esta conversa para a Marília — ${m}.\n${r}\n\nA IA fica fora por 12 h.`)
    } catch (e) {
      console.error('[passar-para-marilia] nota no Chatwoot falhou:', e instanceof Error ? e.message : e)
    }
  }

  const aviso = await avisarEquipe(textoDoAvisoDePassagem({ telefone, motivo: m, resumo: r })).catch((e) => {
    console.error('[passar-para-marilia] aviso falhou:', e instanceof Error ? e.message : e)
    return null
  })

  return { jaEstava: false, logId: log ? String(log.id) : null, aviso }
}
