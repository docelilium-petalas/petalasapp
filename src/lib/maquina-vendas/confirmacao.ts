/**
 * APLICAR O QUE A META CONFIRMOU — a única escrita que corrige a tabela.
 *
 * Recebe os `statuses` já normalizados (`entrega-meta.ts`) e decide o que cada
 * um significa para a mensagem e para a inscrição.
 *
 * ── A regra que manda: falha DESFAZ a tentativa ────────────────────────────
 * `inscricao.tentativas` conta mensagens que a pessoa REALMENTE recebeu — é ele
 * que o teto por cadência consulta (`cfg.tetoPorCadencia`, guard 5 do
 * despachante). Uma mensagem que a Meta recusou não pode consumir tentativa,
 * senão o lead perde uma etapa da cadência por um envio que nunca chegou nele.
 *
 * ── O que este módulo NÃO faz ──────────────────────────────────────────────
 * Não move card, não escreve em Deal, Stage ou Contact. A Máquina observa o
 * funil e nunca o empurra — a regra dura do módulo continua valendo aqui.
 *
 * Porta da CarBoss: `falhaCodigo` → `codigoErro`, e a `naturezaFalha` do canal
 * (`canal.classificar`) é gravada junto, congelada no momento da falha.
 */

import prisma from '@/lib/prisma'
import { INSCRICAO_STATUS, MENSAGEM_STATUS } from './config'
import { ACAO, acaoDaFalha, type StatusDaMeta } from './entrega-meta'
import { classificar } from './canal'

export interface ResultadoConfirmacao {
  recebidos: number
  /** Quantos `wamid` eram nossos. O resto é eco ou mensagem de outro sistema. */
  casados: number
  entregues: number
  lidas: number
  falhas: number
  /** Recusadas pela Meta. NÃO voltam para a fila — ver abaixo. */
  bloqueadas: number
  /**
   * Represadas (131049 / 130472): a Meta segurou ESTA mensagem, mas a pessoa
   * é válida e a cadência dela segue viva. Contadas à parte de `bloqueadas`
   * porque a consequência é outra — ali a inscrição morre, aqui ela continua.
   */
  represadas: number
  invalidos: number
  /** Janela de 24h fechada: a mensagem volta para a fila, intacta. */
  devolvidas: number
  /**
   * A nossa conta está impedida de enviar (fatura, travamento, política).
   * Contadas à parte porque não são falha de lead nenhum: são UM fato sobre o
   * remetente, repetido N vezes. Ver a contagem separada é o que evita ler
   * "8 falhas" como "8 leads ruins".
   */
  contaSuspensa: number
  detalhes: string[]
}

