/**
 * O DESFECHO DE CADA CLIENTE — uma inscrição, um balde, uma função.
 *
 * Porte de `resultado.ts` da CarBoss. É a fonte ÚNICA: tela, CSV e relatório
 * leem esta função — contar por caminhos diferentes põe dois números na mesma
 * conversa e ninguém sabe em qual acreditar.
 *
 * Regra de ouro: separar pelo que a AÇÃO exige, não pelo que o erro parece.
 * "Número inválido" e "bloqueada pela Meta" somados dariam um "não recebeu"
 * inútil — um pede conferir cadastro, o outro pede NÃO reenviar.
 *
 * Tradução para a Doce Lilium: lá o desfecho era reunião e depois venda; aqui
 * é PEDIDO (o carrinho virou compra, ou o pedido foi pago). Quem assume a
 * conversa é a equipe (Marília), não uma SDR.
 */

export const BALDE = {
  /** Comprou dentro da janela. É o que a operação inteira existe para produzir. */
  PEDIDO: 'PEDIDO',
  /** Pediu para parar. Negativa expressa. */
  PEDIU_PARAR: 'PEDIU_PARAR',
  /** A equipe entrou na conversa e ainda não virou pedido. */
  EQUIPE_ASSUMIU: 'EQUIPE_ASSUMIU',
  /** Falou alguma coisa depois do nosso toque. */
  RESPONDEU: 'RESPONDEU',
  /** A Meta disse que o número não recebe. Cadastro para corrigir. */
  NUMERO_INVALIDO: 'NUMERO_INVALIDO',
  /** A Meta recusou a entrega. Nada a corrigir, e NÃO se reenvia. */
  BLOQUEADA_META: 'BLOQUEADA_META',
  /** Recebeu ao menos uma mensagem e não respondeu nada. */
  ENTREGUE_SEM_RESPOSTA: 'ENTREGUE_SEM_RESPOSTA',
  /** Inscrita, nada saiu ainda. */
  AGUARDANDO_PRIMEIRO_ENVIO: 'AGUARDANDO_PRIMEIRO_ENVIO',
  /** Nunca saiu: sem nome utilizável, telefone impossível. */
  NAO_ALCANCAVEL: 'NAO_ALCANCAVEL',
  /** Saiu da régua por fato do pedido/loja, não por decisão dela. */
  ENCERRADA: 'ENCERRADA',
  /** Operador olhou a conversa e disse que não é a cliente. */
  CONTATO_ERRADO: 'CONTATO_ERRADO',
  /** Operador mandou tirar do relatório. */
  DESCONSIDERAR: 'DESCONSIDERAR',
} as const

export type Balde = (typeof BALDE)[keyof typeof BALDE]

export const ROTULO_DO_BALDE: Record<Balde, string> = {
  PEDIDO: 'Fez o pedido',
  PEDIU_PARAR: 'Pediu para parar',
  EQUIPE_ASSUMIU: 'A equipe assumiu',
  RESPONDEU: 'Respondeu',
  NUMERO_INVALIDO: 'Número inválido no WhatsApp',
  BLOQUEADA_META: 'Bloqueada pela Meta (sem reenvio)',
  ENTREGUE_SEM_RESPOSTA: 'Recebeu e ainda não respondeu',
  AGUARDANDO_PRIMEIRO_ENVIO: 'Aguardando o primeiro envio',
  NAO_ALCANCAVEL: 'Não alcançável (cadastro incompleto)',
  ENCERRADA: 'Régua encerrada',
  CONTATO_ERRADO: 'Contato errado (marcado à mão)',
  DESCONSIDERAR: 'Desconsiderado (marcado à mão)',
}

export type TomDoBalde = 'neutro' | 'bom' | 'alerta' | 'ruim'

/** `PEDIU_PARAR` é NEUTRO de propósito: não há nada a consertar, e a ação certa é não fazer nada. */
export const TOM_DO_BALDE: Record<Balde, TomDoBalde> = {
  PEDIDO: 'bom',
  EQUIPE_ASSUMIU: 'bom',
  RESPONDEU: 'bom',
  ENTREGUE_SEM_RESPOSTA: 'neutro',
  PEDIU_PARAR: 'neutro',
  NUMERO_INVALIDO: 'alerta',
  BLOQUEADA_META: 'ruim',
  AGUARDANDO_PRIMEIRO_ENVIO: 'neutro',
  NAO_ALCANCAVEL: 'alerta',
  ENCERRADA: 'neutro',
  CONTATO_ERRADO: 'neutro',
  DESCONSIDERAR: 'neutro',
}

export type GrupoDeBalde = 'deu-certo' | 'nao-deu' | 'fora-da-conta'

export const GRUPO_DO_BALDE: Record<Balde, GrupoDeBalde> = {
  PEDIDO: 'deu-certo',
  EQUIPE_ASSUMIU: 'deu-certo',
  RESPONDEU: 'deu-certo',
  ENTREGUE_SEM_RESPOSTA: 'nao-deu',
  PEDIU_PARAR: 'nao-deu',
  NUMERO_INVALIDO: 'nao-deu',
  BLOQUEADA_META: 'nao-deu',
  AGUARDANDO_PRIMEIRO_ENVIO: 'fora-da-conta',
  NAO_ALCANCAVEL: 'fora-da-conta',
  ENCERRADA: 'fora-da-conta',
  CONTATO_ERRADO: 'fora-da-conta',
  DESCONSIDERAR: 'fora-da-conta',
}

