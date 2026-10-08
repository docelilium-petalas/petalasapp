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
 *
 * ── O PERÍODO (08/10/2026) ─────────────────────────────────────────────────
 * Antes, metade dos cartões era "hoje" e a outra metade era "desde sempre" —
 * no dia seguinte a um disparo não havia como ver o disparo. Agora todo cartão
 * datável responde a UM período (dias inteiros na parede de São Paulo):
 *
 *  · A FILA é retrato do AGORA nos dois cartões que só existem no presente
 *    (réguas ativas, vencidas) — `retrato: true`. Vencida de anteontem
 *    escondida por um filtro de "hoje" seria atraso fingindo que não existe.
 *  · A ENTREGA conta pelo carimbo do próprio evento (saiu, chegou).
 *  · A RESPOSTA é por COORTE: das clientes que receberam mensagem no período,
 *    quantas responderam/compraram DEPOIS do início dele. É a pergunta "como
 *    foi o disparo do dia 9?" — e mantém cada cartão subconjunto da base.
 *  · ONDE TRAVOU conta pela data em que travou (`updatedAt` do status final).
 *  · `periodo = null` é "tudo": as condições originais, sem data.
 */

/** Dias inteiros na parede SP: `inicio` inclusivo, `fim` exclusivo. `null` = sem recorte de data. */
export type PeriodoIndicadores = { inicio: Date; fim: Date } | null

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
  /** Retrato do agora: não muda com o período escolhido. */
  retrato?: boolean
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

/** O período padrão da tela: o dia de hoje em São Paulo. */
export function periodoDeHoje(agora: Date): { inicio: Date; fim: Date } {
  const inicio = inicioDoDiaSP(agora)
  return { inicio, fim: new Date(inicio.getTime() + 24 * 3600_000) }
}

