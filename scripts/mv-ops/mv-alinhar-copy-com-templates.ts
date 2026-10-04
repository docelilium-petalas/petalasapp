/**
 * Faz a copy das cadências SER o texto que a Meta aprovou
 * (porte de `mv-alinhar-copy-com-templates.ts` do CarBoss).
 *
 *   npx tsx scripts/mv-ops/mv-alinhar-copy-com-templates.ts            # dry-run
 *   npx tsx scripts/mv-ops/mv-alinhar-copy-com-templates.ts --apply
 *
 * Duas conferências, nesta ordem:
 *
 *   1) CATÁLOGO × META — `divergenciasDoCatalogo()` compara o corpo de cada
 *      template do catálogo local com o corpo APROVADO na WABA (precisa de
 *      DATAFY_TOKEN e DATAFY_WABA_ID). Divergência aqui NÃO se corrige por
 *      script: template aprovado nunca é editado — cria-se um `_v2`. O script
 *      para e mostra.
 *
 *   2) ETAPA × CATÁLOGO — `templateBase` de cada etapa tem de ser
 *      `esqueletoNomeado(templateNome)`. Quando não é, a tela mostra um texto e
 *      a cliente recebe outro (quem monta a frase é a Meta). `--apply` regrava
 *      só essas etapas.
 *
 * Diferenças para a origem, e por quê:
 *   · a origem convertia a copy da era Evolution (`[[a|b|c]]`, `{{ancora}}`)
 *     buscando o corpo na Meta. Aqui o catálogo local já é a fonte executável
 *     (o mesmo texto submetido), e a conferência 1 prova que ele bate com a
 *     Meta — então a etapa deriva do catálogo, sem rede no caminho da escrita.
 *   · as etapas da campanha datada (`campanha_*`) ficam de fora: decisão do
 *     Owner.
 *   · `mensagemFinal` das AGENDADAS não é tocada aqui; depois do --apply rode
 *     `resincronizar-copy-mv.ts`, que é quem re-renderiza com as variáveis
 *     congeladas.
 */
import { prisma, APLICAR, tem, cabecalho, rodar, registrarAjuste } from './_base'
import { divergenciasDoCatalogo } from '../../src/lib/maquina-vendas/corpo-template'
import { esqueletoNomeado } from '../../src/lib/maquina-vendas/catalogo-templates'

const SEM_META = tem('--sem-meta')

async function main() {
  cabecalho('ALINHAR COPY DAS ETAPAS COM OS TEMPLATES')

  if (SEM_META) {
    console.log('⚠️ --sem-meta: conferência catálogo × Meta PULADA.\n')
  } else if (!process.env.DATAFY_TOKEN || !process.env.DATAFY_WABA_ID) {
    throw new Error('DATAFY_TOKEN/DATAFY_WABA_ID ausentes — sem eles não há prova de que o catálogo é o texto aprovado (use --sem-meta só para conferir as etapas).')
  } else {
    const todas = await divergenciasDoCatalogo()
    // Template que ainda não existe/não foi aprovado e que NENHUMA etapa usa
    // (ex.: o interno `dl_relatorio_pronto_v1`) é aviso, não bloqueio. Corpo
    // diferente, esse sim, bloqueia sempre.
    const emUso = new Set(
      (await prisma.mvCadenciaEtapa.findMany({ select: { templateNome: true } }))
        .map((e) => e.templateNome)
        .filter((x): x is string => !!x),
    )
    const div = todas.filter((d) => d.nome === '*' || d.motivo.startsWith('corpo') || emUso.has(d.nome))
    for (const d of todas.filter((x) => !div.includes(x))) console.log(`⚠️ ${d.nome}: ${d.motivo} (nenhuma etapa usa)`)
    if (div.length) {
      console.log('✗ CATÁLOGO DIVERGE DA META — nada é gravado:')
      for (const d of div) console.log(`  ${d.nome}: ${d.motivo}`)
      console.log('\nTemplate aprovado não se edita: crie um _v2 e aponte a etapa para ele.')
      process.exitCode = 1
      return
    }
    console.log('✔ catálogo local = corpo aprovado na Meta.\n')
  }

  const etapas = await prisma.mvCadenciaEtapa.findMany({
    where: { cadencia: { NOT: { gatilho: { startsWith: 'campanha_' } } } },
    select: {
      id: true,
      ordem: true,
      templateNome: true,
      templateBase: true,
      cadencia: { select: { nome: true } },
    },
    orderBy: [{ cadenciaId: 'asc' }, { ordem: 'asc' }],
  })

  const trocar: { id: string; rotulo: string; novo: string }[] = []
  const problemas: string[] = []
  let iguais = 0
  for (const e of etapas) {
    const rotulo = `${e.cadencia.nome} · etapa ${e.ordem}`
    if (!e.templateNome) {
      problemas.push(`${rotulo}: sem templateNome — o despachante VETA essa etapa`)
      continue
    }
    let esperado: string
    try {
      esperado = esqueletoNomeado(e.templateNome)
    } catch (err) {
      problemas.push(`${rotulo}: ${err instanceof Error ? err.message : String(err)}`)
      continue
    }
    if (e.templateBase === esperado) iguais++
    else trocar.push({ id: e.id, rotulo: `${rotulo} (${e.templateNome})`, novo: esperado })
  }

  console.log(`${etapas.length} etapa(s) fora da campanha · ${iguais} já alinhada(s) · ${trocar.length} a alinhar`)
  for (const t of trocar) console.log(`  ↻ ${t.rotulo}\n      ${t.novo.replace(/\s+/g, ' ').slice(0, 110)}`)
  if (problemas.length) {
    console.log('\n✗ PROBLEMAS (nada é gravado enquanto existirem):')
    for (const p of problemas) console.log(`  ${p}`)
    process.exitCode = 1
    return
  }
  if (!trocar.length) return
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada gravado. Para valer: --apply (depois: resincronizar-copy-mv.ts)')
    return
  }
  await prisma.$transaction(
    trocar.map((t) => prisma.mvCadenciaEtapa.update({ where: { id: t.id }, data: { templateBase: t.novo } })),
  )
  await registrarAjuste(`Copy de ${trocar.length} etapa(s) alinhada ao template aprovado`, {
    etapas: trocar.map((t) => t.rotulo),
  })
  console.log(`\n✔ ${trocar.length} etapa(s) alinhada(s). Agora: npx tsx scripts/mv-ops/resincronizar-copy-mv.ts`)
}

rodar(main)
