/**
 * SEMEIA A TRILHA DE CARRINHO ABANDONADO.
 *
 *   npx tsx --env-file=.env scripts/mv-cadencia-carrinho.ts
 *
 * Idempotente: rodar de novo atualiza a cadência que existe em vez de criar
 * outra. Rode outra vez depois de configurar o cupom — é assim que o terceiro
 * toque nasce.
 *
 * ── POR QUE A RÉGUA É ESTA ────────────────────────────────────────────────
 * Etapa 1 sai na descoberta (delay 0 sobre o gatilho). Não é impaciência: a
 * Nuvemshop publica o carrinho com horas de atraso — 27h na medição de
 * 09/09/2026 — então "assim que a gente souber" já é tarde, e qualquer espera
 * adicional empilha em cima de um atraso que não é nosso.
 *
 * Etapas 2 e 3 contam da ENTREGA da anterior, nunca do abandono. Ver
 * `src/lib/maquina-vendas/agenda.ts`.
 *
 * O TETO de 72h existe por causa da primeira varredura: a janela inicial é de
 * 7 dias, e sem teto ela inscreveria de uma vez toda pessoa que abandonou algo
 * na semana — dezenas recebendo "vi que você deixou no carrinho" sobre um
 * carrinho de sexta passada.
 */

import prisma from '../src/lib/prisma'
import { esqueletoNomeado } from '../src/lib/maquina-vendas/catalogo-templates'
import { obterAjustes } from '../src/lib/maquina-vendas/config'

const GATILHO = 'carrinho_abandonado'
const IDADE_MAXIMA_HORAS = 72

async function main() {
  const ajustes = await obterAjustes()
  const temCupom = !!(ajustes.cupomCarrinho && ajustes.descontoCarrinho)

  // O último toque promete um cupom. Sem cupom configurado ele não existe —
  // e a etapa 2 é que se anuncia como última. Uma mensagem prometendo
  // "o cupom  com  de desconto" é pior do que mensagem nenhuma.
  const etapas = [
    {
      ordem: 1,
      delayMinutos: 0,
      ancoradaEm: 'gatilho',
      templateNome: 'dl_carrinho_lembrete_v1',
      ehUltima: false,
    },
    {
      ordem: 2,
      delayMinutos: 24 * 60,
      ancoradaEm: 'entrega',
      templateNome: 'dl_carrinho_duvida_v1',
      ehUltima: !temCupom,
    },
    ...(temCupom
      ? [
          {
            ordem: 3,
            delayMinutos: 48 * 60,
            ancoradaEm: 'entrega',
            templateNome: 'dl_carrinho_ultimo_v1',
            ehUltima: true,
          },
        ]
      : []),
  ].map((e) => ({ ...e, templateBase: esqueletoNomeado(e.templateNome) }))

  // `findFirst` e não `upsert`: a chave única é (gatilho, pipelineId, stageId)
  // e os dois últimos são NULL aqui — no Postgres, NULL não colide com NULL,
  // então o upsert criaria uma segunda cadência a cada execução.
  const existente = await prisma.mvCadencia.findFirst({ where: { gatilho: GATILHO } })

  const cadencia = existente
    ? await prisma.mvCadencia.update({
        where: { id: existente.id },
        data: { nome: 'Carrinho abandonado', idadeMaximaHoras: IDADE_MAXIMA_HORAS },
      })
    : await prisma.mvCadencia.create({
        data: {
          nome: 'Carrinho abandonado',
          gatilho: GATILHO,
          idadeMaximaHoras: IDADE_MAXIMA_HORAS,
          // Nasce ATIVA: quem decide se sai mensagem é `envioPausado` nos
          // ajustes, que nasce pausado. Cadência inativa esconderia a fila da
          // tela, e a fila precisa ser vista antes de ser ligada.
          ativo: true,
        },
      })

  // Substitui as etapas em vez de acumular: a régua é uma só, e etapa órfã de
  // uma versão anterior continuaria disparando.
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
  console.log(`teto de idade: ${IDADE_MAXIMA_HORAS}h\n`)
  for (const e of etapas) {
    const quando =
      e.ancoradaEm === 'gatilho'
        ? e.delayMinutos === 0
          ? 'na descoberta'
          : `${e.delayMinutos / 60}h após o abandono`
        : `${e.delayMinutos / 60}h após a anterior sair`
    console.log(`  ${e.ordem}. ${quando.padEnd(28)} ${e.templateNome}${e.ehUltima ? '  (última)' : ''}`)
  }
  if (!temCupom) {
    console.log(
      '\n⚠ Sem cupom configurado: a trilha nasceu com DOIS toques.\n' +
        '  Para o terceiro existir, preencha cupom_carrinho e desconto_carrinho\n' +
        '  em maquina_vendas_ajustes (o cupom precisa existir de verdade na\n' +
        '  Nuvemshop) e rode este script de novo.',
    )
  }
  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nfalhou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
