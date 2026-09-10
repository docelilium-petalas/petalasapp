/**
 * SEMEIA A TRILHA DE PEDIDO PAGO.
 *
 *   npx tsx --env-file=.env scripts/mv-cadencia-pedido.ts
 *
 * Idempotente, como o de carrinho.
 *
 * ── POR QUE ELA TEM UM TOQUE SÓ, E NÃO CINCO ──────────────────────────────
 * O catálogo tem sete mensagens de pós-venda: confirmado, Pix pendente,
 * pagamento aprovado, enviado, entregue, avaliação e troca. Só UMA entra aqui
 * hoje, e o motivo é medição, não preguiça:
 *
 *   · `dl_pedido_enviado_v1` pede o código de rastreio, e os 62 pedidos da
 *     loja estavam com o campo VAZIO em 09/09/2026. É lacuna de processo da
 *     loja, não limite da API — quando alguém passar a preencher, esta trilha
 *     ganha a etapa.
 *   · `dl_pedido_entregue_v1` e a avaliação dependem de saber que chegou. A
 *     Nuvemshop tem `shipping_status`, mas ele só muda se a loja marcar.
 *
 * E a regra dura: se UMA etapa da cadência não conseguir montar a copy, a
 * inscrição INTEIRA é recusada — não é a etapa que cai, é a pessoa que não
 * entra. Semear uma trilha com etapa que não tem como preencher é desligar a
 * trilha inteira sem perceber.
 */

import prisma from '../src/lib/prisma'
import { esqueletoNomeado } from '../src/lib/maquina-vendas/catalogo-templates'

const GATILHO = 'pedido_pago'

async function main() {
  const etapas = [
    {
      ordem: 1,
      delayMinutos: 0,
      ancoradaEm: 'gatilho',
      templateNome: 'dl_pagamento_aprovado_v1',
      ehUltima: true,
    },
  ].map((e) => ({ ...e, templateBase: esqueletoNomeado(e.templateNome) }))

  const existente = await prisma.mvCadencia.findFirst({ where: { gatilho: GATILHO } })
  const cadencia = existente
    ? await prisma.mvCadencia.update({ where: { id: existente.id }, data: { nome: 'Pedido pago' } })
    : await prisma.mvCadencia.create({
        data: {
          nome: 'Pedido pago',
          gatilho: GATILHO,
          // Sem teto de idade: quem pagou, pagou. O webhook chega no ato, e
          // uma reentrega da Nuvemshop horas depois ainda é o mesmo pedido.
          idadeMaximaHoras: null,
          ativo: true,
        },
      })

  await prisma.mvCadenciaEtapa.deleteMany({ where: { cadenciaId: cadencia.id } })
  await prisma.mvCadenciaEtapa.createMany({
    data: etapas.map((e) => ({
      cadenciaId: cadencia.id,
      ordem: e.ordem,
      delayMinutos: e.delayMinutos,
      ancoradaEm: e.ancoradaEm,
      templateBase: e.templateBase,
      templateNome: e.templateNome,
      ehUltima: e.ehUltima,
    })),
  })

  console.log(`\ncadência "${cadencia.nome}" ${existente ? 'atualizada' : 'criada'} · ${cadencia.id}`)
  for (const e of etapas) {
    console.log(`  ${e.ordem}. no ato do pagamento        ${e.templateNome}  (única)`)
  }
  console.log(
    '\nA mensagem é UTILITY: ela não espera a janela das 9h, não conta no teto\n' +
      'do dia e não é barrada pelo anti-eco. Quem comprou às 22h é avisado às 22h.\n' +
      '\nFaltam na trilha, e por quê:\n' +
      '  · pedido enviado    — os 62 pedidos da loja estão sem código de rastreio\n' +
      '  · entregue/avaliação — depende de a loja marcar a entrega na Nuvemshop\n',
  )
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nfalhou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
