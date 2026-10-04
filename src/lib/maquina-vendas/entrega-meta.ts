/**
 * O QUE A META DIZ DEPOIS — entrega, leitura e falha.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * `status = ENVIADA` sempre significou só "a API aceitou e devolveu um id". A
 * confirmação chega minutos depois, por webhook, e até agora não havia onde
 * guardá-la — então a tabela afirmava alcance que podia não ter existido.
 *
 * É a mesma falha que a gente já viu duas vezes por outros caminhos: 79
 * marcadas como enviadas com 12 entregues, e o HTTP 200 do fluxo n8n que
 * marcava ENVIADA com a API do outro lado devolvendo 503. O canal mudou; a
 * volta não vinha junto. Este arquivo é a volta.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── Por que classificar por CÓDIGO, e não por texto ────────────────────────
 * `paradas.ts` e o classificador antigo casam o TEXTO que a Evolution devolvia,
 * porque era só isso que existia. A Cloud API manda número, e número não tem
 * sinônimo: 131026 é sempre "não dá para entregar a este número". Casar string
 * quando existe um código é escolher a fonte pior.
 *
 * Este módulo é PURO: não fala com o banco, não lê relógio. Quem grava é
 * `confirmacao.ts`, e é isso que deixa os dois testáveis sem Postgres.
 */

/** O que fazer com uma falha da Meta. */
export const ACAO = {
  /** O número não recebe. Re-tentar só queima reputação. */
  NUMERO_INVALIDO: 'NUMERO_INVALIDO',
  /** A Meta represou ESTA mensagem. A pessoa é válida — mas não se insiste. */
  REPRESADA: 'REPRESADA',
  /** Erro nosso de template/configuração. Re-tentar repete o mesmo erro. */
  CONFIGURACAO: 'CONFIGURACAO',
  /** Janela de 24h fechada. Problema do nosso agendamento, não da pessoa. */
  JANELA_FECHADA: 'JANELA_FECHADA',
  /**
   * A NOSSA conta está impedida de enviar — fatura em aberto, conta travada,
   * bloqueio de política. Não tem relação nenhuma com o destinatário.
   */
  CONTA_SUSPENSA: 'CONTA_SUSPENSA',
  /** Não reconhecida. */
  TRANSITORIA: 'TRANSITORIA',
} as const

export type AcaoDeFalha = (typeof ACAO)[keyof typeof ACAO]

/**
 * Códigos da Cloud API que já vimos ou que vale antecipar.
 *
 * A lista é conservadora de propósito, pela assimetria de sempre: marcar um
 * número como inválido por engano apaga um lead bom da base sem ninguém
 * perceber; re-tentar à toa custa uma mensagem.
 */
const POR_CODIGO: Record<number, AcaoDeFalha> = {
  // "Message undeliverable" — o número não tem WhatsApp ou não pode receber.
  131026: ACAO.NUMERO_INVALIDO,
  // Número não registrado no WhatsApp.
  133010: ACAO.NUMERO_INVALIDO,
  // "This message was not delivered to maintain healthy ecosystem engagement."
  // É o limite POR DESTINATÁRIO de mensagem de marketing. A pessoa existe e
  // recebe — a Meta é que segurou esta. Insistir hoje é exatamente o
  // comportamento que o código está punindo.
  131049: ACAO.REPRESADA,
  // Destinatário num experimento da Meta — mesma natureza.
  130472: ACAO.REPRESADA,
  // Fora da janela de 24h sem template. NÃO é problema do número: é a nossa
  // etapa que não tem template aprovado, e a mensagem volta para a fila.
  131047: ACAO.JANELA_FECHADA,
  // ══════════════════════════════════════════════════════════════════════════
  // OS CÓDIGOS DE CONTA — falam de NÓS, nunca do destinatário.
  //
  // Sem esta seção os três caíam em `TRANSITORIA`, e `confirmacao.ts` trata
  // transitória junto com represada: inscrição BLOQUEADA_META e fila da pessoa
  // cancelada, sem reenvio. Ou seja, um problema de cobrança era debitado da
  // conta do lead, e `rodarParadas` só revisita inscrição ATIVA — quem saía
  // assim não voltava nunca.
  //
  // Não é hipótese: em 31/08/2026 a fatura da conta venceu, três mensagens
  // levaram 131042, e Filipe, Ari e Prime saíram da cadência de vez. Nenhum
  // dos três fez nada — e nenhum tem culpa da fatura.
  //
  // A mensagem VOLTA para a fila, como em `JANELA_FECHADA`. Quem tem de parar
  // é o CANAL, e disso cuida o disjuntor: três falhas em série já o desarmam.
  // ══════════════════════════════════════════════════════════════════════════
  // "your WhatsApp Business account has unsettled invoice" — fatura em aberto.
  131042: ACAO.CONTA_SUSPENSA,
  // "Business account has been locked" — conta travada pela Meta.
  131031: ACAO.CONTA_SUSPENSA,
  // Bloqueio temporário por violação de política.
  368: ACAO.CONTA_SUSPENSA,
  // Família 132xxx: template inexistente, não aprovado, parâmetro errado.
  132000: ACAO.CONFIGURACAO,
  132001: ACAO.CONFIGURACAO,
  132005: ACAO.CONFIGURACAO,
  132007: ACAO.CONFIGURACAO,
  132012: ACAO.CONFIGURACAO,
  132015: ACAO.CONFIGURACAO,
  132016: ACAO.CONFIGURACAO,
  132068: ACAO.CONFIGURACAO,
  132069: ACAO.CONFIGURACAO,
}

