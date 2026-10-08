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
 *
 * Silêncio só é defeito quando havia o que ouvir (08/10/2026). A Datafy só
 * chama quando há status ou mensagem de cliente; sem nada sair, horas sem
 * chamada são o esperado — e o painel gritava "mudo" em vermelho no meio de
 * uma pausa planejada entre ondas de campanha. Agora: saiu mensagem depois da
 * última chamada e nada voltou em 15 min → mudo (crítico); não saiu nada →
 * "canal quieto", que só vira atenção depois de uma semana sem chamada.
 */

import prisma from '@/lib/prisma'
import { CURSOR_PULSO_WEBHOOK, CURSOR_PULSO_STATUS, MENSAGEM_STATUS } from './config'
import { SILENCIO_SUSPEITO_MS } from './prova'

const MUDO_MS = 6 * 60 * 60 * 1000
const JANELA_SEM_PROVA_MS = 7 * 24 * 60 * 60 * 1000
/** Sem nada sair, o silêncio só vira atenção depois disto. */
const QUIETO_DEMAIS_MS = 7 * 24 * 60 * 60 * 1000

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
  const [chamada, status, semProva, jaConfirmou, ultima] = await Promise.all([
    lerCarimbo(CURSOR_PULSO_WEBHOOK),
    lerCarimbo(CURSOR_PULSO_STATUS),
    medirSemProva(agora),
    prisma.mvMensagem.count({ where: { entregueEm: { not: null } } }),
    // Só o que saiu de verdade pela Cloud API (tem wamid) espera status de volta.
    prisma.mvMensagem.findFirst({
      where: { idExterno: { not: null }, enviadaEm: { not: null } },
      orderBy: { enviadaEm: 'desc' },
      select: { enviadaEm: true },
    }),
  ])
  return avaliarPulso({ chamada, status, semProva, jaConfirmou, agora, ultimoEnvio: ultima?.enviadaEm ?? null })
}

/** Puro: a leitura a partir dos carimbos e contagens. */
export function avaliarPulso(e: {
  chamada: Carimbo | null
  status: Carimbo | null
  semProva: number
  jaConfirmou: number
  agora: Date
  /** Último envio com wamid. `undefined` = não medido (mantém a regra antiga, só por tempo). */
  ultimoEnvio?: Date | null
}): PulsoDoCanal {
  const { chamada, status, semProva, jaConfirmou, agora, ultimoEnvio } = e
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

  const silencio = agora.getTime() - chamada.em.getTime()
  if (silencio > MUDO_MS && ultimoEnvio !== undefined) {
    const saiuDepois = !!ultimoEnvio && ultimoEnvio.getTime() > chamada.em.getTime()
    if (!saiuDepois) {
      const demais = silencio > QUIETO_DEMAIS_MS
      return {
        ...base,
        nivel: demais ? 'atencao' : 'ok',
        titulo: 'Canal quieto — nada saiu desde a última chamada',
        detalhe:
          `A última chamada da Datafy foi ${quando(chamada.em, agora)}` +
          (ultimoEnvio ? ` e o último envio ${quando(ultimoEnvio, agora)}` : '') +
          '. Sem mensagem saindo não há status para voltar, então o silêncio é o esperado. ' +
          'O próximo envio prova o cano: se em 15 min nada voltar, esta faixa fica vermelha.' +
          (demais ? ' Faz mais de uma semana sem nenhuma chamada — nem resposta de cliente.' : ''),
      }
    }
    if (agora.getTime() - ultimoEnvio!.getTime() <= SILENCIO_SUSPEITO_MS) {
      return {
        ...base,
        nivel: 'atencao',
        titulo: 'Aguardando a primeira confirmação do envio',
        detalhe:
          `Saiu mensagem ${quando(ultimoEnvio!, agora)}, depois de um silêncio desde ${quando(chamada.em, agora)}. ` +
          'A Meta costuma devolver o status em segundos; se nada chegar em 15 min, o canal está mudo.',
      }
    }
  }

  if (silencio > MUDO_MS) {
    return {
      ...base,
      nivel: 'critico',
      titulo: 'O canal está mudo',
      detalhe:
        `A última chamada da Datafy foi ${quando(chamada.em, agora)}` +
        (ultimoEnvio ? `, e depois dela saiu mensagem ${quando(ultimoEnvio, agora)} sem nenhum status de volta` : '') +
        `. Nada chega há mais de ${Math.floor(MUDO_MS / 3_600_000)}h — nem confirmação de entrega, nem resposta de cliente. ` +
        'Conferir no painel da Datafy a assinatura do webhook para /api/webhook/whatsapp.',
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
