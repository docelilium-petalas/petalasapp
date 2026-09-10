/**
 * O DESPACHANTE — o que sai agora, e as oito razões para não sair.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Este arquivo é quase todo GUARDA. Isso é de propósito: o trabalho de mandar
 * uma mensagem é uma chamada HTTP, e está em `canal.ts`. O trabalho difícil é
 * decidir que ela pode sair — e é aqui que os dois projetos de origem
 * queimaram número.
 *
 * ── UMA MENSAGEM POR TIQUE ────────────────────────────────────────────────
 * O tique roda de 5 em 5 minutos e envia NO MÁXIMO UMA mensagem. Não é
 * timidez: é o que produz o espaçamento sem segurar o processo dormindo entre
 * envios. O intervalo entre mensagens (3 a 12 minutos, sorteado) vive no
 * cursor `mv:ultimo_envio`, então ele vale ENTRE tiques, entre deploys e entre
 * reinícios do container — um `sleep` dentro de um laço não sobrevive a nada
 * disso, e some junto com a máquina.
 *
 * ── OS GUARDAS, NA ORDEM EM QUE VALEM ─────────────────────────────────────
 *   1. pausa           alguém desligou pela tela. Ganha de tudo.
 *   2. canal           sem credencial não se tenta — e não se finge que deu.
 *   3. intervalo       3 a 12 min desde o último envio, sorteado.
 *   4. opt-out         reconferido AGORA: pode ter chegado depois da semeadura.
 *   5. respondeu       quem falou com a gente sai da régua na hora.
 *   ── daqui para baixo, SÓ PARA MARKETING ──
 *   6. janela          9h–20h na parede de São Paulo, fim de semana incluso.
 *   7. teto do dia     40 por padrão, contados na parede de São Paulo.
 *   8. anti-eco        a mesma pessoa não recebe dois assuntos no mesmo dia.
 *
 * Os três últimos protegem a reputação do número contra disparo promocional.
 * Aplicá-los a uma confirmação de pagamento seria segurar até as 9h da manhã
 * uma mensagem que a pessoa está esperando agora — e a Meta trata UTILITY como
 * outra coisa justamente porque ela é outra coisa.
 *
 * Do 4 em diante a conferência é por mensagem, e não por tique, porque são
 * fatos que mudam entre a semeadura e o envio. Guard que só roda na semeadura
 * é guard que não vale — foi assim que a CarBoss mandou mensagem para quem
 * tinha pedido para sair três dias antes.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { obterAjustes, dentroDaJanela, paredeSP, CURSOR_ULTIMO_ENVIO } from './config'
import { canalConfigurado, enviarTemplate, ErroCanal, type NaturezaFalha } from './canal'
import { reancorarAposEnvio } from './agenda'
import { CATALOGO } from './catalogo-templates'

/** Os nomes MARKETING, para o anti-eco não contar transacional como incômodo. */
const NOMES_MARKETING = CATALOGO.filter((t) => t.categoria === 'MARKETING').map((t) => t.nome)

/**
 * A mensagem é resposta a um ato da pessoa (pedido, pagamento, entrega)?
 *
 * Template desconhecido conta como MARKETING de propósito: no escuro, o certo
 * é aplicar TODOS os guards, não nenhum.
 */
function ehTransacional(templateNome: string | null): boolean {
  if (!templateNome) return false
  return CATALOGO.find((t) => t.nome === templateNome)?.categoria === 'UTILITY'
}

/**
 * Quanto tempo a mesma pessoa fica de fora depois de receber algo.
 *
 * Existe porque uma pessoa pode ter DOIS carrinhos abandonados, e cada um vira
 * uma inscrição própria. O encadeamento por inscrição espaça as etapas de uma
 * régua; ele não sabe da outra régua. Sem este teto, quem abandonou dois
 * carrinhos recebe duas mensagens no mesmo dia, de assuntos diferentes — que
 * é exatamente a sensação de estar sendo perseguido por um robô.
 */
const ANTI_ECO_HORAS = 20

export type ResultadoDespacho = {
  enviadas: number
  /** Por que o tique não enviou. Ausente quando enviou. */
  motivo?: string
  /** O que aconteceu de errado, agregado. */
  falhas: { natureza: NaturezaFalha; quantos: number }[]
  /** Mensagens tiradas da fila sem envio (opt-out, respondeu). */
  canceladas: number
}

const nada = (motivo: string): ResultadoDespacho => ({ enviadas: 0, motivo, falhas: [], canceladas: 0 })

/** Meia-noite de hoje na parede de São Paulo, em UTC. */
function inicioDoDiaSP(agora: Date): Date {
  const { hora, minuto } = paredeSP(agora)
  const d = new Date(agora.getTime() - (hora * 60 + minuto) * 60_000)
  d.setSeconds(0, 0)
  return d
}

