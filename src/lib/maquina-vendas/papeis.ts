/**
 * O NOME DE CADA MENSAGEM — a fonte única do vocabulário da régua.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte de `papeis.ts` do CRM CarBoss. A regra é a mesma: a operação pensa em
 * "o lembrete do carrinho saiu?", o banco pensa em `templateNome` e
 * `etapaOrdem`. Este arquivo é o tradutor, em UM lugar — duas tabelas
 * parecidas em arquivos diferentes é como o mesmo template vira "lembrete"
 * numa tela e "C1" na outra.
 *
 * ── O que mudou em relação à origem ───────────────────────────────────────
 *  · Lá havia dois motores (funil n8n com marcos T0/D1/R1/R2, e a Máquina com
 *    etapas numeradas). Aqui todo template `dl_*` é disparado pela Máquina;
 *    a separação útil é MARKETING × TRANSACIONAL (Meta cobra e trata
 *    diferente, e opt-out pesa diferente).
 *  · A "régua do compromisso" (demonstração marcada) não existe na loja. O
 *    equivalente é a RÉGUA DO PEDIDO — confirmado → pago → enviado →
 *    entregue → avaliação — exportada para a tela mostrar onde o pedido está.
 *  · Os 16 templates vêm do `CATALOGO`; o teste de nível 1 garante que todo
 *    template do catálogo tem papel aqui.
 * ══════════════════════════════════════════════════════════════════════════
 */

export type MotorDaMensagem = 'marketing' | 'transacional'

export interface PapelDoTemplate {
  motor: MotorDaMensagem
  /** Sigla curta para o marcador do trilho. */
  marco: string
  /** O que a mensagem FAZ, em poucas palavras. Vira o título do passo. */
  papel: string
  /** Uma linha explicando por que ela existe. Vai no corpo do cartão. */
  porque: string
}

/**
 * ⚠️ Template que não estiver aqui NÃO é erro: a tela cai no nome técnico.
 *    Lançar exceção faria um `_v2` recém-aprovado derrubar a tela.
 */
export const PAPEL_POR_TEMPLATE: Record<string, PapelDoTemplate> = {
  // ── Carrinho abandonado ─────────────────────────────────────────────────
  dl_carrinho_lembrete_v1: {
    motor: 'marketing',
    marco: 'C1',
    papel: 'Lembrete do carrinho',
    porque: 'Primeiro toque: lembra a peça que ficou no carrinho. Sem cupom — a conversa vem antes do desconto.',
  },
  dl_carrinho_duvida_v1: {
    motor: 'marketing',
    marco: 'C2',
    papel: 'Alguma dúvida?',
    porque: 'Segundo toque: oferece ajuda com tamanho, frete ou prazo — as três travas mais comuns.',
  },
  dl_carrinho_ultimo_v2: {
    motor: 'marketing',
    marco: 'C3',
    papel: 'Último aviso do carrinho',
    porque: 'A despedida desta régua. O cupom MINHADL só aparece se a cliente responder, nunca no template.',
  },

  // ── Pedido e pagamento ──────────────────────────────────────────────────
  dl_pedido_confirmado_v1: {
    motor: 'transacional',
    marco: 'P0',
    papel: 'Pedido confirmado',
    porque: 'Sai quando o pedido nasce: confirma número e itens.',
  },
  dl_pix_pendente_v1: {
    motor: 'marketing',
    marco: 'PX',
    papel: 'Pix pendente',
    porque: 'Lembra o Pix que não foi pago. Reclassificado pela Meta como MARKETING — por isso respeita opt-out.',
  },
  dl_pagamento_aprovado_v1: {
    motor: 'transacional',
    marco: 'P1',
    papel: 'Pagamento aprovado',
    porque: 'Quem comprou quer saber que deu certo. Sai no `order/paid`.',
  },
  dl_pedido_enviado_v1: {
    motor: 'transacional',
    marco: 'P2',
    papel: 'Pedido enviado + rastreio',
    porque: 'Leva o link de rastreio assinado. Não sai sem código de rastreio — mensagem com buraco é pior que nenhuma.',
  },
  dl_pedido_entregue_v1: {
    motor: 'transacional',
    marco: 'P3',
    papel: 'Pedido entregue',
    porque: 'Fecha o ciclo do pedido.',
  },

  // ── Pós-venda ───────────────────────────────────────────────────────────
  dl_pos_entrega_avaliacao_v1: {
    motor: 'marketing',
    marco: 'PV',
    papel: 'Como ficou a peça?',
    porque: 'Pede avaliação depois da entrega. É também a porta da recompra.',
  },
  dl_troca_instrucoes_v1: {
    motor: 'transacional',
    marco: 'TR',
    papel: 'Instruções de troca',
    porque: 'Só para quem pediu troca. Explica o caminho sem a cliente precisar perguntar duas vezes.',
  },

  // ── Reativação ──────────────────────────────────────────────────────────
  dl_reativacao_60d_v1: {
    motor: 'marketing',
    marco: 'R60',
    papel: 'Saudade — 60 dias sem comprar',
    porque: 'Para quem comprou e sumiu. Pretexto: o que chegou desde a última compra.',
  },
  dl_colecao_nova_v1: {
    motor: 'marketing',
    marco: 'CN',
    papel: 'Coleção nova',
    porque: 'Anuncia a coleção. Mesmo assunto da reativação: as duas nunca saem para a mesma pessoa no mesmo período.',
  },
  dl_lista_desejos_voltou_v1: {
    motor: 'marketing',
    marco: 'LD',
    papel: 'A peça da lista voltou',
    porque: 'A peça que a cliente salvou voltou ao estoque — o pretexto mais forte da loja.',
  },

  // ── Campanha 10.10 ──────────────────────────────────────────────────────
  dl_drop_1010_save_the_date_v1: {
    motor: 'marketing',
    marco: 'D1',
    papel: 'Drop 10.10 · save the date',
    porque: 'Onda 1 da campanha datada. Avisa a data do drop.',
  },
  dl_drop_1010_vespera_v1: {
    motor: 'marketing',
    marco: 'D2',
    papel: 'Drop 10.10 · véspera',
    porque: 'Onda 2: só para quem recebeu a onda 1.',
  },
  dl_drop_1010_chegou_v1: {
    motor: 'marketing',
    marco: 'D3',
    papel: 'Drop 10.10 · chegou',
    porque: 'Onda 3: o drop está no ar. Só para quem recebeu a onda 2.',
  },
}

