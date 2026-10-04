/**
 * Porta única dos testes da Máquina de Vendas.
 *
 *   npm run test:mv            → nível 1 (puro)
 *   npm run test:mv -- 1       → nível 1
 *   npm run test:mv -- 2       → nível 2 (banco local `_qa`, canal falso)
 *   npm run test:mv -- 1 2     → os dois, em ordem; para no primeiro vermelho
 *   npm run test:mv -- 3 ...   → nível 3 (envio REAL, só lista branca) — argumentos repassados
 */
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const niveis = args.filter((a) => /^[123]$/.test(a))
const resto = args.filter((a) => !/^[123]$/.test(a))
if (!niveis.length) niveis.push('1')

for (const n of niveis) {
  // Uma linha só, com cada argumento entre aspas: `npx` no Windows exige shell,
  // e o Node 24 recusa (DEP0190) lista de argumentos junto com `shell: true`.
  const extras = (n === '3' ? resto : []).map((a) => JSON.stringify(a)).join(' ')
  const r = spawnSync(`npx tsx scripts/test-mv/nivel${n}.ts ${extras}`.trim(), { stdio: 'inherit', shell: true })
  if (r.status !== 0) process.exit(r.status ?? 1)
}