export async function aplicarStatuses(lista: StatusDaMeta[]): Promise<ResultadoConfirmacao> {
  const r: ResultadoConfirmacao = {
    recebidos: lista.length,
    casados: 0,
    entregues: 0,
    lidas: 0,
    falhas: 0,
    bloqueadas: 0,
    represadas: 0,
    invalidos: 0,
    devolvidas: 0,
    contaSuspensa: 0,
    detalhes: [],
  }
  if (lista.length === 0) return r

  for (const s of lista) {
    const msg = await prisma.mvMensagem.findFirst({
      where: { idExterno: s.id },
      include: {
        inscricao: { select: { id: true, nomeSnapshot: true, status: true, tentativas: true } },
      },
    })
    // `wamid` que não é nosso: mensagem que alguém mandou pelo aplicativo, ou
    // eco de outro sistema. Segue em frente — não é erro.
    if (!msg) continue
    r.casados++

    if (s.status === 'delivered') {
      // `sent` pode chegar DEPOIS de `delivered` (a Meta não garante ordem). Só
      // grava se ainda não havia confirmação, para não recuar o horário.
      if (!msg.entregueEm) {
        await prisma.mvMensagem.update({
          where: { id: msg.id },
          data: { entregueEm: s.quando, codigoErro: null, falhaMotivo: null },
        })
      }
      r.entregues++
      continue
    }

    if (s.status === 'read') {
      await prisma.mvMensagem.update({
        where: { id: msg.id },
        data: {
          lidaEm: msg.lidaEm ?? s.quando,
          // Lida implica entregue: se o evento de entrega se perdeu, a leitura
          // prova que chegou. Sem isto a mensagem ficaria "sem confirmação"
          // para sempre, com a pessoa já tendo lido.
          entregueEm: msg.entregueEm ?? s.quando,
          codigoErro: null,
          falhaMotivo: null,
        },
      })
      r.lidas++
      continue
    }

    // `sent` não muda nada: já era o que a gente sabia quando gravou ENVIADA.
    if (s.status !== 'failed') continue

    r.falhas++
    const acao = acaoDaFalha(s.codigo)
    const motivo = `${s.codigo ?? 's/código'}: ${s.motivo ?? 'falha sem detalhe'}`.slice(0, 200)
    const naturezaFalha = classificar(s.codigo ?? undefined).natureza
    // A tentativa volta atrás — a pessoa não recebeu nada.
    const tentativas = Math.max(0, msg.inscricao.tentativas - 1)

    if (acao === ACAO.JANELA_FECHADA) {
      // Não é falha do número nem da pessoa: é a nossa etapa tentando sair sem
      // template com a janela fechada. A mensagem VOLTA para a fila e sai
      // sozinha quando a pessoa responder — cancelar aqui apagaria a cadência
      // de quem só ainda não tinha respondido, que é a maioria da base.
      await prisma.$transaction([
        prisma.mvMensagem.update({
          where: { id: msg.id },
          data: {
            status: MENSAGEM_STATUS.AGENDADA,
            enviadaEm: null,
            idExterno: null,
            codigoErro: s.codigo,
            naturezaFalha,
            falhaMotivo: motivo,
            erro: `janela de 24h fechada — segue agendada (${motivo})`,
          },
        }),
        prisma.mvInscricao.update({ where: { id: msg.inscricaoId }, data: { tentativas } }),
      ])
      r.devolvidas++
      r.detalhes.push(`${msg.inscricao.nomeSnapshot}: janela fechada — mensagem devolvida à fila`)
      continue
    }

    if (acao === ACAO.CONTA_SUSPENSA) {
      // A conta é que não pode enviar — fatura em aberto, travamento, política.
      // O destinatário não tem parte nisso, então ele NÃO perde a cadência: a
      // mensagem volta para a fila igual à janela fechada, e sai quando a conta
      // voltar. Encerrar a inscrição aqui seria cobrar do lead uma dívida nossa.
      //
      // Parar o CANAL é assunto do disjuntor, que conta falha em série — e é
      // por isso que devolver à fila não vira laço: sem conta boa, o disjuntor
      // desarma antes de a mensagem ser tentada muitas vezes.
      await prisma.$transaction([
        prisma.mvMensagem.update({
          where: { id: msg.id },
          data: {
            status: MENSAGEM_STATUS.AGENDADA,
            enviadaEm: null,
            idExterno: null,
            codigoErro: s.codigo,
            naturezaFalha,
            falhaMotivo: motivo,
            erro: `a NOSSA conta está impedida de enviar — segue agendada (${motivo})`,
          },
        }),
        prisma.mvInscricao.update({ where: { id: msg.inscricaoId }, data: { tentativas } }),
      ])
      r.contaSuspensa++
      r.detalhes.push(
        `${msg.inscricao.nomeSnapshot}: conta impedida de enviar — mensagem devolvida à fila (${motivo})`,
      )
      continue
    }

    if (acao === ACAO.NUMERO_INVALIDO) {
      await prisma.$transaction([
        prisma.mvMensagem.update({
          where: { id: msg.id },
          data: {
            status: MENSAGEM_STATUS.ERRO,
            codigoErro: s.codigo,
            naturezaFalha,
            falhaMotivo: motivo,
            erro: `não entregue — ${motivo}`,
          },
        }),
        prisma.mvInscricao.update({
          where: { id: msg.inscricaoId },
          data: {
            status: INSCRICAO_STATUS.NUMERO_INVALIDO,
            motivoParada: `número não recebe no WhatsApp (${motivo})`,
            tentativas,
          },
        }),
        prisma.mvMensagem.updateMany({
          where: { inscricaoId: msg.inscricaoId, status: MENSAGEM_STATUS.AGENDADA },
          data: { status: MENSAGEM_STATUS.CANCELADA, erro: 'número não recebe no WhatsApp' },
        }),
      ])
      r.invalidos++
      r.detalhes.push(`${msg.inscricao.nomeSnapshot}: número não recebe — cadência encerrada (${motivo})`)
      continue
    }

    if (acao === ACAO.REPRESADA) {
      // ══════════════════════════════════════════════════════════════════════
      // ESTA mensagem morre. A CADÊNCIA continua.
      //
      // 131049 é o limite de marketing POR DESTINATÁRIO, e ele expira. Diz que
      // esta pessoa recebeu marketing demais AGORA — de nós e de todo mundo —,
      // não que ela seja um contato ruim. A regra antiga cancelava a inscrição
      // inteira, e o custo apareceu em 09/09/2026: o Felipe entrou às 20:19,
      // levou 131049 na PRIMEIRA mensagem às 07:01 e perdeu as etapas 2 a 5 —
      // agendadas para o dia seguinte, +5, +12 e +21 dias. Três semanas depois
      // o limite de hoje não existe mais, e não havia nada para reavaliar,
      // porque `rodarParadas` só revisita inscrição ATIVA.
      //
      // O que continua valendo é não REENVIAR esta: reenviar o que a Meta
      // represou é exatamente o comportamento punido. Uma coisa é não insistir
      // hoje; outra é apagar a pessoa do funil por três semanas.
      // ══════════════════════════════════════════════════════════════════════
      await prisma.$transaction([
        prisma.mvMensagem.update({
          where: { id: msg.id },
          data: {
            status: MENSAGEM_STATUS.ERRO,
            codigoErro: s.codigo,
            naturezaFalha,
            falhaMotivo: motivo,
            erro: `a Meta represou esta mensagem (${motivo}) — a cadência segue`,
          },
        }),
        // A inscrição NÃO é tocada além da tentativa devolvida: ela continua
        // ATIVA, e as etapas seguintes continuam AGENDADAS.
        prisma.mvInscricao.update({ where: { id: msg.inscricaoId }, data: { tentativas } }),
      ])
      r.represadas++
      r.detalhes.push(
        `${msg.inscricao.nomeSnapshot}: mensagem represada pela Meta (${motivo}) — cadência mantida`,
      )
      continue
    }

    if (acao === ACAO.TRANSITORIA) {
      // ⚠️ NÃO reagenda, e a decisão é consciente: o que a Meta bloqueou não é
      // reenviado. Reenviar é o próprio comportamento que o bloqueio pune, e o
      // preço é a reputação de um número que já foi banido uma vez.
      //
      // `TRANSITORIA` (código que ainda não conhecemos) entra aqui junto, de
      // propósito. A regra antiga mandava re-tentar o desconhecido, e ela fazia
      // sentido quando a única informação era o texto da Evolution. Com um
      // `failed` da Cloud API na mão, "não sei por que a Meta recusou" não é
      // razão para insistir — é razão para alguém olhar. O código fica gravado
      // e visível na tela.
      await prisma.$transaction([
        prisma.mvMensagem.update({
          where: { id: msg.id },
          data: {
            status: MENSAGEM_STATUS.ERRO,
            codigoErro: s.codigo,
            naturezaFalha,
            falhaMotivo: motivo,
            erro: `a Meta bloqueou a entrega (${motivo}) — não será reenviada`,
          },
        }),
        prisma.mvInscricao.update({
          where: { id: msg.inscricaoId },
          data: {
            status: INSCRICAO_STATUS.BLOQUEADA_META,
            motivoParada: `a Meta bloqueou a entrega (${motivo}) — sem reenvio`,
            tentativas,
          },
        }),
        // As etapas seguintes também não saem: mesma pessoa, mesmo número,
        // mesmo canal que acabou de ser recusado.
        prisma.mvMensagem.updateMany({
          where: { inscricaoId: msg.inscricaoId, status: MENSAGEM_STATUS.AGENDADA },
          data: { status: MENSAGEM_STATUS.CANCELADA, erro: 'a Meta bloqueou a entrega para este contato' },
        }),
      ])
      r.bloqueadas++
      r.detalhes.push(`${msg.inscricao.nomeSnapshot}: a Meta bloqueou (${motivo}) — sem reenvio`)
      continue
    }

    // CONFIGURACAO: re-tentar repete o mesmo erro. Fica ERRO nominal e a
    // inscrição segue viva — o problema é do template, não da pessoa.
    await prisma.$transaction([
      prisma.mvMensagem.update({
        where: { id: msg.id },
        data: {
          status: MENSAGEM_STATUS.ERRO,
          codigoErro: s.codigo,
            naturezaFalha,
          falhaMotivo: motivo,
          erro: `template/configuração recusada pela Meta — ${motivo}`,
        },
      }),
      prisma.mvInscricao.update({ where: { id: msg.inscricaoId }, data: { tentativas } }),
    ])
    r.detalhes.push(`${msg.inscricao.nomeSnapshot}: a Meta recusou o template (${motivo})`)
  }

  return r
}
