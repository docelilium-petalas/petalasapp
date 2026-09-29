/**
 * A PROVA DO LINK DE RASTREIO — a corrente inteira, sem tocar a loja.
 *
 * O caminho real tem cinco elos, e quatro deles dá para provar aqui, offline:
 *
 *   1. a loja grava `shipping_tracking_url` no pedido        (precisa da API)
 *   2. o CRM monta `linkDeRastreio(pedidoId)`                 ← provado
 *   3. o que vai no `{{1}}` do botão é só o SUFIXO            ← provado
 *   4. a Meta concatena dominio fixo + sufixo                 ← provado
 *   5. o clique bate em /api/r/rastreio e a assinatura confere ← provado
 *
 * O elo 3 é o que mais quebra, e quebra invisível: a Meta não aceita botão de
 * URL inteiramente variável. O template é aprovado com endereço FIXO terminado
 * em variável, e no envio ela CONCATENA. Mandar a URL inteira como parâmetro
 * produz `https://petalas.../https://petalas.../api/r/...` — um link morto que
 * só aparece no celular da cliente, depois de a mensagem ter saído.
 *
 * Rodar:  npx tsx scripts/test-rastreio-link.ts
 */

process.env.JWT_SECRET ||= 'segredo-de-teste-nao-usar-em-producao'
process.env.APP_URL ||= 'https://petalas.docelilium.com.br'

import { assinaturaDoPedido, caminhoDeRastreio, conferirRastreio, linkDeRastreio } from '../src/lib/maquina-vendas/rastreio'
import { sufixoDoBotao } from '../src/lib/maquina-vendas/canal'

let passou = 0
let falhou = 0

function checa(condicao: boolean, oQue: string): void {
  if (condicao) {
    passou++
    console.log(`  ✓ ${oQue}`)
  } else {
    falhou++
    console.log(`  ✗ ${oQue}`)
  }
}

const PEDIDO = 1042

console.log('\n── 1 · O link que o CRM monta ───────────────────────────────')

const link = linkDeRastreio(PEDIDO)
console.log(`   ${link}`)
checa(link.startsWith('https://'), 'e https')
checa(link.includes('/api/r/rastreio/'), 'e aponta para a rota do CRM, não para a transportadora')
checa(/\/\d+\.[0-9a-f]{20}$/.test(link), 'e termina em <id>.<assinatura de 20 hex>')

console.log('\n── 2 · A assinatura fecha a porta ───────────────────────────')
console.log('   (o id do pedido da Nuvemshop é sequencial — sem assinatura,')
console.log('    trocar o número mostraria o rastreio e a cidade de outra cliente)')

const param = `${PEDIDO}.${assinaturaDoPedido(PEDIDO)}`
checa(conferirRastreio(param) === String(PEDIDO), 'o parâmetro que o CRM emitiu abre')
checa(conferirRastreio(`1043.${assinaturaDoPedido(PEDIDO)}`) === null, 'trocar o id NÃO abre o pedido vizinho')
checa(conferirRastreio(`${PEDIDO}.${'0'.repeat(20)}`) === null, 'assinatura chutada não abre')
checa(conferirRastreio(String(PEDIDO)) === null, 'id cru, sem assinatura, não abre')
checa(conferirRastreio(`${PEDIDO}.${assinaturaDoPedido(PEDIDO).toUpperCase()}`) === null, 'hex em maiúscula não passa (forma única)')
checa(conferirRastreio('') === null && conferirRastreio('../../etc/passwd') === null, 'lixo no caminho não abre')

const outra = assinaturaDoPedido(9999)
checa(outra !== assinaturaDoPedido(PEDIDO), 'pedidos diferentes, assinaturas diferentes')
checa(assinaturaDoPedido(PEDIDO) === assinaturaDoPedido(String(PEDIDO)), 'número e texto dão a MESMA assinatura')

console.log('\n── 3 · O que vai no {{1}} do botão ──────────────────────────')

const sufixo = sufixoDoBotao(link)
console.log(`   {{1}} = ${sufixo}`)
checa(!sufixo.startsWith('http'), 'o parâmetro NÃO carrega o domínio (essa é a armadilha)')
checa(!sufixo.startsWith('/'), 'nem a barra inicial — a Meta já põe a dela')
checa(sufixo === caminhoDeRastreio(PEDIDO), 'e bate exatamente com `caminhoDeRastreio`')

console.log('\n── 4 · O que a cliente vê, depois da Meta concatenar ────────────')

const DOMINIO_APROVADO = 'https://petalas.docelilium.com.br/'
const montado = DOMINIO_APROVADO + sufixo
console.log(`   ${montado}`)
checa(montado === link, 'domínio aprovado + {{1}} reconstrói o link original, sem duplicar')
checa((montado.match(/https:\/\//g) ?? []).length === 1, 'e há UM só `https://` no endereço final')

const caminhoRecebido = new URL(montado).pathname.replace('/api/r/rastreio/', '')
checa(conferirRastreio(caminhoRecebido) === String(PEDIDO), 'o clique nesse link chega com assinatura válida')

console.log('\n── 5 · A assinatura depende do segredo ───────────────────────')
console.log('   (trocar JWT_SECRET invalida os links já enviados. É de propósito,')
console.log('    mas precisa ser sabido ANTES de girar a chave)')

const antes = assinaturaDoPedido(PEDIDO)
process.env.JWT_SECRET = 'outro-segredo'
checa(assinaturaDoPedido(PEDIDO) !== antes, 'segredo outro, assinatura outra')
checa(conferirRastreio(param) === null, 'e o link antigo para de abrir')

console.log('\n' + '─'.repeat(70))
console.log(`${passou} passaram · ${falhou} falharam`)
if (falhou) {
  console.error('\n❌ A prova NÃO fechou.')
  process.exit(1)
}
console.log('\n✅ Prova fechada — elos 2 a 5 da corrente.')
console.log('   Falta o elo 1: a loja precisa ter `shipping_tracking_url` no pedido.')
console.log('   Isso só se prova com a credencial da Nuvemshop em mãos.\n')
