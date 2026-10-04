/**
 * MIGRAÇÃO DAS CADÊNCIAS JÁ CADASTRADAS PARA O MOTOR PORTADO (04/10/2026).
 *
 *   npx tsx scripts/mv-porte-migrar.ts                 # dry-run (padrão): só mede e mostra
 *   npx tsx scripts/mv-porte-migrar.ts --apply         # grava — só se a conferência der 100%
 *   npx tsx scripts/mv-porte-migrar.ts --sem-meta      # não consulta a Meta (banco local)
 *
 * As cadências da Doce Lilium JÁ moram nas tabelas `maquina_vendas_*` — o porte
 * não muda de tabela, então não há cópia de linha nem troca de id. O que falta
 * para elas valerem no motor portado é:
 *
 *   1. copy das etapas igual ao corpo APROVADO na Meta (templateBase)
 *   2. mensagens AGENDADAS re-renderizadas com essa copy
 *   3. etapa nova da régua (ex.: 3º toque do carrinho) nas inscrições ATIVAS
 *   4. `textoEntregue` carimbado no que já saiu, quando o corpo é conhecido
 *
 * Cada passo é um script de `scripts/mv-ops/` que já sabe fazer dry-run; este
 * arquivo só os chama NA ORDEM e cerca a execução com duas provas:
 *
 *   ANTES   · toda etapa fora da campanha mapeia para um template do catálogo
 *           · nenhuma cliente ATIVA duas vezes na mesma cadência
 *           · a migration aditiva está aplicada (coluna `perfil` + índice)
 *   DEPOIS  · a impressão digital da campanha 10.10 (inscrições, mensagens,
 *             cadências, etapas e cursores) é IDÊNTICA à de antes
 *
 * A campanha 10.10 nunca é tocada (`GATILHOS_INTOCAVEIS`). Se a impressão
 * digital mudar, o script sai com código 1 e grita — não há "quase igual".
 */

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { APLICAR, cabecalho, prisma, registrarAjuste, rodar, tem } from './mv-ops/_base'
import { CATALOGO, esqueletoNomeado } from '../src/lib/maquina-vendas/catalogo-templates'
import { GATILHOS_INTOCAVEIS } from '../src/lib/maquina-vendas/cadencias-seed'

const SEM_META = tem('--sem-meta')
const PROTEGIDOS = [...GATILHOS_INTOCAVEIS]

async function digitalDaCampanha(): Promise<{ hash: string; resumo: Record<string, number> }> {
  const cadencias = await prisma.mvCadencia.findMany({
    where: { gatilho: { in: PROTEGIDOS } },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
    orderBy: { gatilho: 'asc' },
  })
  const ids = cadencias.map((c) => c.id)
  const inscricoes = await prisma.mvInscricao.findMany({ where: { cadenciaId: { in: ids } }, orderBy: { id: 'asc' } })
  const mensagens = await prisma.mvMensagem.findMany({
    where: { inscricaoId: { in: inscricoes.map((i) => i.id) } },
    orderBy: { id: 'asc' },
  })
  const cursores = await prisma.mvCursor.findMany({
    where: { OR: [{ chave: { contains: '1010' } }, { chave: { startsWith: 'mv:campanha' } }] },
    orderBy: { chave: 'asc' },
    select: { chave: true, valor: true },
  })
  const json = JSON.stringify({ cadencias, inscricoes, mensagens, cursores }, (_k, v) =>
    typeof v === 'bigint' ? v.toString() : v,
  )
  return {
    hash: createHash('sha256').update(json).digest('hex'),
    resumo: {
      cadencias: cadencias.length,
      etapas: cadencias.reduce((n, c) => n + c.etapas.length, 0),
      inscricoes: inscricoes.length,
      mensagens: mensagens.length,
      cursores: cursores.length,
    },
  }
}

type Problema = { onde: string; o_que: string }

