/**
 * A CONVERSA — uma linha do tempo por CLIENTE, não uma tabela por mensagem.
 *
 * Porte de `maquina-vendas/conversa.ts` da CarBoss. A aba de mensagens
 * responde "o que vai sair"; esta responde "o que aconteceu com a Ana?" —
 * juntando `entregueEm`, `lidaEm`, `textoEntregue`, `codigoErro` e
 * `humanoFalouEm`, que já estão no banco.
 *
 *   Ana · …1215
 *     ✓✓ 18/10 15:40  "Oi, Ana! Vi que você deixou…"   lida
 *     ↩  20/10 10:00  janela de 24h fechada — voltou para a fila
 *     💬 20/10 10:12  a cliente respondeu
 *     👤 20/10 10:15  alguém da equipe entrou na conversa
 *     🛍 20/10 11:02  fez o pedido
 *
 * Cada envio carrega a PROVA de `prova.ts` (a mesma da tabela), para as duas
 * telas nunca discordarem. A devolução é um EVENTO, não um erro: na tabela
 * ela parece mensagem que nunca saiu; aqui é o que foi.
 *
 * ⚠️ Não confundir com `@/lib/atendimento/conversa`, que é a MEMÓRIA da IA.
 *    Esta é só leitura, para a tela.
 */

import prisma from '@/lib/prisma'
import { PROVA, provaDeEntrega, type Prova } from './prova'

export type TipoEvento = 'envio' | 'devolucao' | 'resposta' | 'equipe' | 'pedido' | 'programada'

export interface EventoDaConversa {
  /** ISO — a tela formata; o servidor não decide fuso de exibição. */
  quando: string
  tipo: TipoEvento
  titulo: string
  detalhe?: string
  prova?: Prova
  texto?: string
  futuro?: boolean
}

export interface Conversa {
  inscricaoId: string
  nome: string
  telefone: string
  cadencia: string
  status: string
  ultimoSinal: string | null
  enviadas: number
  entregues: number
  respondeu: boolean
  eventos: EventoDaConversa[]
}

const iso = (d: Date) => d.toISOString()

function resumir(texto: string | null | undefined, limite = 160): string | undefined {
  const t = String(texto ?? '').replace(/\s+/g, ' ').trim()
  if (!t) return undefined
  return t.length > limite ? t.slice(0, limite - 1) + '…' : t
}

export const MOTIVO_DA_FALHA: Record<number, string> = {
  131047: 'janela de 24h fechada — voltou para a fila',
  131049: 'a Meta segurou para não cansar a cliente — volta depois',
  131026: 'o número não recebe no WhatsApp',
  133010: 'o número não recebe no WhatsApp',
  132000: 'o template não casou com os parâmetros',
  132001: 'o template não existe ou não está aprovado',
}

type MensagemDaConversa = {
  etapaOrdem: number
  status: string
  agendadaPara: Date
  enviadaEm: Date | null
  entregueEm: Date | null
  lidaEm: Date | null
  codigoErro: number | null
  falhaMotivo: string | null
  naturezaFalha: string | null
  textoEntregue: string | null
  mensagemFinal: string
  templateNome: string | null
  idExterno: string | null
  updatedAt: Date
}