export function acaoDaFalha(codigo: number | null | undefined): AcaoDeFalha {
  if (codigo === null || codigo === undefined) return ACAO.TRANSITORIA
  return POR_CODIGO[codigo] ?? ACAO.TRANSITORIA
}

/**
 * Os códigos que falam de UMA PESSOA, e não do canal.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Em 16/09/2026 a Máquina parou sozinha e ficou dois dias muda. O disjuntor
 * puxou o freio por FALHA_EM_SERIE — três erros em uma hora — e os três eram
 * 131049, que é a Meta segurando mensagem de marketing PARA AQUELE
 * DESTINATÁRIO. O número estava CONNECTED, a qualidade GREEN, e nenhuma das
 * outras 300 mensagens da fila tinha problema nenhum.
 *
 * O disjuntor existe para proteger o NÚMERO. Um limite por destinatário não
 * diz nada sobre o número — diz que aquela pessoa já recebeu marketing demais
 * esta semana. Contar os dois na mesma conta faz a operação inteira parar por
 * um sintoma que é, por construção, de um lead só.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ Derivado do mapa, nunca escrito à mão. Uma segunda lista de códigos é uma
 *    lista que envelhece sozinha: o dia em que alguém acrescentar um código
 *    novo em `POR_CODIGO` e esquecer da cópia é o dia em que o disjuntor volta
 *    a parar a operação pelo motivo errado.
 *
 * ⚠️ Códigos `CONFIGURACAO` (132xxx) NÃO entram: template reprovado ou
 *    parâmetro errado se repete em TODA mensagem seguinte, e parar cedo é
 *    exatamente o certo. `TRANSITORIA` — inclusive o código nulo do canal
 *    antigo — também fica de fora: é falha de transporte, que é o que o
 *    disjuntor nasceu para pegar.
 */
export const CODIGOS_DO_DESTINATARIO: number[] = Object.entries(POR_CODIGO)
  .filter(([, acao]) => acao === ACAO.NUMERO_INVALIDO || acao === ACAO.REPRESADA)
  .map(([codigo]) => Number(codigo))

/** Uma linha de `statuses` do webhook, já do jeito que interessa. */
export interface StatusDaMeta {
  /** wamid — casa com `MvMensagem.idExterno`. */
  id: string
  /** sent | delivered | read | failed */
  status: string
  /** Telefone do destinatário, na forma canônica da Meta. */
  destinatario: string
  quando: Date
  codigo: number | null
  motivo: string | null
}

interface ValorDoWebhook {
  statuses?: Array<{
    id?: string
    status?: string
    recipient_id?: string
    timestamp?: string | number
    errors?: Array<{
      code?: number
      title?: string
      message?: string
      error_data?: { details?: string }
    }>
  }>
  /** Fala do lead. Convive com `statuses` no mesmo tipo porque o campo que
   *  distingue os dois é o `field` da mudança, não o formato do valor. */
  messages?: Array<{
    from?: string
    id?: string
    timestamp?: string | number
    type?: string
    text?: { body?: string }
    /** Toque em botão de resposta rápida de TEMPLATE. `text` é o rótulo. */
    button?: { text?: string; payload?: string }
    /** Toque em botão/lista de mensagem interativa. */
    interactive?: {
      type?: string
      button_reply?: { id?: string; title?: string }
      list_reply?: { id?: string; title?: string }
    }
  }>
}

