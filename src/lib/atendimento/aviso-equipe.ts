/**
 * AVISO PARA A EQUIPE NO WHATSAPP — "uma cliente passou para você".
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Pedido da Marília (08/10/2026): toda vez que a IA passar uma conversa para
 * ela, receber uma mensagem. Sai do número da loja para o número de aviso.
 *
 * Número: `MV_HANDOFF_NUMERO` → `MV_ALERTA_NUMERO`. Hoje é o número do Luan,
 * em teste; para virar o da Marília basta trocar a env (sem deploy de código).
 *
 * ── A janela de 24 h ──────────────────────────────────────────────────────
 * Texto livre só chega com a janela aberta, e o 131047 volta pelo webhook,
 * não no envio (`janela-24h.ts`). Então:
 *   janela aberta  → manda agora
 *   janela fechada → guarda em `atendimento:avisos_pendentes` e o tique entrega
 *                    tudo junto quando o número escrever (inclusive o "Quero ver"
 *                    do briefing da manhã)
 * Não existe template aprovado para este aviso: com a janela fechada ele espera.
 * O aviso é melhor-esforço — o handoff em si (silêncio da IA, funil, log,
 * Chatwoot) nunca depende dele.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { numeroDeAlerta } from '@/lib/maquina-vendas/config'
import { enviarMensagemLivre } from '@/lib/maquina-vendas/canal'
import { janelaAberta } from '@/lib/maquina-vendas/janela-24h'

export const CHAVE_AVISOS_PENDENTES = 'atendimento:avisos_pendentes'
const MAX_PENDENTES = 15

type Pendente = { em: string; texto: string }

export function numeroDoAvisoDeAtendimento(): string | null {
  const n = (process.env.MV_HANDOFF_NUMERO ?? '').replace(/\D/g, '')
  return n.length >= 12 ? n : numeroDeAlerta()
}

/** "+55 62 98119-1215" — legível para quem vai procurar a conversa. */
export function telefoneLegivel(e164: string): string {
  const d = e164.replace(/\D/g, '')
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d)
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`
}

/** Pura: o texto que a Marília recebe. */
export function textoDoAvisoDePassagem(p: { telefone: string; nome?: string | null; motivo: string; resumo: string }): string {
  const quem = p.nome?.trim() ? `${p.nome.trim()} · ${telefoneLegivel(p.telefone)}` : telefoneLegivel(p.telefone)
  return [
    '🙋 Doce Lilium · cliente para você',
    `${quem}`,
    `Motivo: ${p.motivo}`,
    p.resumo.trim() ? p.resumo.trim().slice(0, 600) : null,
    '',
    'A IA saiu dessa conversa por 12 h. Responda pelo Chatwoot ou pelo WhatsApp da loja.',
  ]
    .filter((l) => l !== null)
    .join('\n')
}

async function lerPendentes(): Promise<Pendente[]> {
  const c = await prisma.mvCursor.findUnique({ where: { chave: CHAVE_AVISOS_PENDENTES }, select: { valor: true } })
  if (!c?.valor) return []
  try {
    const v = JSON.parse(c.valor) as unknown
    return Array.isArray(v) ? (v as Pendente[]).filter((x) => x && typeof x.texto === 'string') : []
  } catch {
    return []
  }
}

async function gravarPendentes(lista: Pendente[]): Promise<void> {
  if (!lista.length) {
    await prisma.mvCursor.deleteMany({ where: { chave: CHAVE_AVISOS_PENDENTES } })
    return
  }
  const valor = JSON.stringify(lista.slice(-MAX_PENDENTES))
  await prisma.mvCursor.upsert({ where: { chave: CHAVE_AVISOS_PENDENTES }, create: { chave: CHAVE_AVISOS_PENDENTES, valor }, update: { valor } })
}

async function logar(nivel: 'INFO' | 'AVISO', tipo: string, titulo: string, dados: unknown) {
  await prisma.logEvento
    .create({ data: { origem: 'atendimento', nivel, tipo, titulo, dados: JSON.stringify(dados).slice(0, 2000) } })
    .catch((e) => console.error('[aviso-equipe] log falhou:', e))
}

/**
 * O eco deste envio não pode virar "a atendente assumiu". O webhook reconhece
 * o próprio eco pelo `wamid` no turno da conversa ou na `MvMensagem` — e o aviso
 * não está em nenhum dos dois (nem pode: viraria histórico da conversa). Então
 * grava a marca de "eco já visto" que o `tratarEco` consulta antes de tudo.
 */
async function marcarEcoComoNosso(wamid: string | null | undefined): Promise<void> {
  if (!wamid) return
  await prisma.eventIngestLog
    .create({ data: { source: `whatsapp:eco:${wamid}`, payload: '', status: 'aviso_equipe' } })
    .catch((e) => console.error('[aviso-equipe] marca de eco falhou:', e))
}

export type ResultadoDoAviso = 'enviado' | 'pendente' | 'sem_numero'

export async function avisarEquipe(texto: string, agora: Date = new Date()): Promise<ResultadoDoAviso> {
  const numero = numeroDoAvisoDeAtendimento()
  if (!numero) return 'sem_numero'

  if (await janelaAberta(numero, agora).catch(() => false)) {
    try {
      const { idExterno } = await enviarMensagemLivre(`+${numero}`, { tipo: 'texto', texto })
      await marcarEcoComoNosso(idExterno)
      return 'enviado'
    } catch (e) {
      await logar('AVISO', 'aviso_equipe_falhou', 'Aviso de passagem não saiu — fica pendente', { erro: e instanceof Error ? e.message : String(e) })
    }
  }
  await gravarPendentes([...(await lerPendentes()), { em: agora.toISOString(), texto }])
  return 'pendente'
}

/** Passo do tique: entrega o que esperava a janela abrir. Uma mensagem só. */
export async function entregarAvisosPendentes(agora: Date = new Date()): Promise<{ pendentes: number; entregues: number; motivo?: string }> {
  const pendentes = await lerPendentes()
  if (!pendentes.length) return { pendentes: 0, entregues: 0 }
  const numero = numeroDoAvisoDeAtendimento()
  if (!numero) return { pendentes: pendentes.length, entregues: 0, motivo: 'sem número de aviso' }
  if (!(await janelaAberta(numero, agora))) return { pendentes: pendentes.length, entregues: 0, motivo: 'janela de 24h fechada' }

  const cabeca = pendentes.length > 1 ? `📬 ${pendentes.length} passagens enquanto a janela estava fechada:\n\n` : ''
  const corpo = pendentes
    .map((p) => `${new Date(p.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}\n${p.texto}`)
    .join('\n\n— — —\n\n')
  const { idExterno } = await enviarMensagemLivre(`+${numero}`, { tipo: 'texto', texto: (cabeca + corpo).slice(0, 4000) })
  await marcarEcoComoNosso(idExterno)
  await gravarPendentes([])
  await logar('INFO', 'aviso_equipe_entregue', `Avisos de passagem entregues (${pendentes.length})`, { quantos: pendentes.length })
  return { pendentes: 0, entregues: pendentes.length }
}
