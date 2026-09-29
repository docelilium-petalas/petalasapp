/**
 * CAMPANHA COM DATA MARCADA — o drop 10.10.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * POR QUE ISTO NÃO É UMA CADÊNCIA DE TRÊS ETAPAS.
 *
 * O desenho óbvio seria uma cadência só, com três etapas: 01/10, 09/10 e
 * 10/10. Ele não sobrevive ao motor, e o defeito é silencioso:
 *
 *   `agenda.ts` conta as etapas por DELAY a partir de uma âncora, e
 *   `reancorarAposEnvio` recalcula a cauda a partir do envio REAL de cada
 *   etapa. É a correção certa para régua de carrinho — "24h depois da
 *   anterior" tem que contar da anterior de verdade. Mas aqui a régua não é
 *   relativa: 10.10 é 10.10.
 *
 *   Basta a primeira onda encostar no teto do dia e escorregar para 02/10
 *   para a véspera cair em 10/10 e o "é hoje!" em 11/10 — anunciando como
 *   futuro um drop que já está no ar, para a base inteira.
 *
 * Por isso cada onda é uma CADÊNCIA PRÓPRIA, de uma etapa só, com delay 0. A
 * data não vive em `delayMinutos`: vive em `ABRE_EM`, aqui, e quem decide é o
 * relógio do tique. Onda que não chegou não semeia; onda que passou não
 * semeia duas vezes (cursor). Nada reancora nada, porque não existe cauda.
 *
 * ── QUEM RECEBE ───────────────────────────────────────────────────────────
 * Onda 1: quem comprou na loja no último ano, com telefone válido e sem
 * opt-out. É relação comercial existente, não lista comprada.
 *
 * Ondas 2 e 3: SÓ quem recebeu a onda 1. Está escrito no próprio texto da
 * Marília — "vim te lembrar" não se diz a quem nunca foi avisado. A regra é
 * lida do banco (quem tem inscrição na onda 1), não de uma lista paralela.
 *
 * ── NASCE DESLIGADA ───────────────────────────────────────────────────────
 * `MV_CAMPANHA_1010=1` arma. Sem isso o observador roda, mede e relata — mas
 * não inscreve ninguém. Campanha de lançamento não pode começar a falar com
 * cliente real por causa de um deploy, e o número de pessoas que ela vai
 * atingir tem que ser visto ANTES, não descoberto depois.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { listarPedidos, primeiroNome, type Pedido } from '@/lib/nuvemshop/loja'
import { chaveTelefone, paraE164 } from './telefone'
import { obterAjustes, type Ajustes } from './config'
import { inscrever } from './observador'
import { CopyIncompleta } from './copy'
import { esqueletoNomeado } from './catalogo-templates'
import { statusDosTemplates } from './canal'

/** A base do convite: quem comprou no último ano. */
const BASE_DIAS = 365
/** Campanha em massa sai atrás de carrinho e pedido, que são de quem agiu agora. */
const PRIORIDADE_EM_MASSA = 2

export const ORIGEM_CAMPANHA = 'campanha_1010'

type Onda = {
  /** Chave curta, usada no cursor e na `refExterna`. */
  id: string
  gatilho: string
  nome: string
  template: string
  /**
   * Instante de abertura, com o fuso ESCRITO. Data sem offset é interpretada
   * como UTC pelo Node no container e a onda abriria 3h antes — às 6h da
   * manhã, fora da janela, o que só apareceria no dia.
   */
  abreEm: string
  /** A onda 1 convida a base; as demais falam só com quem já foi convidado. */
  seguirOnda: string | null
}

const ONDAS: Onda[] = [
  {
    id: 'd1',
    gatilho: 'campanha_1010_save_the_date',
    nome: 'Drop 10.10 · save the date (01/10)',
    template: 'dl_drop_1010_save_the_date_v1',
    abreEm: '2026-10-01T09:00:00-03:00',
    seguirOnda: null,
  },
  {
    id: 'd2',
    gatilho: 'campanha_1010_vespera',
    nome: 'Drop 10.10 · véspera (09/10)',
    template: 'dl_drop_1010_vespera_v1',
    abreEm: '2026-10-09T09:00:00-03:00',
    seguirOnda: 'd1',
  },
  {
    id: 'd3',
    gatilho: 'campanha_1010_chegou',
    nome: 'Drop 10.10 · chegou o dia (10/10)',
    template: 'dl_drop_1010_chegou_v1',
    abreEm: '2026-10-10T09:00:00-03:00',
    seguirOnda: 'd2',
  },
]

