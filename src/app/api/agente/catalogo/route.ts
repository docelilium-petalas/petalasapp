import { NextResponse } from 'next/server'
import { portaAberta, telefoneDaRequisicao } from '@/lib/atendimento/porta'
import { catalogoDaLoja, formatarPreco, situacaoDoPedido } from '@/lib/nuvemshop/catalogo'
import { DICA_PASSOU_POR_ESTOQUE, passarParaMarilia } from '@/lib/atendimento/passar-para-marilia'

export const dynamic = 'force-dynamic'

/**
 * Ferramenta `buscar_catalogo`. Devolve até 4 peças — a IA oferece no máximo 3
 * por vez — já com o texto que ela pode repetir: nome, preço, tamanhos que TÊM
 * e o link. Nada de foto aqui: foto é outra ferramenta, porque sai como
 * mensagem para a cliente e não pode ser efeito colateral de uma busca.
 *
 * ── Sem estoque é com a Marília (reunião de 08/10/2026) ───────────────────
 * Quem decide é `situacaoDoPedido`, com dado da Nuvemshop — não o modelo.
 * Se a peça que ela pediu esgotou (E1/E2) ou não tem o tamanho dela (E3), e
 * o n8n mandou o `telefone` da conversa, a PRÓPRIA rota passa a conversa para
 * a Marília e devolve só a frase de passagem: sem peças, sem nomes, sem link.
 * Sem telefone (chamada de teste, n8n antigo) não há efeito colateral: a dica
 * manda chamar `chamar_atendente`.
 *
 * "Avisar quando voltar" saiu de vez: o template da lista de desejos está
 * PENDING na Meta — era promessa sem caminho, e a IA a repetia a cada turno.
 */
export async function GET(request: Request) {
  const porta = portaAberta(request)
  if (porta !== true) return porta
  const q = new URL(request.url).searchParams
  const precoMax = Number(q.get('preco_max'))
  const telefone = telefoneDaRequisicao(q.get('telefone'))

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

  const filtro = {
    busca: q.get('busca'),
    categoria: q.get('categoria'),
    tamanho: q.get('tamanho'),
    precoMax: Number.isFinite(precoMax) && precoMax > 0 ? precoMax : null,
    limite: 4,
  }
  const situacao = situacaoDoPedido(produtos, filtro)
  // Só categoria que tem o que vender: sugerir "Vestidos" com todos zerados foi
  // exatamente o laço da conversa revisada.
  const categorias = [...new Set(produtos.filter((p) => p.disponivel).flatMap((p) => p.categorias))]

  if (situacao.tipo === 'tem') {
    const pecas = situacao.pecas.map((p) => ({
      id: p.id,
      nome: p.nome,
      preco: formatarPreco(p.preco),
      de: p.precoCheio ? formatarPreco(p.precoCheio) : null,
      tamanhos_disponiveis: p.tamanhos.filter((t) => t.disponivel).map((t) => t.nome),
      categorias: p.categorias,
      link: p.link,
      detalhes: p.resumo.slice(0, 280),
    }))
    return NextResponse.json({
      situacao: 'tem',
      pecas,
      categorias,
      dica:
        'Ofereça no máximo 3, uma linha cada (nome e preço). Para mostrar, chame enviar_fotos com os ids. ' +
        'Tudo em pecas está disponível: só cite tamanho que está em tamanhos_disponiveis. ' +
        'Não invente tecido nem medida: use só o que está em detalhes.',
    })
  }

  if (situacao.tipo === 'nao_existe') {
    return NextResponse.json({
      situacao: 'nao_existe',
      pecas: [],
      categorias,
      dica: `Nada no catálogo bate com essa busca. NÃO ofereça outra peça como se fosse o que ela pediu. Diga que não tem e pergunte se quer ver alguma destas categorias: ${categorias.join(', ')}.`,
    })
  }

  // Sem estoque (E1, E2 ou E3).
  const semTamanho = situacao.tipo === 'sem_tamanho'
  const procurou = [filtro.busca, filtro.categoria, filtro.tamanho ? `tamanho ${filtro.tamanho}` : null].filter(Boolean).join(' · ')
  const motivo = semTamanho ? 'tamanho sem estoque' : 'peça sem estoque'
  const resumo = `Procurou: ${procurou || '(sem termo)'}. Sem estoque: ${situacao.queria.join(', ')}${semTamanho ? ` no ${situacao.tamanho}` : ''}.`

  if (!telefone) {
    return NextResponse.json({
      situacao: situacao.tipo,
      pecas: [],
      dica:
        'Se o que ela pediu está sem estoque, chame chamar_atendente com motivo "' + motivo + '" e o resumo do que ela queria. ' +
        'Não ofereça outra peça, não mande foto nem link.',
    })
  }

  const passagem = await passarParaMarilia(telefone, motivo, resumo)
  return NextResponse.json({
    situacao: situacao.tipo,
    caso: situacao.tipo === 'esgotou' ? situacao.caso : 'E3',
    passou_para_marilia: true,
    ja_estava_com_a_equipe: passagem.jaEstava,
    pecas: [],
    dica: DICA_PASSOU_POR_ESTOQUE,
  })
}