async function conferir(): Promise<Problema[]> {
  const problemas: Problema[] = []

  // Migration aditiva aplicada?
  const coluna = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM information_schema.columns
      WHERE table_name = 'maquina_vendas_inscricoes' AND column_name = 'perfil'`,
  )
  if (!coluna[0]?.n) problemas.push({ onde: 'schema', o_que: 'coluna `perfil` ausente — rode `prisma migrate deploy` antes' })
  const indice = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE indexname = 'maquina_vendas_inscricoes_ativa_unica'`,
  )
  if (!indice[0]?.n) problemas.push({ onde: 'schema', o_que: 'índice `maquina_vendas_inscricoes_ativa_unica` ausente' })

  // Cliente ATIVA duas vezes na mesma cadência (o índice não nasceria).
  const duplas = await prisma.$queryRawUnsafe<Array<{ cadencia_id: string; n: number }>>(
    `SELECT cadencia_id, count(*)::int AS n FROM maquina_vendas_inscricoes
      WHERE status = 'ATIVA' GROUP BY cadencia_id, telefone_key HAVING count(*) > 1`,
  )
  for (const d of duplas) problemas.push({ onde: `cadência ${d.cadencia_id}`, o_que: `${d.n} inscrições ATIVAS do mesmo número` })

  // Toda etapa fora da campanha mapeia para o catálogo.
  const nomes = new Set(CATALOGO.map((t) => t.nome))
  const cadencias = await prisma.mvCadencia.findMany({
    where: { gatilho: { notIn: PROTEGIDOS } },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
    orderBy: { nome: 'asc' },
  })
  console.log('\nMapa cadência → template do catálogo (fora da campanha)')
  for (const c of cadencias) {
    for (const e of c.etapas) {
      const mapeia = !!e.templateNome && nomes.has(e.templateNome)
      const alinhada = mapeia && e.templateBase === esqueletoNomeado(e.templateNome!)
      console.log(
        `  ${mapeia ? '✓' : '✗'} ${c.nome.padEnd(22)} etapa ${e.ordem}  ${(e.templateNome ?? '(sem template)').padEnd(30)} copy ${alinhada ? 'alinhada' : 'a alinhar'}`,
      )
      if (!mapeia) problemas.push({ onde: `${c.nome} · etapa ${e.ordem}`, o_que: `template "${e.templateNome ?? '—'}" fora do catálogo` })
    }
  }
  return problemas
}

function passo(script: string, extra: string[] = []): void {
  const args = [...extra, ...(APLICAR ? ['--apply'] : [])]
  console.log(`\n── ${script} ${args.join(' ')}`.padEnd(72, '─'))
  const linha = `npx tsx scripts/mv-ops/${script} ${args.join(' ')}`.trim()
  const r = spawnSync(linha, { stdio: 'inherit', shell: true, env: process.env })
  if (r.status !== 0) throw new Error(`${script} saiu com código ${r.status} — migração interrompida aqui`)
}

rodar(async () => {
  cabecalho(`Migração das cadências para o motor portado — ${APLICAR ? 'APLICAR' : 'DRY-RUN'}`)
  const antes = await digitalDaCampanha()
  console.log(`\nCampanha 10.10 antes: ${antes.hash.slice(0, 16)}…`, antes.resumo)

  const problemas = await conferir()
  if (problemas.length) {
    console.log('\n✗ Conferência NÃO deu 100%:')
    for (const p of problemas) console.log(`  · ${p.onde}: ${p.o_que}`)
    if (APLICAR) throw new Error('--apply recusado: corrija os itens acima e rode o dry-run de novo')
  } else {
    console.log('\n✓ Conferência 100%: schema, unicidade e mapa de templates')
  }

  // A ordem importa: alinhar a copy, re-renderizar a fila com ela, depois
  // semear a etapa nova (que já nasce com a copy certa) e carimbar o passado.
  passo('mv-alinhar-copy-com-templates.ts', SEM_META ? ['--sem-meta'] : [])
  passo('resincronizar-copy-mv.ts')
  passo('mv-completar-etapas-novas.ts')
  // O carimbo precisa do corpo APROVADO lido na Meta: sem ela, não se inventa.
  if (SEM_META) console.log('\n⚠️ --sem-meta: backfill do texto entregue PULADO (exige o corpo lido na Meta).')
  else passo('mv-backfill-texto-entregue.ts')

  const depois = await digitalDaCampanha()
  console.log(`\nCampanha 10.10 depois: ${depois.hash.slice(0, 16)}…`, depois.resumo)
  if (depois.hash !== antes.hash) {
    throw new Error('A CAMPANHA 10.10 MUDOU durante a migração — pare tudo e compare os snapshots')
  }
  console.log('✓ Campanha 10.10 idêntica antes e depois (sha256)')

  if (APLICAR) {
    await registrarAjuste('Migração das cadências para o motor portado', {
      campanha: { hash: antes.hash, ...antes.resumo },
      semMeta: SEM_META,
    })
    console.log('\nMigração aplicada e registrada em logs_eventos (mv_ajustes).')
  } else {
    console.log('\nDRY-RUN — nada foi gravado. Para valer: --apply')
  }
})
