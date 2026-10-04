/**
 * Agenda as etapas que a cadência GANHOU depois da inscrição.
 *
 *   npx tsx scripts/mv-ops/mv-completar-etapas-novas.ts                       # dry-run
 *   npx tsx scripts/mv-ops/mv-completar-etapas-novas.ts --apply
 *   npx tsx scripts/mv-ops/mv-completar-etapas-novas.ts --cadencia <id> --apply
 *
 * Porte de `scripts/mv-completar-etapas-novas.ts` da CarBoss. `inscrever`
 * semeia a régua inteira no ato — então esticar a cadência (3 → 5 etapas) não
 * alcança quem já está dentro: a tela mostra cinco, a cliente recebe três e
 * para, sem erro em lugar nenhum.
 *
 * Como a etapa faltante nasce aqui, igual à semeadura:
 *  · contexto remontado das `variaveis` congeladas das mensagens que a
 *    inscrição já tem (`contextoDasVariaveis`) + o primeiro nome do snapshot;
 *  · copy por `montarCopy`, validada por `validarCopy` (regra da última só
 *    com 2+ etapas); variáveis da Meta pela ordem do catálogo — variável vazia
 *    é problema (a Meta devolve 132000), não mensagem quebrada;
 *  · horário por `agendarEtapas` ancorado na última mensagem da inscrição e
 *    encaixado na MESMA grade (uma por cliente por dia, 60 min de silêncio).
 *
 * Qualquer problema → nada é gravado. A campanha datada fica de fora.
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, mascarar, opcao, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { agendarEtapas } from '../../src/lib/maquina-vendas/agenda'
import { GradeDeVagas } from '../../src/lib/maquina-vendas/grade'
import { parseJanela } from '../../src/lib/maquina-vendas/janela'
import { contextoDasVariaveis } from '../../src/lib/maquina-vendas/resincronizar'
import { montarCopy, validarCopy, primeiroNomeDeGente, type Contexto } from '../../src/lib/maquina-vendas/copy'
import { VARIAVEIS } from '../../src/lib/maquina-vendas/catalogo-templates'

const ESPACO_MS = 60 * 60_000

type Plano = { inscricaoId: string; cadencia: string; cliente: string; etapaOrdem: number; quando: Date; texto: string; templateNome: string | null; variaveis: string[] }

rodar(async () => {
  cabecalho('COMPLETAR ETAPAS NOVAS (fora da campanha datada)')
  const cadenciaId = opcao('--cadencia')
  const ajustes = await obterAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)
  const agora = new Date()

  const inscricoes = await prisma.mvInscricao.findMany({
    where: { status: 'ATIVA', ...FORA_DA_CAMPANHA, ...(cadenciaId ? { cadenciaId } : {}) },
    include: {
      cadencia: { include: { etapas: { orderBy: { ordem: 'asc' } } } },
      mensagens: { orderBy: { agendadaPara: 'asc' }, select: { etapaOrdem: true, agendadaPara: true, enviadaEm: true, status: true, templateNome: true, variaveis: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  const planos: Plano[] = []
  const problemas: string[] = []
  let completas = 0
  for (const insc of inscricoes) {
    const jaTem = new Set(insc.mensagens.map((m) => m.etapaOrdem))
    const faltando = insc.cadencia.etapas.filter((e) => !jaTem.has(e.ordem))
    if (!faltando.length) {
      completas++
      continue
    }
    const rotulo = `${insc.cadencia.nome} · ${insc.nomeSnapshot} ${mascarar(insc.telefoneE164)}`
    const ctx: Contexto = { ...contextoDasVariaveis(insc.mensagens) }
    if (!ctx.primeiro_nome) ctx.primeiro_nome = primeiroNomeDeGente(insc.nomeSnapshot)

    const vivas = insc.mensagens.filter((m) => m.status === 'AGENDADA' || (m.status === 'ENVIADA' && m.enviadaEm))
    const quandoDe = (m: (typeof vivas)[number]) => (m.status === 'ENVIADA' && m.enviadaEm ? m.enviadaEm : m.agendadaPara)
    const ultima = vivas.length ? new Date(Math.max(...vivas.map((m) => quandoDe(m).getTime()))) : null
    const primeiraFalta = faltando[0]
    const ancora = primeiraFalta.ancoradaEm === 'entrega' && ultima ? ultima : insc.ancoraEm ?? insc.createdAt
    const datas = agendarEtapas({
      ancora,
      etapas: faltando.map((e, i) => ({ ordem: e.ordem, delayMinutos: e.delayMinutos, ancoradaEm: i === 0 ? 'gatilho' : e.ancoradaEm })),
      ajustes,
      agora,
    })
    const grade = new GradeDeVagas(
      vivas.map((m) => ({ quando: quandoDe(m).getTime(), inscricaoId: insc.id })),
      { minimoMs: ESPACO_MS, passoMs: ESPACO_MS, janela },
    )

    const total = insc.cadencia.etapas.length
    faltando.forEach((etapa, i) => {
      try {
        const texto = montarCopy(etapa.templateBase, ctx, `${insc.refExterna}:${etapa.ordem}`)
        const v = validarCopy(texto, { ehUltima: etapa.ehUltima && total > 1 })
        if (!v.ok) throw new Error(`copy reprovada — ${v.erros.join('; ')}`)
        const nomes = etapa.templateNome ? (VARIAVEIS[etapa.templateNome] ?? []) : []
        const variaveis = nomes.map((n) => String(ctx[n as keyof Contexto] ?? '').trim())
        const vazias = nomes.filter((_, k) => !variaveis[k])
        if (vazias.length) throw new Error(`variável sem valor para a Meta: ${vazias.join(', ')}`)
        const desejado = datas[i] && ultima && datas[i] <= ultima ? new Date(ultima.getTime() + ESPACO_MS) : datas[i]
        const quando = grade.vaga(desejado, { inscricaoId: insc.id })
        if (!quando) throw new Error('a grade não achou vaga')
        grade.ocupar({ quando: quando.getTime(), inscricaoId: insc.id })
        planos.push({ inscricaoId: insc.id, cadencia: insc.cadencia.nome, cliente: rotulo, etapaOrdem: etapa.ordem, quando, texto, templateNome: etapa.templateNome, variaveis })
      } catch (e) {
        problemas.push(`${rotulo} · etapa ${etapa.ordem}: ${e instanceof Error ? e.message : String(e)}`)
      }
    })
  }

  console.log(`${inscricoes.length} inscrição(ões) ATIVA(s) · ${completas} já completa(s) · ${planos.length} mensagem(ns) a criar\n`)
  for (const p of planos) {
    console.log(`  ${p.cliente}  etapa ${p.etapaOrdem}  ${brt(p.quando)}  ${p.templateNome ?? '(sem template — vai virar VETADA)'}`)
    console.log(`      ${p.texto.split('\n')[0].slice(0, 96)}`)
  }
  if (problemas.length) {
    console.log('\n== PROBLEMAS ==')
    for (const p of problemas) console.log(`  ⚠️ ${p}`)
    throw new Error('há problemas — nada gravado. Resolva antes.')
  }
  if (!planos.length) {
    console.log('Nada a fazer.')
    return
  }
  if (!APLICAR) {
    console.log('\nDRY-RUN — nada gravado. Para valer: --apply')
    return
  }
  await prisma.mvMensagem.createMany({
    data: planos.map((p) => ({
      inscricaoId: p.inscricaoId,
      etapaOrdem: p.etapaOrdem,
      mensagemFinal: p.texto,
      variaveis: p.variaveis,
      agendadaPara: p.quando,
      templateNome: p.templateNome,
      status: 'AGENDADA',
    })),
  })
  await registrarAjuste('Etapas novas agendadas para quem já estava inscrita', { mensagens: planos.length, cadenciaId: cadenciaId ?? 'todas (fora da campanha)' })
  console.log(`\n✅ ${planos.length} mensagem(ns) agendada(s).`)
})
