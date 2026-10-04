/**
 * Vocabulário da marca DOCE LILIUM — espelho executável do tom da loja.
 *
 * Porta de `vocabulario.ts` da CarBoss. A lista NÃO se transfere entre
 * clientes (regra da skill `copy-de-followup`): o que é proibido lá — falar de
 * desconto, por exemplo — aqui é parte do negócio (cupom `MINHADL` no carrinho
 * vivo). Por isso cada termo foi reavaliado, e a lista foi MEDIDA contra os 16
 * templates aprovados na Meta (`test-mv` nível 1): ela descreve o que a loja já
 * escreve, não inventa regra que reprova copy aprovada.
 *
 * O validador consome isto por GREP no texto final — não por leitura de LLM.
 */

export const NOMES_CANONICOS = {
  marca: 'Doce Lilium',
  vertical: 'moda feminina',
  assina: 'Doce Lilium',
  cidade: 'Goiânia',
  /** Lançamento de coleção. Nunca "campanha" na fala com a cliente. */
  lancamento: 'drop',
  /** Quem compra. Nunca "lead". */
  pessoa: 'cliente',
} as const

/** termo proibido → para onde ir. Sem o substituto a lista não funciona. */
export const PALAVRAS_PROIBIDAS: ReadonlyArray<{ termo: string; motivo: string }> = [
  // Vocabulário de CRM/agência — a cliente não fala assim, e a equipe também não.
  { termo: 'follow-up', motivo: 'vocabulário de agência → "passando aqui de novo"' },
  { termo: 'followup', motivo: 'vocabulário de agência → "passando aqui de novo"' },
  { termo: 'lead', motivo: 'vocabulário de CRM → "cliente"' },
  { termo: 'pipeline', motivo: 'vocabulário de CRM' },
  { termo: 'funil', motivo: 'vocabulário de CRM' },
  { termo: 'churn', motivo: 'vocabulário de agência' },
  { termo: 'conversao', motivo: 'vocabulário de agência' },
  { termo: 'reuniao', motivo: 'a loja não marca reunião — quem fala é o atendimento' },
  { termo: 'demonstracao', motivo: 'vocabulário da CarBoss, não da loja' },
  // Vocabulário de OUTRO produto — vazou uma vez, não vaza de novo.
  { termo: 'carboss', motivo: 'é outro cliente' },
  { termo: 'estetica automotiva', motivo: 'é outro cliente' },
  { termo: 'caixa parado', motivo: 'é de outro produto (OCR)' },
  // Pressão falsa. O drop tem estoque de verdade limitado e isso PODE ser dito
  // ("peças contadas"); o que não pode é o clichê de anúncio.
  { termo: 'imperdivel', motivo: 'pressão falsa → diga o que a peça tem' },
  { termo: 'ultima chance', motivo: 'escassez falsa → "as peças são contadas"' },
  { termo: 'so hoje', motivo: 'escassez falsa' },
  { termo: 'corra', motivo: 'pressão falsa' },
  { termo: 'risco zero', motivo: 'garantia que não podemos dar' },
  { termo: 'frete gratis', motivo: 'só a regra da loja define frete — não prometer em copy' },
]

/**
 * Âncora por PERFIL — decide a segunda linha, nunca o texto inteiro.
 * Perfil ausente cai em `default`: nunca adivinhar.
 *
 * Na CarBoss o perfil saía do quiz do funil. Aqui sai do histórico de compra
 * (`PERFIS` em `cadencias-seed.ts`): nunca comprou / já comprou / recorrente.
 */
export const ANCORAS_POR_PERFIL: Record<string, string> = {
  nunca_comprou:
    '[[Separei com carinho o que mais saiu essa semana.|Tem peça nova que combina muito com o que você olhou.]]',
  ja_comprou:
    '[[Lembrei de você quando essas peças chegaram.|Chegou coisa nova que conversa com a sua última compra.]]',
  recorrente:
    '[[Você é de casa, então te conto antes de todo mundo.|Como você sempre volta, separei primeiro pra você.]]',
  default: '[[Tem novidade fresquinha aqui na loja.|Chegaram peças novas por aqui.]]',
}

/**
 * Cumprimento que não é pedido — lista fechada, só vale na primeira linha.
 * Sem acento e em minúscula — a comparação normaliza os dois lados.
 */
export const SAUDACOES_RETORICAS: readonly string[] = [
  'tudo bem', 'tudo bom', 'tudo certo', 'tudo joia', 'como vai', 'como voce esta', 'como esta',
]

/**
 * Fecho da última mensagem da cadência. Na CarBoss era uma frase só; aqui a
 * loja tem mais de um jeito aprovado de se despedir sem pressionar — a lista
 * foi medida contra `dl_carrinho_ultimo_v2`.
 */
export const ANUNCIOS_DE_ULTIMA: readonly string[] = [
  'ultimo aviso',
  'ultima vez',
  'ultima mensagem',
  'nao vou mais te chamar',
  'nao te chamo mais',
  'nao vou mais insistir',
  'deixo com voce',
]
/** Compat com a origem (um fecho só). */
export const ANUNCIO_ULTIMA_MENSAGEM = ANUNCIOS_DE_ULTIMA[0]

/** Não contam como CAPS em palavra comum. */
export const SIGLAS_PERMITIDAS = new Set(['DL', 'PIX', 'CPF', 'CEP', 'OK', 'VIP', 'MINHADL', 'PP', 'GG', 'EXG'])