const cursorDaOnda = (id: string) => `mv:campanha_1010:${id}`

export type ResultadoOnda = {
  onda: string
  quando: string
  /** Quantas pessoas a onda alcançaria se semeasse agora. */
  alvo: number
  inscritos: number
  /** Motivo pelo qual não semeou. Ausente quando semeou. */
  motivo?: string
  pulados: { motivo: string; quantos: number }[]
  /**
   * Quantos dias o motor levaria para entregar `alvo` com o teto atual.
   * Maior que 1 é defeito de campanha datada: o "é hoje" chegaria amanhã.
   */
  diasParaEntregar: number
}
export type ResultadoCampanha = { armada: boolean; ondas: ResultadoOnda[] }

type Contagem = Map<string, number>
const contar = (m: Contagem, motivo: string) => m.set(motivo, (m.get(motivo) ?? 0) + 1)
const pulados = (m: Contagem) => [...m].map(([motivo, quantos]) => ({ motivo, quantos }))

type Convidada = { chave: string; e164: string; nome: string | null; jaComprou: boolean }

/**
 * A base da loja, por telefone.
 *
 * A chave é a mesma de todo o módulo (8 últimos dígitos), porque é ela que
 * casa loja, CRM e conversa — metade dos contatos não tem o 9º dígito.
 */
async function baseDaLoja(): Promise<{ pessoas: Map<string, Convidada>; semTelefone: number }> {
  const pedidos: Pedido[] = await listarPedidos(new Date(Date.now() - BASE_DIAS * 86_400_000))
  const pessoas = new Map<string, Convidada>()
  let semTelefone = 0

  for (const p of pedidos) {
    if (p.payment_status !== 'paid' || p.status === 'cancelled') continue
    const e164 = paraE164(p.contact_phone)
    const chave = e164 ? chaveTelefone(e164) : ''
    if (!e164 || !chave) {
      semTelefone++
      continue
    }
    const nome = primeiroNome(p.contact_name)
    const antes = pessoas.get(chave)
    if (!antes) pessoas.set(chave, { chave, e164, nome, jaComprou: true })
    else if (!antes.nome && nome) antes.nome = nome
  }

  return { pessoas, semTelefone }
}

/** Quem foi inscrito numa onda anterior — a lista de quem já foi avisado. */
async function quemRecebeu(ondaId: string): Promise<Map<string, Convidada>> {
  const inscricoes = await prisma.mvInscricao.findMany({
    where: { origem: ORIGEM_CAMPANHA, refExterna: { endsWith: `:${ondaId}` } },
    select: { telefoneKey: true, telefoneE164: true, nomeSnapshot: true },
  })
  return new Map(
    inscricoes.map((i) => [
      i.telefoneKey,
      { chave: i.telefoneKey, e164: i.telefoneE164, nome: i.nomeSnapshot, jaComprou: true },
    ]),
  )
}

