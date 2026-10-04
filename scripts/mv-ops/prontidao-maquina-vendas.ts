/**
 * Checklist de religamento, medido — SOMENTE LEITURA.
 *
 *   npx tsx scripts/mv-ops/prontidao-maquina-vendas.ts
 *
 * Porte de `scripts/prontidao-maquina-vendas.ts` da CarBoss, mais a bateria
 * pura (a mesma da aba Prontidão). Cada linha é uma consulta; o que não dá
 * para medir daqui (env do deploy) aparece como "?" — nunca como "ok".
 */

import { brt, cabecalho, prisma, rodar } from './_base'
import { rodarBateriaPura } from '../../src/lib/maquina-vendas/bateria-pura'
import { lerPulsoDoCanal } from '../../src/lib/maquina-vendas/pulso'

const ok = (s: string) => console.log(`  ✓  ${s}`)
const nao = (s: string) => console.log(`  ✗  ${s}`)
const naoSei = (s: string) => console.log(`  ?  ${s}`)

rodar(async () => {
  cabecalho('PRONTIDÃO DA MÁQUINA (somente leitura)', false)
  let ruins = 0

  console.log('── bateria pura (regras sem banco) ──')
  const b = rodarBateriaPura()
  if (b.falhou === 0 && !b.parouEm) ok(`${b.passou} verificação(ões) passaram`)
  else {
    ruins++
    nao(`${b.falhou} falha(s)${b.parouEm ? ` · parou em ${b.parouEm}` : ''}`)
    for (const g of b.grupos) for (const f of g.falhas) console.log(`       ${g.titulo}: ${f.oQue}${f.detalhe ? ` — ${f.detalhe}` : ''}`)
  }

  console.log('\n── ritmo e limites ──')
  const a = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  if (!a) naoSei('sem linha de ajustes — valem os padrões do código')
  else {
    if (a.envioPausado) nao('envioPausado = true — NADA sai enquanto isto estiver ligado')
    else ok('envioPausado = false — o freio está solto')
    console.log(`     teto ${a.tetoDiario}/dia · intervalo ${a.intervaloMinMinutos}–${a.intervaloMaxMinutos} min · janela ${a.janelaInicio}–${a.janelaFim}`)
  }

  console.log('\n── cadências ──')
  const cads = await prisma.mvCadencia.findMany({
    orderBy: { nome: 'asc' },
    select: { nome: true, ativo: true, gatilho: true, stageId: true, _count: { select: { inscricoes: { where: { status: 'ATIVA' } } } } },
  })
  for (const c of cads) {
    let semInscricao = ''
    if (c.stageId && c.gatilho === 'funil') {
      const n = await prisma.deal.count({ where: { stageId: c.stageId, status: 'OPEN' } })
      semInscricao = ` · ${n} card(s) abertos na coluna`
    }
    console.log(`  ${c.ativo ? 'LIGADA   ' : 'desligada'} ${c.nome} [${c.gatilho}] · ${c._count.inscricoes} ATIVA(s)${semInscricao}`)
  }

  console.log('\n── fila agendada por dia (São Paulo) ──')
  const fila = await prisma.$queryRaw<Array<{ dia: string; n: number; primeira: string; ultima: string }>>`
    SELECT to_char(agendada_para AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') AS dia, count(*)::int AS n,
           to_char(min(agendada_para AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS primeira,
           to_char(max(agendada_para AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'), 'HH24:MI') AS ultima
      FROM maquina_vendas_mensagens WHERE status = 'AGENDADA' GROUP BY 1
     ORDER BY min(agendada_para)`
  // Armadilha: a coluna é timestamp SEM fuso guardando UTC — converter direto para SP erra 3h.
  if (!fila.length) console.log('  (vazia)')
  for (const f of fila) console.log(`  ${f.dia}  ${String(f.n).padStart(3)} mensagem(ns)  ${f.primeira} → ${f.ultima}`)
  const vencidas = await prisma.mvMensagem.count({ where: { status: 'AGENDADA', agendadaPara: { lte: new Date() } } })
  if (vencidas) nao(`${vencidas} vencida(s) — soltar o freio as dispara no próximo tique`)
  else ok('nada vencido')

  console.log('\n── pegada do canal oficial ──')
  const [enviadas, comWamid, ultima] = await Promise.all([
    prisma.mvMensagem.count({ where: { status: 'ENVIADA' } }),
    prisma.mvMensagem.count({ where: { status: 'ENVIADA', idExterno: { not: null } } }),
    prisma.mvMensagem.findFirst({ where: { status: 'ENVIADA' }, orderBy: { enviadaEm: 'desc' }, select: { enviadaEm: true } }),
  ])
  console.log(`  ${enviadas} enviada(s) · ${comWamid} com wamid · última ${brt(ultima?.enviadaEm)}`)
  if (comWamid > 0) ok('já houve envio pelo canal oficial (wamid da Cloud API)')
  else nao('nenhum envio com wamid neste banco')
  const p = await lerPulsoDoCanal(new Date())
  if (p.nivel === 'ok') ok(`pulso: ${p.titulo}`)
  else {
    if (p.nivel === 'critico') ruins++
    nao(`pulso ${p.nivel}: ${p.titulo}`)
  }

  console.log('\n── o que mora no deploy ──')
  naoSei('MV_NUMEROS_TESTE, CRON_SECRET, DATAFY_*, WEBHOOK_CALLBACK_SECRET são env do EasyPanel — confira lá')

  if (ruins) process.exitCode = 1
})
