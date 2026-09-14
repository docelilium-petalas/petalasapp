import { NextResponse } from 'next/server'
import { portaAberta } from '@/lib/atendimento/porta'
import { catalogoDaLoja, filtrarCatalogo, formatarPreco } from '@/lib/nuvemshop/catalogo'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `buscar_catalogo`. Devolve até 4 peças — a IA oferece no máximo 3
 * por vez — já com o texto que ela pode repetir: nome, preço, tamanhos que TÊM
 * e o link. Nada de foto aqui: foto é outra ferramenta, porque sai como
 * mensagem para a cliente e não pode ser efeito colateral de uma busca.
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
  const pecas = achados.map((p) => ({
    id: p.id,
    nome: p.nome,
    preco: formatarPreco(p.preco),
    de: p.precoCheio ? formatarPreco(p.precoCheio) : null,
    tamanhos_disponiveis: p.tamanhos.filter((t) => t.disponivel).map((t) => t.nome),
    esgotada: !p.disponivel,
    categorias: p.categorias,
    link: p.link,
    detalhes: p.resumo.slice(0, 280),
  }))

  let dica: string
  if (!pecas.length) {
    dica = `Nada no catálogo bate com essa busca. NÃO ofereça outra peça como se fosse o que ela pediu. Diga que não tem e pergunte se quer ver alguma destas categorias: ${categorias.join(', ')}.`
  } else {
    dica =
      'Ofereça no máximo 3, uma linha cada (nome e preço). Para mostrar, chame enviar_fotos com os ids. ' +
      'Só cite tamanho que está em tamanhos_disponiveis; peça esgotada você diz que esgotou. ' +
      'Não invente tecido nem medida: use só o que está em detalhes.'
  }

  return NextResponse.json({ pecas, categorias, dica })
}
