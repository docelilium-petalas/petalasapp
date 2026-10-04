/**
 * O TEXTO ENTREGUE DAS MENSAGENS QUE JÁ SAÍRAM SEM O CARIMBO.
 *
 *   npx tsx scripts/mv-ops/mv-backfill-texto-entregue.ts            # dry-run
 *   npx tsx scripts/mv-ops/mv-backfill-texto-entregue.ts --apply
 *
 * Ambiente: DATABASE_URL, DATAFY_WABA_ID e o canal (integração ou DATAFY_TOKEN).
 *
 * Porte de `scripts/mv-backfill-texto-entregue.ts` da CarBoss. Aqui é MAIS
 * exato que na origem: os parâmetros não são reconstruídos a partir do nome —
 * a Doce Lilium congela `variaveis` em cada mensagem na semeadura, e são elas
 * que foram para a Meta. O que é reconstruído é só o CORPO, lido da Meta hoje.
 *
 * Duas contenções, como na origem:
 *  1. só preenche `textoEntregue` NULO — nunca sobrescreve carimbo de envio;
 *  2. o preenchido leva `_reconstruido` no `payloadEnvio`, para que ninguém
 *     confunda "carimbado no envio" com "reconstruído depois".
 *
 * Template que não está mais APROVADO na Meta fica sem corpo (não inventa).
 */

import { APLICAR, cabecalho, prisma, registrarAjuste, rodar } from './_base'
import { buscarCorposAprovados, textoEntregueDoTemplate } from '../../src/lib/maquina-vendas/corpo-template'

rodar(async () => {
  cabecalho('BACKFILL do texto entregue')
  const corpos = await buscarCorposAprovados()
  console.log(`▸ ${corpos.size} corpo(s) lidos da Meta`)
  if (corpos.size === 0) throw new Error('nenhum corpo lido da Meta — confira DATAFY_WABA_ID e o canal. Nada feito.')

  const alvos = await prisma.mvMensagem.findMany({
    where: { status: 'ENVIADA', templateNome: { not: null }, textoEntregue: null },
    orderBy: { enviadaEm: 'asc' },
    select: { id: true, templateNome: true, variaveis: true, payloadEnvio: true, inscricao: { select: { nomeSnapshot: true } } },
  })
  console.log(`▸ ${alvos.length} mensagem(ns) saíram por template sem o corpo\n`)

  let preenchidas = 0
  let semCorpo = 0
  for (const m of alvos) {
    const aprovado = corpos.get(m.templateNome!)
    if (!aprovado || aprovado.status !== 'APPROVED') {
      console.log(`  · ${m.templateNome} — sem corpo aprovado na Meta, fica como está`)
      semCorpo++
      continue
    }
    const valores = Array.isArray(m.variaveis) ? (m.variaveis as unknown[]).map((v) => String(v ?? '')) : []
    const texto = textoEntregueDoTemplate(aprovado, valores)
    preenchidas++
    console.log(`  ${APLICAR ? '✓' : '+'} ${m.inscricao.nomeSnapshot} · ${m.templateNome}`)
    console.log(`      "${texto.replace(/\n/g, ' ').slice(0, 90)}…"`)
    if (!APLICAR) continue

    let payload: Record<string, unknown> = {}
    try {
      payload = m.payloadEnvio ? JSON.parse(m.payloadEnvio) : {}
    } catch {
      payload = { _payloadOriginalIlegivel: m.payloadEnvio }
    }
    await prisma.mvMensagem.updateMany({
      where: { id: m.id, textoEntregue: null },
      data: {
        textoEntregue: texto,
        payloadEnvio: JSON.stringify({ ...payload, _reconstruido: { em: new Date().toISOString(), fonte: 'meta/message_templates + variaveis congeladas' } }),
      },
    })
  }
  console.log(`\n${APLICAR ? '✓' : '(dry-run)'} ${preenchidas} preenchida(s), ${semCorpo} sem corpo.${APLICAR ? '' : ' Rode com --apply para valer.'}`)
  if (APLICAR && preenchidas) await registrarAjuste('Backfill do texto entregue', { preenchidas, semCorpo })
})
