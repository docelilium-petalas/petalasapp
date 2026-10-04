/**
 * Auditoria de invariantes da Máquina de Vendas — SOMENTE LEITURA.
 * Porte de `scripts/auditoria-maquina-vendas.ts` da CarBoss.
 *
 *   npx tsx scripts/mv-ops/auditoria-maquina-vendas.ts
 *
 * Sai com código 1 se alguma invariante de gravidade ALTA quebrou.
 *
 * Cada invariante existe porque a quebra dela seria visível para a cliente
 * (mensagem repetida, fora de hora, depois de ela responder ou pedir para
 * sair) ou tornaria a tabela do módulo mentirosa. As 14 da origem estão aqui
 * com o vocabulário da Doce Lilium; INV15–INV17 são da DL (opt-out, lista de
 * teste e campanha datada).
 */

import { prisma, cabecalho, rodar } from './_base'
import { CURSOR_VARREDURA_CARRINHO, obterAjustes, numerosDeTeste, liberadoParaEnvio } from '../../src/lib/maquina-vendas/config'
import { parseJanela, dentroDaJanela } from '../../src/lib/maquina-vendas/janela'
import { validarCopy } from '../../src/lib/maquina-vendas/copy'

type Achado = { inv: string; gravidade: 'ALTA' | 'MEDIA' | 'BAIXA'; detalhe: string }

