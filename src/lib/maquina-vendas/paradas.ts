/**
 * CONDIÇÕES DE PARADA — avaliadas na varredura E de novo na hora do envio.
 * Entre agendar e enviar o mundo muda.
 *
 * Porta de `paradas.ts` da CarBoss. Lá a fala do lead vinha de
 * `n8n_chat_histories`; aqui vem de `MvResposta.ultimasMsgs`, que é a MESMA
 * linha que a IA usa como memória (`@/lib/atendimento/conversa`) — uma fonte só
 * para "o que ela disse" evita a IA e a Máquina discordarem.
 *
 * Tudo aqui é SOMENTE LEITURA do funil (Deal/Stage). Proibido parar em
 * silêncio: toda parada grava `motivoParada`, que aparece na tabela.
 *
 * ⚠️ "A equipe falou hoje" NÃO é parada (regra da origem, mantida): a Marília
 *    conversar com a cliente adia o toque de marketing, não mata a cadência.
 *    Quem trata é o despachante, pelo relógio de 12h do atendimento humano.
 */

import prisma from '@/lib/prisma'
import { INSCRICAO_STATUS, MENSAGEM_STATUS } from './config'
import { pediuParaSair } from './opt-out'
import { GATILHOS_INTOCAVEIS } from './cadencias-seed'

export type ResultadoParadas = { avaliadas: number; paradas: number; detalhes: string[] }

/** Folga contra defasagem de relógio app × banco. Erra para o lado de parar. */
const FOLGA_MS = 2 * 60_000

type TurnoGravado = { em?: string; de?: string; texto?: string }

/** As falas da CLIENTE depois de `depoisDe`, mais recente primeiro. Puro. */
export function falasDaClienteDepois(ultimasMsgs: unknown, depoisDe: Date): Array<{ em: Date; texto: string }> {
  if (!Array.isArray(ultimasMsgs)) return []
  const corte = depoisDe.getTime() - FOLGA_MS
  return (ultimasMsgs as TurnoGravado[])
    .filter((t) => t && t.de !== 'loja' && typeof t.texto === 'string' && t.texto.trim())
    .map((t) => ({ em: new Date(t.em ?? 0), texto: String(t.texto) }))
    .filter((t) => Number.isFinite(t.em.getTime()) && t.em.getTime() > corte)
    .sort((a, b) => b.em.getTime() - a.em.getTime())
}

/** A última fala da cliente depois de `depoisDe`, ou null. */
export async function ultimaRespostaDaCliente(
  telefoneKey: string,
  depoisDe: Date,
): Promise<{ em: Date; texto: string } | null> {
  const linha = await prisma.mvResposta.findUnique({
    where: { telefoneKey },
    select: { ultimasMsgs: true, respondidoEm: true },
  })
  if (!linha) return null
  const falas = falasDaClienteDepois(linha.ultimasMsgs, depoisDe)
  if (falas[0]) return falas[0]
  // Linha sem turnos legíveis mas com carimbo: a cliente falou (mídia, botão).
  if (linha.respondidoEm && linha.respondidoEm.getTime() > depoisDe.getTime() - FOLGA_MS) {
    return { em: linha.respondidoEm, texto: '' }
  }
  return null
}

export async function clienteRespondeu(telefoneKey: string, depoisDe: Date): Promise<boolean> {
  return (await ultimaRespostaDaCliente(telefoneKey, depoisDe)) !== null
}

/**
 * Status da parada a partir do motivo. "pediu para parar" antes de
 * "respondeu": os dois começam com `cliente_`, e a ordem separa "parou esta
 * cadência" de "nunca mais".
 */
export function statusDaParada(motivo: string): string {
  if (motivo.startsWith('cliente_pediu_para_parar')) return INSCRICAO_STATUS.OPT_OUT
  if (motivo.startsWith('cliente_respondeu')) return INSCRICAO_STATUS.RESPONDEU
  return INSCRICAO_STATUS.CANCELADA
}

type InscricaoParaAvaliar = {
  id: string
  telefoneKey: string
  dealId: string | null
  createdAt: Date
  cadencia: { stageId: string | null }
}

