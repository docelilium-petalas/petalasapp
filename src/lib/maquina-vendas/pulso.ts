/**
 * O PULSO DO CANAL — "a confirmação de entrega está chegando?", numa frase.
 *
 * Portado da CarBoss (`pulso.ts`). Antes de acusar a mensagem, a tela tem que
 * dizer se o instrumento está ligado: com o webhook mudo, TODA linha fica "sem
 * confirmação" e a tela passa a afirmar que nada chegou em ninguém.
 *
 * Os dois carimbos que `api/webhook/whatsapp` escreve separam três estados, e
 * cada um pede conserto em lugar diferente:
 *   sem carimbo de chamada → a Datafy não chama (painel: assinatura/URL)
 *   chama, `casados: 0`    → status chega e o wamid não é nosso (código)
 *   `casados > 0`          → a volta está fechada
 */

import prisma from '@/lib/prisma'
import { CURSOR_PULSO_WEBHOOK, CURSOR_PULSO_STATUS, MENSAGEM_STATUS } from './config'
import { SILENCIO_SUSPEITO_MS } from './prova'

const MUDO_MS = 6 * 60 * 60 * 1000
const JANELA_SEM_PROVA_MS = 7 * 24 * 60 * 60 * 1000

export interface PulsoDoCanal {
  nivel: 'ok' | 'atencao' | 'critico'
  titulo: string
  detalhe: string
  ultimaChamada: string | null
  ultimaConfirmacao: string | null
  recebidos: number | null
  casados: number | null
  semProva: number
}

type Carimbo = { em: Date; recebidos?: number; casados?: number }

/** Grava o carimbo. Chamado pelo webhook; falha aqui é registrada, não engolida. */
export async function carimbar(chave: string, dados: { recebidos?: number; casados?: number } = {}, agora = new Date()) {
  const valor = JSON.stringify({ em: agora.toISOString(), ...dados })
  await prisma.mvCursor.upsert({ where: { chave }, create: { chave, valor }, update: { valor } })
}

async function lerCarimbo(chave: string): Promise<Carimbo | null> {
  const linha = await prisma.mvCursor.findUnique({ where: { chave } })
  return interpretarCarimbo(linha?.valor ?? null)
}

/** Puro. O carimbo é JSON escrito por outro processo: qualquer coisa pode estar lá. */
export function interpretarCarimbo(valor: string | null): Carimbo | null {
  if (!valor) return null
  try {
    const j = JSON.parse(valor)
    const em = new Date(j?.em)
    if (Number.isNaN(em.getTime())) return null
    return {
      em,
      recebidos: typeof j?.recebidos === 'number' ? j.recebidos : undefined,
      casados: typeof j?.casados === 'number' ? j.casados : undefined,
    }
  } catch {
    return null
  }
}

/** Só as que têm `idExterno`, e só 7 dias: um número que nunca zera é um número que ninguém olha. */
async function medirSemProva(agora: Date): Promise<number> {
  return prisma.mvMensagem.count({
    where: {
      status: MENSAGEM_STATUS.ENVIADA,
      idExterno: { not: null },
      entregueEm: null,
      lidaEm: null,
      codigoErro: null,
      enviadaEm: {
        gte: new Date(agora.getTime() - JANELA_SEM_PROVA_MS),
        lt: new Date(agora.getTime() - SILENCIO_SUSPEITO_MS),
      },
    },
  })
}

export async function lerPulsoDoCanal(agora: Date = new Date()): Promise<PulsoDoCanal> {
  const [chamada, status, semProva, jaConfirmou] = await Promise.all([
    lerCarimbo(CURSOR_PULSO_WEBHOOK),
    lerCarimbo(CURSOR_PULSO_STATUS),
    medirSemProva(agora),
    prisma.mvMensagem.count({ where: { entregueEm: { not: null } } }),
  ])
  return avaliarPulso({ chamada, status, semProva, jaConfirmou, agora })
}

