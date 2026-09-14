import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { catalogoDaLoja, formatarPreco } from '@/lib/nuvemshop/catalogo'
import { enviarMensagemLivre } from '@/lib/maquina-vendas/canal'
import { registrarTurno } from '@/lib/atendimento/conversa'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `enviar_fotos`: manda a foto principal de até 3 peças, cada uma
 * com legenda de nome, preço e link. É a vitrine dentro do WhatsApp.
 *
 * O telefone NÃO vem do modelo: o n8n preenche com o da conversa. Um modelo
 * que escolhe o destinatário é um modelo que um dia manda a foto para outra
 * pessoa.
 */
export async function POST(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const corpo = (await request.json().catch(() => ({}))) as { telefone?: string; produtos?: string | number[] }
  const telefone = telefoneDaRequisicao(corpo.telefone)
  if (!telefone) return NextResponse.json({ erro: 'telefone inválido' }, { status: 400 })

  const ids = (Array.isArray(corpo.produtos) ? corpo.produtos : String(corpo.produtos ?? '').split(/[^0-9]+/))
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, 3)
  if (!ids.length) return NextResponse.json({ enviadas: 0, dica: 'Mande os ids que vieram de buscar_catalogo.' })

  const catalogo = await catalogoDaLoja()
  const enviadas: string[] = []
  const falhas: string[] = []
  for (const id of ids) {
    const p = catalogo.find((x) => x.id === id)
    if (!p || !p.fotos[0]) {
      falhas.push(`${id}: não está no catálogo`)
      continue
    }
    const legenda = `${p.nome} · ${formatarPreco(p.preco)}${p.disponivel ? '' : ' · esgotada'}\n${p.link}`
    try {
      await enviarMensagemLivre(telefone, { tipo: 'imagem', link: p.fotos[0], legenda })
      await registrarTurno(telefone, { em: new Date().toISOString(), de: 'loja', texto: `[foto] ${p.nome} · ${formatarPreco(p.preco)}` })
      enviadas.push(p.nome)
    } catch (e) {
      falhas.push(`${p.nome}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  return NextResponse.json({
    enviadas: enviadas.length,
    pecas: enviadas,
    falhas,
    dica: enviadas.length
      ? 'As fotos JÁ chegaram para ela, com preço e link. Não repita a lista: pergunte numa frase curta se alguma agradou ou qual tamanho ela usa.'
      : 'Nenhuma foto saiu. Mande os links das peças em texto.',
  })
}