export function listarIndicadores(agora: Date, periodo: PeriodoIndicadores = periodoDeHoje(agora)): Indicador[] {
  const P = periodo
  const entre = P ? { gte: P.inicio, lt: P.fim } : undefined
  // "hoje" no rótulo só quando o período É hoje; nos outros, a faixa do
  // período acima dos cartões diz qual é — rótulo com data repetida 9 vezes é ruído.
  const hoje = periodoDeHoje(agora)
  const ehHoje = !!P && P.inicio.getTime() === hoje.inicio.getTime() && P.fim.getTime() === hoje.fim.getTime()
  const sufixo = ehHoje ? ' hoje' : ''
  const noPeriodo = ehHoje ? 'hoje' : P ? 'no período' : 'desde o início'

  /**
   * A coorte: clientes com pelo menos uma mensagem que SAIU no período e segue
   * ENVIADA. `enviadaEm` sozinho não basta: a Meta aceita e depois recusa
   * (131049) — a mensagem fica ERRO com `enviadaEm` carimbado, e a cliente
   * entrava em "já receberam" sem ter recebido (05/10: 51 contra 49 enviadas).
   */
  const coorte: Record<string, unknown> = P
    ? { mensagens: { some: { status: MENSAGEM_STATUS.ENVIADA, enviadaEm: entre } } }
    : { tentativas: { gt: 0 } }
  /** Desfecho DEPOIS do início do período — subconjunto da coorte por construção. */
  const depoisDoInicio = (campo: string): Record<string, unknown> =>
    P ? { ...coorte, [campo]: { gte: P.inicio } } : { [campo]: { not: null } }
  /** Status final, pela data em que a cliente chegou nele. */
  const travouNoPeriodo = (status: string): Record<string, unknown> => (P ? { status, updatedAt: entre } : { status })

  return [
    {
      id: 'ativas',
      rotulo: 'Réguas ativas',
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'pessoa',
      retrato: true,
      inscricao: { status: INSCRICAO_STATUS.ATIVA },
      ajuda: 'Clientes com régua em andamento agora — nem parada, nem concluída. Não muda com o período.',
    },
    {
      id: 'entraramHoje',
      rotulo: `Entraram${sufixo}`,
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'pessoa',
      inscricao: P ? { createdAt: entre } : {},
      ajuda: `Clientes que entraram em alguma régua ${noPeriodo}.`,
    },
    {
      id: 'vencidas',
      rotulo: 'Vencidas na fila',
      grupo: 'fila',
      tom: 'alerta',
      unidade: 'mensagem',
      retrato: true,
      // Só de inscrição ATIVA: vencida de régua pausada é consequência da
      // pausa, não atraso. Retrato do agora, sempre: um filtro de data que
      // escondesse a vencida de anteontem esconderia exatamente o atraso.
      mensagem: {
        status: MENSAGEM_STATUS.AGENDADA,
        agendadaPara: { lte: agora },
        inscricao: { status: INSCRICAO_STATUS.ATIVA },
      },
      ajuda: 'Mensagens de régua ativa que já passaram da hora e ainda não saíram. Retrato de agora — não muda com o período.',
    },
    {
      id: 'agendadasHoje',
      rotulo: `Agendadas${sufixo}`,
      grupo: 'fila',
      tom: 'neutro',
      unidade: 'mensagem',
      mensagem: P ? { status: MENSAGEM_STATUS.AGENDADA, agendadaPara: entre } : { status: MENSAGEM_STATUS.AGENDADA },
      ajuda:
        `Mensagens com horário marcado ${noPeriodo} e ainda não enviadas. Campanha datada só entra na fila na ` +
        'manhã do próprio dia — para o que ainda vai ser montado, veja a aba Programação.',
    },
    {
      id: 'enviadasHoje',
      rotulo: `Enviadas${sufixo}`,
      grupo: 'entrega',
      tom: 'neutro',
      unidade: 'mensagem',
      mensagem: P ? { status: MENSAGEM_STATUS.ENVIADA, enviadaEm: entre } : { status: MENSAGEM_STATUS.ENVIADA },
      ajuda: `Mensagens que saíram ${noPeriodo}. Saíram — a Meta aceitar não é a cliente receber.`,
    },
    {
      id: 'entreguesHoje',
      rotulo: `Entregues${sufixo}`,
      grupo: 'entrega',
      tom: 'bom',
      unidade: 'mensagem',
      mensagem: P ? { entregueEm: entre } : { entregueEm: { not: null } },
      ajuda: `Mensagens que a Meta confirmou ter entregue no aparelho ${noPeriodo}. É a prova, não a promessa.`,
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
        enviadaEm: {
          ...(P ? { gte: P.inicio } : {}),
          lt: new Date(Math.min(agora.getTime() - SILENCIO_SUSPEITO_MS, P ? P.fim.getTime() : Infinity)),
        },
      },
      ajuda:
        'Saíram, a Meta aceitou e nunca confirmou entrega. Leia a faixa do canal primeiro: com o webhook ' +
        'mudo, isto é notícia sobre o CRM; com ele funcionando, é notícia sobre estas mensagens.',
    },
    {
      id: 'falhaEntrega',
      rotulo: 'Recusadas na entrega',
      grupo: 'entrega',
      tom: 'ruim',
      unidade: 'mensagem',
      // Saíram (têm `enviadaEm`) e voltaram com erro da Meta — 131049 é o caso
      // real: limite de marketing por cliente. Não aparecia em cartão nenhum,
      // porque a régua segue (a inscrição não vira ERRO).
      mensagem: { status: MENSAGEM_STATUS.ERRO, enviadaEm: P ? entre : { not: null } },
      ajuda:
        'Saíram, a Meta aceitou e depois recusou a entrega — o mais comum é 131049, o limite de mensagens de ' +
        'marketing por cliente. A cliente NÃO recebeu. Clique para ver o código de cada uma.',
    },
    {
      id: 'jaReceberam',
      rotulo: 'Já receberam',
      grupo: 'entrega',
      tom: 'neutro',
      unidade: 'pessoa',
      // `tentativas` conta ENVIO ACEITO, não entrega — por isso o rótulo
      // do relatório fala em "enviadas". Com período, a coorte é quem teve
      // mensagem saindo dentro dele.
      inscricao: coorte,
      ajuda: `Clientes para quem pelo menos uma mensagem saiu ${noPeriodo}. É a base dos cartões de resposta.`,
    },
    {
      id: 'responderam',
      rotulo: 'Responderam',
      grupo: 'resposta',
      tom: 'bom',
      base: 'jaReceberam',
      unidade: 'pessoa',
      // Por `respondeuEm`, NUNCA por status — o defeito que deu nome a este arquivo.
      inscricao: depoisDoInicio('respondeuEm'),
      ajuda: P
        ? 'Das que receberam no período, as que falaram com a gente depois do início dele (até agora).'
        : 'Clientes que falaram com a gente depois da nossa mensagem.',
    },
    {
      id: 'equipeAssumiu',
      rotulo: 'Equipe assumiu',
      grupo: 'resposta',
      tom: 'bom',
      base: 'jaReceberam',
      unidade: 'pessoa',
      inscricao: depoisDoInicio('humanoFalouEm'),
      ajuda: 'Conversas em que alguém da equipe entrou — pelo celular ou pelo Chatwoot —, não só a IA.',
    },
    {
      id: 'pedido',
      rotulo: 'Pedido feito',
      grupo: 'resposta',
      tom: 'bom',
      unidade: 'pessoa',
      inscricao: depoisDoInicio('converteuEm'),
      ajuda: P
        ? 'Das que receberam no período, as que fizeram pedido na Nuvemshop depois do início dele.'
        : 'Clientes que fizeram pedido na Nuvemshop depois de entrar na régua.',
    },
    {
      id: 'semResposta',
      rotulo: 'Sem resposta',
      grupo: 'resposta',
      tom: 'neutro',
      base: 'jaReceberam',
      unidade: 'pessoa',
      inscricao: P ? { ...coorte, OR: [{ respondeuEm: null }, { respondeuEm: { lt: P.inicio } }] } : { tentativas: { gt: 0 }, respondeuEm: null },
      ajuda: 'Receberam e ainda não responderam — o complemento exato de "Responderam".',
    },
    {
      id: 'pediramParar',
      rotulo: 'Pediram para parar',
      grupo: 'problema',
      tom: 'neutro',
      unidade: 'pessoa',
      inscricao: travouNoPeriodo(INSCRICAO_STATUS.OPT_OUT),
      ajuda: 'Pediram para não receber mais. Não entram em régua nenhuma, nunca mais.',
    },
    {
      id: 'numeroInvalido',
      rotulo: 'Número inválido',
      grupo: 'problema',
      tom: 'alerta',
      unidade: 'pessoa',
      inscricao: travouNoPeriodo(INSCRICAO_STATUS.NUMERO_INVALIDO),
      ajuda: 'A Meta respondeu que o número não recebe (131026 / 133010) — a ação é conferir o cadastro.',
    },
    {
      id: 'bloqueadaMeta',
      rotulo: 'Bloqueadas pela Meta',
      grupo: 'problema',
      tom: 'ruim',
      unidade: 'pessoa',
      inscricao: travouNoPeriodo(INSCRICAO_STATUS.BLOQUEADA_META),
      ajuda: 'A Meta recusou a entrega. O número é bom — o canal é que foi barrado. NÃO são reenviadas.',
    },
    {
      id: 'vetadas',
      rotulo: 'Vetadas antes de sair',
      grupo: 'problema',
      tom: 'alerta',
      unidade: 'mensagem',
      mensagem: P ? { status: MENSAGEM_STATUS.VETADA, updatedAt: entre } : { status: MENSAGEM_STATUS.VETADA },
      ajuda: 'Recusadas por uma guarda antes do envio: fora da lista de teste, copy incompleta ou template ausente.',
    },
    {
      id: 'comErro',
      rotulo: 'Com erro',
      grupo: 'problema',
      tom: 'ruim',
      unidade: 'pessoa',
      inscricao: travouNoPeriodo(INSCRICAO_STATUS.ERRO),
      ajuda: 'A régua parou por falha de envio ou de copy.',
    },
  ]
}

