/**
 * NÍVEL 1 — funções puras do motor. Sem banco, sem rede, sem relógio real.
 *
 * As checagens moram em `src/lib/maquina-vendas/bateria-pura.ts`, porque a aba
 * Prontidão roda as MESMAS dentro do servidor. Este arquivo só imprime.
 *
 * Rodar:  npm run test:mv -- 1
 */

process.env.JWT_SECRET ||= 'segredo-de-teste-nao-usar-em-producao'
process.env.APP_URL ||= 'https://petalas.docelilium.com.br'

import { imprimirBateria } from './_kit'

async function main() {
  // Import dinâmico: a env acima precisa existir antes do módulo de rastreio carregar.
  const { rodarBateriaPura } = await import('../../src/lib/maquina-vendas/bateria-pura')
  const ok = imprimirBateria('Nível 1', rodarBateriaPura())
  process.exit(ok ? 0 : 1)
}

void main()