/** Puro: a leitura a partir dos carimbos e contagens. */
export function avaliarPulso(e: {
  chamada: Carimbo | null
  status: Carimbo | null
  semProva: number
  jaConfirmou: number
  agora: Date
}): PulsoDoCanal {
  const { chamada, status, semProva, jaConfirmou, agora } = e
  const base = {
    ultimaChamada: chamada?.em.toISOString() ?? null,
    ultimaConfirmacao: status?.em.toISOString() ?? null,
    recebidos: status?.recebidos ?? null,
    casados: status?.casados ?? null,
    semProva,
  }

  if (!chamada) {
    return {
      ...base,
      nivel: 'critico',
      titulo: 'A Datafy nunca chamou este CRM',
      detalhe:
        'Nenhuma chamada de webhook foi registrada. Enquanto isso não mudar, o CRM não sabe se alguma ' +
        'mensagem foi entregue — o "sem confirmação" da tabela é sobre nós, não sobre as mensagens. ' +
        'Conserto no painel da Datafy: assinar o evento `messages` para /api/webhook/whatsapp.',
    }
  }

  if (agora.getTime() - chamada.em.getTime() > MUDO_MS) {
    return {
      ...base,
      nivel: 'critico',
      titulo: 'O canal está mudo',
      detalhe:
        `A última chamada da Datafy foi ${quando(chamada.em, agora)}. Nada chega há mais de ` +
        `${Math.floor(MUDO_MS / 3_600_000)}h — nem confirmação de entrega, nem resposta de cliente.`,
    }
  }

  if (!status) {
    return {
      ...base,
      nivel: semProva > 0 ? 'critico' : 'atencao',
      titulo: 'Nenhuma confirmação de entrega chegou ainda',
      detalhe:
        `A Datafy chamou ${quando(chamada.em, agora)}, então o cano está aberto — mas nenhum status de ` +
        'entrega passou por ele. ' +
        (semProva > 0
          ? `${semProva} mensagem(ns) já saíram e continuam sem prova por causa disso.`
          : 'Assim que a primeira sair, ela ficará sem prova até isso ser resolvido.'),
    }
  }

  if ((status.casados ?? 0) === 0 && (status.recebidos ?? 0) > 0) {
    // Já casou alguma vez? Então este lote era de mensagem que não é da
    // Máquina — o agente IA e a Marília falam pelo mesmo número.
    if (jaConfirmou > 0) {
      return {
        ...base,
        nivel: semProva > 0 ? 'atencao' : 'ok',
        titulo: 'A volta está fechada',
        detalhe:
          `${jaConfirmou} mensagem(ns) já tiveram entrega confirmada. O último lote (${quando(status.em, agora)}) ` +
          'trouxe status de mensagem que não é da Máquina — atendimento da IA ou da equipe pelo mesmo número. ' +
          (semProva > 0
            ? `Ainda assim ${semProva} mensagem(ns) continuam sem resposta da Meta: filtre por "sem confirmação".`
            : 'Toda mensagem da Máquina já teve resposta.'),
      }
    }
    return {
      ...base,
      nivel: 'critico',
      titulo: 'Chega confirmação, e ela nunca é das nossas mensagens',
      detalhe:
        `O último lote (${quando(status.em, agora)}) trouxe ${status.recebidos} status e ${status.casados} casaram ` +
        'com mensagem da Máquina — e nenhuma foi confirmada até hoje. O que não bate é o `wamid`.',
    }
  }

  return {
    ...base,
    nivel: semProva > 0 ? 'atencao' : 'ok',
    titulo: 'A confirmação de entrega está chegando',
    detalhe:
      `Última confirmação ${quando(status.em, agora)} · ${status.recebidos ?? 0} status, ${status.casados ?? 0} de mensagens nossas. ` +
      (semProva > 0
        ? `Ainda assim ${semProva} mensagem(ns) continuam sem resposta da Meta — com o canal funcionando, isso é notícia sobre elas.`
        : 'Toda mensagem enviada já teve resposta da Meta.'),
  }
}

function quando(d: Date, agora: Date): string {
  const min = Math.floor((agora.getTime() - d.getTime()) / 60_000)
  const relativo = min < 1 ? 'agora há pouco' : min < 60 ? `há ${min} min` : `há ${Math.floor(min / 60)}h`
  return `${relativo} (${d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })})`
}