export async function despachar(): Promise<ResultadoDespacho> {
  const agora = new Date()
  const ajustes = await obterAjustes()

  // 1 · PAUSA — ganha de tudo, inclusive de mensagem vencida.
  if (ajustes.envioPausado) return nada('envio pausado nos ajustes')

  // 2 · CANAL — sem credencial não se tenta. Tentar produziria uma falha por
  // mensagem, gastando tentativa e sujando o log com um problema de config.
  if (!(await canalConfigurado())) return nada('canal de WhatsApp não configurado')

  // 3 · INTERVALO — o espaçamento que sobrevive a reinício.
  const cursor = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_ULTIMO_ENVIO } })
  if (cursor) {
    const desde = (agora.getTime() - new Date(cursor.valor).getTime()) / 60_000
    const sorteado =
      ajustes.intervaloMinMinutos +
      Math.random() * Math.max(0, ajustes.intervaloMaxMinutos - ajustes.intervaloMinMinutos)
    if (desde < sorteado) return nada(`aguardando intervalo (${desde.toFixed(1)} de ${sorteado.toFixed(1)} min)`)
  }

  // O teto e a janela NÃO barram o tique inteiro: eles valem POR MENSAGEM, e
  // só para marketing. Barrar aqui em cima seguraria também a confirmação de
  // pagamento de quem comprou às 21h.
  const enviadasHoje = await prisma.mvMensagem.count({
    where: { status: 'ENVIADA', enviadaEm: { gte: inicioDoDiaSP(agora) } },
  })
  const janelaAberta = dentroDaJanela(ajustes, agora)

  // A fila: vencidas, de inscrição viva, quem não respondeu na frente.
  // Prioridade menor primeiro (0 = já comprou alguma vez), depois a mais antiga.
  const candidatas = await prisma.mvMensagem.findMany({
    where: {
      status: 'AGENDADA',
      agendadaPara: { lte: agora },
      inscricao: { status: 'ATIVA' },
    },
    orderBy: [{ inscricao: { prioridade: 'asc' } }, { agendadaPara: 'asc' }],
    take: 25,
    include: {
      inscricao: {
        select: {
          id: true,
          telefoneKey: true,
          telefoneE164: true,
          nomeSnapshot: true,
          respondeuEm: true,
          contexto: true,
        },
      },
    },
  })
  if (!candidatas.length) return nada('nada vencido na fila')

  let canceladas = 0

  for (const msg of candidatas) {
    const insc = msg.inscricao

    // 4 · OPT-OUT — reconferido agora, não na semeadura.
    const saiu = await prisma.mvOptOut.findUnique({ where: { telefoneKey: insc.telefoneKey } })
    if (saiu) {
      canceladas += await encerrar(insc.id, 'OPT_OUT', 'pediu para sair depois da semeadura')
      continue
    }

    // 5 · RESPONDEU — quem falou com a gente sai da régua. O robô insistindo
    // depois da resposta é o defeito que mais irrita, e o mais fácil de evitar.
    if (insc.respondeuEm) {
      canceladas += await encerrar(insc.id, 'RESPONDEU', 'respondeu antes desta etapa')
      continue
    }

    // 6, 7 e 8 · SÓ PARA MARKETING — janela, teto do dia e anti-eco.
    //
    // Quem manda é a CATEGORIA do template aprovado, não um campo nosso: é a
    // Meta que decide o que é utility, inclusive reclassificando por conta
    // própria. Espelhar a decisão dela é o único jeito de não divergir.
    if (!ehTransacional(msg.templateNome)) {
      if (!janelaAberta) continue
      if (enviadasHoje >= ajustes.tetoDiario) continue

      const recente = await prisma.mvMensagem.findFirst({
        where: {
          status: 'ENVIADA',
          enviadaEm: { gte: new Date(agora.getTime() - ANTI_ECO_HORAS * 3_600_000) },
          inscricao: { telefoneKey: insc.telefoneKey },
          templateNome: { in: NOMES_MARKETING },
        },
        select: { id: true },
      })
      if (recente) continue // não é erro: a vez dela é amanhã
    }

    return await enviarUma(msg, insc, ajustes, agora, canceladas)
  }

  return { enviadas: 0, motivo: 'nenhuma candidata passou nos guards', falhas: [], canceladas }
}

type Candidata = {
  id: string
  etapaOrdem: number
  templateNome: string | null
  /** Os `{{n}}` do corpo, na ordem, congelados na semeadura. */
  variaveis: unknown
}
type InscricaoMin = {
  id: string
  telefoneE164: string
  nomeSnapshot: string
  contexto: unknown
}