export function indicadorPorId(id: string, agora: Date, periodo: PeriodoIndicadores = periodoDeHoje(agora)): Indicador | null {
  return listarIndicadores(agora, periodo).find((i) => i.id === id) ?? null
}

const DIA = /^\d{4}-\d{2}-\d{2}$/

/**
 * `{ de, ate }` da tela ('YYYY-MM-DD', inclusivos) → instantes. `null` = tudo.
 * `undefined` = hoje (padrão). Lixo vira erro em palavras, não período errado.
 */
export function periodoDosDias(
  dias: { de: string; ate: string } | null | undefined,
  agora: Date,
  inicioDoDia: (dia: string) => Date,
): PeriodoIndicadores {
  if (dias === undefined) return periodoDeHoje(agora)
  if (dias === null) return null
  const { de, ate } = dias
  if (!DIA.test(de) || !DIA.test(ate)) throw new Error('Período inválido: use datas no formato AAAA-MM-DD.')
  if (ate < de) throw new Error('Período inválido: a data final é anterior à inicial.')
  const inicio = inicioDoDia(de)
  const fim = new Date(inicioDoDia(ate).getTime() + 24 * 3600_000)
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) throw new Error('Período inválido.')
  if (fim.getTime() - inicio.getTime() > 400 * 24 * 3600_000) throw new Error('Período longo demais (máximo de 400 dias). Use "Tudo".')
  return { inicio, fim }
}

/** O recorte traduzido para um `where` de mensagens — a tabela lista mensagem. */
export function whereDaTabela(ind: Indicador): Record<string, unknown> {
  return ind.mensagem ? { ...ind.mensagem } : { inscricao: { ...ind.inscricao } }
}
