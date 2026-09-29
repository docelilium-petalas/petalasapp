/**
 * A PROVA DO HANDOFF — o eco separa gente de robô, ou não separa.
 *
 * Testa o módulo PURO (`lib/maquina-vendas/eco.ts`). Não toca banco, não toca
 * rede: dá para rodar sem o Postgres de pé, que é a condição em que este
 * arquivo nasceu.
 *
 * Rodar:  npx tsx scripts/test-handoff-eco.ts
 */

import { ecosDoCorpo, temEco } from '../src/lib/maquina-vendas/eco'

const LOJA = '556299630120'
const CLIENTE = '5562991215'

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

/** O envelope da Meta, do jeito que ela manda. */
function envelope(campo: string, mensagens: unknown[]): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: campo,
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: LOJA, phone_number_id: '123' },
              message_echoes: mensagens,
            },
          },
        ],
      },
    ],
  }
}

const eco = (id: string, texto: string) => ({
  from: LOJA,
  to: CLIENTE,
  id,
  timestamp: '1790000000',
  type: 'text',
  text: { body: texto },
})

console.log('\n── 1 · Reconhece os dois nomes do mesmo fato ────────────────────')

const porApi = ecosDoCorpo(envelope('message_echoes', [eco('wamid.API', 'oi, sou a IA')]))
checa(porApi.length === 1, 'message_echoes vira um eco')
checa(porApi[0]?.porOnde === 'api', 'e sai marcado como `api`')

const porApp = ecosDoCorpo(envelope('smb_message_echoes', [eco('wamid.APP', 'oi, aqui é a Marília')]))
checa(porApp.length === 1, 'smb_message_echoes vira um eco')
checa(porApp[0]?.porOnde === 'app', 'e sai marcado como `app`')

console.log('\n── 2 · O destino é a CLIENTE, nunca a loja ──────────────────────')
console.log('   (num eco, `from` é o nosso número — o contrário de `messages`)')

checa(porApp[0]?.paraTelefone === CLIENTE, 'o eco aponta para o telefone da cliente')
checa(porApp[0]?.paraTelefone !== LOJA, 'e NÃO para o número da loja')

const semTo = ecosDoCorpo(envelope('smb_message_echoes', [{ from: LOJA, id: 'x', type: 'text', text: { body: 'a' } }]))
checa(semTo.length === 0, 'eco sem destino é descartado em vez de virar conversa fantasma')

const porRecipient = ecosDoCorpo(
  envelope('smb_message_echoes', [{ from: LOJA, recipient_id: CLIENTE, id: 'y', type: 'text', text: { body: 'a' } }]),
)
checa(porRecipient[0]?.paraTelefone === CLIENTE, '`recipient_id` serve de destino quando `to` falta')

console.log('\n── 3 · O texto sai de qualquer tipo de mensagem ──────────────────')

checa(porApp[0]?.texto === 'oi, aqui é a Marília', 'texto simples')

const comFoto = ecosDoCorpo(
  envelope('smb_message_echoes', [
    { from: LOJA, to: CLIENTE, id: 'f', type: 'image', image: { caption: 'esse aqui ó' } },
  ]),
)
checa(comFoto[0]?.texto === 'esse aqui ó', 'legenda de foto')

const semLegenda = ecosDoCorpo(
  envelope('smb_message_echoes', [{ from: LOJA, to: CLIENTE, id: 'g', type: 'image', image: {} }]),
)
checa(semLegenda.length === 1, 'foto sem legenda ainda conta como fala')
checa(semLegenda[0]?.texto === '', 'e o texto vem vazio, para quem chama decidir a frase')

console.log('\n── 4 · Não confunde eco com mensagem da cliente ─────────────────')

const daCliente = {
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: { messages: [{ from: CLIENTE, id: 'wamid.IN', type: 'text', text: { body: 'oi' } }] },
        },
      ],
    },
  ],
}
checa(!temEco(daCliente), 'corpo de `messages` não tem eco')
checa(ecosDoCorpo(daCliente).length === 0, 'e não produz eco nenhum')

const status = { entry: [{ changes: [{ field: 'statuses', value: { statuses: [{ id: 'a', status: 'read' }] } }] }] }
checa(!temEco(status), 'corpo de status não tem eco')

console.log('\n── 5 · Corpo torto não derruba o webhook ──────────────────────')

for (const lixo of [null, undefined, 0, '', 'texto', [], {}, { entry: 'nao e array' }, { entry: [{ changes: {} }] }]) {
  const r = ecosDoCorpo(lixo)
  if (!Array.isArray(r)) {
    falhou++
    console.log(`  ✗ ${JSON.stringify(lixo)} derrubou`)
  }
}
checa(true, 'nove corpos inválidos e nenhuma exceção')

// A forma enxuta: a Datafy às vezes manda a mudança solta, sem `entry`.
const solto = {
  field: 'smb_message_echoes',
  value: { message_echoes: [eco('wamid.SOLTO', 'mudança na raiz')] },
}
checa(ecosDoCorpo(solto).length === 1, 'mudança solta na raiz também é lida')

console.log('\n── 6 · Vários ecos num corpo só ─────────────────────────────')

const tres = ecosDoCorpo(
  envelope('smb_message_echoes', [eco('w1', 'um'), eco('w2', 'dois'), eco('w3', 'três')]),
)
checa(tres.length === 3, 'os três balões de uma resposta picada viram três ecos')
checa(tres.map((e) => e.wamid).join(',') === 'w1,w2,w3', 'e na ordem em que saíram')

console.log('\n' + '─'.repeat(70))
console.log(`${passou} passaram · ${falhou} falharam`)
if (falhou) {
  console.error('\n❌ A prova NÃO fechou. Não suba assim.')
  process.exit(1)
}
console.log('\n✅ Prova fechada.\n')
