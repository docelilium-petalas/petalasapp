/**
 * "PARA DE ME MANDAR MENSAGEM" — o detector, e o lado para o qual ele erra.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Os dois erros possíveis não custam a mesma coisa:
 *
 *   FALSO NEGATIVO  a pessoa pediu para sair e continua recebendo. Ela
 *                   denuncia, o `quality_rating` do número cai, e um número
 *                   queimado leva semanas para voltar — quando volta.
 *   FALSO POSITIVO  a gente para de falar com alguém que não pediu. Custa
 *                   uma venda, e a pessoa pode voltar sozinha.
 *
 * Então o detector se inclina para DETECTAR. Mas inclinar-se não é chutar: o
 * problema do português é que "para" é preposição em metade das frases da
 * língua — "guardei para você", "vou para casa", "é para amanhã".
 *
 * ── O DISCRIMINADOR QUE RESOLVE ISSO ──────────────────────────────────────
 * Palavra solta só vale quando ela é A MENSAGEM INTEIRA.
 *
 * A primeira versão deste arquivo cortava por tamanho — "até 60 caracteres,
 * aceita palavra solta" — e falhou na hora em quatro frases reais:
 * "Guardei para você, obrigada!" (28), "Quanto sai o frete para Goiânia?"
 * (32). São curtas, têm "para", e não são despedida nenhuma.
 *
 * Tamanho não separa: POSIÇÃO separa. Quem quer sair manda "para" e nada
 * mais. Quem está conversando usa "para" no meio de uma frase, porque é
 * preposição. Então:
 *
 *   palavra solta      →  só se a mensagem inteira for ela (mais um "por
 *                         favor" ou "obrigada", que não mudam a intenção)
 *   frase inequívoca   →  em qualquer posição, em mensagem de qualquer
 *                         tamanho ("parar de receber", "me descadastra")
 *
 * O `trecho` é guardado sempre, e é ele que permite auditar um falso positivo
 * sem precisar abrir a conversa da pessoa.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** O texto exato do botão de saída dos templates MARKETING. */
export const BOTAO_SAIR = 'Parar de receber'

/**
 * Palavras que só valem SOZINHAS — sendo a mensagem inteira.
 *
 * "para" e "sair" são preposição e verbo comuns; fora desta condição elas
 * produzem falso positivo em conversa normal de loja de roupa.
 */
const PALAVRAS_SOZINHAS = [
  'para',
  'pare',
  'parar',
  'sair',
  'stop',
  'cancelar',
  'cancela',
  'remover',
  'remove',
  'descadastrar',
  'descadastra',
  'chega',
]

/**
 * Cortesia que acompanha a despedida sem mudar a intenção.
 *
 * "para, por favor" continua sendo "para". Sem isto, o pedido educado — que é
 * a maioria — escaparia do detector.
 */
const CORTESIA = [
  'por favor',
  'pfv',
  'pf',
  'obrigad[oa]',
  'obg',
  'vlw',
  'valeu',
  'bom dia',
  'boa tarde',
  'boa noite',
  'oi',
  'ola',
]

/** Frase inequívoca. Vale em qualquer posição e em mensagem de qualquer tamanho. */
const FRASES_INEQUIVOCAS = [
  'parar de receber',
  'pare de receber',
  'para de receber',
  'parar de mandar',
  'pare de mandar',
  'para de mandar',
  'nao quero mais receber',
  'nao quero receber',
  'nao quero mais mensagem',
  'nao quero mais nada',
  'me descadastr',
  'descadastrar',
  'me remove da lista',
  'remover da lista',
  'sair da lista',
  'me tira da lista',
  'me tira dessa lista',
  'me tire da lista',
  'tirar da lista',
  'nao me mande mais',
  'nao me manda mais',
  'nao me envie mais',
  'para de me mandar',
  'pare de me mandar',
  'nao tenho interesse',
  'sem interesse',
  'me bloqueia',
  'nao me perturbe',
]

/** Minúsculas, sem acento, sem pontuação — para comparar frase com frase. */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Deteccao = {
  saiu: boolean
  /** `botao` | `texto` — de onde veio a negativa. */
  origem: 'botao' | 'texto'
  /** O que casou, para auditoria. */
  motivo?: string
}

/**
 * A pessoa está pedindo para sair?
 *
 * `textoBotao` é o rótulo do quick reply, quando a mensagem veio de um botão.
 * Botão é definitivo: não tem ambiguidade nenhuma em alguém tocar em "Parar
 * de receber".
 */
export function pediuParaSair(texto: string | null | undefined, textoBotao?: string | null): Deteccao {
  if (textoBotao && normalizar(textoBotao) === normalizar(BOTAO_SAIR)) {
    return { saiu: true, origem: 'botao', motivo: BOTAO_SAIR }
  }

  const limpo = normalizar(texto ?? '')
  if (!limpo) return { saiu: false, origem: 'texto' }

  for (const frase of FRASES_INEQUIVOCAS) {
    if (limpo.includes(frase)) return { saiu: true, origem: 'texto', motivo: frase }
  }

  // Palavra solta: só se, tirada a cortesia, não sobrar mais nada.
  //
  // O regex nasce da LISTA, em vez de ser escrito à mão ao lado dela: assim
  // acrescentar uma cortesia é mexer num lugar só, e não há como a lista e o
  // regex discordarem. A fronteira `\b` é o que impede "oi" de casar dentro
  // de "coisa" e comer a palavra no meio.
  const cortesia = new RegExp(`\\b(?:${CORTESIA.join('|')})\\b`, 'g')
  const nu = limpo
    .replace(cortesia, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (PALAVRAS_SOZINHAS.includes(nu)) return { saiu: true, origem: 'texto', motivo: nu }

  return { saiu: false, origem: 'texto' }
}
