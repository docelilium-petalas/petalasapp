/**
 * ÚLTIMOS EVENTOS DO MÓDULO LOGS, NA LINHA DE COMANDO — só leitura.
 * Porte de `ver-logs.ts`.
 *
 *   npx tsx scripts/mv-ops/ver-logs.ts                  # últimos 20
 *   npx tsx scripts/mv-ops/ver-logs.ts 50
 *   npx tsx scripts/mv-ops/ver-logs.ts --tipo disjuntor
 *   npx tsx scripts/mv-ops/ver-logs.ts --nivel ERRO
 *
 * A tela /logs exige sessão; isto confere de fora, durante um deploy ou uma
 * investigação.
 */
import { brt, cabecalho, opcao, posicionais, prisma, rodar } from './_base'

rodar(async () => {
  cabecalho('LOGS (só leitura)', false)
  const n = Math.min(500, Math.max(1, Number(posicionais(['--tipo', '--nivel'])[0] ?? 20) || 20))
  const tipo = opcao('--tipo')
  const nivel = opcao('--nivel')
  const linhas = await prisma.logEvento.findMany({
    where: { ...(tipo ? { tipo } : {}), ...(nivel ? { nivel: nivel.toUpperCase() } : {}) },
    orderBy: { createdAt: 'desc' },
    take: n,
  })
  if (!linhas.length) {
    console.log('Nenhum evento com esse filtro.')
    return
  }
  for (const l of linhas.reverse()) {
    const marca = l.nivel === 'ERRO' ? '✗' : l.nivel === 'AVISO' ? '!' : '·'
    console.log(`${marca} ${brt(l.createdAt)}  ${l.origem.padEnd(16)} ${l.tipo.padEnd(24)} ${l.titulo}`)
    if (l.detalhe) console.log(`    ${l.detalhe.replace(/\s+/g, ' ').slice(0, 200)}`)
  }
})