/** Devolve o motivo da parada, ou null se a inscrição segue viva. */
export async function avaliarParada(i: InscricaoParaAvaliar): Promise<{ motivo: string; respondeuEm: Date | null } | null> {
  // Funil: só para cadência de COLUNA (stageId). Carrinho, pedido e drop não
  // nascem de card e não morrem por card.
  if (i.dealId && i.cadencia.stageId) {
    const deal = await prisma.deal.findUnique({ where: { id: i.dealId }, select: { status: true, stageId: true } })
    if (!deal) return { motivo: 'negocio_apagado', respondeuEm: null }
    if (deal.status !== 'OPEN') return { motivo: `negocio_fechado: ${deal.status}`, respondeuEm: null }
    if (deal.stageId !== i.cadencia.stageId) return { motivo: 'etapa_mudou: o card saiu da coluna de origem', respondeuEm: null }
  }

  const fala = await ultimaRespostaDaCliente(i.telefoneKey, i.createdAt)
  if (fala) {
    const recusa = pediuParaSair(fala.texto, fala.texto)
    if (recusa.saiu) return { motivo: `cliente_pediu_para_parar: "${fala.texto.slice(0, 120)}"`, respondeuEm: fala.em }
    return { motivo: 'cliente_respondeu no WhatsApp', respondeuEm: fala.em }
  }
  return null
}

async function pararInscricao(id: string, status: string, motivo: string, respondeuEm: Date | null): Promise<void> {
  await prisma.$transaction([
    prisma.mvInscricao.update({
      where: { id },
      // O carimbo entra na MESMA transação que o status: em dois passos a
      // inscrição ficaria RESPONDEU sem `respondeuEm` e o Resultados não a veria.
      data: { status, motivoParada: motivo.slice(0, 200), ...(respondeuEm ? { respondeuEm } : {}) },
    }),
    prisma.mvMensagem.updateMany({
      where: { inscricaoId: id, status: MENSAGEM_STATUS.AGENDADA },
      data: { status: MENSAGEM_STATUS.CANCELADA, erro: motivo.slice(0, 200) },
    }),
  ])
}

/** Varre as inscrições ATIVAS e aplica as paradas. LIMIT sempre com ORDER BY. */
export async function rodarParadas(limite = 500): Promise<ResultadoParadas> {
  const ativas = await prisma.mvInscricao.findMany({
    // ⚠️ A campanha 10.10 fica de fora da VARREDURA (decisão do Owner em
    //    04/10/2026: "não mexer em nada da campanha agora"). As ondas dela têm
    //    o próprio motor (`campanha-datada.ts`), e cancelar mensagem AGENDADA
    //    do d1 aqui mudaria o estado que o d2 usa para semear. A trava no
    //    momento do envio (despachante) continua valendo para todas.
    where: { status: INSCRICAO_STATUS.ATIVA, cadencia: { gatilho: { notIn: [...GATILHOS_INTOCAVEIS] } } },
    select: {
      id: true,
      telefoneKey: true,
      dealId: true,
      createdAt: true,
      nomeSnapshot: true,
      respondeuEm: true,
      cadencia: { select: { stageId: true, nome: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limite,
  })

  const detalhes: string[] = []
  let paradas = 0

  for (const i of ativas) {
    const r = await avaliarParada(i)
    if (!r) continue
    const status = statusDaParada(r.motivo)
    await pararInscricao(i.id, status, r.motivo, i.respondeuEm ? null : r.respondeuEm)
    if (status === INSCRICAO_STATUS.OPT_OUT) {
      await prisma.mvOptOut.upsert({
        where: { telefoneKey: i.telefoneKey },
        create: { telefoneKey: i.telefoneKey, origem: 'texto', trecho: r.motivo.slice(0, 300), despedidaEm: r.respondeuEm ?? new Date() },
        update: {},
      })
    }
    paradas++
    detalhes.push(`${i.nomeSnapshot} · ${i.cadencia.nome}: ${r.motivo}`)

    if (r.motivo.startsWith('cliente_')) {
      await prisma.logEvento.create({
        data: {
          origem: 'maquina-vendas',
          nivel: status === INSCRICAO_STATUS.OPT_OUT ? 'AVISO' : 'INFO',
          tipo: status === INSCRICAO_STATUS.OPT_OUT ? 'cliente_opt_out' : 'cliente_respondeu',
          titulo:
            status === INSCRICAO_STATUS.OPT_OUT
              ? `${i.nomeSnapshot} pediu para parar`
              : `${i.nomeSnapshot} respondeu (${i.cadencia.nome})`,
          dados: JSON.stringify({ inscricaoId: i.id, motivo: r.motivo }),
        },
      })
    }
  }

  return { avaliadas: ativas.length, paradas, detalhes }
}
