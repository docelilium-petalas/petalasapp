/**
 * A JANELA DE ENVIO, com a conferência que o clique não mostra.
 *
 *   npx tsx scripts/mv-ops/mv-janela.ts                                 # só mostra
 *   npx tsx scripts/mv-ops/mv-janela.ts --inicio 09:00 --fim 20:00 --apply
 *
 * Porte de `scripts/mv-janela.ts` da CarBoss. O guard de meia-noite da origem
 * (`--pos-deploy`) não se porta: o `parseJanela` da Doce Lilium já nasceu
 * lendo "00:00" como fim do dia, então não existe versão em produção que
 * tropece nele. Ficam: a mesma validação da tela, o mínimo de 2h, a capacidade
 * do dia e o registro em `mv_ajustes`.
 *
 * Mensagem JÁ agendada não anda — ela fica no horário em que foi marcada.
 */

import { APLICAR, cabecalho, opcao, prisma, registrarAjuste, rodar } from './_base'
import { parseJanela, capacidadeDoDia, CRON_MINUTOS, MENSAGENS_POR_TIQUE } from '../../src/lib/maquina-vendas/janela'

rodar(async () => {
  cabecalho('JANELA DE ENVIO', Boolean(opcao('--inicio') || opcao('--fim')))
  const linha = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  if (!linha) throw new Error('sem linha de ajustes — abra a aba Ritmo uma vez antes.')
  const atual = { inicio: linha.janelaInicio, fim: linha.janelaFim }
  console.log(`janela em uso: ${atual.inicio} → ${atual.fim}  (salva por "${linha.atualizadoPor ?? '—'}")`)

  const inicio = opcao('--inicio') ?? atual.inicio
  const fim = opcao('--fim') ?? atual.fim
  if (inicio === atual.inicio && fim === atual.fim) {
    console.log('\nnada a mudar. Use --inicio / --fim.')
    return
  }
  const j = parseJanela(inicio, fim)
  if (j.fimMin - j.inicioMin < 120) throw new Error('a janela ficaria com menos de 2 horas.')

  const cap = capacidadeDoDia({
    janela: j,
    cronMinutos: CRON_MINUTOS,
    intervaloMinMinutos: linha.intervaloMinMinutos,
    intervaloMaxMinutos: linha.intervaloMaxMinutos,
    mensagensPorTick: MENSAGENS_POR_TIQUE,
  })
  console.log(`\nde:   ${atual.inicio} → ${atual.fim}`)
  console.log(`para: ${inicio} → ${fim}   (${((j.fimMin - j.inicioMin) / 60).toFixed(1)}h)`)
  console.log(`capacidade: ~${cap.mensagens} mensagens no dia (1 a cada ${cap.passoMinutos} min) · teto ${linha.tetoDiario} — o menor dos dois manda`)
  console.log('⚠️ Mensagem JÁ agendada não anda.')

  if (!APLICAR) {
    console.log('\nDRY-RUN — nada mudou. Para valer: --apply')
    return
  }
  const por = opcao('--por') ?? 'script mv-janela'
  await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { janelaInicio: inicio, janelaFim: fim, atualizadoEm: new Date(), atualizadoPor: por } })
  await registrarAjuste(`Janela de envio alterada: ${inicio}–${fim}`, { de: atual, para: { inicio, fim }, por })
  console.log(`\n✅ janela agora é ${inicio} → ${fim}. Vale a partir do próximo tique.`)
})
