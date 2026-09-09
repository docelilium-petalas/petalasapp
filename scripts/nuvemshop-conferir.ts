/**
 * A LOJA RESPONDE? — a prova de ponta a ponta da conexão com a Nuvemshop.
 *
 * Roda ANTES de qualquer integração, e de novo sempre que alguém trocar o
 * token. Só lê. Não grava nada, em lugar nenhum.
 *
 *   npx tsx scripts/nuvemshop-conferir.ts
 *
 * Credenciais: primeiro a tabela `Integration` (cifradas), depois as variáveis
 * NUVEMSHOP_STORE_ID / NUVEMSHOP_ACCESS_TOKEN / NUVEMSHOP_USER_AGENT.
 *
 * Para conferir um token que ainda não foi salvo na tela, sem gravar nada:
 *
 *   NUVEMSHOP_STORE_ID=123456 NUVEMSHOP_ACCESS_TOKEN=xxx npx tsx scripts/nuvemshop-conferir.ts
 */

import { conferirConexao, folgaAtual, ErroNuvemshop } from '../src/lib/nuvemshop/cliente'
import { listarCarrinhosAbandonados, listarPedidos, telefoneDoCarrinho, ancoraDaPeca } from '../src/lib/nuvemshop/loja'
import { NuvemshopSemCredencial, VERSAO_API } from '../src/lib/nuvemshop/config'

const linha = (t: string) => console.log(`\n${'─'.repeat(70)}\n${t}\n${'─'.repeat(70)}`)

async function main() {
  linha(`NUVEMSHOP · conferência de conexão · API ${VERSAO_API}`)

  // 1 · A loja responde
  const loja = await conferirConexao()
  console.log(`✅ Conectado`)
  console.log(`   loja      ${loja.nome}`)
  console.log(`   store_id  ${loja.storeId}`)
  console.log(`   domínio   ${loja.dominio}`)

  // 2 · Carrinhos abandonados — o fluxo que exige varredura
  linha('CARRINHOS ABANDONADOS (últimos 30 dias)')
  const desde = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const carrinhos = await listarCarrinhosAbandonados(desde)
  console.log(`total em aberto: ${carrinhos.length}`)

  const comTelefone = carrinhos.filter((c) => telefoneDoCarrinho(c))
  console.log(`com telefone:    ${comTelefone.length}  ← só estes são alcançáveis por WhatsApp`)

  if (carrinhos.length) {
    // O atraso REAL entre abandonar e aparecer na API. A documentação diz "até
    // 6 horas"; o que vale para calibrar a cadência é o que esta loja faz.
    const idades = carrinhos.map((c) => (Date.now() - new Date(c.created_at).getTime()) / 3_600_000)
    idades.sort((a, b) => a - b)
    console.log(`idade do mais novo: ${idades[0].toFixed(1)}h  ← se for ≫1h, a janela de 6h está mordendo`)

    console.log('\namostra:')
    for (const c of carrinhos.slice(0, 5)) {
      const tel = telefoneDoCarrinho(c) ?? '(sem telefone)'
      console.log(`  ${c.created_at.slice(0, 16)}  ${tel.padEnd(14)} ${c.total.padStart(9)} · ${ancoraDaPeca(c)}`)
    }
  }

  // 3 · Pedidos — o fluxo que roda por webhook
  linha('PEDIDOS (últimos 30 dias)')
  const pedidos = await listarPedidos(desde)
  console.log(`total: ${pedidos.length}`)
  const porPagamento = pedidos.reduce<Record<string, number>>((acc, p) => {
    acc[p.payment_status] = (acc[p.payment_status] ?? 0) + 1
    return acc
  }, {})
  console.table(porPagamento)

  linha('RITMO')
  console.log(`folga no balde ao terminar: ${folgaAtual() ?? '(não informada)'} de 40`)
  console.log('\n✅ Conferência concluída. Nada foi gravado.')
  process.exit(0)
}

main()
  .catch((erro: unknown) => {
    if (erro instanceof NuvemshopSemCredencial) {
      console.error(`\n⚠️  ${erro.message}`)
      process.exit(2)
    }
    if (erro instanceof ErroNuvemshop) {
      console.error(`\n❌ ${erro.message}`)
      if (erro.status === 401) {
        console.error('   401 = token inválido, revogado, ou app desinstalado da loja.')
      }
      if (erro.status === 400) {
        console.error('   400 costuma ser User-Agent ausente — mas o cliente já o envia.')
        console.error('   Confira o store_id: id errado devolve 400, não 404.')
      }
      process.exit(1)
    }
    console.error('\n❌ Falha inesperada:', erro)
    process.exit(1)
  })