export const GRUPOS_DE_BALDES: { id: GrupoDeBalde; titulo: string; legenda: string }[] = [
  { id: 'deu-certo', titulo: 'Deu certo', legenda: 'a Máquina produziu conversa ou pedido' },
  { id: 'nao-deu', titulo: 'Não deu', legenda: 'chegou e parou aqui' },
  { id: 'fora-da-conta', titulo: 'Fora da conta', legenda: 'não entra na taxa' },
]

export const ACAO_DO_BALDE: Record<Balde, string> = {
  PEDIDO: 'Nada. Já comprou — acompanhar o envio.',
  PEDIU_PARAR: 'Nada, nunca. Não entra em régua nenhuma.',
  EQUIPE_ASSUMIU: 'Acompanhar com a equipe: a conversa está de pé e ainda não virou pedido.',
  RESPONDEU: 'Puxar a conversa — respondeu e ninguém da equipe entrou ainda.',
  NUMERO_INVALIDO: 'Conferir o cadastro da cliente. O número não recebe.',
  BLOQUEADA_META: 'Nada. Não reenviar — quem reenvia queima a qualidade do canal.',
  ENTREGUE_SEM_RESPOSTA: 'Deixar a régua seguir. É o curso normal.',
  AGUARDANDO_PRIMEIRO_ENVIO: 'Nada. A primeira mensagem ainda não venceu.',
  NAO_ALCANCAVEL: 'Completar o cadastro: nunca chegou a sair mensagem.',
  ENCERRADA: 'Nada. A régua terminou por um fato da loja.',
  CONTATO_ERRADO: 'Corrigir o contato da cliente.',
  DESCONSIDERAR: 'Nada.',
}

export interface InscricaoParaBalde {
  status: string
  tentativas: number
  respondeuEm?: Date | null
  humanoFalouEm?: Date | null
  converteuEm?: Date | null
  resultadoManual?: string | null
}

/**
 * Em que balde uma inscrição cai. A ORDEM é o conteúdo:
 *  · marcação manual ganha de tudo;
 *  · PEDIDO ganha de qualquer conversa (quem comprou também respondeu);
 *  · PEDIU_PARAR vem antes de sinal positivo anterior — consequência legal;
 *  · EQUIPE_ASSUMIU antes de RESPONDEU, senão some no meio das respostas;
 *  · NÚMERO/BLOQUEIO depois dos sinais positivos: o bloqueio foi de UMA
 *    mensagem, não da relação.
 */
export function baldeDaInscricao(i: InscricaoParaBalde): Balde {
  if (i.resultadoManual === 'CONTATO_ERRADO') return BALDE.CONTATO_ERRADO
  if (i.resultadoManual === 'DESCONSIDERAR') return BALDE.DESCONSIDERAR

  if (i.converteuEm || i.status === 'CONVERTEU') return BALDE.PEDIDO
  if (i.status === 'OPT_OUT') return BALDE.PEDIU_PARAR
  if (i.humanoFalouEm) return BALDE.EQUIPE_ASSUMIU
  if (i.respondeuEm) return BALDE.RESPONDEU

  switch (i.status) {
    case 'RESPONDEU':
      return BALDE.RESPONDEU
    case 'NUMERO_INVALIDO':
      return BALDE.NUMERO_INVALIDO
    case 'BLOQUEADA_META':
      return BALDE.BLOQUEADA_META
    case 'ERRO':
      return i.tentativas > 0 ? BALDE.ENTREGUE_SEM_RESPOSTA : BALDE.NAO_ALCANCAVEL
    case 'CANCELADA':
    case 'CONCLUIDA':
    case 'ENCERRADA':
      return i.tentativas > 0 ? BALDE.ENCERRADA : BALDE.NAO_ALCANCAVEL
    default:
      // ATIVA, PAUSADA
      return i.tentativas > 0 ? BALDE.ENTREGUE_SEM_RESPOSTA : BALDE.AGUARDANDO_PRIMEIRO_ENVIO
  }
}

export const ORDEM_DOS_BALDES: Balde[] = [
  BALDE.PEDIDO,
  BALDE.EQUIPE_ASSUMIU,
  BALDE.RESPONDEU,
  BALDE.ENTREGUE_SEM_RESPOSTA,
  BALDE.AGUARDANDO_PRIMEIRO_ENVIO,
  BALDE.PEDIU_PARAR,
  BALDE.NUMERO_INVALIDO,
  BALDE.BLOQUEADA_META,
  BALDE.NAO_ALCANCAVEL,
  BALDE.ENCERRADA,
  BALDE.CONTATO_ERRADO,
  BALDE.DESCONSIDERAR,
]

export const BALDES_DE_SUCESSO: Balde[] = [BALDE.PEDIDO]

export const BALDES_FORA_DA_CONTA: Balde[] = [
  BALDE.AGUARDANDO_PRIMEIRO_ENVIO,
  BALDE.NAO_ALCANCAVEL,
  BALDE.CONTATO_ERRADO,
  BALDE.DESCONSIDERAR,
]
