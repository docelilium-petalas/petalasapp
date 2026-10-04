/**
 * AS CADÊNCIAS QUE FALAM COM A CLIENTE — dados, não script.
 *
 * Porta de `cadencias-seed.ts` da CarBoss. Lá cada cadência carregava a copy
 * inteira; aqui o texto que sai é SEMPRE o corpo de um template aprovado da
 * Meta (`catalogo-templates.ts`), e a etapa só diz QUAL template, quando, e
 * contra qual âncora. Derivar o esqueleto do catálogo (`esqueletoNomeado`) em
 * vez de redigitar a mensagem é o que garante que o texto revisado pela dona da
 * marca e o texto que sai sejam o mesmo.
 *
 * Importar este arquivo não tem efeito nenhum — é o que deixa a bateria
 * `cadencias` validar a régua sem banco.
 *
 * O espelho é PRODUÇÃO em 04/10/2026 (snapshot da Fase 0): os ids reais estão
 * aqui para o script de migração casar linha por linha sem criar duplicata.
 *
 * ⚠️ As três cadências do drop 10.10 (`campanha_1010_*`) estão listadas com
 *    `intocavel: true`. Nenhum script de seed, porte ou reparo escreve nelas —
 *    a campanha tem motor próprio (`campanha-datada.ts`) e decisão pendente do
 *    Owner (ver PORTE-CARBOSS-DESCOBERTA §6.1).
 */

export type AncoraEtapa = 'gatilho' | 'entrega'

export type EtapaSeed = {
  ordem: number
  delayMinutos: number
  ancoradaEm: AncoraEtapa
  templateNome: string
  ehUltima?: boolean
}

export type CadenciaSeed = {
  /** id em produção — o porte casa por ele. */
  id: string
  nome: string
  gatilho: string
  porque: string
  /** Nasce ligada? `false` = decisão registrada, não esquecimento (ver `situacao.ts`). */
  ativo: boolean
  /** Idade máxima do evento para entrar (h). `null` = sem limite. */
  idadeMaximaHoras: number | null
  /** Nunca escrita por seed/porte. */
  intocavel?: boolean
  etapas: EtapaSeed[]
}

const D = 1440

export const CADENCIAS: CadenciaSeed[] = [
  {
    id: 'c7de72a2-a8a1-4541-9014-34de9834fb4f',
    nome: 'Carrinho abandonado',
    gatilho: 'carrinho_abandonado',
    ativo: true,
    idadeMaximaHoras: 72,
    porque:
      'Três toques em dois dias: lembrete na hora, dúvida no dia seguinte, última no outro. ' +
      'Nenhum dos três leva cupom — o cupom MINHADL só aparece na conversa, quando a cliente ' +
      'responde e o carrinho ainda está vivo. Template com cupom ensina a abandonar carrinho.',
    etapas: [
      { ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_carrinho_lembrete_v1' },
      { ordem: 2, delayMinutos: 1 * D, ancoradaEm: 'entrega', templateNome: 'dl_carrinho_duvida_v1' },
      { ordem: 3, delayMinutos: 2 * D, ancoradaEm: 'entrega', templateNome: 'dl_carrinho_ultimo_v2', ehUltima: true },
    ],
  },
  {
    id: '927cadf3-fc23-4d53-b455-3463880e7df2',
    nome: 'Pedido pago',
    gatilho: 'pedido_pago',
    ativo: true,
    idadeMaximaHoras: null,
    porque: 'Confirmação de pagamento. UTILITY: sai fora do teto de marketing e da janela de anti-eco.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_pagamento_aprovado_v1', ehUltima: true }],
  },
  {
    id: '2a674988-02a4-4195-9445-7db740df39f5',
    nome: 'Pedido enviado',
    gatilho: 'pedido_enviado',
    ativo: true,
    idadeMaximaHoras: 96,
    porque: 'Rastreio assinado (HMAC) no botão. Pedido enviado há mais de 4 dias não recebe — já chegou ou já perguntou.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_pedido_enviado_v1', ehUltima: true }],
  },
  {
    id: 'c4bf5253-4993-42d2-b5f4-12afd1437d23',
    nome: 'Reativação 60 dias',
    gatilho: 'reativacao_60d',
    ativo: true,
    idadeMaximaHoras: null,
    porque: 'Quem comprou e sumiu há 60 dias recebe a coleção do momento. Um toque só: insistir com base fria queima o número.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_reativacao_60d_v1', ehUltima: true }],
  },
  {
    id: '63be5f46-5916-41ea-96b8-8b2db6d41218',
    nome: 'Coleção nova',
    gatilho: 'colecao_nova',
    ativo: true,
    idadeMaximaHoras: null,
    porque: 'Aviso de coleção nova para quem já comprou. Um toque.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_colecao_nova_v1', ehUltima: true }],
  },
  {
    id: 'b8cda1f0-f966-4321-bd68-eb89b31356e6',
    nome: 'Drop 10.10 · d1',
    gatilho: 'campanha_1010_save_the_date',
    ativo: true,
    idadeMaximaHoras: null,
    intocavel: true,
    porque: 'Campanha datada (motor próprio). Não é escrita pelo porte.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_drop_1010_save_the_date_v1', ehUltima: true }],
  },
  {
    id: '367fb6e8-042d-4281-a5d0-7031f5e93f52',
    nome: 'Drop 10.10 · d2',
    gatilho: 'campanha_1010_vespera',
    ativo: true,
    idadeMaximaHoras: null,
    intocavel: true,
    porque: 'Campanha datada (motor próprio). Não é escrita pelo porte.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_drop_1010_vespera_v1', ehUltima: true }],
  },
  {
    id: '6e2ee163-7ced-4144-9ee5-d7166dad4a5e',
    nome: 'Drop 10.10 · d3',
    gatilho: 'campanha_1010_chegou',
    ativo: true,
    idadeMaximaHoras: null,
    intocavel: true,
    porque: 'Campanha datada (motor próprio). Não é escrita pelo porte.',
    etapas: [{ ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho', templateNome: 'dl_drop_1010_chegou_v1', ehUltima: true }],
  },
]

/** Os perfis que `perfilDaCliente` devolve. A copy tem que servir a todos. */
export const PERFIS = ['nunca_comprou', 'ja_comprou', 'recorrente'] as const
export type Perfil = (typeof PERFIS)[number]

export const ROTULO_DO_PERFIL: Record<Perfil, string> = {
  nunca_comprou: 'nunca comprou',
  ja_comprou: 'já comprou',
  recorrente: 'recorrente',
}

/** Gatilhos protegidos: nenhum seed/porte escreve em cadência com estes gatilhos. */
export const GATILHOS_INTOCAVEIS = new Set(CADENCIAS.filter((c) => c.intocavel).map((c) => c.gatilho))
export const ehGatilhoDeCampanha = (gatilho: string) => gatilho.startsWith('campanha_')