rodar(async () => {
  cabecalho('AUDITORIA DA MÁQUINA DE VENDAS (somente leitura)', false)
  const achados: Achado[] = []
  const reg = (inv: string, gravidade: Achado['gravidade'], detalhe: string) => achados.push({ inv, gravidade, detalhe })
  const agora = new Date()

  const inscricoes = await prisma.mvInscricao.findMany({
    include: {
      cadencia: { select: { nome: true, gatilho: true, stageId: true, etapas: { select: { ordem: true, ehUltima: true } } } },
      mensagens: true,
    },
  })
  const ativas = inscricoes.filter((i) => i.status === 'ATIVA')
  const todas = inscricoes.flatMap((i) => i.mensagens.map((m) => ({ ...m, insc: i })))
  const agendadas = todas.filter((m) => m.status === 'AGENDADA')
  const enviadas = todas.filter((m) => m.status === 'ENVIADA')
  console.log(`estado: ${inscricoes.length} inscrições (${ativas.length} ativas) · ${agendadas.length} agendadas · ${enviadas.length} enviadas`)

  // INV1 — inscrição ATIVA duplicada por (cadência, telefone). O índice parcial
  // único deveria impedir; se aparecer, o índice sumiu em algum ambiente.
  const porChave = new Map<string, number>()
  for (const i of ativas) porChave.set(`${i.cadenciaId}:${i.telefoneKey}`, (porChave.get(`${i.cadenciaId}:${i.telefoneKey}`) ?? 0) + 1)
  for (const [k, n] of porChave) if (n > 1) reg('INV1 duplicata ativa', 'ALTA', `${n} inscrições ATIVAS para ${k.split(':')[0].slice(0, 8)}…:${k.split(':')[1]}`)

  // INV2 — card aberto em coluna observada sem inscrição na cadência.
  const deColuna = await prisma.mvCadencia.findMany({ where: { ativo: true, stageId: { not: null } }, select: { id: true, nome: true, stageId: true } })
  for (const c of deColuna) {
    const deals = await prisma.deal.findMany({ where: { stageId: c.stageId!, status: 'OPEN' }, select: { id: true, titulo: true } })
    const inscritos = new Set(inscricoes.filter((i) => i.cadenciaId === c.id).map((i) => i.dealId))
    for (const d of deals) if (!inscritos.has(d.id)) reg('INV2 estoque órfão', 'MEDIA', `pedido "${d.titulo}" sem inscrição em "${c.nome}"`)
  }

  // INV3 — mensagem AGENDADA fora da janela de envio.
  const ajustes = await obterAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)
  for (const m of agendadas) {
    if (m.agendadaPara > agora && !dentroDaJanela(m.agendadaPara, janela)) {
      reg('INV3 fora da janela', 'ALTA', `${m.insc.nomeSnapshot} etapa ${m.etapaOrdem} em ${m.agendadaPara.toISOString()}`)
    }
  }

  // INV4 — inscrição ATIVA que já mandou todas as etapas.
  for (const i of ativas) {
    if (i.tentativas >= i.cadencia.etapas.length && i.cadencia.etapas.length > 0) {
      reg('INV4 teto estourado', 'ALTA', `${i.nomeSnapshot}: ${i.tentativas} enviadas de ${i.cadencia.etapas.length} etapas e ainda ATIVA`)
    }
  }

  // INV5 — duas mensagens vivas da mesma inscrição a menos de 60 min.
  for (const i of inscricoes) {
    const vivas = i.mensagens
      .filter((m) => m.status === 'AGENDADA' || m.status === 'ENVIADA')
      .map((m) => (m.status === 'ENVIADA' && m.enviadaEm ? m.enviadaEm : m.agendadaPara).getTime())
      .sort((a, b) => a - b)
    for (let k = 1; k < vivas.length; k++) {
      if (vivas[k] - vivas[k - 1] < 60 * 60_000) {
        reg('INV5 colapso de etapas', 'ALTA', `${i.nomeSnapshot}: ${Math.round((vivas[k] - vivas[k - 1]) / 60_000)} min entre duas etapas`)
      }
    }
  }

  // INV6 — mensagem AGENDADA pendurada em inscrição que já parou.
  for (const m of agendadas) {
    if (m.insc.status !== 'ATIVA' && m.insc.status !== 'PAUSADA') {
      reg('INV6 mensagem órfã', 'ALTA', `${m.insc.nomeSnapshot} está ${m.insc.status} e etapa ${m.etapaOrdem} segue AGENDADA`)
    }
  }

  // INV7 — parada silenciosa. Proibido parar sem dizer por quê.
  for (const i of inscricoes) {
    if (!['ATIVA', 'PAUSADA', 'CONCLUIDA'].includes(i.status) && !i.motivoParada) {
      reg('INV7 parada silenciosa', 'ALTA', `${i.nomeSnapshot} está ${i.status} sem motivoParada`)
    }
  }

  // INV8 — cursor coerente.
  const cursor = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_VARREDURA_CARRINHO } })
  if (!cursor) reg('INV8 cursor', 'MEDIA', 'cursor da varredura de carrinho não existe (nunca rodou?)')
  else {
    const v = new Date(cursor.valor)
    if (Number.isNaN(v.getTime())) reg('INV8 cursor', 'ALTA', `valor inválido: "${cursor.valor.slice(0, 40)}"`)
    else if (v.getTime() > agora.getTime() + 60_000) reg('INV8 cursor', 'ALTA', `cursor no futuro: ${v.toISOString()}`)
  }

  // INV9 — coerência de ENVIADA.
  for (const m of enviadas) {
    if (!m.enviadaEm) reg('INV9 enviada sem carimbo', 'MEDIA', `${m.insc.nomeSnapshot} etapa ${m.etapaOrdem}`)
    if (!m.idExterno && m.canal === 'oficial') reg('INV9 enviada sem wamid', 'ALTA', `${m.insc.nomeSnapshot} etapa ${m.etapaOrdem}`)
    if (!m.payloadEnvio) reg('INV9 enviada sem auditoria', 'BAIXA', `${m.insc.nomeSnapshot} etapa ${m.etapaOrdem} sem payloadEnvio`)
  }

  // INV10 — telefone de inscrição ativa em E.164 válido (Brasil: 55 + DDD + 8/9).
  for (const i of ativas) {
    if (!/^\+?55\d{10,11}$/.test(i.telefoneE164)) reg('INV10 telefone inválido', 'ALTA', `${i.nomeSnapshot}: "${i.telefoneE164.slice(0, 6)}…"`)
  }

  // INV11 — toda copy ainda no ar passa no validador de HOJE.
  for (const m of agendadas) {
    // Mesmo critério de `resincronizar.ts`: só régua de 2+ toques anuncia a última.
    const ehUltima = (m.insc.cadencia.etapas.find((e) => e.ordem === m.etapaOrdem)?.ehUltima ?? false) && m.insc.cadencia.etapas.length > 1
    const v = validarCopy(m.mensagemFinal, { ehUltima })
    if (!v.ok) reg('INV11 copy reprovada', 'ALTA', `${m.insc.nomeSnapshot} etapa ${m.etapaOrdem}: ${v.erros.slice(0, 2).join('; ')}`)
  }

  // INV12 — inscrição de funil ATIVA cujo pedido já fechou (paradas não rodaram).
  for (const i of ativas.filter((x) => x.dealId)) {
    const deal = await prisma.deal.findUnique({ where: { id: i.dealId! }, select: { status: true, stageId: true } })
    if (!deal) reg('INV12 parada atrasada', 'ALTA', `${i.nomeSnapshot}: card apagado e inscrição ATIVA`)
    else if (deal.status !== 'OPEN') reg('INV12 parada atrasada', 'ALTA', `${i.nomeSnapshot}: card ${deal.status} e inscrição ATIVA`)
    else if (i.cadencia.stageId && deal.stageId !== i.cadencia.stageId) reg('INV12 parada atrasada', 'ALTA', `${i.nomeSnapshot}: card saiu da coluna e inscrição ATIVA`)
  }

  // INV13 — contador `tentativas` bate com as mensagens ENVIADAS.
  for (const i of inscricoes) {
    const n = i.mensagens.filter((m) => m.status === 'ENVIADA').length
    if (n !== i.tentativas) reg('INV13 contador desalinhado', 'ALTA', `${i.nomeSnapshot}: tentativas=${i.tentativas}, ENVIADAS=${n}`)
  }

  // INV14 — o índice parcial único existe neste banco.
  const idx = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM pg_indexes WHERE indexname = 'maquina_vendas_inscricoes_ativa_unica'`
  if (Number(idx[0]?.n ?? 0) === 0) reg('INV14 índice ausente', 'ALTA', 'maquina_vendas_inscricoes_ativa_unica não existe neste banco')

  // INV15 (DL) — quem pediu para sair não tem nada AGENDADO.
  const saidas = new Set((await prisma.mvOptOut.findMany({ select: { telefoneKey: true } })).map((o) => o.telefoneKey))
  for (const m of agendadas) if (saidas.has(m.insc.telefoneKey)) reg('INV15 opt-out com fila', 'ALTA', `${m.insc.nomeSnapshot} pediu para sair e etapa ${m.etapaOrdem} segue AGENDADA`)

  // INV16 (DL) — com lista de teste ligada, nada ENVIADO para fora dela depois de ligada.
  const lista = numerosDeTeste()
  if (lista) {
    const fora = enviadas.filter((m) => !liberadoParaEnvio(m.insc.telefoneE164, lista) && m.enviadaEm && m.enviadaEm.getTime() > agora.getTime() - 24 * 3_600_000)
    for (const m of fora) reg('INV16 envio fora da lista', 'ALTA', `${m.insc.nomeSnapshot} recebeu etapa ${m.etapaOrdem} com MV_NUMEROS_TESTE ligada`)
  }

  // INV17 (DL) — campanha datada é cadência de etapa única.
  for (const i of inscricoes.filter((x) => x.cadencia.gatilho.startsWith('campanha_'))) {
    if (i.mensagens.length > 1) reg('INV17 campanha com régua', 'ALTA', `${i.nomeSnapshot} tem ${i.mensagens.length} mensagens em "${i.cadencia.nome}"`)
  }

  if (!achados.length) {
    console.log('\nAUDITORIA OK — 17 invariantes, nenhuma quebra.')
    return
  }
  const ordem = { ALTA: 0, MEDIA: 1, BAIXA: 2 }
  achados.sort((a, b) => ordem[a.gravidade] - ordem[b.gravidade])
  console.log(`\n${achados.length} ACHADO(S):`)
  for (const a of achados.slice(0, 200)) console.log(`  [${a.gravidade}] ${a.inv} — ${a.detalhe}`)
  if (achados.length > 200) console.log(`  … e mais ${achados.length - 200}`)
  if (achados.some((a) => a.gravidade === 'ALTA')) process.exitCode = 1
})
