/**
 * INDICADORES DA MÁQUINA — o número do cartão e o recorte da tabela, um só.
 *
 * Porta de `indicadores.ts` da CarBoss (04/10/2026). A contagem do cartão e o
 * filtro da tabela leem o MESMO `where` deste arquivo; se divergirem, é porque
 * alguém mudou um objeto que os dois usam, e aí os dois mudam juntos. Na
 * origem, "Responderam: 0" conviveu um mês com dez pessoas que tinham
 * respondido — o painel contava um status que o código tinha parado de escrever.
 *
 * ── Diferenças da origem ───────────────────────────────────────────────────
 *  · "Reunião agendada" e "Venda" viram UM indicador: **Pedido feito**
 *    (`converteuEm`), que é o desfecho da loja.
 *  · "Luiza assumiu" vira **Equipe assumiu** (`humanoFalouEm`).
 *  · `falhaCodigo` da origem é `codigoErro` aqui.
 *  · Novo: **Vetadas** — mensagem recusada por guarda antes de sair (lista de
 *    teste, copy incompleta, template ausente). Na loja isso é um status
 *    próprio (`VETADA`), e esconder o veto faria a fila parecer travada.
 *
 * ── Por que a contagem é de PESSOAS e a tabela mostra MENSAGENS ─────────────
 * "8 responderam" são 8 clientes; a tabela lista mensagem, e cada cliente tem
 * várias. `unidade` existe para a tela dizer isso em palavras.
 */

import { INSCRICAO_STATUS, MENSAGEM_STATUS } from './config'
// Grupos e tons vêm de `grupos.ts`, que não importa nada: a tela é
// `'use client'` e este arquivo arrasta o `prisma` via `config.ts`.
import type { GrupoIndicador, TomIndicador } from './grupos'
import { inicioDoDiaSP } from './janela'
import { SILENCIO_SUSPEITO_MS } from './prova'

export type UnidadeIndicador = 'pessoa' | 'mensagem'

export type { GrupoIndicador, TomIndicador } from './grupos'

export interface Indicador {
  id: string
  rotulo: string
  unidade: UnidadeIndicador
  grupo: GrupoIndicador
  tom: TomIndicador
  /** Condição sobre `maquina_vendas_inscricoes`. Um indicador preenche UM dos dois. */
  inscricao?: Record<string, unknown>
  /** Condição sobre `maquina_vendas_mensagens`. */
  mensagem?: Record<string, unknown>
  /**
   * O denominador, só quando o recorte é SUBCONJUNTO dele por construção.
   * ⚠️ "Entregues hoje" NÃO tem base em "Enviadas hoje": uma mensagem enviada
   *    ontem e confirmada hoje entra num e não no outro.
   */
  base?: string
  ajuda: string
}

