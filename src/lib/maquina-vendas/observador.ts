/**
 * O OBSERVADOR — quem entra na fila, e por quê.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Nas duas implementações de origem (OCR e CarBoss) o observador vigiava UMA
 * coisa: card parado em coluna do funil. Venda consultiva B2B.
 *
 * A Doce Lilium vende roupa, e o gatilho natural é outro — carrinho
 * abandonado, pedido pago, entrega, recompra. Por isso aqui ele tem três
 * fontes, e a inscrição carrega `origem` + `refExterna` em vez de só um
 * `dealId`.
 *
 * ── A ÂNCORA, e o que ela decide ──────────────────────────────────────────
 * `ancoraEm` é o instante do evento NO RELÓGIO DA FONTE — o `created_at` do
 * checkout na Nuvemshop, nunca o instante em que a varredura o encontrou.
 *
 * Ela decide DUAS coisas, e só duas:
 *
 *   1. se o evento é recente o bastante para entrar (`idadeMaximaHoras`)
 *   2. quando sai a PRIMEIRA etapa
 *
 * O que ela deliberadamente NÃO decide é o resto da régua. A documentação da
 * Nuvemshop fala em "até 6 horas" de atraso para publicar um carrinho
 * abandonado; a medição de 09/09/2026 mostrou 27 horas no carrinho mais novo
 * que a API entregava. Com todas as etapas contando da âncora, um carrinho
 * assim chega com a régua inteira vencida e as três mensagens saem no mesmo
 * minuto. As etapas seguintes contam da ENTREGA da anterior — ver `agenda.ts`,
 * que é onde essa decisão mora.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { chaveTelefone, paraE164, primeiroNome } from './telefone'
import { montarCopy, CopyIncompleta, type Contexto } from './copy'
import { obterAjustes, CURSOR_VARREDURA_CARRINHO, type Ajustes } from './config'
import { agendarEtapas } from './agenda'
import { listarCarrinhosAbandonados, telefoneDoCarrinho, ancoraDaPeca } from '@/lib/nuvemshop/loja'

export type ResultadoObservacao = {
  vistos: number
  inscritos: number
  pulados: { motivo: string; quantos: number }[]
}

function contar(pulados: Map<string, number>, motivo: string) {
  pulados.set(motivo, (pulados.get(motivo) ?? 0) + 1)
}

/**
 * Varre os carrinhos abandonados da Nuvemshop e inscreve quem for elegível.
 *
 * VARREDURA e não evento porque a plataforma não publica webhook de carrinho —
 * medido na documentação em 08/09/2026. É a única porta que existe.
 *
 * Reprocessar é seguro: a inscrição é idempotente pela chave
 * (cadência, origem, refExterna), então um carrinho já visto não entra duas
 * vezes. É isso que permite a sobreposição de cursor sem medo.
 */
export async function observarCarrinhosAbandonados(): Promise<ResultadoObservacao> {
  const pulados = new Map<string, number>()

  const cadencia = await prisma.mvCadencia.findFirst({
    where: { gatilho: 'carrinho_abandonado', ativo: true },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (!cadencia || cadencia.etapas.length === 0) {
    return { vistos: 0, inscritos: 0, pulados: [{ motivo: 'sem cadência ativa de carrinho', quantos: 1 }] }
  }

  // Cursor com folga de 2h para trás: a Nuvemshop publica com atraso, e um
  // corte exato no último instante processado perderia o que apareceu depois.
  const cursor = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_VARREDURA_CARRINHO } })
  const desde = cursor
    ? new Date(new Date(cursor.valor).getTime() - 2 * 60 * 60 * 1000)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const carrinhos = await listarCarrinhosAbandonados(desde)
  const ajustes = await obterAjustes()
  let inscritos = 0

  for (const carrinho of carrinhos) {
    const e164 = paraE164(telefoneDoCarrinho(carrinho))
    if (!e164) {
      contar(pulados, 'sem telefone')
      continue
    }
    const chave = chaveTelefone(e164)
    if (!chave) {
      contar(pulados, 'telefone inválido')
      continue
    }

    // Quem pediu para sair não entra na fila. O filtro vem ANTES de tudo:
    // um detector perfeito sem filtro não impede nada.
    const saiu = await prisma.mvOptOut.findUnique({ where: { telefoneKey: chave } })
    if (saiu) {
      contar(pulados, 'opt-out')
      continue
    }

    const nome = primeiroNome(carrinho.contact_name)
    if (!nome) {
      contar(pulados, 'sem primeiro nome utilizável')
      continue
    }

    const ancora = new Date(carrinho.created_at)

    // Carrinho velho demais não entra. O corte é da cadência, não do código:
    // a mesma varredura serve reativação, que quer justamente o evento antigo.
    if (cadencia.idadeMaximaHoras != null) {
      const idadeHoras = (Date.now() - ancora.getTime()) / 3_600_000
      if (idadeHoras > cadencia.idadeMaximaHoras) {
        contar(pulados, `mais velho que ${cadencia.idadeMaximaHoras}h`)
        continue
      }
    }

    const contexto: Contexto = {
      primeiro_nome: nome,
      peca: ancoraDaPeca(carrinho),
      link: carrinho.abandoned_checkout_url,
      // Vêm dos ajustes, não do carrinho: o cupom é de campanha, tem validade
      // e é criado por uma pessoa na Nuvemshop. Nulos aqui só quebram a
      // inscrição se a cadência tiver uma etapa que os cite — e o semeador
      // (`scripts/mv-cadencia-carrinho.ts`) não cria essa etapa sem cupom.
      cupom: ajustes.cupomCarrinho,
      desconto: ajustes.descontoCarrinho,
    }

    try {
      await inscrever({
        ajustes,
        cadenciaId: cadencia.id,
        etapas: cadencia.etapas,
        origem: 'carrinho',
        refExterna: carrinho.token || String(carrinho.id),
        nome,
        e164,
        chave,
        ancora,
        contexto,
        retrato: {
          total: carrinho.total,
          moeda: carrinho.currency,
          itens: (carrinho.products ?? []).map((p) => ({ nome: p.name, qtd: p.quantity })),
          url: carrinho.abandoned_checkout_url,
        },
      })
      inscritos++
    } catch (e) {
      if (e instanceof CopyIncompleta) contar(pulados, `copy sem ${e.faltando.join('/')}`)
      else if (e instanceof JaInscrito) contar(pulados, 'já inscrito')
      else throw e
    }
  }

  await prisma.mvCursor.upsert({
    where: { chave: CURSOR_VARREDURA_CARRINHO },
    create: { chave: CURSOR_VARREDURA_CARRINHO, valor: new Date().toISOString() },
    update: { valor: new Date().toISOString() },
  })

  return {
    vistos: carrinhos.length,
    inscritos,
    pulados: [...pulados].map(([motivo, quantos]) => ({ motivo, quantos })),
  }
}

