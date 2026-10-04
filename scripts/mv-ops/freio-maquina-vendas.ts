/**
 * O FREIO da Máquina — `envioPausado`, o interruptor que decide se sai WhatsApp.
 *
 *   npx tsx scripts/mv-ops/freio-maquina-vendas.ts                    # só lê e explica
 *   npx tsx scripts/mv-ops/freio-maquina-vendas.ts --soltar --apply
 *   npx tsx scripts/mv-ops/freio-maquina-vendas.ts --puxar --apply
 *
 * Porte de `scripts/freio-maquina-vendas.ts` da CarBoss. A origem falava com o
 * banco por uma ponte temporária no n8n; aqui é Prisma direto (o n8n não é
 * caminho de dado da Doce Lilium). O GUARD é o mesmo e é o motivo do script:
 *
 *   Só solta se NADA estiver vencido. Soltar com fila vencida é mensagem saindo
 *   no próximo tique (5 min) — inclusive a fila da campanha datada, cuja
 *   decisão é do Owner. Remarque antes com `adiar-fila-mv.ts`.
 *
 * O que ele NÃO vê: `MV_NUMEROS_TESTE`, `CRON_SECRET` e o agendador do cron
 * moram no EasyPanel. O aviso sai na tela; quem confere é gente.
 */

import { APLICAR, brt, cabecalho, prisma, registrarAjuste, rodar, tem } from './_base'

const SOLTAR = tem('--soltar')
const PUXAR = tem('--puxar')

rodar(async () => {
  if (SOLTAR && PUXAR) throw new Error('--soltar e --puxar ao mesmo tempo, não.')
  cabecalho('FREIO DA MÁQUINA', SOLTAR || PUXAR)
  const agora = new Date()

  const a = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  if (!a) throw new Error('não achei a linha de ajustes — PARANDO.')

  const [agendadas, vencidas, vencidasCampanha, primeira] = await Promise.all([
    prisma.mvMensagem.count({ where: { status: 'AGENDADA' } }),
    prisma.mvMensagem.count({ where: { status: 'AGENDADA', agendadaPara: { lte: agora } } }),
    prisma.mvMensagem.count({
      where: { status: 'AGENDADA', agendadaPara: { lte: agora }, inscricao: { cadencia: { gatilho: { startsWith: 'campanha_' } } } },
    }),
    prisma.mvMensagem.findFirst({ where: { status: 'AGENDADA' }, orderBy: { agendadaPara: 'asc' }, select: { agendadaPara: true } }),
  ])

  console.log(`agora: ${brt(agora)} (São Paulo)`)
  console.log(`freio: envioPausado = ${a.envioPausado ? 'TRUE  (nada sai)' : 'FALSE (pode sair)'}`)
  console.log(`       "${a.atualizadoPor ?? '—'}" em ${brt(a.atualizadoEm)}`)
  console.log(`limites: teto ${a.tetoDiario}/dia · intervalo ${a.intervaloMinMinutos}–${a.intervaloMaxMinutos} min · janela ${a.janelaInicio}–${a.janelaFim}`)
  console.log(`fila: ${agendadas} agendada(s) · primeira em ${brt(primeira?.agendadaPara)} · ${vencidas} vencida(s) agora (${vencidasCampanha} da campanha datada)`)

  if (!SOLTAR && !PUXAR) {
    console.log('\n(só leitura. Use --soltar --apply ou --puxar --apply)')
    return
  }

  const novo = !SOLTAR
  if (a.envioPausado === novo) {
    console.log(`\nJá está como você quer (envioPausado = ${novo}). Nada a fazer.`)
    return
  }

  if (SOLTAR && vencidas > 0) {
    console.log(
      `\n⛔ RECUSADO: ${vencidas} mensagem(ns) já vencida(s)` +
        (vencidasCampanha ? ` — ${vencidasCampanha} delas da campanha datada, que é decisão do Owner` : '') +
        `.\n   Soltar agora dispara no próximo tique. Remarque antes:\n` +
        `   npx tsx scripts/mv-ops/adiar-fila-mv.ts AAAA-MM-DD HH:MM --apply`,
    )
    process.exitCode = 1
    return
  }

  if (SOLTAR) {
    console.log(`\n✓ guard passou: nada vencido. A primeira sai em ${brt(primeira?.agendadaPara)}.`)
    console.log('⚠️ Confira no EasyPanel se MV_NUMEROS_TESTE está como deve (ausente = produção aberta).')
  }

  if (!APLICAR) {
    console.log(`\nDRY-RUN — o freio continua ${a.envioPausado ? 'PUXADO' : 'SOLTO'}. Para valer: --apply`)
    return
  }

  const quem = SOLTAR ? 'freio solto (script)' : 'freio puxado (script)'
  await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { envioPausado: novo, atualizadoEm: agora, atualizadoPor: quem } })
  // Reler do banco, não confiar no retorno do UPDATE.
  const depois = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  if (depois?.envioPausado !== novo) throw new Error(`o banco continua em envioPausado=${depois?.envioPausado}. PARANDO.`)
  await registrarAjuste(SOLTAR ? 'Freio solto' : 'Freio puxado', { envioPausado: novo })
  console.log(`\n✅ envioPausado = ${depois.envioPausado}  ("${depois.atualizadoPor}")`)
})