/** O papel deste template, ou `null` quando ele não está mapeado. */
export function papelDoTemplate(nome: string | null | undefined): PapelDoTemplate | null {
  if (!nome) return null
  // `_v2`, `_v3`… herdam o papel do `_v1` até ganharem entrada própria.
  return PAPEL_POR_TEMPLATE[nome] ?? PAPEL_POR_TEMPLATE[nome.replace(/_v\d+$/, '_v1')] ?? null
}

/**
 * A RÉGUA DO PEDIDO — onde o pedido está, na ordem em que a cliente vive.
 * É o equivalente da "régua do compromisso" da origem: o trilho mostra os
 * marcos que já saíram e os que ainda faltam, sem prometer horário (quem
 * move o pedido é a loja, não a Máquina).
 */
export interface MarcoDoPedido {
  marco: string
  papel: string
  templates: readonly string[]
}

export const REGUA_DO_PEDIDO: readonly MarcoDoPedido[] = [
  { marco: 'P0', papel: 'Pedido confirmado', templates: ['dl_pedido_confirmado_v1'] },
  { marco: 'P1', papel: 'Pagamento aprovado', templates: ['dl_pagamento_aprovado_v1'] },
  { marco: 'P2', papel: 'Pedido enviado', templates: ['dl_pedido_enviado_v1'] },
  { marco: 'P3', papel: 'Pedido entregue', templates: ['dl_pedido_entregue_v1'] },
  { marco: 'PV', papel: 'Avaliação', templates: ['dl_pos_entrega_avaliacao_v1'] },
]

/** Os marcos da régua do pedido que ainda não saíram, na ordem. */
export function marcosQueFaltam(jaSaiu: ReadonlySet<string>): MarcoDoPedido[] {
  const ultimo = REGUA_DO_PEDIDO.reduce((acc, m, i) => (m.templates.some((t) => jaSaiu.has(t)) ? i : acc), -1)
  return REGUA_DO_PEDIDO.slice(ultimo + 1)
}

/**
 * O rótulo curto da etapa — o que vai dentro do marcador do trilho.
 * "T1", "T2"… (toque), e não "1", "2": o trilho mistura marcos nomeados
 * (C1, P2) com etapas numeradas, e um número solto não diz de onde é.
 */
export function marcadorDaEtapa(ordem: number): string {
  return `T${ordem}`
}
