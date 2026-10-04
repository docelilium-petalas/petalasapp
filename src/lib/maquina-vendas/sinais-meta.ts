/**
 * OS AVISOS QUE A META MANDA SOZINHA — e o que fazer com cada um.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Até 19/08/2026 a gente só ouvia dois eventos: `messages` (entrega e fala da
 * cliente) e `smb_message_echoes`. Todo o resto do que a Meta avisa — número
 * marcado, conta restrita, template reprovado, limite cortado — chegava como
 * nada, e a operação descobria pelo sintoma: mensagem que não sai, template que
 * devolve 132001, teto que encolheu sem ninguém mexer.
 *
 * Com a assinatura integral, esses avisos passam a CHEGAR EMPURRADOS, no
 * segundo em que acontecem. É outra qualidade de informação: `vigia.ts` pergunta
 * de cinco em cinco minutos "como está o número?" e só enxerga o que a consulta
 * de status mostra; isto aqui é a Meta dizendo o que houve, na hora, com motivo.
 * ══════════════════════════════════════════════════════════════════════════
 *
 * ── A regra de ouro deste arquivo ──────────────────────────────────────────
 * Cortar o envio por engano custa o dia da operação; não cortar quando devia
 * custa o NÚMERO. As duas doem, e a segunda não tem volta — mas isso não
 * autoriza cortar no escuro. Então `desarmar: true` só sai de evento que diz
 * explicitamente que a Meta parou de aceitar: conta desativada, restrita, em
 * violação, ou número marcado. Queda de qualidade de template, mudança de
 * limite e reprovação de template AVISAM, e não cortam — nenhuma delas impede
 * o resto da operação de entregar.
 *
 * Porta literal da CarBoss (04/10/2026) — os avisos da Meta são os mesmos
 * para qualquer WABA. Módulo PURO: não fala com banco, não lê relógio, não faz rede. Quem grava e
 * age é a rota do webhook.
 */

/** O que a Meta avisou, já traduzido para o que a operação precisa saber. */
export interface SinalDaMeta {
  /** Slug estável para agrupar em `logs_eventos`. */
  tipo:
    | 'meta_conta'
    | 'meta_numero'
    | 'meta_template'
    | 'meta_limite'
    | 'meta_alerta'
  nivel: 'INFO' | 'AVISO' | 'ERRO'
  titulo: string
  detalhe: string
  /** Puxar o freio AGORA? Só para o que impede a operação de entregar. */
  desarmar: boolean
  /** Nome do template, quando o aviso é sobre um. */
  template?: string
}

/**
 * Eventos de `account_update` que significam "a Meta parou de aceitar".
 *
 * A lista é FECHADA de propósito. `account_update` também carrega coisa
 * inofensiva — parceiro adicionado, política de privacidade mudada, conta
 * verificada — e tratar tudo como grave faria o freio cair por causa de um
 * campo de cadastro editado no Business Manager.
 */
const CONTA_GRAVE = new Set([
  'DISABLED_UPDATE',
  'ACCOUNT_VIOLATION',
  'ACCOUNT_RESTRICTION',
  'ACCOUNT_DELETED',
])

/** Situações de template que impedem o template de sair. */
const TEMPLATE_MORTO = new Set(['REJECTED', 'PAUSED', 'DISABLED', 'PENDING_DELETION', 'DELETED'])

const texto = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

/**
 * Traduz UMA mudança do webhook num sinal, ou `null` se não for coisa nossa.
 *
 * Nunca lança: o corpo vem de fora, e derrubar a rota faria a Meta re-tentar e,
 * depois de muitas falhas, DESLIGAR o webhook — que é justamente o canal por
 * onde estes avisos chegam.
 */