/**
 * Extrai os status de um corpo de webhook da Meta.
 *
 * Devolve lista vazia para qualquer payload que não seja de status — inclusive
 * mensagens recebidas e ecos. **Nunca lança**: o corpo vem de fora, e derrubar
 * a rota faria a Meta re-tentar e, depois de muitas falhas, DESLIGAR o webhook.
 */
/** Uma mudança do webhook, já fora do envelope, seja ele qual for. */
export interface MudancaDoWebhook {
  field?: string
  value?: ValorDoWebhook
}

/**
 * AS DUAS FORMAS DE ENVELOPE, NORMALIZADAS NUMA SÓ.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A Meta manda o corpo embrulhado:
 *
 *   { object, entry: [ { id, changes: [ { field, value } ] } ] }
 *
 * A **Datafy manda o miolo, sem envelope**:
 *
 *   { field, value }
 *
 * Descoberto em 18/08, e custou caro: até então todos os extratores daqui
 * liam `corpo.entry[].changes[]` direto. Com o formato achatado eles não
 * encontravam nada, devolviam vazio, e o webhook respondia `200 {ok:true}`
 * como se tivesse processado — a pior forma de falhar que existe. Ficamos um
 * dia inteiro sem confirmação de entrega e sem a fala de nenhum lead, com o
 * sistema jurando que estava tudo certo.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Aceitar as duas formas não é remendo: é o contrato real de quem nos chama.
 * Um proxy pode mudar o embrulho a qualquer momento, e o custo de aceitar o
 * envelope completo E o miolo é uma função de dez linhas.
 */
export function mudancasDoCorpo(corpo: unknown): MudancaDoWebhook[] {
  const fora: MudancaDoWebhook[] = []
  try {
    const c = corpo as {
      entry?: Array<{ changes?: MudancaDoWebhook[] }>
      changes?: MudancaDoWebhook[]
      field?: string
      value?: ValorDoWebhook
    }
    if (Array.isArray(c?.entry)) {
      for (const entrada of c.entry) for (const m of entrada?.changes ?? []) if (m) fora.push(m)
    }
    // `changes` solto, sem `entry` em volta.
    if (Array.isArray(c?.changes)) for (const m of c.changes) if (m) fora.push(m)
    // O miolo puro, que é o que a Datafy entrega.
    if (fora.length === 0 && c && (c.field !== undefined || c.value !== undefined)) {
      fora.push({ field: c.field, value: c.value })
    }
  } catch {
    /* corpo torto devolve lista vazia; quem chama já responde 200 */
  }
  return fora
}

export function statusesDoCorpo(corpo: unknown): StatusDaMeta[] {
  const saida: StatusDaMeta[] = []
  try {
    for (const mudanca of mudancasDoCorpo(corpo)) {
      for (const s of mudanca.value?.statuses ?? []) {
        if (!s?.id || !s?.status) continue
        const erro = s.errors?.[0]
        const segundos = Number(s.timestamp)
        saida.push({
          id: s.id,
          status: String(s.status).toLowerCase(),
          destinatario: String(s.recipient_id ?? ''),
          quando: Number.isFinite(segundos) && segundos > 0 ? new Date(segundos * 1000) : new Date(),
          codigo: typeof erro?.code === 'number' ? erro.code : null,
          motivo: erro?.error_data?.details ?? erro?.message ?? erro?.title ?? null,
        })
      }
    }
  } catch {
    // Payload estranho não pode virar 500 — ver o comentário acima.
  }
  return saida
}

/** O webhook trouxe mensagem RECEBIDA (e não status)? É o que vai para o agente. */
export function temMensagemRecebida(corpo: unknown): boolean {
  try {
    return mudancasDoCorpo(corpo).some(
      (m) => m.field === 'messages' && Array.isArray(m.value?.messages) && m.value!.messages!.length > 0,
    )
  } catch {
    return false
  }
}

/** Uma fala do lead, já extraída do corpo da Meta. */
export interface MensagemRecebida {
  /** `from` da Meta: E.164 sem `+`, na forma que a Meta usa (wa_id). */
  telefone: string
  texto: string
  /** `timestamp` da Meta é em SEGUNDOS. Multiplicar por 1000 é obrigatório. */
  quando: Date
  idExterno: string | null
}

