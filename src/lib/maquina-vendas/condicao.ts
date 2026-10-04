/**
 * A CONDIÇÃO — o desconto da Doce Lilium, num lugar só e com regra.
 *
 * Porta de `condicao.ts` da CarBoss. Lá era um preço de campanha com prazo
 * (`valeAte`), para não cravar "agosto" num template aprovado que não se edita.
 * Aqui a regra é outra e é do Owner:
 *
 *   UM cupom só — `MINHADL` (10%, não cumulativo) — e SÓ para quem tem um
 *   carrinho abandonado VIVO naquele telefone.
 *
 * Nenhum template leva o código (o carrinho é recuperado pela conversa, não
 * pela promessa de desconto). Quem usa esta condição é o atendimento — a IA e a
 * resposta livre dentro da janela de 24h —, e a pergunta é sempre a mesma:
 * "esta cliente pode ouvir o cupom agora?".
 *
 * O que acontece quando o cupom some da tela (Ajustes → cupom vazio): a função
 * devolve `null` e ninguém promete desconto. Silêncio é a falha correta —
 * prometer cupom que a loja não aceita é pior que não oferecer.
 */

export const CUPOM_UNICO = 'MINHADL'

export type CondicaoDoCarrinho = {
  cupom: string
  desconto: string
}

/**
 * O cupom que esta cliente pode ouvir AGORA, ou `null`.
 *
 * Puro. `carrinhoVivo` vem de `listarCarrinhosAbandonados` (Nuvemshop, ao vivo,
 * cache de 10 min em `cupons.ts`) — nunca de cópia no banco.
 */
export function condicaoDoCarrinho(opts: {
  cupomConfigurado: string | null
  descontoConfigurado: string | null
  carrinhoVivo: boolean
}): CondicaoDoCarrinho | null {
  if (!opts.carrinhoVivo) return null
  const cupom = (opts.cupomConfigurado ?? '').trim().toUpperCase()
  if (!cupom) return null
  // Só o cupom único. Outro código na tela (sobrou de campanha, digitado
  // errado) não vira promessa: a regra é de negócio, não de configuração.
  if (cupom !== CUPOM_UNICO) return null
  const desconto = (opts.descontoConfigurado ?? '').trim()
  return { cupom, desconto: desconto ? `${desconto.replace(/%$/, '')}%` : '10%' }
}

/** A copy desta etapa depende do cupom estar de pé? */
export function dependeDaCondicao(params: readonly string[]): boolean {
  return params.includes('cupom') || params.includes('desconto')
}
