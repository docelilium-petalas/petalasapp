/**
 * CATÁLOGO DE TEMPLATES — Doce Lilium · WhatsApp Business
 *
 * ══════════════════════════════════════════════════════════════════════════
 * NADA AQUI FOI PUBLICADO NA META. Este arquivo é o catálogo pronto para
 * submissão, e só. Quem submete é `scripts/mv-submeter-templates.ts`, que
 * ainda não existe de propósito — publicar template é ato irreversível de
 * conta, e a conta ainda não está definida.
 * Ver docs/maquina-vendas/TEMPLATES-META.md §1.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── A decisão que mais custa dinheiro: MARKETING × UTILITY ────────────────
 * A Meta cobra e entrega de forma diferente conforme a categoria, e ela
 * RECLASSIFICA por conta própria quando discorda do que você declarou.
 *
 *   UTILITY   — fala de uma transação que JÁ existe (pedido, pagamento, envio).
 *               Mais barata, entrega melhor, não sofre o represamento por
 *               destinatário que a Meta aplica a marketing.
 *   MARKETING — tudo que tenta gerar uma venda nova. Sujeita a limite por
 *               destinatário (o erro 131049 é ele batendo), exige opt-in.
 *
 * ⚠️ CARRINHO ABANDONADO É MARKETING. Parece transacional — tem produto, tem
 * valor, tem carrinho — mas não existe transação: a pessoa não comprou. Toda
 * loja tenta declarar como utility, a Meta reclassifica, e quem descobre isso
 * depois de subir a campanha descobre pelo preço.
 *
 * ── Regras de forma que reprovam template na hora ─────────────────────────
 *  · nome: só minúsculas, números e `_`
 *  · o corpo NÃO pode começar nem terminar com variável
 *  · duas variáveis não podem ser vizinhas ({{1}} {{2}} reprova)
 *  · toda variável precisa de exemplo no envio para revisão
 *  · marketing sem caminho de saída derruba `quality_rating` — daí o botão
 *    de opt-out em TODO template MARKETING, e nenhum nos de UTILITY
 *    (utility com "parar de receber" confunde: ninguém quer deixar de saber
 *    que o pedido dela saiu para entrega)
 */

import type { Contexto } from './copy'

export type CategoriaMeta = 'MARKETING' | 'UTILITY'

export type BotaoTemplate =
  | { tipo: 'QUICK_REPLY'; texto: string }
  | { tipo: 'URL'; texto: string; url: string; exemplo?: string }

export type TemplateMeta = {
  /** Nome na Meta. Imutável depois de aprovado — versione pelo sufixo `_vN`. */
  nome: string
  categoria: CategoriaMeta
  idioma: 'pt_BR'
  /** Trilha da jornada a que pertence. Só documental. */
  trilha: 'carrinho' | 'pedido' | 'pagamento' | 'pos_venda' | 'reativacao'
  /** Quando este template é o certo. Lido por humano, não por código. */
  quando: string
  corpo: string
  rodape?: string
  botoes?: BotaoTemplate[]
  /** Um exemplo por variável do CORPO, na ordem. Exigido pela Meta. */
  exemplos: string[]
}

/**
 * O `{{n}}` do corpo de cada template, com o NOME que o contexto usa.
 *
 * O tipo é `keyof Contexto` de propósito, e isso é o que impede o defeito que
 * já estava plantado aqui: este mapa dizia `nome_da_peca` enquanto o contexto
 * entregava `peca`. Ninguém teria notado até alguém escrever `{{nome_da_peca}}`
 * numa cadência e a copy quebrar na hora do envio, para cliente real.
 *
 * Agora nome que não existe no contexto não compila.
 */
export const VARIAVEIS: Record<string, (keyof Contexto)[]> = {
  dl_carrinho_lembrete_v1: ['primeiro_nome', 'peca'],
  dl_carrinho_duvida_v1: ['primeiro_nome', 'peca'],
  dl_carrinho_ultimo_v1: ['primeiro_nome', 'cupom', 'desconto'],
  dl_pedido_confirmado_v1: ['primeiro_nome', 'pedido'],
  dl_pix_pendente_v1: ['primeiro_nome', 'pedido', 'prazo'],
  dl_pagamento_aprovado_v1: ['primeiro_nome', 'pedido'],
  dl_pedido_enviado_v1: ['primeiro_nome', 'pedido', 'rastreio'],
  dl_pedido_entregue_v1: ['primeiro_nome', 'pedido'],
  dl_pos_entrega_avaliacao_v1: ['primeiro_nome', 'peca'],
  dl_troca_instrucoes_v1: ['primeiro_nome', 'pedido', 'prazo'],
  dl_reativacao_60d_v1: ['primeiro_nome', 'colecao'],
  dl_colecao_nova_v1: ['primeiro_nome', 'colecao'],
  dl_lista_desejos_voltou_v1: ['primeiro_nome', 'peca'],
}

