/**
 * Reencaixa a fila usando a GRADE DE VAGAS — o conserto das colisões.
 *
 *   npx tsx scripts/mv-ops/reencaixar-fila-mv.ts                                # dry-run
 *   npx tsx scripts/mv-ops/reencaixar-fila-mv.ts --apply
 *   npx tsx scripts/mv-ops/reencaixar-fila-mv.ts --a-partir-de 2026-10-06T09:00 --apply
 *
 * Porte de `scripts/reencaixar-fila-mv.ts` da CarBoss. O `grade.ts` fecha o
 * buraco para o que vier; isto arruma o que já está marcado: duas mensagens da
 * mesma cliente no mesmo dia, intervalos abaixo do mínimo, dia acima do teto.
 *
 * Ordem: inscrição mais antiga, depois etapa — quem já começou termina antes
 * de a fila fria começar outra. Nada é antecipado: a vaga nunca é antes do
 * horário atual da mensagem (nem do piso `--a-partir-de`).
 *
 * Diferença da origem: a campanha datada NÃO se move (decisão do Owner), mas
 * as mensagens dela OCUPAM a grade — o resto da fila se encaixa em volta.
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, opcao, prisma, registrarAjuste, rodar } from './_base'
import { obterAjustes } from '../../src/lib/maquina-vendas/config'
import { GradeDeVagas, diaDaGrade } from '../../src/lib/maquina-vendas/grade'
import { deParedeSP, parseJanela } from '../../src/lib/maquina-vendas/janela'

function lerPiso(): Date {
  const bruto = opcao('--a-partir-de')
  if (bruto === undefined) return new Date()
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})$/.exec(bruto)
  if (!m) throw new Error(`--a-partir-de inválido: "${bruto}" (AAAA-MM-DDTHH:MM, parede de São Paulo)`)
  const piso = deParedeSP(+m[1], +m[2], +m[3], +m[4], +m[5])
  if (piso.getTime() < Date.now()) throw new Error('--a-partir-de está no passado — reencaixar não antecipa mensagem.')
  return piso
}

rodar(async () => {
  cabecalho('REENCAIXAR FILA PELA GRADE (campanha fica parada, mas ocupa vaga)')
  const piso = lerPiso()
  const ajustes = await obterAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)
  if (piso.getTime() > Date.now()) console.log(`piso: ${brt(piso)} — nada sai antes disso\n`)

  const sel = { id: true, inscricaoId: true, etapaOrdem: true, agendadaPara: true, inscricao: { select: { nomeSnapshot: true, createdAt: true } } } as const
  const [pendentes, fixas] = await Promise.all([
    prisma.mvMensagem.findMany({ where: { status: 'AGENDADA', inscricao: { status: 'ATIVA', ...FORA_DA_CAMPANHA } }, select: sel, orderBy: { id: 'asc' } }),
    prisma.mvMensagem.findMany({
      where: { status: 'AGENDADA', agendadaPara: { gte: piso }, inscricao: { status: 'ATIVA', NOT: FORA_DA_CAMPANHA } },
      select: { agendadaPara: true, inscricaoId: true },
      orderBy: { agendadaPara: 'asc' },
    }),
  ])
  if (!pendentes.length) {
    console.log('nada agendado fora da campanha — nada a reencaixar.')
    return
  }

  const colisoes = (lista: Array<{ inscricaoId: string; quando: Date }>) => {
    const n = new Map<string, number>()
    for (const m of lista) n.set(`${m.inscricaoId}|${diaDaGrade(m.quando)}`, (n.get(`${m.inscricaoId}|${diaDaGrade(m.quando)}`) ?? 0) + 1)
    return [...n.values()].filter((v) => v > 1).length
  }
  const antes = colisoes(pendentes.map((m) => ({ inscricaoId: m.inscricaoId, quando: m.agendadaPara })))
  console.log(`${pendentes.length} pendente(s) · ${fixas.length} da campanha ocupando vaga · ${antes} dia(s) com 2+ da mesma cliente\n`)

  const ordenadas = [...pendentes].sort((a, b) => a.inscricao.createdAt.getTime() - b.inscricao.createdAt.getTime() || a.etapaOrdem - b.etapaOrdem)
  const grade = new GradeDeVagas(
    fixas.map((f) => ({ quando: f.agendadaPara.getTime(), inscricaoId: f.inscricaoId })),
    { minimoMs: ajustes.intervaloMinMinutos * 60_000, passoMs: ((ajustes.intervaloMinMinutos + ajustes.intervaloMaxMinutos) / 2) * 60_000, janela },
  )

  const mudancas: Array<{ id: string; de: Date; para: Date; cliente: string; etapa: number }> = []
  const novoHorario = new Map<string, Date>()
  let semVaga = 0
  for (const m of ordenadas) {
    const desejado = m.agendadaPara > piso ? m.agendadaPara : piso
    const vaga = grade.vaga(desejado, { inscricaoId: m.inscricaoId, tetoPorDia: ajustes.tetoDiario })
    if (!vaga) {
      semVaga++
      continue
    }
    grade.ocupar({ quando: vaga.getTime(), inscricaoId: m.inscricaoId })
    novoHorario.set(m.id, vaga)
    if (vaga.getTime() !== m.agendadaPara.getTime()) mudancas.push({ id: m.id, de: m.agendadaPara, para: vaga, cliente: m.inscricao.nomeSnapshot, etapa: m.etapaOrdem })
  }
  for (const c of mudancas.slice(0, 25)) console.log(`  ${c.cliente.padEnd(22).slice(0, 22)} etapa ${c.etapa}  ${brt(c.de)} → ${brt(c.para)}`)
  if (mudancas.length > 25) console.log(`  … e mais ${mudancas.length - 25}`)

  const depois = colisoes(ordenadas.map((m) => ({ inscricaoId: m.inscricaoId, quando: novoHorario.get(m.id) ?? m.agendadaPara })))
  console.log(`\n${mudancas.length} remarcação(ões) · ${semVaga} sem vaga`)
  console.log(`colisões antes: ${antes} → depois: ${depois}`)
  if (depois > 0) throw new Error('a grade deixou colisão de pé — nada gravado.')
  if (semVaga > 0) throw new Error(`${semVaga} mensagem(ns) sem vaga — nada gravado (janela/teto apertados demais).`)
  if (!mudancas.length || !APLICAR) {
    if (!APLICAR && mudancas.length) console.log('\nDRY-RUN — nada gravado. Para valer: --apply')
    return
  }
  for (let i = 0; i < mudancas.length; i += 25) {
    await prisma.$transaction(mudancas.slice(i, i + 25).map((c) => prisma.mvMensagem.update({ where: { id: c.id }, data: { agendadaPara: c.para } })))
  }
  await registrarAjuste('Fila reencaixada pela grade', { remarcadas: mudancas.length, colisoesAntes: antes, piso: piso.toISOString() })
  console.log(`\n✓ ${mudancas.length} mensagem(ns) remarcada(s). O freio continua como estava.`)
})