export function listarIndicadores(agora: Date): Indicador[] {
  const inicioHoje = inicioDoDiaSP(agora)
  const fimHoje = new Date(inicioHoje.getTime() + 24 * 3600_000)

  return [
    {
      id: 'ativas',
      rotulo: 'Réguas ativas',
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'pessoa',
      inscricao: { status: INSCRICAO_STATUS.ATIVA },
      ajuda: 'Clientes com régua em andamento — nem parada, nem concluída.',
    },
    {
      id: 'entraramHoje',
      rotulo: 'Entraram hoje',
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'pessoa',
      inscricao: { createdAt: { gte: inicioHoje } },
      ajuda: 'Clientes que entraram em alguma régua hoje.',
    },
    {
      id: 'vencidas',
      rotulo: 'Vencidas na fila',
      grupo: 'fila',
      tom: 'alerta',
      unidade: 'mensagem',
      // Só de inscrição ATIVA: vencida de régua pausada é consequência da
      // pausa, não atraso.
      mensagem: {
        status: MENSAGEM_STATUS.AGENDADA,
        agendadaPara: { lte: agora },
        inscricao: { status: INSCRICAO_STATUS.ATIVA },
      },
      ajuda: 'Mensagens de régua ativa que já passaram da hora e ainda não saíram.',
    },
    {
      id: 'agendadasHoje',
      rotulo: 'Agendadas hoje',
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'mensagem',
      mensagem: { status: MENSAGEM_STATUS.AGENDADA, agendadaPara: { gte: inicioHoje, lt: fimHoje } },
      ajuda: 'Mensagens com horário marcado para hoje e ainda não enviadas.',
    },
    {
      id: 'enviadasHoje',
      rotulo: 'Enviadas hoje',
      grupo: 'entrega',
      tom: 'neutro',
      unidade: 'mensagem',
      mensagem: { status: MENSAGEM_STATUS.ENVIADA, enviadaEm: { gte: inicioHoje } },
      ajuda: 'Mensagens que saíram hoje. Saíram — a Meta aceitar não é a cliente receber.',
    },
    {
      id: 'entreguesHoje',
      rotulo: 'Entregues hoje',
      grupo: 'entrega',
      tom: 'bom',
      unidade: 'mensagem',
      mensagem: { entregueEm: { gte: inicioHoje } },
      ajuda: 'Mensagens que a Meta confirmou ter entregue no aparelho hoje. É a prova, não a promessa.',
    },
    {
      id: 'semConfirmacao',
      rotulo: 'Sem confirmação',
      grupo: 'entrega',
      tom: 'alerta',
      unidade: 'mensagem',
      // `idExterno` não nulo: mensagem sem wamid nunca terá confirmação, e
      // cartão que nunca zera é cartão que ninguém olha. O corte de tempo é o
      // mesmo `SILENCIO_SUSPEITO_MS` da linha da tabela, de propósito.
      mensagem: {
        status: MENSAGEM_STATUS.ENVIADA,
        idExterno: { not: null },
        entregueEm: null,
        lidaEm: null,
        codigoErro: null,
        enviadaEm: { lt: new Date(agora.getTime() - SILENCIO_SUSPEITO_MS) },
      },
      ajuda:
        'Saíram, a Meta aceitou e nunca confirmou entrega. Leia a faixa do canal primeiro: com o webhook ' +
        'mudo, isto é notícia sobre o CRM; com ele funcionando, é notícia sobre estas mensagens.',
    },
    {
      id: 'jaReceberam',
      rotulo: 'Já receberam',
      grupo: 'entrega',
      tom: 'neutro',
      unidade: 'pessoa',
      // `tentativas` conta ENVIO ACEITO, não entrega — por isso o rótulo
      // do relatório fala em "enviadas".
      inscricao: { tentativas: { gt: 0 } },
      ajuda: 'Clientes para quem pelo menos uma mensagem saiu.',
    },
    {
      id: 'responderam',
      rotulo: 'Responderam',
      grupo: 'resposta',
      tom: 'bom',
      base: 'jaReceberam',
      unidade: 'pessoa',
      // Por `respondeuEm`, NUNCA por status — o defeito que deu nome a este arquivo.
      inscricao: { respondeuEm: { not: null } },
      ajuda: 'Clientes que falaram com a gente depois da nossa mensagem.',
    },
    {
      id: 'equipeAssumiu',
      rotulo: 'Equipe assumiu',
      grupo: 'resposta',
      tom: 'bom',
      base: 'jaReceberam',
      unidade: 'pessoa',
      inscricao: { humanoFalouEm: { not: null } },
      ajuda: 'Conversas em que alguém da equipe entrou — pelo celular ou pelo Chatwoot —, não só a IA.',
    },
    {
      id: 'pedido',
      rotulo: 'Pedido feito',
      grupo: 'resposta',
      tom: 'bom',
      unidade: 'pessoa',
      inscricao: { converteuEm: { not: null } },
      ajuda: 'Clientes que fizeram pedido na Nuvemshop depois de entrar na régua.',
    },
    {
      id: 'semResposta',
      rotulo: 'Sem resposta',
      grupo: 'resposta',
      tom: 'neutro',
      base: 'jaReceberam',
      unidade: 'pessoa',
      inscricao: { tentativas: { gt: 0 }, respondeuEm: null },
      ajuda: 'Receberam e ainda não responderam — o complemento exato de "Responderam".',
    },
    {
      id: 'pediramParar',
      rotulo: 'Pediram para parar',
      grupo: 'problema',
      tom: 'neutro',
      unidade: 'pessoa',
      inscricao: { status: INSCRICAO_STATUS.OPT_OUT },
      ajuda: 'Pediram para não receber mais. Não entram em régua nenhuma, nunca mais.',
    },
    {
      id: 'numeroInvalido',
      rotulo: 'Número inválido',
      grupo: 'problema',
      tom: 'alerta',
      unidade: 'pessoa',
      inscricao: { status: INSCRICAO_STATUS.NUMERO_INVALIDO },
      ajuda: 'A Meta respondeu que o número não recebe (131026 / 133010) — a ação é conferir o cadastro.',
    },
    {
      id: 'bloqueadaMeta',
      rotulo: 'Bloqueadas pela Meta',
      grupo: 'problema',
      tom: 'ruim',
      unidade: 'pessoa',
      inscricao: { status: INSCRICAO_STATUS.BLOQUEADA_META },
      ajuda: 'A Meta recusou a entrega. O número é bom — o canal é que foi barrado. NÃO são reenviadas.',
    },
    {
      id: 'vetadas',
      rotulo: 'Vetadas antes de sair',
      grupo: 'problema',
      tom: 'alerta',
      unidade: 'mensagem',
      mensagem: { status: MENSAGEM_STATUS.VETADA },
      ajuda: 'Recusadas por uma guarda antes do envio: fora da lista de teste, copy incompleta ou template ausente.',
    },
    {
      id: 'comErro',
      rotulo: 'Com erro',
      grupo: 'problema',
      tom: 'ruim',
      unidade: 'pessoa',
      inscricao: { status: INSCRICAO_STATUS.ERRO },
      ajuda: 'A régua parou por falha de envio ou de copy.',
    },
  ]
}

export function indicadorPorId(id: string, agora: Date): Indicador | null {
  return listarIndicadores(agora).find((i) => i.id === id) ?? null
}

/** O recorte traduzido para um `where` de mensagens — a tabela lista mensagem. */
export function whereDaTabela(ind: Indicador): Record<string, unknown> {
  return ind.mensagem ? { ...ind.mensagem } : { inscricao: { ...ind.inscricao } }
}
