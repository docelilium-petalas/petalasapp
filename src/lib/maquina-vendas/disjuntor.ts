/**
 * O DISJUNTOR — corta o envio quando o canal está doente, e avisa gente.
 *
 * Portado da CarBoss (`disjuntor.ts`) sem mudança de regra. Origem do módulo:
 * em 18/08/2026 a operação de lá passou um dia mandando WhatsApp que não
 * chegava — HTTP 200, wamid, ENVIADA, painel verde — e só um humano olhando o
 * celular da cliente descobriu.
 *
 * - PAUSA em vez de só avisar: pausar é reversível; número queimado, não.
 * - "Sai e não chega" só desarma se o canal JÁ confirmou entrega alguma vez;
 *   sem isso, zero entregas é falta de webhook de status, não canal doente.
 * - Falhas POR DESTINATÁRIO (131049) não contam como falha de canal — três
 *   delas pararam a origem por dois dias com o número verde.
 *
 * Puro: sem banco, sem rede. Quem lê o banco e aplica é `vigia.ts`.
 */

import type { StatusDoNumero } from './datafy'

/** Quantas mensagens precisam ter saído para "nenhuma chegou" significar algo. */
export const AMOSTRA_MINIMA = 5
/** Falhas seguidas que já são padrão, e não azar. */
export const ERROS_PARA_DESARMAR = 3

export interface LeituraDoCanal {
  /** `null` = a Datafy não respondeu. Não é o mesmo que canal ruim. */
  canal: Pick<StatusDoNumero, 'status' | 'qualidade' | 'podeEnviar'> | null
  enviadasRecentes: number
  entreguesRecentes: number
  /** Falhas da última hora que dizem algo sobre o CANAL (não sobre a destinatária). */
  falhasDeCanalRecentes: number
  /** Alguma mensagem, em toda a história, já teve entrega confirmada? */
  jaConfirmouAlgumaVez: boolean
  envioJaPausado: boolean
}

export type CodigoDoDisjuntor = 'CANAL_SUSPENSO' | 'SAI_SEM_CHEGAR' | 'FALHA_EM_SERIE' | 'SEM_VOLTA'

export interface Veredito {
  desarmar: boolean
  avisar: boolean
  codigo: CodigoDoDisjuntor | null
  titulo: string
  detalhe: string
}

const OK: Veredito = { desarmar: false, avisar: false, codigo: null, titulo: '', detalhe: '' }

/** A ordem importa: canal suspenso explica os outros sintomas, então responde primeiro. */
export function avaliar(l: LeituraDoCanal): Veredito {
  const c = l.canal
  if (c) {
    const motivos: string[] = []
    if (c.status !== 'CONNECTED') motivos.push(`status ${c.status}`)
    if (c.podeEnviar === 'BLOCKED') motivos.push('a Meta bloqueou o envio')
    if (c.qualidade === 'RED') motivos.push('qualidade VERMELHA')
    if (motivos.length > 0) {
      return {
        desarmar: true,
        avisar: true,
        codigo: 'CANAL_SUSPENSO',
        titulo: 'Canal suspenso — envio pausado',
        detalhe:
          `A Meta está com o número em ${motivos.join(' · ')}. ` +
          'O envio foi pausado para não empurrar a qualidade mais para baixo. ' +
          'Recuperar número banido é caro; pausar é um clique.',
      }
    }
  }

  if (l.falhasDeCanalRecentes >= ERROS_PARA_DESARMAR) {
    return {
      desarmar: true,
      avisar: true,
      codigo: 'FALHA_EM_SERIE',
      titulo: 'Falha em série no envio — envio pausado',
      detalhe:
        `${l.falhasDeCanalRecentes} mensagens falharam por problema de CANAL na última hora ` +
        '(limite por destinatária não entra nesta conta). ' +
        'Isso é padrão, não azar: o envio foi pausado até alguém olhar o motivo.',
    }
  }

  if (l.enviadasRecentes >= AMOSTRA_MINIMA && l.entreguesRecentes === 0) {
    if (!l.jaConfirmouAlgumaVez) {
      return {
        desarmar: false,
        avisar: true,
        codigo: 'SEM_VOLTA',
        titulo: 'Mandando às cegas — nenhuma entrega jamais confirmada',
        detalhe:
          `${l.enviadasRecentes} mensagens saíram e a Meta nunca confirmou entrega de nenhuma. ` +
          'Isso não é canal doente: é o evento `messages` sem assinatura para /api/webhook/whatsapp ' +
          'no painel da Datafy. O envio segue, mas ninguém sabe se chega.',
      }
    }
    return {
      desarmar: true,
      avisar: true,
      codigo: 'SAI_SEM_CHEGAR',
      titulo: 'Sai e não chega — envio pausado',
      detalhe:
        `${l.enviadasRecentes} mensagens saíram e nenhuma foi entregue, sendo que o canal já confirmou ` +
        'entrega antes. A API aceita, devolve wamid, e a mensagem morre no caminho.',
    }
  }

  return OK
}

/** Quem já está pausado só volta a avisar quando o motivo mudar — alerta repetido vira ruído. */
export function decidir(l: LeituraDoCanal, ultimoCodigo: CodigoDoDisjuntor | null): Veredito {
  const v = avaliar(l)
  if (!v.codigo) return v
  if (l.envioJaPausado && v.codigo === ultimoCodigo) return { ...v, desarmar: false, avisar: false }
  return { ...v, desarmar: v.desarmar && !l.envioJaPausado }
}