/** A cadência de um toque da onda. Desligada no banco, fica desligada. */
async function garantirCadencia(onda: Onda) {
  const existente = await prisma.mvCadencia.findFirst({
    where: { gatilho: onda.gatilho },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (existente && existente.etapas.length) return existente

  const cadencia =
    existente ??
    (await prisma.mvCadencia.create({
      data: { nome: onda.nome, gatilho: onda.gatilho, idadeMaximaHoras: null, ativo: true },
    }))

  await prisma.mvCadenciaEtapa.create({
    data: {
      cadenciaId: cadencia.id,
      ordem: 1,
      // Zero de propósito: a data é a abertura da onda, não um delay. Quem
      // atrasa o envio daqui para a frente é o espaçamento do despachante.
      delayMinutos: 0,
      ancoradaEm: 'gatilho',
      templateBase: esqueletoNomeado(onda.template),
      templateNome: onda.template,
      ehUltima: true,
    },
  })

  return prisma.mvCadencia.findFirstOrThrow({
    where: { id: cadencia.id },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
}
type Cadencia = Awaited<ReturnType<typeof garantirCadencia>>

/** As razões para uma onda não semear, na ordem em que valem. */
async function bloqueio(onda: Onda, cadencia: Cadencia, agora: Date): Promise<string | null> {
  if (agora < new Date(onda.abreEm)) return `ainda não abriu (abre em ${onda.abreEm})`
  if (!cadencia.ativo) return `cadência ${onda.nome} desligada`

  const status = await statusDosTemplates()
  if (!status) return 'sem como conferir a aprovação do template (DATAFY_WABA_ID ou canal)'
  const s = status.get(onda.template)
  if (s !== 'APPROVED') return `template ${onda.template} ${s ? s.toLowerCase() : 'ausente'} na Meta`

  return null
}

async function semearOnda(args: {
  onda: Onda
  ajustes: Ajustes
  agora: Date
  armada: boolean
}): Promise<ResultadoOnda> {
  const { onda, ajustes, agora } = args
  const base: ResultadoOnda = {
    onda: onda.nome,
    quando: onda.abreEm,
    alvo: 0,
    inscritos: 0,
    pulados: [],
    diasParaEntregar: 0,
  }

  const jaSemeada = await prisma.mvCursor.findUnique({ where: { chave: cursorDaOnda(onda.id) } })
  if (jaSemeada) return { ...base, motivo: `já semeada em ${jaSemeada.valor}` }

  const cadencia = await garantirCadencia(onda)
  const impedimento = await bloqueio(onda, cadencia, agora)

  // Quem entra: a base da loja na primeira onda, e só quem já foi avisado nas
  // seguintes. Medido mesmo quando bloqueado — é esse número que responde
  // "quantas pessoas isso atinge" antes de armar.
  const contagem: Contagem = new Map()
  let candidatas: Convidada[]
  if (onda.seguirOnda) {
    candidatas = [...(await quemRecebeu(onda.seguirOnda)).values()]
  } else {
    const { pessoas, semTelefone } = await baseDaLoja()
    for (let i = 0; i < semTelefone; i++) contar(contagem, 'sem telefone utilizável')
    candidatas = [...pessoas.values()]
  }

  // Opt-out e nome ausente saem da conta do alvo: não são pessoas alcançáveis.
  const alcancaveis: Convidada[] = []
  for (const c of candidatas) {
    if (!c.nome) {
      contar(contagem, 'sem primeiro nome')
      continue
    }
    const saiu = await prisma.mvOptOut.findUnique({
      where: { telefoneKey: c.chave },
      select: { telefoneKey: true },
    })
    if (saiu) {
      contar(contagem, 'pediu para sair')
      continue
    }
    alcancaveis.push(c)
  }

  const alvo = alcancaveis.length
  const diasParaEntregar = alvo === 0 ? 0 : Math.ceil(alvo / Math.max(1, ajustes.tetoDiario))
  const medido = { ...base, alvo, diasParaEntregar, pulados: pulados(contagem) }

  if (impedimento) return { ...medido, motivo: impedimento }
  if (!args.armada) return { ...medido, motivo: 'campanha não armada (MV_CAMPANHA_1010)' }

  let inscritos = 0
  for (const c of alcancaveis) {
    try {
      await inscrever({
        ajustes,
        cadenciaId: cadencia.id,
        etapas: cadencia.etapas,
        origem: ORIGEM_CAMPANHA,
        // A chave da idempotência: a mesma pessoa não entra duas vezes na
        // mesma onda, e entra uma vez em cada uma das três.
        refExterna: `${c.chave}:${onda.id}`,
        nome: c.nome!,
        e164: c.e164,
        chave: c.chave,
        ancora: agora,
        contexto: { primeiro_nome: c.nome },
        retrato: { campanha: 'drop_1010', onda: onda.id },
        prioridade: PRIORIDADE_EM_MASSA,
      })
      inscritos++
    } catch (e) {
      if (e instanceof CopyIncompleta) contar(contagem, `copy sem ${e.faltando.join('/')}`)
      else if (e instanceof Error && e.name === 'JaInscrito') contar(contagem, 'já inscrito')
      else throw e
    }
  }

  // O cursor é gravado DEPOIS de semear, e só então: gravar antes deixaria a
  // onda marcada como feita se o processo morresse no meio da base.
  await prisma.mvCursor.upsert({
    where: { chave: cursorDaOnda(onda.id) },
    create: { chave: cursorDaOnda(onda.id), valor: agora.toISOString() },
    update: { valor: agora.toISOString() },
  })

  return { ...medido, inscritos, pulados: pulados(contagem) }
}

/**
 * O tique da campanha. Não envia nada — só decide quem entra na fila; quem
 * envia é o despachante, com os guards dele.
 */
export async function observarCampanhas(): Promise<ResultadoCampanha> {
  const armada = process.env.MV_CAMPANHA_1010 === '1'
  const ajustes = await obterAjustes()
  const agora = new Date()

  const ondas: ResultadoOnda[] = []
  for (const onda of ONDAS) {
    ondas.push(await semearOnda({ onda, ajustes, agora, armada }))
  }
  return { armada, ondas }
}