/**
 * O corpo do template com `{{1}}` trocado por `{{primeiro_nome}}`.
 *
 * É este texto que vira `templateBase` de uma etapa de cadência: a numeração
 * da Meta serve para a Meta, e o esqueleto nomeado serve para a copy. Derivar
 * um do outro — em vez de redigitar a mensagem no semeador — é o que garante
 * que o texto revisado pela dona da marca e o texto que sai sejam o mesmo.
 */
export function esqueletoNomeado(nomeTemplate: string): string {
  const t = CATALOGO.find((x) => x.nome === nomeTemplate)
  if (!t) throw new Error(`Template desconhecido: ${nomeTemplate}`)
  const nomes = VARIAVEIS[nomeTemplate]
  if (!nomes) throw new Error(`Template sem mapa de variáveis: ${nomeTemplate}`)
  return t.corpo.replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const nome = nomes[Number(n) - 1]
    if (!nome) throw new Error(`${nomeTemplate}: {{${n}}} sem nome em VARIAVEIS`)
    return `{{${nome}}}`
  })
}

/** Botão de saída obrigatório em todo MARKETING. */
const SAIR: BotaoTemplate = { tipo: 'QUICK_REPLY', texto: 'Parar de receber' }

export const CATALOGO: TemplateMeta[] = [
  // ── TRILHA 1 · CARRINHO ABANDONADO (MARKETING) ──────────────────────────
  // A Nuvemshop só considera carrinho abandonado quem chegou ao 2º passo do
  // checkout — então já temos nome e telefone, e o `abandoned_checkout_url`
  // devolve a pessoa ao carrinho montado.
  {
    nome: 'dl_carrinho_lembrete_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'carrinho',
    quando:
      'Assim que a loja publica o carrinho — o que leva horas, e não minutos. ' +
      'O primeiro toque não vende: só devolve o link.',
    corpo:
      'Oi, {{1}}! Vi que você deixou {{2}} no carrinho aqui na Doce Lilium 🌸\n\n' +
      'Guardei tudo pra você. É só tocar no botão abaixo que ele volta do jeitinho que estava.',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Voltar ao carrinho', url: '{{1}}', exemplo: 'https://docelilium.com.br/checkout/ab/abc123' },
      SAIR,
    ],
    exemplos: ['Marina', 'o vestido Alícia'],
  },
  {
    nome: 'dl_carrinho_duvida_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'carrinho',
    quando:
      '24h depois do primeiro toque SAIR, não do abandono. A hipótese muda: ' +
      'não foi distração, foi dúvida. Pergunta em vez de insistir.',
    corpo:
      'Oi, {{1}}! Passando de novo aqui sobre {{2}} 💗\n\n' +
      'Ficou alguma dúvida de tamanho, cor ou prazo de entrega? Me conta aqui que eu te ajudo a escolher.',
    rodape: 'Doce Lilium',
    botoes: [{ tipo: 'QUICK_REPLY', texto: 'Tenho uma dúvida' }, SAIR],
    exemplos: ['Marina', 'o vestido Alícia'],
  },
  {
    nome: 'dl_carrinho_ultimo_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'carrinho',
    quando:
      '48h depois do toque anterior, e ÚLTIMO da trilha. Se anuncia como último ' +
      'de propósito — ' +
      'quem não responde a três não responde ao quarto, e o quarto queima o número.',
    corpo:
      'Oi, {{1}}! Esse é meu último toque sobre seu carrinho, prometo 🤍\n\n' +
      'Separei o cupom {{2}} com {{3}} de desconto pra fechar hoje. Se não for agora, sem problema — ' +
      'a gente se fala nas próximas novidades.',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Usar meu cupom', url: '{{1}}', exemplo: 'https://docelilium.com.br/checkout/ab/abc123' },
      SAIR,
    ],
    exemplos: ['Marina', 'VOLTA10', '10%'],
  },

  // ── TRILHA 2 · PEDIDO (UTILITY) ─────────────────────────────────────────
  // Todos ancorados num pedido que existe. Sem botão de saída: ninguém quer
  // deixar de saber que a encomenda dela saiu para entrega.
  {
    nome: 'dl_pedido_confirmado_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pedido',
    quando: 'Disparado por `order/created` da Nuvemshop.',
    corpo:
      'Oi, {{1}}! Recebemos seu pedido {{2}} aqui na Doce Lilium 🌸\n\n' +
      'Assim que o pagamento for confirmado eu te aviso por aqui e já começo a preparar tudo com carinho.',
    rodape: 'Doce Lilium',
    exemplos: ['Marina', '#1042'],
  },
  {
    nome: 'dl_pix_pendente_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pagamento',
    quando: 'PIX gerado e não pago. Utility porque o pedido existe — não é oferta, é cobrança de algo iniciado.',
    corpo:
      'Oi, {{1}}! O PIX do seu pedido {{2}} ainda está aguardando pagamento.\n\n' +
      'Ele expira em {{3}}, e depois disso as peças voltam pro estoque. Se precisar de um novo código, é só me chamar.',
    rodape: 'Doce Lilium',
    exemplos: ['Marina', '#1042', '30 minutos'],
  },
  {
    nome: 'dl_pagamento_aprovado_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pagamento',
    quando: 'Disparado por `order/paid`.',
    corpo:
      'Oi, {{1}}! Pagamento do pedido {{2}} aprovado ✨\n\n' +
      'Já estou separando e embalando suas peças. Assim que postar, te mando o código de rastreio por aqui.',
    rodape: 'Doce Lilium',
    exemplos: ['Marina', '#1042'],
  },
  {
    nome: 'dl_pedido_enviado_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pedido',
    quando: 'Disparado por `order/fulfilled` ou `fulfillment_order/status_updated`.',
    corpo:
      'Oi, {{1}}! Seu pedido {{2}} saiu pra viagem 📦\n\n' +
      'O código de rastreio é {{3}}. Dá pra acompanhar cada passo até chegar na sua porta.',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Rastrear pedido', url: '{{1}}', exemplo: 'https://docelilium.com.br/rastreio/AA123456789BR' },
    ],
    exemplos: ['Marina', '#1042', 'AA123456789BR'],
  },
  {
    nome: 'dl_pedido_entregue_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pedido',
    quando: 'Entrega confirmada pela transportadora.',
    corpo:
      'Oi, {{1}}! Seu pedido {{2}} foi entregue 🤍\n\n' +
      'Espero que você ame tanto quanto a gente amou preparar. Qualquer coisa com o tamanho ou a peça, me chama aqui mesmo.',
    rodape: 'Doce Lilium',
    exemplos: ['Marina', '#1042'],
  },

  // ── TRILHA 3 · PÓS-VENDA ────────────────────────────────────────────────
  {
    nome: 'dl_pos_entrega_avaliacao_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pos_venda',
    quando:
      '3 dias após a entrega. ⚠️ Declarado UTILITY por estar preso a um pedido, ' +
      'mas a Meta reclassifica pedido de avaliação como MARKETING com frequência. ' +
      'Se vier reclassificado, ACEITE — não resubmeta como utility.',
    corpo:
      'Oi, {{1}}! Já deu tempo de estrear {{2}}? 💗\n\n' +
      'Queria muito saber o que você achou — do caimento, do tecido, de tudo. Sua opinião ajuda a próxima cliente a escolher.',
    rodape: 'Doce Lilium',
    botoes: [{ tipo: 'QUICK_REPLY', texto: 'Deixar minha opinião' }],
    exemplos: ['Marina', 'o vestido Alícia'],
  },
  {
    nome: 'dl_troca_instrucoes_v1',
    categoria: 'UTILITY',
    idioma: 'pt_BR',
    trilha: 'pos_venda',
    quando: 'A cliente pediu troca ou devolução. Resposta a solicitação dela — utility sem ambiguidade.',
    corpo:
      'Oi, {{1}}! Recebi seu pedido de troca do {{2}} e já deixei tudo encaminhado.\n\n' +
      'Você tem {{3}} pra postar a peça, e assim que ela chegar aqui eu envio a nova. Te mando o código de postagem em seguida.',
    rodape: 'Doce Lilium',
    exemplos: ['Marina', '#1042', '7 dias'],
  },

  // ── TRILHA 4 · REATIVAÇÃO E NOVIDADES (MARKETING) ───────────────────────
  {
    nome: 'dl_reativacao_60d_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'reativacao',
    quando: '60 dias sem compra, e SÓ para quem já comprou alguma vez.',
    corpo:
      'Oi, {{1}}! Faz um tempinho que a gente não se fala 🌸\n\n' +
      'Chegou a coleção {{2}}, e lembrei de você em algumas peças. Quer dar uma olhada?',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Ver a coleção', url: '{{1}}', exemplo: 'https://docelilium.com.br/colecoes/primavera' },
      SAIR,
    ],
    exemplos: ['Marina', 'Primavera'],
  },
  {
    nome: 'dl_colecao_nova_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'reativacao',
    quando: 'Lançamento de coleção, para a base com opt-in. O de maior alcance e o de maior risco de bloqueio.',
    corpo:
      'Oi, {{1}}! A coleção {{2}} acabou de entrar no ar ✨\n\n' +
      'São peças em tiragem pequena, e as favoritas costumam sair rápido. Te deixo o link pra ver antes de todo mundo.',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Ver antes de todo mundo', url: '{{1}}', exemplo: 'https://docelilium.com.br/colecoes/primavera' },
      SAIR,
    ],
    exemplos: ['Marina', 'Primavera'],
  },
  {
    nome: 'dl_lista_desejos_voltou_v1',
    categoria: 'MARKETING',
    idioma: 'pt_BR',
    trilha: 'reativacao',
    quando: 'Peça que ela viu ou salvou voltou ao estoque. O marketing de melhor conversão, porque a intenção é dela.',
    corpo:
      'Oi, {{1}}! Boa notícia: {{2}} voltou pro estoque 🤍\n\n' +
      'Como você tinha demonstrado interesse, quis te avisar antes de anunciar pra base toda.',
    rodape: 'Doce Lilium',
    botoes: [
      { tipo: 'URL', texto: 'Ver a peça', url: '{{1}}', exemplo: 'https://docelilium.com.br/produtos/vestido-alicia' },
      SAIR,
    ],
    exemplos: ['Marina', 'o vestido Alícia'],
  },
]

