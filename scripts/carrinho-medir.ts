/**
 * QUAL RÉGUA CABE NESTA LOJA? — mede o atraso real de publicação do carrinho.
 *
 *   npx tsx scripts/carrinho-medir.ts
 *
 * Só lê. A pergunta que ele responde é uma só, e ela decide a cadência inteira:
 * **quantas horas tem o carrinho MAIS NOVO que a API nos mostra?**
 *
 * A documentação da Nuvemshop diz "até 6 horas". A medição de 09/09/2026 disse
 * 27. Uma etapa agendada para antes desse piso não é agressiva — ela é
 * impossível: quando a varredura enxerga o carrinho, a hora dela já passou, e
 * a mensagem sai atrasada fingindo ser pontual.
 */

import { listarCarrinhosAbandonados, telefoneDoCarrinho, ancoraDaPeca } from '../src/lib/nuvemshop/loja'
import { paraE164, primeiroNome } from '../src/lib/maquina-vendas/telefone'

const H = 3600_000
const horas = (ms: number) => (ms / H).toFixed(1)

function percentil(v: number[], p: number): number {
  if (!v.length) return NaN
  const s = [...v].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

async function main() {
  const agora = Date.now()
  const carrinhos = await listarCarrinhosAbandonados(new Date(agora - 30 * 24 * H))
  console.log(`\ncarrinhos abandonados nos últimos 30 dias: ${carrinhos.length}\n`)
  if (!carrinhos.length) return

  const idades = carrinhos.map((c) => agora - new Date(c.created_at).getTime())

  console.log('IDADE NO MOMENTO EM QUE A API OS MOSTRA')
  console.log(`  mais novo (o piso da régua) : ${horas(Math.min(...idades))} h`)
  console.log(`  p25                         : ${horas(percentil(idades, 25))} h`)
  console.log(`  mediana                     : ${horas(percentil(idades, 50))} h`)
  console.log(`  mais velho                  : ${horas(Math.max(...idades))} h`)

  let comTel = 0, comNome = 0, comLink = 0, elegiveis = 0
  for (const c of carrinhos) {
    const tel = !!paraE164(telefoneDoCarrinho(c))
    const nome = !!primeiroNome(c.contact_name)
    const link = !!c.abandoned_checkout_url
    if (tel) comTel++
    if (nome) comNome++
    if (link) comLink++
    if (tel && nome && link) elegiveis++
  }
  const pct = (n: number) => `${n}/${carrinhos.length} (${Math.round((100 * n) / carrinhos.length)}%)`
  console.log('\nO QUE A COPY PRECISA, E QUANTOS TÊM')
  console.log(`  telefone utilizável : ${pct(comTel)}`)
  console.log(`  primeiro nome       : ${pct(comNome)}`)
  console.log(`  link do checkout    : ${pct(comLink)}`)
  console.log(`  ELEGÍVEIS (os três) : ${pct(elegiveis)}`)

  console.log('\nOS 5 MAIS NOVOS')
  for (const c of [...carrinhos].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 5)) {
    const idade = horas(agora - new Date(c.created_at).getTime())
    console.log(
      `  ${String(idade).padStart(6)} h  ${(primeiroNome(c.contact_name) || '—').padEnd(12)}` +
        `  tel:${paraE164(telefoneDoCarrinho(c)) ? 'sim' : 'não'}  ${ancoraDaPeca(c) || '—'}`,
    )
  }
  console.log()
}

main().catch((e) => {
  console.error('\nfalhou:', e instanceof Error ? e.message : e)
  process.exit(1)
})
