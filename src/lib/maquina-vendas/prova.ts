/**
 * A PROVA DE ENTREGA — o que a Meta confirmou, em palavras que a equipe lê.
 *
 * Portado da CarBoss (`prova.ts`). `ENVIADA` significa "o POST voltou com um
 * wamid" — não é entrega. Este módulo separa "a gente mandou" de "a cliente
 * recebeu", e trata o SILÊNCIO como estado próprio: sem confirmação há 40 s é a
 * Meta sendo a Meta; há seis horas é o webhook desligado.
 *
 * Diferença do destino: o código de falha da Meta se chama `codigoErro` aqui
 * (na origem, `falhaCodigo`). A linha do Prisma entra como está.
 */

import { MENSAGEM_STATUS } from './config'

export const PROVA = {
  NAO_SAIU: 'NAO_SAIU',
  SEM_PROVA: 'SEM_PROVA',
  ENTREGUE: 'ENTREGUE',
  LIDA: 'LIDA',
  FALHOU: 'FALHOU',
  /** Janela de 24h fechada: não chegou, e voltou para a fila intacta. */
  DEVOLVIDA: 'DEVOLVIDA',
} as const

export type NivelDaProva = (typeof PROVA)[keyof typeof PROVA]

export interface Prova {
  nivel: NivelDaProva
  /** `✓` saiu · `✓✓` chegou · `✓✓` lida · `✗` não chegou · `↩` voltou para a fila */
  tique: string
  rotulo: string
  detalhe: string
}

export interface MensagemParaProva {
  status: string
  enviadaEm: Date | null
  entregueEm: Date | null
  lidaEm: Date | null
  idExterno: string | null
  codigoErro: number | null
  falhaMotivo: string | null
  naturezaFalha: string | null
}

/** A partir de quando o silêncio deixa de ser normal (folga larga de propósito). */
export const SILENCIO_SUSPEITO_MS = 15 * 60 * 1000

function haQuantoTempo(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 1) return 'agora há pouco'
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `há ${h}h`
  return `há ${Math.floor(h / 24)}d`
}

const hora = (d: Date) =>
  d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })

/** Verdade mais forte primeiro: leitura prova entrega, entrega prova envio, falha desmente todas. */
export function provaDeEntrega(m: MensagemParaProva, agora: Date = new Date()): Prova {
  // A devolvida vem antes: é a única AGENDADA que carrega falha.
  if (m.status === MENSAGEM_STATUS.AGENDADA && m.codigoErro !== null) {
    return {
      nivel: PROVA.DEVOLVIDA,
      tique: '↩',
      rotulo: 'voltou para a fila',
      detalhe:
        `Não chegou: ${m.falhaMotivo ?? `Meta ${m.codigoErro}`}. ` +
        'A mensagem voltou para a fila e sai sozinha quando a janela de 24h abrir — ' +
        'ou seja, quando a cliente responder.',
    }
  }
  if (m.lidaEm) {
    return { nivel: PROVA.LIDA, tique: '✓✓', rotulo: 'lida', detalhe: `A cliente abriu em ${hora(m.lidaEm)}.` }
  }
  if (m.entregueEm) {
    return {
      nivel: PROVA.ENTREGUE,
      tique: '✓✓',
      rotulo: 'entregue',
      detalhe: `A Meta confirmou a entrega no aparelho em ${hora(m.entregueEm)}.`,
    }
  }
  if (m.status === MENSAGEM_STATUS.ERRO || m.codigoErro !== null) {
    const natureza = m.naturezaFalha ? ` (${m.naturezaFalha.toLowerCase().replace(/_/g, ' ')})` : ''
    return {
      nivel: PROVA.FALHOU,
      tique: '✗',
      rotulo: 'não chegou',
      detalhe: `A Meta recusou${natureza}: ${m.falhaMotivo ?? 'sem detalhe'}.`,
    }
  }
  if (m.status !== MENSAGEM_STATUS.ENVIADA || !m.enviadaEm) {
    return {
      nivel: PROVA.NAO_SAIU,
      tique: '—',
      rotulo: 'não saiu',
      detalhe: 'Ainda não foi enviada, então não há confirmação a esperar.',
    }
  }
  const silencio = agora.getTime() - m.enviadaEm.getTime()
  const suspeito = silencio > SILENCIO_SUSPEITO_MS
  return {
    nivel: PROVA.SEM_PROVA,
    tique: '✓',
    rotulo: suspeito ? `sem confirmação ${haQuantoTempo(silencio)}` : 'aguardando confirmação',
    detalhe: m.idExterno
      ? `A Meta aceitou a mensagem em ${hora(m.enviadaEm)} e devolveu um id, mas ainda não confirmou a ` +
        `entrega${suspeito ? ' — e já faz tempo demais. Confira o pulso do canal, acima.' : '.'}`
      : `Saiu em ${hora(m.enviadaEm)} sem id da Meta. Sem id não existe como casar a confirmação: ` +
        'esta mensagem nunca vai sair de "sem prova", independente de ter chegado ou não.',
  }
}
