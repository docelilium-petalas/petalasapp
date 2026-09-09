/**
 * REGISTRA (ou lista, ou remove) os webhooks da loja na Nuvemshop.
 *
 *   npx tsx scripts/nuvemshop-webhooks.ts                 # lista o que existe
 *   npx tsx scripts/nuvemshop-webhooks.ts --aplicar       # cria os que faltam
 *   npx tsx scripts/nuvemshop-webhooks.ts --remover <id>  # apaga um
 *
 * A URL de destino vem de APP_URL, ou do argumento --url.
 *
 * ⚠️ Só eventos de PEDIDO. Carrinho abandonado NÃO tem webhook na plataforma —
 * conferido na documentação em 08/09/2026 — e por isso vive na varredura do
 * tique, em /api/cron/maquina-vendas.
 */

import { requisitar } from '../src/lib/nuvemshop/cliente'
import { obterCredenciais, NuvemshopSemCredencial } from '../src/lib/nuvemshop/config'

/**
 * Os eventos que a Máquina realmente usa.
 *
 * Deliberadamente curto: cada webhook a mais é uma entrega a mais para
 * verificar, registrar e tornar idempotente. Assinar `product/updated` porque
 * "pode ser útil" é assinar ruído que ninguém lê.
 */
const EVENTOS = [
  'order/created',   // pedido novo — encerra a cadência de carrinho
  'order/paid',      // pagamento aprovado — é a conversão
  'order/fulfilled', // enviado — abre a trilha de pós-venda
  'order/cancelled', // cancelado — a pessoa volta a ser abordável
] as const

type Webhook = { id: number; event: string; url: string }

async function main() {
  const args = process.argv.slice(2)
  const aplicar = args.includes('--aplicar')
  const idxUrl = args.indexOf('--url')
  const idxRem = args.indexOf('--remover')

  const cred = await obterCredenciais()
  const base = (idxUrl >= 0 ? args[idxUrl + 1] : process.env.APP_URL || '').replace(/\/$/, '')

  console.log(`loja: ${cred.storeId}`)

  if (idxRem >= 0) {
    const id = args[idxRem + 1]
    await requisitar(`webhooks/${id}`, { metodo: 'DELETE', credenciais: cred })
    console.log(`removido: webhook ${id}`)
    return
  }

  const { dados: existentes } = await requisitar<Webhook[]>('webhooks', { credenciais: cred })
  console.log(`\nwebhooks já registrados: ${existentes.length}`)
  for (const w of existentes) console.log(`  ${String(w.id).padEnd(10)} ${w.event.padEnd(18)} ${w.url}`)

  const faltando = EVENTOS.filter((e) => !existentes.some((w) => w.event === e))
  console.log(`\nfaltando: ${faltando.length ? faltando.join(', ') : '(nenhum)'}`)
  if (faltando.length === 0) return

  if (!aplicar) {
    console.log('\n(simulação — rode com --aplicar para criar)')
    return
  }
  if (!base.startsWith('https://')) {
    console.error('\n❌ A Nuvemshop exige HTTPS. Defina APP_URL ou passe --url https://…')
    process.exit(1)
  }

  const destino = `${base}/api/webhook/nuvemshop`
  for (const evento of faltando) {
    const { dados } = await requisitar<Webhook>('webhooks', {
      metodo: 'POST',
      corpo: { event: evento, url: destino },
      credenciais: cred,
    })
    console.log(`  criado ${dados.id}  ${evento} -> ${destino}`)
  }
  console.log('\n✅ Pronto. Confira que NUVEMSHOP_APP_SECRET está definido — sem ele a rota recusa toda entrega.')
}

main().catch((e: unknown) => {
  if (e instanceof NuvemshopSemCredencial) {
    console.error(`\n⚠️  ${e.message}`)
    process.exit(2)
  }
  console.error('\n❌', e instanceof Error ? e.message : e)
  process.exit(1)
})
