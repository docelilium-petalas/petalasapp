/**
 * Para a régua de quem JÁ CONVERSOU com a loja — em qualquer outra inscrição.
 *
 *   npx tsx scripts/mv-ops/mv-parar-quem-ja-falou.ts            # dry-run
 *   npx tsx scripts/mv-ops/mv-parar-quem-ja-falou.ts --apply
 *
 * Porte de `scripts/mv-parar-quem-ja-falou.ts` da CarBoss.
 *
 * O buraco: as paradas da Doce Lilium já olham a conversa por TELEFONE
 * (`MvResposta`), mas só falas DEPOIS da inscrição. A cliente que conversou
 * na régua A e foi inscrita depois na régua B segue recebendo texto frio por
 * cima de uma conversa viva. Este script pega esse caso pelos carimbos das
 * outras inscrições (`respondeuEm`, `humanoFalouEm`).
 *
 * Não apaga: a inscrição vira `RESPONDEU` com motivo, as pendentes viram
 * `CANCELADA`. Apagar perderia a prova de que a cliente foi trabalhada.
 * A campanha datada fica de fora (decisão do Owner) — ela é lida como
 * histórico, nunca parada por aqui.
 */

import { APLICAR, FORA_DA_CAMPANHA, brt, cabecalho, mascarar, prisma, registrarAjuste, rodar } from './_base'

const MOTIVO = 'ja_conversou_em_outra_inscricao'

rodar(async () => {
  cabecalho('PARAR QUEM JÁ FALOU (em outra inscrição)')
  const vivas = await prisma.mvInscricao.findMany({
    where: { status: 'ATIVA', ...FORA_DA_CAMPANHA, mensagens: { some: { status: 'AGENDADA' } } },
    orderBy: { createdAt: 'asc' },
    include: { cadencia: { select: { nome: true } }, mensagens: { where: { status: 'AGENDADA' }, orderBy: { agendadaPara: 'asc' }, select: { agendadaPara: true } } },
  })
  const historico = await prisma.mvInscricao.findMany({
    where: { telefoneKey: { in: [...new Set(vivas.map((i) => i.telefoneKey))] }, OR: [{ respondeuEm: { not: null } }, { humanoFalouEm: { not: null } }] },
    orderBy: { id: 'asc' },
    select: { id: true, telefoneKey: true, respondeuEm: true, humanoFalouEm: true, respostas: true, cadencia: { select: { nome: true } } },
  })
  const porChave = new Map<string, typeof historico>()
  for (const h of historico) porChave.set(h.telefoneKey, [...(porChave.get(h.telefoneKey) ?? []), h])

  const alvos = vivas
    .map((i) => ({ i, h: (porChave.get(i.telefoneKey) ?? []).filter((x) => x.id !== i.id) }))
    .filter(({ h }) => h.length > 0)
    .map(({ i, h }) => ({
      i,
      h,
      ultima: h.map((x) => (x.respondeuEm ?? x.humanoFalouEm)!).sort((a, b) => b.getTime() - a.getTime())[0],
      respostas: h.reduce((s, x) => s + x.respostas, 0),
    }))

  console.log(`${vivas.length} inscrição(ões) ATIVA(s) com mensagem agendada (fora da campanha)`)
  if (!alvos.length) {
    console.log('\n✓ nenhuma régua fria por cima de conversa viva.')
    return
  }
  console.log(`\n🔴 ${alvos.length} com conversa em OUTRA inscrição:\n`)
  for (const { i, h, ultima, respostas } of alvos) {
    console.log(`   ${i.nomeSnapshot.padEnd(14)} ${mascarar(i.telefoneE164)}`)
    console.log(`      seria tocada em ${brt(i.mensagens[0]?.agendadaPara)} por "${i.cadencia.nome}"`)
    console.log(`      já falou em ${brt(ultima)} · ${respostas} resposta(s) · ${h.map((x) => x.cadencia.nome).join(', ')}`)
    console.log(`      → parar, cancelando ${i.mensagens.length} mensagem(ns)`)
  }
  if (!APLICAR) {
    console.log('\n(dry-run — nada mudou. Repita com --apply)')
    return
  }
  for (const { i, ultima, respostas } of alvos) {
    await prisma.$transaction([
      prisma.mvMensagem.updateMany({ where: { inscricaoId: i.id, status: 'AGENDADA' }, data: { status: 'CANCELADA', erro: MOTIVO } }),
      prisma.mvInscricao.update({
        where: { id: i.id },
        data: { status: 'RESPONDEU', motivoParada: MOTIVO, respondeuEm: i.respondeuEm ?? ultima, respostas: i.respostas || respostas },
      }),
    ])
    console.log(`   ✅ ${i.nomeSnapshot} parada — ${i.mensagens.length} mensagem(ns) cancelada(s)`)
  }
  await registrarAjuste('Régua parada para quem já conversou', { inscricoes: alvos.length })
})
