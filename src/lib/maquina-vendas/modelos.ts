/**
 * Modelos prontos de cadência, para quem configura pela tela.
 *
 * Porta de `modelos.ts` da CarBoss. Lá eram três réguas de venda B2B (não
 * agendou, base antiga, orçamento parado); aqui são as réguas que a loja usa —
 * e cada etapa aponta para um TEMPLATE APROVADO na Meta, porque fora da janela
 * de 24h o canal oficial só entrega template. `templateBase` fica como o texto
 * que a tela mostra (o esqueleto nomeado do catálogo), nunca como copy livre.
 *
 * Todo modelo é validado pela bateria (`scripts/test-mv/nivel1.ts`): template
 * existe no catálogo, variáveis batem com `VARIAVEIS`, última etapa marcada.
 */

import { esqueletoNomeado } from './catalogo-templates'

export type ModeloEtapa = {
  delayMinutos: number
  ancoradaEm: 'gatilho' | 'entrega'
  templateNome: string
  templateBase: string
}

export type ModeloCadencia = {
  slug: string
  nome: string
  /** Quando usar — texto mostrado na tela de configuração. */
  quando: string
  gatilho: string
  etapas: ModeloEtapa[]
}

function etapa(delayMinutos: number, templateNome: string, ancoradaEm: 'gatilho' | 'entrega' = 'entrega'): ModeloEtapa {
  return { delayMinutos, ancoradaEm, templateNome, templateBase: esqueletoNomeado(templateNome) }
}

export const MODELOS_CADENCIA: ModeloCadencia[] = [
  {
    slug: 'carrinho_tres_toques',
    nome: 'Carrinho abandonado — 3 toques',
    quando: 'Quem deixou peça no carrinho. Lembra na hora, tira dúvida no dia seguinte e se despede em 2 dias.',
    gatilho: 'carrinho_abandonado',
    etapas: [
      etapa(0, 'dl_carrinho_lembrete_v1', 'gatilho'),
      etapa(1440, 'dl_carrinho_duvida_v1'),
      etapa(2880, 'dl_carrinho_ultimo_v2'),
    ],
  },
  {
    slug: 'pos_venda',
    nome: 'Pós-venda — entregue e avaliação',
    quando: 'Pedido entregue: confirma a chegada e, 3 dias depois, pergunta o que ela achou da peça.',
    gatilho: 'pedido_entregue',
    etapas: [etapa(0, 'dl_pedido_entregue_v1', 'gatilho'), etapa(4320, 'dl_pos_entrega_avaliacao_v1')],
  },
  {
    slug: 'reativacao',
    nome: 'Voltar a chamar — 60 dias sem comprar',
    quando: 'Cliente que comprou e sumiu há 60 dias. Um toque só, com a coleção do momento.',
    gatilho: 'reativacao_60d',
    etapas: [etapa(0, 'dl_reativacao_60d_v1', 'gatilho')],
  },
  {
    slug: 'colecao_nova',
    nome: 'Coleção nova',
    quando: 'Quando uma coleção entra no ar. Vai para quem já comprou, respeitando o teto do dia.',
    gatilho: 'colecao_nova',
    etapas: [etapa(0, 'dl_colecao_nova_v1', 'gatilho')],
  },
  {
    slug: 'lista_desejos',
    nome: 'Peça da lista de desejos voltou',
    quando: 'A peça que ela favoritou voltou ao estoque.',
    gatilho: 'lista_desejos',
    etapas: [etapa(0, 'dl_lista_desejos_voltou_v1', 'gatilho')],
  },
]

/** Opções de espera oferecidas na tela — evita digitar minutos na mão. */
export const OPCOES_DELAY: Array<{ minutos: number; rotulo: string }> = [
  { minutos: 0, rotulo: 'Assim que o gatilho acontecer' },
  { minutos: 60, rotulo: '1 hora depois' },
  { minutos: 120, rotulo: '2 horas depois' },
  { minutos: 240, rotulo: '4 horas depois' },
  { minutos: 1440, rotulo: '1 dia depois' },
  { minutos: 2880, rotulo: '2 dias depois' },
  { minutos: 4320, rotulo: '3 dias depois' },
  { minutos: 5760, rotulo: '4 dias depois' },
  { minutos: 10080, rotulo: '7 dias depois' },
  { minutos: 20160, rotulo: '14 dias depois' },
]

export function rotuloDelay(minutos: number): string {
  const achado = OPCOES_DELAY.find((o) => o.minutos === minutos)
  if (achado) return achado.rotulo
  if (minutos < 60) return `${minutos} min depois`
  if (minutos < 1440) return `${Math.round(minutos / 60)}h depois`
  const dias = Math.round(minutos / 1440)
  return `${dias} ${dias === 1 ? 'dia' : 'dias'} depois`
}

/** Slug estável a partir do nome — vira o `gatilho` de cadência criada na tela. */
export function slugificar(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'cadencia'
  )
}
