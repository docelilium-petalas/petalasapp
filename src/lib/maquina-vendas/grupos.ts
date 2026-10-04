/**
 * OS GRUPOS DOS INDICADORES — e por que eles moram sozinhos aqui.
 *
 * ⚠️ Este arquivo NÃO importa nada, e isso é a razão de ele existir. A tela da
 *    Máquina de Vendas é `'use client'`; `indicadores.ts` importa `config.ts`,
 *    que importa o `prisma`. Puxar a lista de grupos direto de `indicadores.ts`
 *    leva o driver `pg` para o navegador e quebra o build — foi exatamente o
 *    que aconteceu ao montar esta tela, e o `tsc` passou limpo: só o
 *    `next build` acusou.
 *
 *    Mesmo motivo e mesmo desenho de `filtros.ts`, que já existia por essa
 *    razão. Aqui fica só o que a TELA precisa saber; o que é assunto de query
 *    continua em `indicadores.ts`.
 */

/**
 * O grupo de um indicador — porque dezessete cartões iguais não são um painel,
 * são uma parede.
 *
 * A tela nasceu com cinco cartões numa grade de cinco colunas. Foram somados
 * doze indicadores e a grade nunca mudou: virou uma parede de dezessete peças
 * de peso idêntico, com órfão em toda última linha e "Venda" com o mesmo
 * destaque que "Bloqueadas pela Meta: 0". Quando tudo grita, nada é ouvido.
 */
export type GrupoIndicador = 'fila' | 'entrega' | 'resposta' | 'problema'

/**
 * O TOM — o que o número significa quando NÃO é zero.
 *
 * Não é enfeite: é o que decide o que salta aos olhos. Cartão zerado fica
 * apagado em qualquer tom, porque num dia bom quase tudo aqui é zero e um
 * painel inteiro aceso é um painel que ninguém lê.
 */
export type TomIndicador = 'neutro' | 'bom' | 'alerta' | 'ruim'

/** Os grupos na ordem da pergunta de quem opera: saiu? chegou? voltou? travou? */
export const GRUPOS_DE_INDICADORES: { id: GrupoIndicador; titulo: string; legenda: string }[] = [
  { id: 'fila', titulo: 'A fila', legenda: 'o que está para sair' },
  { id: 'entrega', titulo: 'A entrega', legenda: 'saiu, e chegou?' },
  { id: 'resposta', titulo: 'A resposta', legenda: 'o que voltou' },
  { id: 'problema', titulo: 'Onde travou', legenda: 'exige ação de alguém' },
]