/** Conferência barata antes de qualquer submissão. Roda em teste, não em runtime. */
export function validarCatalogo(): string[] {
  const erros: string[] = []
  const vistos = new Set<string>()

  for (const t of CATALOGO) {
    if (vistos.has(t.nome)) erros.push(`${t.nome}: nome duplicado`)
    vistos.add(t.nome)

    if (!/^[a-z0-9_]+$/.test(t.nome)) erros.push(`${t.nome}: nome fora do padrão da Meta`)

    const corpo = t.corpo.trim()
    if (/^\{\{\d+\}\}/.test(corpo)) erros.push(`${t.nome}: corpo começa com variável`)
    if (/\{\{\d+\}\}$/.test(corpo)) erros.push(`${t.nome}: corpo termina com variável`)
    if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(corpo)) erros.push(`${t.nome}: variáveis vizinhas`)

    const usadas = [...corpo.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
    const maior = usadas.length ? Math.max(...usadas) : 0
    if (maior !== t.exemplos.length) {
      erros.push(`${t.nome}: usa ${maior} variáveis no corpo e declara ${t.exemplos.length} exemplos`)
    }
    for (let i = 1; i <= maior; i++) {
      if (!usadas.includes(i)) erros.push(`${t.nome}: {{${i}}} não aparece no corpo (numeração com buraco)`)
    }

    const temSaida = t.botoes?.some((b) => b.tipo === 'QUICK_REPLY' && b.texto === SAIR.texto)
    if (t.categoria === 'MARKETING' && !temSaida) erros.push(`${t.nome}: MARKETING sem botão de saída`)
    if (t.categoria === 'UTILITY' && temSaida) erros.push(`${t.nome}: UTILITY não leva botão de saída`)

    // Preposição colada numa variável que já traz artigo produz "de o vestido".
    // O defeito só existe com o valor preenchido, e por isso atravessa
    // qualquer revisão humana: quem lê o template vê "por causa de {{2}}",
    // que está certo. Medido em 10/09/2026, na régua de carrinho.
    const comArtigo = new Set(['peca', 'colecao'])
    const nomes = VARIAVEIS[t.nome] ?? []
    for (const m of corpo.matchAll(/(\b[a-zà-ú]+)\s+\{\{(\d+)\}\}/gi)) {
      const nomeVar = nomes[Number(m[2]) - 1]
      if (!nomeVar || !comArtigo.has(nomeVar)) continue
      if (/^(de|em|por|a|ao|à)$/i.test(m[1])) {
        erros.push(
          `${t.nome}: "${m[1]} {{${m[2]}}}" vira "${m[1]} o/a …" — ${nomeVar} vem com artigo. ` +
            'Troque a preposição (por "sobre", por exemplo) ou reescreva a frase.',
        )
      }
    }

    const nomeadas = VARIAVEIS[t.nome]
    if (!nomeadas) erros.push(`${t.nome}: sem mapa de variáveis em VARIAVEIS`)
    else if (nomeadas.length !== maior) {
      erros.push(`${t.nome}: VARIAVEIS declara ${nomeadas.length} nomes para ${maior} variáveis do corpo`)
    }
  }
  return erros
}
