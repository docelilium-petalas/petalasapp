import { NextResponse } from 'next/server'
import { portaAberta } from '@/lib/atendimento/porta'
import { catalogoDaLoja, filtrarCatalogo, formatarPreco } from '@/lib/nuvemshop/catalogo'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `buscar_catalogo`. Devolve até 4 peças — a IA oferece no máximo 3
 * por vez — já com o texto que ela pode repetir: nome, preço, tamanhos que TÊM
 * e o link. Nada de foto aqui: foto é outra ferramenta, porque sai como
 * mensagem para a cliente e não pode ser efeito colateral de uma busca.
 *
 * `pecas` só traz o que dá para comprar hoje. O que bateu com a busca mas
 * esgotou vai em `esgotadas`, que a IA usa para NÃO dizer "não temos" — mas
 * nunca para oferecer.
 */
export async function GET(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const q = new URL(request.url).searchParams
  const precoMax = Number(q.get('preco_max'))

  let produtos
  try {
    produtos = await catalogoDaLoja()
  } catch (e) {
    return NextResponse.json({
      pecas: [],
      dica: 'O catálogo da loja não respondeu agora. Diga que vai conferir e mande o link da loja: https://www.docelilium.com.br',
      erro: e instanceof Error ? e.message : String(e),
    })
  }

  const achados = filtrarCatalogo(produtos, {
    busca: q.get('busca'),
    categoria: q.get('categoria'),
    tamanho: q.get('tamanho'),
    precoMax: Number.isFinite(precoMax) && precoMax > 0 ? precoMax : null,
    limite: 4,
  })

  const categorias = [...new Set(produtos.flatMap((p) => p.categorias))]
  const pecas = achados.pecas.map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: formatarPreco(p.preco),
    de: p.precoCheio ? formatarPreco(p.precoCheio) : null,
    tamanhos_disponiveis: p.tamanhos.filter((t) => t.disponivel).map((t) => t.nome),
    categorias: p.categorias,
    link: p.link,
    detalhes: p.resumo.slice(0, 280),
  }))
  // Só o nome. Sem id, sem link e sem foto: o que não tem id não vira
  // enviar_fotos por engano.
  const esgotadas = achados.esgotadas.map((p) => p.nome)

  let dica: string
  if (pecas.length) {
    dica =
      'Ofereça no máximo 3, uma linha cada (nome e preço). Para mostrar, chame enviar_fotos com os ids. ' +
      'Tudo em pecas está disponível: só cite tamanho que está em tamanhos_disponiveis. ' +
      'Não invente tecido nem medida: use só o que está em detalhes. ' +
      'NUNCA cite nem mande foto do que está em esgotadas.'
  } else if (esgotadas.length) {
    dica =
      `Existe na loja, mas está sem estoque: ${esgotadas.join(', ')}. NÃO ofereça, nÃO mande foto e NÃO mande o link dessas. ` +
      'Diga com sinceridade que essa peça esgotou, ofereça avisar quando voltar e pergunte se ela quer ver algo parecido ' +
      `destas categorias: ${categorias.join(', ')}.`
  } else {
    dica = `Nada no catálogo bate com essa busca. NÃO ofereça outra peça como se fosse o que ela pediu. Diga que não tem e pergunte se quer ver alguma destas categorias: ${categorias.join(', ')}.`
  }

  return NextResponse.json({ pecas, esgotadas, categorias, dica })
}
