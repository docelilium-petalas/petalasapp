/**
 * DA META AO AGENTE — o caminho de uma mensagem da cliente até a IA.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * 1. O webhook grava o turno e marca esta mensagem como a ÚLTIMA da cliente.
 * 2. Espera 9s (`after`, depois de já ter devolvido 200 à Datafy).
 * 3. Se outra mensagem chegou nesse meio tempo, esta desiste — a mais nova
 *    leva todas. É o buffer da CarBoss (Redis + Wait), sem Redis.
 * 4. Encaminha ao n8n o que ainda não foi respondido, o histórico e o nome.
 *
 * Não encaminha quando: a IA está desligada (`atendimento:ia = off`), uma
 * pessoa assumiu nas últimas 12h, ou a cliente pediu para sair.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { after } from 'next/server'
import prisma from '@/lib/prisma'
import {
  historicoEmTexto,
  humanoAtendendo,
  iaLigada,
  marcarUltimaMensagem,
  pendentesEHistorico,
  turnosDe,
  ultimaMensagem,
} from './conversa'

export const URL_AGENTE = process.env.N8N_ATENDIMENTO_URL || 'https://petalas-n8n.yt7ol2.easypanel.host/webhook/dl-atendimento'
const ESPERA_MS = 9_000

export type Chegada = {
  e164: string
  msgId: string
  nome: string | null
  tipo: string
  /** Nome do template ao qual ela respondeu, quando respondeu a um. */
  respondendoTemplate: string | null
}

async function logar(nivel: string, tipo: string, titulo: string, dados: unknown) {
  await prisma.logEvento
    .create({ data: { origem: 'atendimento', nivel, tipo, titulo, dados: JSON.stringify(dados).slice(0, 4000) } })
    .catch(() => undefined)
}

export async function agendarAtendimento(c: Chegada): Promise<void> {
  await marcarUltimaMensagem(c.e164, c.msgId)
  after(async () => {
    await new Promise((r) => setTimeout(r, ESPERA_MS))
    if ((await ultimaMensagem(c.e164)) !== c.msgId) return
    await encaminhar(c)
  })
}

export async function encaminhar(c: Chegada): Promise<{ ok: boolean; motivo: string }> {
  if (!(await iaLigada())) return { ok: false, motivo: 'IA desligada' }
  if (await humanoAtendendo(c.e164)) return { ok: false, motivo: 'atendimento humano em curso' }

  const { pendentes, historico } = pendentesEHistorico(await turnosDe(c.e164))
  if (!pendentes.length) return { ok: false, motivo: 'nada pendente' }

  const segredo = process.env.CRON_SECRET?.trim()
  if (!segredo) {
    await logar('ERRO', 'atendimento_falhou', 'CRON_SECRET ausente: não dá para chamar o agente', {})
    return { ok: false, motivo: 'sem segredo' }
  }

  const corpo = JSON.stringify({
    telefone: c.e164,
    nome_whatsapp: c.nome,
    mensagem: pendentes.map((t) => t.texto).join('\n'),
    historico: historicoEmTexto(historico),
    tipo: c.tipo,
    respondendo_template: c.respondendoTemplate,
    msg_id: c.msgId,
    agora: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
  })

  // A credencial do n8n guarda o segredo cru; se um dia ela ganhar o
  // `Bearer `, a segunda tentativa cobre sem ninguém ter que descobrir.
  for (const cabecalho of [segredo, `Bearer ${segredo}`]) {
    try {
      const r = await fetch(URL_AGENTE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: cabecalho },
        body: corpo,
        signal: AbortSignal.timeout(10_000),
      })
      if (r.ok) return { ok: true, motivo: 'encaminhado' }
      if (r.status !== 401 && r.status !== 403) {
        await logar('ERRO', 'atendimento_falhou', `Agente respondeu HTTP ${r.status}`, { status: r.status, corpo: (await r.text()).slice(0, 300) })
        return { ok: false, motivo: `HTTP ${r.status}` }
      }
    } catch (e) {
      await logar('ERRO', 'atendimento_falhou', 'Agente fora do ar', { erro: e instanceof Error ? e.message : String(e) })
      return { ok: false, motivo: 'agente fora do ar' }
    }
  }
  await logar('ERRO', 'atendimento_falhou', 'Agente recusou a credencial (401/403)', {})
  return { ok: false, motivo: 'credencial recusada' }
}
