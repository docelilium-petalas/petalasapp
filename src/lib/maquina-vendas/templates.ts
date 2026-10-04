/**
 * QUAL TEMPLATE ABRE A PORTA DE CADA ETAPA — e qual ASSUNTO ele carrega.
 *
 * Porta de `templates.ts` da CarBoss (04/10/2026).
 *
 * ── O que mudou na porta ───────────────────────────────────────────────────
 *  · ORIGEM DO MAPA: lá era um objeto escrito à mão, chaveado pelo nome da
 *    cadência. Aqui a etapa JÁ guarda `templateNome` (no banco e no seed), e o
 *    corpo mora no catálogo — então o mapa é DERIVADO de `CADENCIAS` e
 *    `VARIAVEIS`. Escrever de novo à mão criaria uma terceira fonte para a
 *    mesma frase.
 *  · PARÂMETROS POSICIONAIS: a CarBoss manda parâmetros NOMEADOS
 *    (`{{nome}}`); a Doce Lilium manda `{{1}}`, `{{2}}` — é o que está em
 *    produção e funciona. `parametrosDoTemplate` devolve a lista na ordem de
 *    `VARIAVEIS`, nunca um objeto.
 *  · FALLBACK DO NOME: lá `nome` vazio virava "tudo bem". Aqui não: sem nome de
 *    gente o valor fica vazio e quem chama decide (o observador já pula, o
 *    despachante já barra). "Oi, tudo bem!" com vírgula no lugar errado é o
 *    tipo de frase que a dona da marca não assinaria.
 *
 * ── Por que o ASSUNTO existe ───────────────────────────────────────────────
 * A mesma cliente pode cair em duas trilhas — reativação e coleção nova, por
 * exemplo — e as duas anunciam a mesma coisa: a coleção do momento. O assunto
 * é o que deixa o histórico perceber que ela já ouviu aquilo, seja de que
 * trilha for. A chave é o assunto e não o nome do template de propósito: dois
 * templates diferentes podem anunciar a mesma novidade.
 */

import type { Contexto } from './copy'
import { CADENCIAS } from './cadencias-seed'
import { CATALOGO, VARIAVEIS } from './catalogo-templates'

export interface TemplateDaEtapa {
  nome: string
  /** Variáveis do corpo, NA ORDEM da Meta (`{{1}}`, `{{2}}`…). */
  params: readonly (keyof Contexto)[]
  assunto: string
}

/**
 * Template → assunto. Um assunto por template do catálogo; a bateria de nível 1
 * falha se aparecer template novo sem assunto.
 *
 * ⚠️ `colecao` é compartilhado por reativação e coleção nova de propósito: as
 *    duas falam da coleção do momento, e quem recebeu uma não precisa da outra
 *    na mesma semana.
 */
export const ASSUNTO_DO_TEMPLATE: Record<string, string> = {
  dl_carrinho_lembrete_v1: 'carrinho-lembrete',
  dl_carrinho_duvida_v1: 'carrinho-duvida',
  dl_carrinho_ultimo_v2: 'carrinho-ultimo',
  dl_pedido_confirmado_v1: 'pedido-recebido',
  dl_pix_pendente_v1: 'pix-pendente',
  dl_pagamento_aprovado_v1: 'pagamento-aprovado',
  dl_pedido_enviado_v1: 'pedido-enviado',
  dl_pedido_entregue_v1: 'pedido-entregue',
  dl_pos_entrega_avaliacao_v1: 'avaliacao',
  dl_troca_instrucoes_v1: 'troca',
  dl_reativacao_60d_v1: 'colecao',
  dl_colecao_nova_v1: 'colecao',
  dl_lista_desejos_voltou_v1: 'desejo-voltou',
  dl_drop_1010_save_the_date_v1: 'drop-1010-save-the-date',
  dl_drop_1010_vespera_v1: 'drop-1010-vespera',
  dl_drop_1010_chegou_v1: 'drop-1010-chegou',
  // Porta do briefing diário: vai para o número da EQUIPE, nunca para cliente,
  // e não passa pelo despachante — o assunto existe só para a bateria cobrir.
  dl_relatorio_pronto_v1: 'relatorio-equipe',
}

/** O template do catálogo com params e assunto, ou `null` se não existir. */
export function templatePorNome(nome: string): TemplateDaEtapa | null {
  if (!CATALOGO.some((t) => t.nome === nome)) return null
  const params = VARIAVEIS[nome]
  const assunto = ASSUNTO_DO_TEMPLATE[nome]
  if (!params || !assunto) return null
  return { nome, params, assunto }
}

/** nome da cadência → ordem → template. Derivado do seed, nunca escrito à mão. */
export const TEMPLATE_POR_CADENCIA: Record<string, Record<number, TemplateDaEtapa>> = Object.fromEntries(
  CADENCIAS.map((c) => [
    c.nome,
    Object.fromEntries(
      c.etapas
        .map((e) => [e.ordem, templatePorNome(e.templateNome)] as const)
        .filter((par): par is readonly [number, TemplateDaEtapa] => par[1] !== null),
    ),
  ]),
)

/**
 * O template desta etapa, ou `null`.
 *
 * Aceita o `templateNome` da etapa no banco como segundo caminho: cadência
 * criada pela tela não está no seed, mas a etapa dela sabe o template.
 */
export function templateDaEtapa(
  cadenciaNome: string,
  etapaOrdem: number,
  templateNomeDaEtapa?: string | null,
): TemplateDaEtapa | null {
  if (templateNomeDaEtapa) return templatePorNome(templateNomeDaEtapa)
  return TEMPLATE_POR_CADENCIA[cadenciaNome]?.[etapaOrdem] ?? null
}

export function templatesDaCadencia(cadenciaNome: string): TemplateDaEtapa[] {
  return Object.values(TEMPLATE_POR_CADENCIA[cadenciaNome] ?? {})
}

export function assuntoDoTemplate(nome: string): string | null {
  return ASSUNTO_DO_TEMPLATE[nome] ?? null
}

export function templatesDoAssunto(assunto: string): string[] {
  return Object.entries(ASSUNTO_DO_TEMPLATE)
    .filter(([, a]) => a === assunto)
    .map(([nome]) => nome)
}

/**
 * Os valores dos parâmetros, NA ORDEM que o template pede.
 *
 * Valor ausente vira '' — e `faltando` diz quais. Quem envia tem de barrar
 * quando `faltando` não está vazio: a Meta devolve 132000 para parâmetro vazio,
 * e o despachante já conta isso como falha do template, não da cliente.
 */
export function parametrosDoTemplate(
  template: TemplateDaEtapa,
  contexto: Contexto,
): { valores: string[]; faltando: (keyof Contexto)[] } {
  const faltando: (keyof Contexto)[] = []
  const valores = template.params.map((p) => {
    const v = String(contexto[p] ?? '').trim()
    if (!v) faltando.push(p)
    return v
  })
  return { valores, faltando }
}

/** Template do catálogo que não tem assunto ou mapa de variáveis — a bateria cobra. */
export function templatesSemAssunto(): string[] {
  return CATALOGO.filter((t) => !ASSUNTO_DO_TEMPLATE[t.nome] || !VARIAVEIS[t.nome]).map((t) => t.nome)
}