async function enviarUma(
  msg: Candidata,
  insc: InscricaoMin,
  ajustes: Awaited<ReturnType<typeof obterAjustes>>,
  agora: Date,
  canceladas: number,
): Promise<ResultadoDespacho> {
  // Sem `templateNome` é texto livre, que só vale dentro da janela de 24h da
  // Meta. Como a régua de carrinho começa fria, isso aqui é erro de cadência,
  // não caso de uso — e vira VETADA em vez de tentativa que a Meta recusa.
  if (!msg.templateNome) {
    await prisma.mvMensagem.update({
      where: { id: msg.id },
      data: { status: 'VETADA', erro: 'etapa sem template aprovado, e a janela de 24h está fechada' },
    })
    return { enviadas: 0, motivo: 'etapa sem template', falhas: [], canceladas }
  }

  const ctx = (insc.contexto ?? {}) as { url?: string }

  try {
    const { idExterno, payload } = await enviarTemplate({
      para: insc.telefoneE164,
      templateNome: msg.templateNome,
      idioma: 'pt_BR',
      // Congeladas na semeadura, junto com a copy. O envio por template manda
      // os valores de fora — quem monta a frase é a Meta, com o texto
      // aprovado — e eles têm que ser os MESMOS que a tela mostrou, mesmo que
      // o carrinho tenha mudado de conteúdo desde então.
      variaveis: (msg.variaveis as string[] | null) ?? [],
      urlBotao: ctx.url,
    })

    await prisma.mvMensagem.update({
      where: { id: msg.id },
      data: {
        status: 'ENVIADA',
        enviadaEm: agora,
        idExterno,
        payloadEnvio: payload.slice(0, 4000),
        canal: 'oficial',
        tentativasEnvio: { increment: 1 },
      },
    })
    await prisma.mvCursor.upsert({
      where: { chave: CURSOR_ULTIMO_ENVIO },
      create: { chave: CURSOR_ULTIMO_ENVIO, valor: agora.toISOString() },
      update: { valor: agora.toISOString() },
    })

    // A régua das seguintes conta do envio REAL, não da previsão.
    await reancorarAposEnvio({
      inscricaoId: insc.id,
      etapaOrdem: msg.etapaOrdem,
      enviadaEm: agora,
      ajustes,
    })

    // Última etapa entregue: a inscrição cumpriu o que tinha para dizer.
    const restam = await prisma.mvMensagem.count({
      where: { inscricaoId: insc.id, status: 'AGENDADA' },
    })
    if (restam === 0) {
      await prisma.mvInscricao.update({
        where: { id: insc.id },
        data: { status: 'CONCLUIDA', motivoParada: 'régua cumprida' },
      })
    }

    return { enviadas: 1, falhas: [], canceladas }
  } catch (e) {
    if (!(e instanceof ErroCanal)) throw e

    await prisma.mvMensagem.update({
      where: { id: msg.id },
      data: {
        status: e.reTentavel ? 'AGENDADA' : 'ERRO',
        erro: e.message.slice(0, 500),
        codigoErro: e.codigo,
        naturezaFalha: e.natureza,
        falhaMotivo: e.message.slice(0, 200),
        tentativasEnvio: { increment: 1 },
        // Re-tentável volta para a fila alguns minutos à frente, para não
        // travar o tique seguinte na mesma mensagem quebrada.
        ...(e.reTentavel ? { agendadaPara: new Date(agora.getTime() + 15 * 60_000) } : {}),
      },
    })

    // Falha que é da PESSOA, e não da mensagem, encerra a inscrição: insistir
    // com número inválido ou conta bloqueada só gasta reputação.
    if (e.natureza === 'NUMERO_INVALIDO' || e.natureza === 'BLOQUEADA_META') {
      await encerrar(insc.id, e.natureza, e.message.slice(0, 200))
    }

    return { enviadas: 0, motivo: `falha no envio: ${e.natureza}`, falhas: [{ natureza: e.natureza, quantos: 1 }], canceladas }
  }
}

/**
 * Tira a inscrição da régua e cancela o que ainda não saiu.
 *
 * Devolve quantas mensagens foram canceladas.
 */
async function encerrar(inscricaoId: string, status: string, motivo: string): Promise<number> {
  const [canceladas] = await prisma.$transaction([
    prisma.mvMensagem.updateMany({
      where: { inscricaoId, status: 'AGENDADA' },
      data: { status: 'CANCELADA', erro: motivo },
    }),
    prisma.mvInscricao.update({ where: { id: inscricaoId }, data: { status, motivoParada: motivo } }),
  ])
  return canceladas.count
}