export function sinalDaMudanca(mudanca: { field?: string; value?: unknown }): SinalDaMeta | null {
  try {
    const campo = texto(mudanca?.field)
    const v = (mudanca?.value ?? {}) as Record<string, unknown>
    const evento = texto(v.event).toUpperCase()

    switch (campo) {
      // ── A CONTA ───────────────────────────────────────────────────────────
      case 'account_update': {
        if (!evento) return null
        const grave = CONTA_GRAVE.has(evento)
        const info = v.ban_info ?? v.violation_info ?? v.restriction_info
        return {
          tipo: 'meta_conta',
          nivel: grave ? 'ERRO' : 'INFO',
          titulo: grave ? `Conta da Meta em ${evento} — envio pausado` : `Conta da Meta: ${evento}`,
          detalhe: grave
            ? `A Meta mudou o estado da conta para ${evento}. Enquanto isso valer, mensagem não sai — ` +
              `o envio foi pausado para não empilhar tentativa recusada.${info ? ` Detalhe: ${JSON.stringify(info).slice(0, 300)}` : ''}`
            : `Atualização de cadastro na conta (${evento}). Nada a fazer.`,
          desarmar: grave,
        }
      }

      case 'account_review_update': {
        const decisao = texto(v.decision).toUpperCase()
        const reprovado = decisao === 'REJECTED'
        return {
          tipo: 'meta_conta',
          nivel: reprovado ? 'ERRO' : 'INFO',
          titulo: `Revisão da conta: ${decisao || 'atualizada'}`,
          detalhe: reprovado
            ? 'A Meta reprovou a revisão da conta. Isso costuma vir junto de restrição de envio — confira o Business Manager.'
            : 'A Meta atualizou a revisão da conta.',
          // Reprovar revisão não é, por si, bloqueio de envio: quando vira
          // bloqueio, chega um `account_update` grave junto. Cortar aqui
          // pararia a operação por um evento que ainda não impede nada.
          desarmar: false,
        }
      }

      // ── O NÚMERO ──────────────────────────────────────────────────────────
      case 'phone_number_quality_update': {
        const marcado = evento === 'FLAGGED'
        const limite = texto(v.current_limit)
        return {
          tipo: 'meta_numero',
          nivel: marcado ? 'ERRO' : 'INFO',
          titulo: marcado ? 'Número MARCADO pela Meta — envio pausado' : `Número: ${evento || 'atualizado'}`,
          detalhe: marcado
            ? 'A Meta marcou o número por qualidade baixa. Continuar mandando é o caminho mais curto para o ' +
              `banimento, então o envio foi pausado.${limite ? ` Limite atual: ${limite}.` : ''}`
            : `A Meta liberou o número (${evento}).${limite ? ` Limite atual: ${limite}.` : ''} ` +
              'O freio NÃO volta sozinho — soltar é decisão de gente.',
          desarmar: marcado,
        }
      }

      case 'phone_number_name_update': {
        const decisao = texto(v.decision).toUpperCase()
        return {
          tipo: 'meta_numero',
          nivel: decisao === 'REJECTED' ? 'AVISO' : 'INFO',
          titulo: `Nome de exibição: ${decisao || 'atualizado'}`,
          detalhe:
            decisao === 'APPROVED'
              ? 'O nome de exibição foi aprovado. O limite de mensagens tende a subir.'
              : `A Meta respondeu ${decisao} para o nome de exibição.${v.reason ? ` Motivo: ${texto(v.reason)}` : ''}`,
          desarmar: false,
        }
      }

      // ── OS TEMPLATES ──────────────────────────────────────────────────────
      case 'message_template_status_update': {
        const nome = texto(v.message_template_name)
        const morto = TEMPLATE_MORTO.has(evento)
        return {
          tipo: 'meta_template',
          nivel: morto ? 'ERRO' : 'INFO',
          titulo: `Template ${nome}: ${evento}`,
          detalhe: morto
            ? `A Meta ${evento === 'REJECTED' ? 'reprovou' : 'derrubou'} o template "${nome}". ` +
              'Toda etapa apontada para ele vai falhar com 132001 até alguém trocar o mapa.' +
              (v.reason ? ` Motivo: ${texto(v.reason)}` : '')
            : `O template "${nome}" agora está ${evento}.`,
          // Um template morto não impede os outros de sair. Parar a operação
          // inteira por causa de um seria trocar um problema pontual por um
          // problema geral.
          desarmar: false,
          template: nome || undefined,
        }
      }

      case 'message_template_quality_update': {
        const nome = texto(v.message_template_name)
        const nova = texto(v.new_quality_score).toUpperCase()
        const ruim = nova === 'RED'
        return {
          tipo: 'meta_template',
          nivel: ruim ? 'ERRO' : nova === 'YELLOW' ? 'AVISO' : 'INFO',
          titulo: `Qualidade do template ${nome}: ${nova || 'atualizada'}`,
          detalhe:
            `A Meta mudou a qualidade de "${nome}" de ${texto(v.previous_quality_score) || '—'} para ${nova || '—'}. ` +
            (ruim
              ? 'Vermelho significa que as pessoas estão bloqueando ou denunciando. Este template precisa sair da régua antes que derrube o número junto.'
              : 'Vale acompanhar.'),
          desarmar: false,
          template: nome || undefined,
        }
      }

      case 'template_category_update':
      case 'template_correct_category_detection': {
        const nome = texto(v.message_template_name)
        const nova = texto(v.correct_category ?? v.new_category).toUpperCase()
        return {
          tipo: 'meta_template',
          nivel: 'AVISO',
          titulo: `Categoria do template ${nome} → ${nova || 'reclassificada'}`,
          detalhe:
            `A Meta reclassificou "${nome}" para ${nova || '—'}. ` +
            'Sair de UTILITY para MARKETING muda o preço e passa a valer o limite por destinatário — ' +
            'que é o erro 131049 que já represou mensagem nossa.',
          desarmar: false,
          template: nome || undefined,
        }
      }

      // ── LIMITE E ALERTAS ──────────────────────────────────────────────────
      case 'business_capability_update': {
        const porNumero = texto(v.max_daily_conversation_per_phone)
        return {
          tipo: 'meta_limite',
          nivel: 'AVISO',
          titulo: 'Limite de envio mudou',
          detalhe:
            `A Meta mudou a capacidade da conta.${porNumero ? ` Conversas por dia, por número: ${porNumero}.` : ''} ` +
            'Se caiu, o teto diário da Máquina precisa acompanhar — teto nosso maior que o da Meta vira erro em série.',
          desarmar: false,
        }
      }

      case 'account_alerts': {
        const severidade = texto(v.alert_severity).toUpperCase()
        const situacao = texto(v.alert_status).toUpperCase()
        const critico = severidade === 'CRITICAL' && situacao !== 'RESOLVED'
        return {
          tipo: 'meta_alerta',
          nivel: critico ? 'ERRO' : 'AVISO',
          titulo: `Alerta da Meta (${severidade || 'sem severidade'}): ${texto(v.alert_type) || 'sem tipo'}`,
          detalhe:
            `${texto(v.alert_description) || 'A Meta abriu um alerta na conta.'} ` +
            `Situação: ${situacao || '—'}.`,
          // Alerta crítico é AVISO ruidoso, não prova de bloqueio: quando ele
          // vira bloqueio de verdade, vem um `account_update` grave junto, e é
          // esse que corta.
          desarmar: false,
        }
      }

      default:
        return null
    }
  } catch {
    return null
  }
}

/** Todos os sinais de um corpo de webhook já normalizado em mudanças. */
export function sinaisDasMudancas(
  mudancas: Array<{ field?: string; value?: unknown }>,
): SinalDaMeta[] {
  const fora: SinalDaMeta[] = []
  for (const m of mudancas) {
    const s = sinalDaMudanca(m)
    if (s) fora.push(s)
  }
  return fora
}