/**
 * As falas do lead que vieram neste corpo.
 *
 * Existe porque saber QUE chegou mensagem (`temMensagemRecebida`) não basta:
 * sem gravar o texto, a fala do lead morre no webhook e três coisas quebram de
 * uma vez — a cadência não para de mandar para quem já respondeu, o Resultados
 * conta zero resposta, e a SDR não vê nada.
 *
 * ⚠️ Áudio, imagem e documento continuam de fora. Eles vêm sem corpo textual, e
 * o que interessa deles é o CARIMBO de que a pessoa falou — isso
 * `temMensagemRecebida` já dá. Inventar um texto para eles poluiria o gabarito
 * que separa a nossa fala da fala da SDR.
 *
 * ── Por que `button` e `interactive` entram ────────────────────────────────
 * ══════════════════════════════════════════════════════════════════════════
 * Toque em botão de resposta rápida NÃO é `type: 'text'`. Chega como
 * `type: 'button'` (botão de TEMPLATE) ou `type: 'interactive'` (botão de
 * mensagem interativa), com o rótulo em `button.text` / `interactive.
 * button_reply.title`.
 *
 * Enquanto isto lia só `text`, o toque caía fora: `gravarRecebidas` recebia
 * lista vazia, `respondeuEm` não era carimbado, e a cadência seguia mandando
 * para quem tinha ACABADO de tocar em "Agora não". O lead responde, o sistema
 * não escuta, e a próxima mensagem sai por cima da resposta dele.
 *
 * Isso deixou de ser hipótese no dia em que os templates de abertura ganharam
 * botão: o toque passou a ser o caminho PRINCIPAL de resposta, porque é ele
 * que abre a janela de 24h sem o lead precisar digitar.
 * ══════════════════════════════════════════════════════════════════════════
 */
export function mensagensRecebidas(corpo: unknown): MensagemRecebida[] {
  const fora: MensagemRecebida[] = []
  try {
    for (const c of mudancasDoCorpo(corpo)) {
      if (c.field !== 'messages') continue
      for (const m of c.value?.messages ?? []) {
        // O rótulo do botão é a fala da pessoa: é o que ela escolheu dizer, e é
        // o que a SDR precisa ler na conversa. `payload` fica de fora de
        // propósito — ele é identificador nosso, não frase dela.
        const texto = String(
          m.type === 'text'
            ? (m.text?.body ?? '')
            : m.type === 'button'
              ? (m.button?.text ?? '')
              : m.type === 'interactive'
                ? (m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? '')
                : '',
        ).trim()
        const telefone = String(m.from ?? '').replace(/\D/g, '')
        if (!telefone || !texto) continue
        const seg = Number(m.timestamp)
        fora.push({
          telefone,
          texto,
          // Sem timestamp utilizável, "agora" é melhor que uma data de 1970 —
          // que cairia antes da inscrição e faria a resposta ser descartada.
          quando: Number.isFinite(seg) && seg > 0 ? new Date(seg * 1000) : new Date(),
          idExterno: m.id ?? null,
        })
      }
    }
  } catch {
    /* corpo torto não derruba o webhook: quem chama já devolve 200 */
  }
  return fora
}

/**
 * O webhook trouxe ECO — mensagem que NÓS mandamos, devolvida pela Meta.
 *
 * ⚠️ É a armadilha número um deste endpoint. `message_echoes` chega no mesmo
 * endereço que `messages`, e tratar um eco como mensagem recebida faz o agente
 * responder a si mesmo, em laço, gastando um envio por volta.
 */
export function ehEco(corpo: unknown): boolean {
  try {
    // `smb_message_echoes` é o eco de mensagem mandada pelo APP do WhatsApp
    // Business (coexistência), e `message_echoes` o de mensagem mandada pela
    // API. São nomes diferentes para a mesma coisa do nosso ponto de vista:
    // fala NOSSA voltando. O painel da Datafy assina o primeiro; conferir só o
    // segundo deixaria o guard sem disparar justamente no caso que existe aqui.
    return mudancasDoCorpo(corpo).some(
      (c) => c.field === 'message_echoes' || c.field === 'smb_message_echoes',
    )
  } catch {
    return false
  }
}
