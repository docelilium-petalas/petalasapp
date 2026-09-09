/**
 * A COPY — do esqueleto ao texto que sai, sem LLM no caminho.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A regra central do módulo: a tabela mostra EXATAMENTE o texto que a pessoa
 * vai receber. Por isso a copy é congelada em `mensagem_final` no momento da
 * inscrição, e nada a reescreve depois.
 *
 * Nos dois projetos de origem havia um nó de IA no fluxo de disparo que
 * "parafraseava o final". Foi desligado nos dois, pela mesma razão duas vezes:
 * a tela passava a prometer um texto e o WhatsApp entregava outro, e o
 * vocabulário da marca deixava de ser verificável.
 *
 * ── A VARIAÇÃO, que não é enfeite ─────────────────────────────────────────
 * Os blocos `[[a|b|c]]` são obrigatórios. Sem eles todo lead recebe o mesmo
 * texto, e o WhatsApp lê remetente único + muitos destinatários + corpo
 * idêntico como disparo em massa — por mais espaçado que o envio esteja.
 *
 * A escolha da variante é DETERMINÍSTICA, derivada do id da inscrição. Um
 * `Math.random()` seria errado aqui: a tela mostra a mensagem antes de ela
 * sair, e o texto não pode mudar entre a exibição e o disparo.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** FNV-1a de 32 bits: hash pequeno, sem dependência, boa dispersão. */
function hash(texto: string): number {
  let h = 2166136261
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export type Contexto = {
  primeiro_nome?: string | null
  peca?: string | null
  pedido?: string | null
  cupom?: string | null
  desconto?: string | null
  rastreio?: string | null
  colecao?: string | null
  prazo?: string | null
  link?: string | null
}

/** Escolhe uma variante de `[[a|b|c]]`, estável para a mesma semente. */
function resolverVariacoes(texto: string, semente: string): string {
  let i = 0
  return texto.replace(/\[\[([^\]]+)\]\]/g, (_, bloco: string) => {
    const opcoes = bloco.split('|').map((o) => o.trim()).filter(Boolean)
    if (opcoes.length === 0) return ''
    const escolhida = opcoes[hash(`${semente}:${i++}`) % opcoes.length]
    return escolhida
  })
}

/** Quantos textos distintos um esqueleto consegue produzir. */
export function variantesPossiveis(template: string): number {
  const blocos = template.match(/\[\[([^\]]+)\]\]/g) ?? []
  return blocos.reduce((acc, b) => acc * b.slice(2, -2).split('|').filter((o) => o.trim()).length, 1)
}

export class CopyIncompleta extends Error {
  constructor(readonly faltando: string[]) {
    super(`A copy exige ${faltando.join(', ')} e o contexto não tem`)
    this.name = 'CopyIncompleta'
  }
}

/**
 * O texto final.
 *
 * ⚠️ Placeholder sem valor no contexto é ERRO, não string vazia. Uma mensagem
 * dizendo "Oi, ! Vi que você deixou  no carrinho" é pior do que mensagem
 * nenhuma — e sai para cliente real. Quem chama trata o erro pulando a
 * inscrição, não enviando um texto pela metade.
 */
export function montarCopy(template: string, contexto: Contexto, semente: string): string {
  const comVariacao = resolverVariacoes(template, semente)

  const faltando: string[] = []
  const texto = comVariacao.replace(/\{\{(\w+)\}\}/g, (_, chave: string) => {
    const valor = (contexto as Record<string, unknown>)[chave]
    if (valor === undefined || valor === null || String(valor).trim() === '') {
      faltando.push(chave)
      return ''
    }
    return String(valor)
  })

  if (faltando.length) throw new CopyIncompleta([...new Set(faltando)])
  return texto.replace(/[ \t]+\n/g, '\n').trim()
}

/**
 * Confere um esqueleto ANTES de ele virar cadência — o validador da tela.
 *
 * As regras vêm do que as duas operações aprenderam: mensagem longa com lista
 * de produtos lê como spam, mais de uma pergunta dilui a única que importa, e
 * texto sem variação forma padrão de disparo em massa.
 */
export function validarTemplate(template: string): string[] {
  const erros: string[] = []
  const limpo = template.trim()

  if (!limpo) return ['A mensagem está vazia.']
  if (limpo.length > 700) erros.push('Passa de 700 caracteres — mensagem longa lê como spam.')

  const linhas = limpo.split('\n').filter((l) => l.trim()).length
  if (linhas > 6) erros.push(`Tem ${linhas} linhas. O teto é 6 — acima disso ninguém lê.`)

  const perguntas = (limpo.match(/\?/g) ?? []).length
  if (perguntas > 1) erros.push(`Tem ${perguntas} perguntas. Mais de uma dilui a que importa.`)

  if (variantesPossiveis(limpo) < 4) {
    erros.push('Sem variação suficiente: use blocos [[a|b|c]]. Corpo idêntico para muitos destinatários é o que o WhatsApp lê como disparo em massa.')
  }

  const placeholders = [...limpo.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1])
  const conhecidos = ['primeiro_nome', 'peca', 'pedido', 'cupom', 'desconto', 'rastreio', 'colecao', 'prazo', 'link']
  for (const p of new Set(placeholders)) {
    if (!conhecidos.includes(p)) erros.push(`{{${p}}} não existe. Disponíveis: ${conhecidos.join(', ')}.`)
  }
  if (!placeholders.includes('primeiro_nome')) {
    erros.push('Sem {{primeiro_nome}} — mensagem sem nome lê como automação.')
  }

  return erros
}