/** Puro — testável com linhas montadas à mão. */
export function montarEventos(
  inscricao: {
    respondeuEm: Date | null
    respostas: number
    humanoFalouEm: Date | null
    converteuEm: Date | null
    valorConvertido?: unknown
  },
  mensagens: MensagemDaConversa[],
  agora: Date = new Date(),
): EventoDaConversa[] {
  const eventos: EventoDaConversa[] = []

  for (const m of mensagens) {
    const prova = provaDeEntrega(m, agora)

    if (prova.nivel === PROVA.DEVOLVIDA) {
      // O instante é `updatedAt`: `confirmacao.ts` limpa `enviadaEm` para a
      // mensagem voltar à fila, e o carimbo do envio recusado não sobrevive.
      eventos.push({
        quando: iso(m.updatedAt),
        tipo: 'devolucao',
        titulo: MOTIVO_DA_FALHA[m.codigoErro ?? 0] ?? `a Meta recusou (${m.codigoErro})`,
        detalhe: m.falhaMotivo ? resumir(m.falhaMotivo, 120) : undefined,
      })
      continue
    }

    if (m.enviadaEm) {
      eventos.push({
        quando: iso(m.enviadaEm),
        tipo: 'envio',
        titulo: `Etapa ${m.etapaOrdem}${m.templateNome ? ` · ${m.templateNome}` : ''}`,
        texto: resumir(m.textoEntregue ?? m.mensagemFinal),
        prova,
      })
      continue
    }

    if (m.status === 'AGENDADA' && m.agendadaPara > agora) {
      eventos.push({
        quando: iso(m.agendadaPara),
        tipo: 'programada',
        titulo: `Etapa ${m.etapaOrdem} programada`,
        texto: resumir(m.mensagemFinal, 120),
        futuro: true,
      })
    }
  }

  if (inscricao.respondeuEm) {
    eventos.push({
      quando: iso(inscricao.respondeuEm),
      tipo: 'resposta',
      titulo: 'a cliente respondeu',
      detalhe: inscricao.respostas > 0 ? `${inscricao.respostas} mensagem(ns) dela` : undefined,
    })
  }
  if (inscricao.humanoFalouEm) {
    eventos.push({ quando: iso(inscricao.humanoFalouEm), tipo: 'equipe', titulo: 'alguém da equipe entrou na conversa' })
  }
  if (inscricao.converteuEm) {
    const valor = Number(inscricao.valorConvertido ?? 0)
    eventos.push({
      quando: iso(inscricao.converteuEm),
      tipo: 'pedido',
      titulo: 'fez o pedido',
      detalhe: valor > 0 ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : undefined,
    })
  }

  return eventos.sort((a, b) => a.quando.localeCompare(b.quando))
}

export interface FiltroDeConversas {
  busca?: string
  pagina?: number
  porPagina?: number
}

/** As conversas mais quentes primeiro — pelo evento mais recente, não pela inscrição mais nova. */
export async function listarConversas(
  filtro: FiltroDeConversas = {},
  agora: Date = new Date(),
): Promise<{ conversas: Conversa[]; total: number }> {
  const porPagina = Math.min(Math.max(filtro.porPagina ?? 20, 1), 50)
  const pagina = Math.max(filtro.pagina ?? 1, 1)
  const busca = String(filtro.busca ?? '').trim()
  const digitos = busca.replace(/\D/g, '')

  const where = busca
    ? {
        OR: [
          { nomeSnapshot: { contains: busca, mode: 'insensitive' as const } },
          ...(digitos ? [{ telefoneE164: { contains: digitos } }] : []),
        ],
      }
    : {}

  const [total, inscricoes] = await Promise.all([
    prisma.mvInscricao.count({ where }),
    prisma.mvInscricao.findMany({
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      select: {
        id: true,
        nomeSnapshot: true,
        telefoneE164: true,
        status: true,
        respondeuEm: true,
        respostas: true,
        humanoFalouEm: true,
        converteuEm: true,
        valorConvertido: true,
        cadencia: { select: { nome: true } },
        mensagens: {
          orderBy: { agendadaPara: 'asc' },
          select: {
            etapaOrdem: true,
            status: true,
            agendadaPara: true,
            enviadaEm: true,
            entregueEm: true,
            lidaEm: true,
            codigoErro: true,
            falhaMotivo: true,
            naturezaFalha: true,
            textoEntregue: true,
            mensagemFinal: true,
            templateNome: true,
            idExterno: true,
            updatedAt: true,
          },
        },
      },
    }),
  ])

  const conversas = inscricoes.map((i) => {
    const eventos = montarEventos(i, i.mensagens, agora)
    const passados = eventos.filter((e) => !e.futuro)
    return {
      inscricaoId: i.id,
      nome: i.nomeSnapshot,
      telefone: i.telefoneE164,
      cadencia: i.cadencia.nome,
      status: i.status,
      ultimoSinal: passados.length ? passados[passados.length - 1].quando : null,
      enviadas: i.mensagens.filter((m) => m.enviadaEm !== null).length,
      entregues: i.mensagens.filter((m) => m.entregueEm !== null).length,
      respondeu: i.respondeuEm !== null,
      eventos,
    }
  })

  conversas.sort((a, b) => String(b.ultimoSinal ?? '').localeCompare(String(a.ultimoSinal ?? '')))
  return { conversas, total }
}