class JaInscrito extends Error {
  constructor() {
    super('ja inscrito')
    this.name = 'JaInscrito'
  }
}

type EtapaMin = {
  ordem: number
  delayMinutos: number
  ancoradaEm: string
  templateBase: string
  templateNome: string | null
}

/**
 * Cria a inscrição e SEMEIA todas as mensagens de uma vez.
 *
 * Semear na inscrição, e não na hora do envio, é o que permite a tela mostrar
 * a fila inteira antes de qualquer coisa sair — e é o que congela a copy.
 */
async function inscrever(args: {
  ajustes: Ajustes
  cadenciaId: string
  etapas: EtapaMin[]
  origem: string
  refExterna: string
  nome: string
  e164: string
  chave: string
  ancora: Date
  contexto: Contexto
  retrato: unknown
}): Promise<void> {
  const existente = await prisma.mvInscricao.findUnique({
    where: {
      cadenciaId_origem_refExterna: {
        cadenciaId: args.cadenciaId,
        origem: args.origem,
        refExterna: args.refExterna,
      },
    },
    select: { id: true },
  })
  if (existente) throw new JaInscrito()

  // A régua inteira de uma vez, em vez de etapa por etapa: é o encadeamento
  // que impede a rajada quando o carrinho chega velho (ver `agenda.ts`).
  const datas = agendarEtapas({ ancora: args.ancora, etapas: args.etapas, ajustes: args.ajustes })

  // Monta a copy ANTES de abrir a transação: se faltar placeholder, a
  // inscrição nem começa — em vez de nascer e ficar com mensagens quebradas.
  const textos = args.etapas.map((etapa, i) => ({
    ordem: etapa.ordem,
    texto: montarCopy(etapa.templateBase, args.contexto, `${args.refExterna}:${etapa.ordem}`),
    templateNome: etapa.templateNome,
    quando: datas[i],
  }))

  await prisma.$transaction(async (tx) => {
    const insc = await tx.mvInscricao.create({
      data: {
        cadenciaId: args.cadenciaId,
        origem: args.origem,
        refExterna: args.refExterna,
        nomeSnapshot: args.nome,
        telefoneE164: args.e164,
        telefoneKey: args.chave,
        ancoraEm: args.ancora,
        contexto: args.retrato as never,
        status: 'ATIVA',
      },
    })
    await tx.mvMensagem.createMany({
      data: textos.map((t) => ({
        inscricaoId: insc.id,
        etapaOrdem: t.ordem,
        mensagemFinal: t.texto,
        agendadaPara: t.quando,
        templateNome: t.templateNome,
        status: 'AGENDADA',
      })),
    })
  })
}

/** Fachada do tique: por ora só a loja. O funil entra quando houver cadência. */
export async function observar(): Promise<ResultadoObservacao> {
  return observarCarrinhosAbandonados()
}
