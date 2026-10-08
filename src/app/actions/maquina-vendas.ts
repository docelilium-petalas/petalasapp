'use server'

/**
 * Server actions da Máquina de Vendas.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * As 4 actions que a Doce Lilium já tinha (getEstadoMaquina, alternarPausa,
 * salvarAjustes, getResultados) + as 23 da CarBoss, traduzidas:
 *
 *   • Ler é para qualquer pessoa logada da equipe; MUDAR o que sai para
 *     cliente (ritmo, pausa, cadência, cancelar/retomar) é só ADMIN — regra da
 *     origem. Antes do porte, qualquer login pausava ou destravava a Máquina.
 *   • "lead/deal/SDR" não existem aqui: a tela fala de cliente, pedido, equipe.
 *   • Lista de teste (`MV_NUMEROS_TESTE`) BLOQUEIA, não redireciona. O aviso
 *     da tela diz isso — a origem dizia "redirecionando para…".
 *   • Cadência de coluna do funil só aceita template cujas variáveis o funil
 *     consegue preencher (hoje: só `primeiro_nome`). O resto vira erro na
 *     tela, não linha ERRO às 9h da manhã.
 *
 * ⚠️ TUDO resiliente à ausência de tabela, de propósito. A migration é ato de
 *    produção e pode ainda não ter rodado quando alguém abrir a tela; `migrado:
 *    false` é a resposta honesta.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import {
  obterAjustes,
  dentroDaJanela,
  numerosDeTeste,
  numeroDeAlerta,
  INSCRICAO_STATUS,
  MENSAGEM_STATUS,
  STATUS_DA_REGUA,
  CURSOR_ULTIMO_ENVIO,
  type Ajustes,
} from '@/lib/maquina-vendas/config'
import { formatarExibicao } from '@/lib/maquina-vendas/telefone'
import { FILTRO_MSG_REGUA } from '@/lib/maquina-vendas/filtros'
import { indicadorPorId, listarIndicadores, periodoDosDias, whereDaTabela, type PeriodoIndicadores } from '@/lib/maquina-vendas/indicadores'
import { provaDeEntrega } from '@/lib/maquina-vendas/prova'
import { buscarCorposAprovados, renderizarCorpo, textoDaLinha, type CorpoAprovado } from '@/lib/maquina-vendas/corpo-template'
import { papelDoTemplate } from '@/lib/maquina-vendas/papeis'
import { parametrosDoTemplate, templateDaEtapa } from '@/lib/maquina-vendas/templates'
import { situacaoDaCadencia } from '@/lib/maquina-vendas/situacao'
import { lerPulsoDoCanal } from '@/lib/maquina-vendas/pulso'
import { listarConversas, type FiltroDeConversas } from '@/lib/maquina-vendas/conversa'
import { dossieDaCliente } from '@/lib/maquina-vendas/dossie'
import { CopyIncompleta, expandirVariantes, montarCopy, validarCopy, validarTemplate } from '@/lib/maquina-vendas/copy'
import { resincronizarCopy } from '@/lib/maquina-vendas/resincronizar'
import {
  CRON_MINUTOS,
  MENSAGENS_POR_TIQUE,
  TETO_DIARIO_MAXIMO,
  capacidadeDoDia,
  distribuirNaJanela,
  inicioDoDiaSP,
  parseJanela,
} from '@/lib/maquina-vendas/janela'
import { observarCarrinhosAbandonados } from '@/lib/maquina-vendas/observador'
import { observarColunas } from '@/lib/maquina-vendas/observador-colunas'
import { rodarParadas } from '@/lib/maquina-vendas/paradas'
import { CATALOGO, problemaParaColuna } from '@/lib/maquina-vendas/catalogo-templates'
import { ehGatilhoDeCampanha, GATILHOS_INTOCAVEIS } from '@/lib/maquina-vendas/cadencias-seed'
import { montarFilaDeAtencao, type FilaDeAtencao } from '@/lib/maquina-vendas/atencao'
import { medirDesempenhoPorToque, type DesempenhoPorToque } from '@/lib/maquina-vendas/desempenho-toque'
import { baldeDaInscricao, ROTULO_DO_BALDE, type Balde } from '@/lib/maquina-vendas/resultado'
import {
  diaSP,
  fimDoDia,
  horaSP,
  inicioDoDia,
  mascararTelefone,
  programacaoDoDia,
  programacaoDoIntervalo,
  type DiaProgramado,
  type ItemProgramado,
} from '@/lib/maquina-vendas/programacao'
import { rodarBateriaPura, type ResultadoDaBateria } from '@/lib/maquina-vendas/bateria-pura'
import {
  CURSOR_BRIEFING,
  CURSOR_DISJUNTOR,
} from '@/lib/maquina-vendas/config'

// ═══════════════════════════════════════════════════════════════════════════
// QUEM PODE
// ═══════════════════════════════════════════════════════════════════════════

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

async function ehAdmin(userId: string): Promise<boolean> {
  const roles = await prisma.userRole.findMany({ where: { userId }, select: { role: true } })
  return roles.some((r) => r.role === 'ADMIN')
}

/** Mudar o que sai para cliente é decisão de quem responde pelo número. */
async function exigirAdmin() {
  const auth = await exigirAuth()
  if (!(await ehAdmin(auth.userId))) {
    throw new Error('Só administradoras mudam o que a Máquina de Vendas manda.')
  }
  return auth
}

async function souAdmin(): Promise<boolean> {
  try {
    const auth = await exigirAuth()
    return await ehAdmin(auth.userId)
  } catch {
    return false
  }
}

/**
 * A tela usa isto só para ESCONDER o que a pessoa não pode fazer (editar ritmo,
 * cadência, abrir a Prontidão). Quem barra de verdade é o servidor: toda ação
 * de escrita chama `exigirAdmin` por conta própria.
 */
export async function getSouAdmin(): Promise<boolean> {
  return souAdmin()
}

/** `true` quando o erro é "a tabela não existe" — Postgres 42P01. */
function tabelaAusente(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('42P01') || msg.includes('does not exist')
}

const mascarar = mascararTelefone
const POR_PAGINA = 30
/** O n8n chama o tique de 5 em 5 min, e o despachante manda 1 por tique. */
/** Mais que isso numa cadência é perseguição — a CarBoss usa 5, a régua DL mais longa tem 3. */
const TETO_POR_CADENCIA = 5

const ROTULO_DA_ORIGEM: Record<string, string> = {
  carrinho: 'carrinho abandonado',
  pedido: 'pedido',
  pedido_pago: 'pedido pago',
  pedido_enviado: 'pedido enviado',
  reativacao: 'reativação',
  colecao_nova: 'coleção nova',
  lista_desejos: 'lista de desejos',
  campanha_1010: 'drop 10.10',
  funil: 'coluna do funil',
}
const rotuloDaOrigem = (o: string) => ROTULO_DA_ORIGEM[o] ?? o.replace(/_/g, ' ')

// ═══════════════════════════════════════════════════════════════════════════
// AS 4 QUE A DOCE LILIUM JÁ TINHA (mantidas; só o "hoje" passou a ser de SP)
// ═══════════════════════════════════════════════════════════════════════════

export type EstadoMaquina = {
  migrado: boolean
  ajustes: Ajustes
  janelaAberta: boolean
  indicadores: {
    cadenciasAtivas: number
    inscricoesAtivas: number
    naFila: number
    enviadasHoje: number
    responderam: number
    converteram: number
    optOuts: number
  }
  proximas: {
    id: string
    inscricaoId: string
    nome: string
    telefone: string
    etapa: number
    quando: string
    texto: string
    cadencia: string
    origem: string
    status: string
  }[]
  cadencias: {
    id: string
    nome: string
    gatilho: string
    ativo: boolean
    etapas: number
    inscricoes: number
  }[]
}

const ESTADO_VAZIO = (ajustes: Ajustes): EstadoMaquina => ({
  migrado: false,
  ajustes,
  janelaAberta: dentroDaJanela(ajustes),
  indicadores: {
    cadenciasAtivas: 0, inscricoesAtivas: 0, naFila: 0,
    enviadasHoje: 0, responderam: 0, converteram: 0, optOuts: 0,
  },
  proximas: [],
  cadencias: [],
})

export async function getEstadoMaquina(): Promise<EstadoMaquina> {
  await exigirAuth()
  const ajustes = await obterAjustes()

  try {
    // Meia-noite de SÃO PAULO. O container roda em UTC: `setHours(0)` contava
    // "hoje" a partir das 21h de ontem.
    const inicioDoDiaHoje = inicioDoDiaSP(new Date())

    // Uma ação só, com o paralelismo AQUI dentro: o Next despacha server
    // actions uma por vez por cliente.
    const [cadencias, inscricoesAtivas, naFila, enviadasHoje, responderam, converteram, optOuts, proximas] =
      await Promise.all([
        prisma.mvCadencia.findMany({
          include: { _count: { select: { etapas: true, inscricoes: true } } },
          orderBy: { createdAt: 'asc' },
        }),
        prisma.mvInscricao.count({ where: { status: 'ATIVA' } }),
        prisma.mvMensagem.count({ where: { status: 'AGENDADA' } }),
        prisma.mvMensagem.count({ where: { status: 'ENVIADA', enviadaEm: { gte: inicioDoDiaHoje } } }),
        prisma.mvInscricao.count({ where: { respondeuEm: { not: null } } }),
        prisma.mvInscricao.count({ where: { converteuEm: { not: null } } }),
        prisma.mvOptOut.count(),
        // 200 e não 25: a aba "por conversa" agrupa por pessoa, e cortar em 25
        // mensagens cortaria conversas pela metade.
        prisma.mvMensagem.findMany({
          where: { status: { in: ['AGENDADA', 'ENVIADA'] } },
          orderBy: { agendadaPara: 'asc' },
          take: 200,
          include: { inscricao: { include: { cadencia: { select: { nome: true } } } } },
        }),
      ])

    return {
      migrado: true,
      ajustes,
      janelaAberta: dentroDaJanela(ajustes),
      indicadores: {
        cadenciasAtivas: cadencias.filter((c) => c.ativo).length,
        inscricoesAtivas, naFila, enviadasHoje, responderam, converteram, optOuts,
      },
      proximas: proximas.map((m) => ({
        id: m.id,
        inscricaoId: m.inscricaoId,
        nome: m.inscricao.nomeSnapshot,
        telefone: formatarExibicao(m.inscricao.telefoneE164),
        etapa: m.etapaOrdem,
        quando: m.agendadaPara.toISOString(),
        texto: m.mensagemFinal,
        cadencia: m.inscricao.cadencia.nome,
        origem: m.inscricao.origem,
        status: m.status,
      })),
      cadencias: cadencias.map((c) => ({
        id: c.id,
        nome: c.nome,
        gatilho: c.gatilho,
        ativo: c.ativo,
        etapas: c._count.etapas,
        inscricoes: c._count.inscricoes,
      })),
    }
  } catch (e) {
    if (tabelaAusente(e)) return ESTADO_VAZIO(ajustes)
    throw e
  }
}

/** O freio de mão. Fecha a porta sem apagar cadência nenhuma. */
export async function alternarPausa(pausar: boolean): Promise<{ ok: boolean; envioPausado: boolean }> {
  const auth = await exigirAdmin()
  const atual = await obterAjustes()
  try {
    await prisma.mvAjustes.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...atual, envioPausado: pausar, atualizadoPor: auth.email },
      update: { envioPausado: pausar, atualizadoPor: auth.email },
    })
    await logAjuste(pausar ? 'AVISO' : 'INFO', pausar ? 'Máquina pausada pela tela' : 'Máquina liberada pela tela', auth.email, { envioPausado: pausar })
    revalidatePath('/maquina-vendas')
    return { ok: true, envioPausado: pausar }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false, envioPausado: atual.envioPausado }
    throw e
  }
}

/** Ritmo e limites — editável por quem responde pelo número, não por quem faz deploy. */
export async function salvarAjustes(dados: Partial<Ajustes>): Promise<{ ok: boolean }> {
  const auth = await exigirAdmin()
  const atual = await obterAjustes()
  const novo = { ...atual, ...dados }
  validarRitmo(novo)

  try {
    await prisma.mvAjustes.upsert({
      where: { id: 'unico' },
      create: { id: 'unico', ...novo, atualizadoPor: auth.email },
      update: { ...novo, atualizadoPor: auth.email },
    })
    await logAjuste(novo.envioPausado ? 'AVISO' : 'INFO', `Ritmo da Máquina alterado: ${resumoDoRitmo(novo)}`, auth.email, {
      de: resumoDoRitmo(atual),
      para: resumoDoRitmo(novo),
    })
    revalidatePath('/maquina-vendas')
    return { ok: true }
  } catch (e) {
    if (tabelaAusente(e)) return { ok: false }
    throw e
  }
}

export type LinhaResultado = {
  id: string
  nome: string
  telefone: string
  cadencia: string
  origem: string
  entrouEm: string
  enviadas: number
  respondeuEm: string | null
  converteuEm: string | null
  valor: number | null
  status: string
  balde: Balde
  rotuloBalde: string
}

/** Uma linha por PESSOA — o que aconteceu com quem a Máquina abordou. */
export async function getResultados(dias = 30): Promise<{ migrado: boolean; linhas: LinhaResultado[] }> {
  await exigirAuth()
  const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000)
  try {
    const inscricoes = await prisma.mvInscricao.findMany({
      where: { createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: {
        cadencia: { select: { nome: true } },
        _count: { select: { mensagens: true } },
      },
    })
    return {
      migrado: true,
      linhas: inscricoes.map((i) => {
        const balde = baldeDaInscricao(i)
        return {
          id: i.id,
          nome: i.nomeSnapshot,
          telefone: formatarExibicao(i.telefoneE164),
          cadencia: i.cadencia.nome,
          origem: i.origem,
          entrouEm: i.createdAt.toISOString(),
          enviadas: i.tentativas,
          respondeuEm: i.respondeuEm?.toISOString() ?? null,
          converteuEm: i.converteuEm?.toISOString() ?? null,
          valor: i.valorConvertido ? Number(i.valorConvertido) : null,
          status: i.status,
          balde,
          rotuloBalde: ROTULO_DO_BALDE[balde],
        }
      }),
    }
  } catch (e) {
    if (tabelaAusente(e)) return { migrado: false, linhas: [] }
    throw e
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TABELA DE MENSAGENS (getMvTabela)
// ═══════════════════════════════════════════════════════════════════════════

export type MvFiltros = {
  statusMensagem?: string
  statusInscricao?: string
  busca?: string
  /** Recorte de um cartão de indicador — o clique no número abre ESTA tabela. */
  indicador?: string
  /**
   * O período do painel (dias SP, inclusivos). `undefined` = hoje, `null` =
   * tudo. Sem cartão escolhido, a tabela mostra as mensagens que SAÍRAM ou
   * estavam MARCADAS para o período; com cartão, o recorte do cartão no período.
   */
  periodo?: { de: string; ate: string } | null
}

/** "o que aconteceu ou ia acontecer nestes dias" — o recorte da tabela sem cartão. */
function mensagensDoPeriodo(P: PeriodoIndicadores): Record<string, unknown> | null {
  if (!P) return null
  const entre = { gte: P.inicio, lt: P.fim }
  return { OR: [{ enviadaEm: entre }, { enviadaEm: null, agendadaPara: entre }] }
}

/** Período em palavras, para a tela não ter que reconstruir. */
function descreverPeriodo(dias: { de: string; ate: string } | null, hoje: string): { de: string | null; ate: string | null; rotulo: string; ehHoje: boolean; umDia: boolean } {
  if (!dias) return { de: null, ate: null, rotulo: 'todo o período', ehHoje: false, umDia: false }
  const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
  const umDia = dias.de === dias.ate
  return {
    de: dias.de,
    ate: dias.ate,
    rotulo: umDia ? (dias.de === hoje ? `hoje (${br(dias.de)})` : br(dias.de)) : `${br(dias.de)} a ${br(dias.ate)}`,
    ehHoje: umDia && dias.de === hoje,
    umDia,
  }
}

export async function getMvTabela(filtros: MvFiltros = {}, pagina = 1) {
  await exigirAuth()
  const agora = new Date()

  const where: Record<string, unknown> = {}
  const naRegua = filtros.statusMensagem === FILTRO_MSG_REGUA
  if (naRegua) where.status = { in: [...STATUS_DA_REGUA] }
  else if (filtros.statusMensagem) where.status = filtros.statusMensagem

  const inscricaoWhere: Record<string, unknown> = {}
  if (filtros.statusInscricao) inscricaoWhere.status = filtros.statusInscricao
  if (filtros.busca?.trim()) {
    const b = filtros.busca.trim()
    const digitos = b.replace(/\D/g, '')
    inscricaoWhere.OR = [
      { nomeSnapshot: { contains: b, mode: 'insensitive' } },
      ...(digitos ? [{ telefoneE164: { contains: digitos } }] : []),
    ]
  }
  if (Object.keys(inscricaoWhere).length > 0) where.inscricao = inscricaoWhere

  const P = periodoDosDias(filtros.periodo, agora, inicioDoDia)
  const ind = filtros.indicador ? indicadorPorId(filtros.indicador, agora, P) : null
  // Com cartão, o cartão já carrega o período (do jeito dele). Sem cartão, a
  // tabela segue o período do painel — um filtro só para a tela inteira.
  const recortes = [ind ? whereDaTabela(ind) : mensagensDoPeriodo(P)].filter((r): r is Record<string, unknown> => !!r)
  const whereFinal: Record<string, unknown> = recortes.length ? { AND: [where, ...recortes] } : where

  const total = await prisma.mvMensagem.count({ where: whereFinal })

  // "Na régua" esconde as encerradas; a tela diz QUANTAS ficaram escondidas.
  let ocultas = 0
  if (naRegua) {
    const semStatus: Record<string, unknown> = { ...where }
    delete semStatus.status
    const whereSemStatus = recortes.length ? { AND: [semStatus, ...recortes] } : semStatus
    ocultas = (await prisma.mvMensagem.count({ where: whereSemStatus })) - total
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const p = Math.min(Math.max(1, pagina), totalPaginas)

  const linhas = await prisma.mvMensagem.findMany({
    where: whereFinal,
    include: {
      inscricao: {
        include: { cadencia: { select: { nome: true, gatilho: true, etapas: { select: { id: true } } } } },
      },
    },
    orderBy: [{ inscricao: { createdAt: 'desc' } }, { inscricaoId: 'asc' }, { etapaOrdem: 'asc' }],
    skip: (p - 1) * POR_PAGINA,
    take: POR_PAGINA,
  })

  // Coluna do funil só existe para cadência de coluna; o resto mostra a origem.
  const dealIds = [...new Set(linhas.map((l) => l.inscricao.dealId).filter((d): d is string => !!d))]
  const deals = dealIds.length
    ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, stage: { select: { nome: true } } } })
    : []
  const colunaDoDeal = new Map(deals.map((d) => [d.id, d.stage?.nome ?? null]))

  return {
    total,
    ocultas,
    pagina: p,
    totalPaginas,
    recorte: ind ? { id: ind.id, rotulo: ind.rotulo, unidade: ind.unidade, ajuda: ind.ajuda, retrato: !!ind.retrato } : null,
    periodo: descreverPeriodo(filtros.periodo === undefined ? { de: diaSP(agora), ate: diaSP(agora) } : filtros.periodo, diaSP(agora)),
    linhas: linhas.map((l) => ({
      id: l.id,
      inscricaoId: l.inscricaoId,
      cliente: l.inscricao.nomeSnapshot,
      telefone: mascarar(l.inscricao.telefoneE164),
      origem: (l.inscricao.dealId && colunaDoDeal.get(l.inscricao.dealId)) || rotuloDaOrigem(l.inscricao.origem),
      cadencia: l.inscricao.cadencia.nome,
      etapa: `${l.etapaOrdem}/${l.inscricao.cadencia.etapas.length}`,
      quando: (l.enviadaEm ?? l.agendadaPara).toISOString(),
      texto: textoDaLinha(l),
      mensagem: l.mensagemFinal,
      template: l.templateNome,
      enviadas: `${l.inscricao.tentativas}/${l.inscricao.cadencia.etapas.length}`,
      statusMensagem: l.status,
      statusInscricao: l.inscricao.status,
      motivoParada: l.inscricao.motivoParada,
      erro: l.erro,
      prova: provaDeEntrega(l, agora),
    })),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TEMPLATES NA TELA DAS CADÊNCIAS
// ═══════════════════════════════════════════════════════════════════════════

export type TemplateDaEtapaNaTela = {
  nome: string
  papel: string | null
  porque: string | null
  /** Status na Meta (APPROVED/PENDING/REJECTED) — null quando não deu para ler. */
  status: string | null
  categoria: string | null
  /** O corpo APROVADO, com nome de exemplo. Null quando a Meta não respondeu. */
  corpo: string | null
  botoes: string[]
}

const NOME_DE_PROVA = 'Ana'
const CONTEXTO_DE_PROVA = {
  primeiro_nome: NOME_DE_PROVA,
  peca: 'Vestido Luna',
  pedido: '#1042',
  cupom: 'MINHADL',
  desconto: '10%',
  rastreio: 'api/r/rastreio/1042.exemplo',
  colecao: 'Primavera',
  prazo: 'hoje às 23h59',
  link: 'docelilium.com.br',
}

function templateNaTela(
  cadenciaNome: string,
  ordem: number,
  templateNome: string | null,
  corpos: Map<string, CorpoAprovado>,
): TemplateDaEtapaNaTela | null {
  const t = templateDaEtapa(cadenciaNome, ordem, templateNome)
  if (!t) return null
  const aprovado = corpos.get(t.nome)
  const papel = papelDoTemplate(t.nome)
  return {
    nome: t.nome,
    papel: papel?.papel ?? null,
    porque: papel?.porque ?? null,
    status: aprovado?.status ?? null,
    categoria: aprovado?.categoria ?? null,
    corpo: aprovado ? renderizarCorpo(aprovado.corpo, parametrosDoTemplate(t, CONTEXTO_DE_PROVA).valores) : null,
    botoes: aprovado?.botoes ?? [],
  }
}

/** cadênciaId → ordem → template. Lê a Meta uma vez (cache de 1h do corpo-template). */
export async function getTemplatesDasCadencias(): Promise<Record<string, Record<number, TemplateDaEtapaNaTela | null>>> {
  await exigirAuth()
  const corpos = await buscarCorposAprovados()
  const cadencias = await prisma.mvCadencia.findMany({
    select: { id: true, nome: true, etapas: { select: { ordem: true, templateNome: true } } },
    orderBy: { createdAt: 'asc' },
  })
  return Object.fromEntries(
    cadencias.map((c) => [
      c.id,
      Object.fromEntries(c.etapas.map((e) => [e.ordem, templateNaTela(c.nome, e.ordem, e.templateNome, corpos)])),
    ]),
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// CADÊNCIAS
// ═══════════════════════════════════════════════════════════════════════════

export async function getMvCadencias() {
  await exigirAuth()
  const cadencias = await prisma.mvCadencia.findMany({
    include: { etapas: { orderBy: { ordem: 'asc' } }, _count: { select: { inscricoes: true } } },
    orderBy: { createdAt: 'asc' },
  })
  const stageIds = cadencias.map((c) => c.stageId).filter((s): s is string => !!s)
  const stages = stageIds.length
    ? await prisma.stage.findMany({ where: { id: { in: stageIds } }, select: { id: true, nome: true } })
    : []
  const nomeDoStage = new Map(stages.map((s) => [s.id, s.nome]))

  const lista = cadencias.map((c) => ({
    id: c.id,
    nome: c.nome,
    gatilho: c.gatilho,
    origem: c.stageId ? 'coluna do funil' : rotuloDaOrigem(c.gatilho),
    ativo: c.ativo,
    /** Campanha datada tem calendário próprio e não se edita pela tela. */
    protegida: GATILHOS_INTOCAVEIS.has(c.gatilho) || ehGatilhoDeCampanha(c.gatilho),
    situacao: situacaoDaCadencia({
      nome: c.nome,
      gatilho: c.gatilho,
      ativo: c.ativo,
      // A Doce Lilium não arquiva coluna: coluna que sumiu é a que importa.
      colunaArquivada: !!c.stageId && !nomeDoStage.has(c.stageId),
      inscricoes: c._count.inscricoes,
      etapasComTemplate: c.etapas.filter((e) => e.templateNome).length,
    }),
    coluna: c.stageId ? (nomeDoStage.get(c.stageId) ?? '(coluna apagada)') : null,
    pipelineId: c.pipelineId,
    stageId: c.stageId,
    inscricoes: c._count.inscricoes,
    etapas: c.etapas.map((e) => ({
      ordem: e.ordem,
      delayMinutos: e.delayMinutos,
      ancoradaEm: e.ancoradaEm,
      ehUltima: e.ehUltima,
      templateBase: e.templateBase,
      templateNome: e.templateNome,
      foraDoTeto: e.ordem > TETO_POR_CADENCIA,
    })),
  }))

  return lista.sort((a, b) => a.situacao.peso - b.situacao.peso || a.nome.localeCompare(b.nome))
}

export async function alternarCadencia(cadenciaId: string, ativo: boolean) {
  const auth = await exigirAdmin()
  const cad = await prisma.mvCadencia.findUnique({ where: { id: cadenciaId }, select: { nome: true, gatilho: true } })
  if (!cad) throw new Error('Cadência não encontrada.')
  if (GATILHOS_INTOCAVEIS.has(cad.gatilho)) {
    throw new Error('A campanha do drop tem calendário próprio e não liga/desliga por aqui.')
  }
  await prisma.mvCadencia.update({ where: { id: cadenciaId }, data: { ativo } })
  await logAjuste('INFO', `Cadência ${ativo ? 'ligada' : 'desligada'}: ${cad.nome}`, auth.email, { cadenciaId, ativo })
  revalidatePath('/maquina-vendas')
}

/** Funis e colunas, com quantos pedidos abertos cada uma tem e que cadência a observa. */
export async function getColunasParaAcompanhamento() {
  await exigirAuth()
  const pipelines = await prisma.pipeline.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, stages: { select: { id: true, nome: true, ordem: true }, orderBy: { ordem: 'asc' } } },
    orderBy: [{ ordem: 'asc' }, { createdAt: 'asc' }],
  })
  const porStage = await prisma.deal.groupBy({ by: ['stageId'], where: { status: 'OPEN' }, _count: { _all: true } })
  const abertos = new Map(porStage.map((g) => [g.stageId, g._count._all]))
  const cadencias = await prisma.mvCadencia.findMany({
    where: { stageId: { not: null } },
    select: { id: true, nome: true, stageId: true, gatilho: true, ativo: true },
  })
  return pipelines.map((p) => ({
    id: p.id,
    nome: p.nome,
    stages: p.stages.map((s) => ({
      id: s.id,
      nome: s.nome,
      abertos: abertos.get(s.id) ?? 0,
      cadencias: cadencias.filter((c) => c.stageId === s.id).map((c) => ({ id: c.id, nome: c.nome, gatilho: c.gatilho, ativo: c.ativo })),
    })),
  }))
}

/** Para o kanban avisar "esta coluna manda mensagem" antes de alguém arrastar um card. */
export async function getAcompanhamentoDaColuna(stageId: string) {
  await exigirAuth()
  if (!stageId) return null
  const cadencias = await prisma.mvCadencia.findMany({
    where: { stageId, ativo: true },
    select: { nome: true, _count: { select: { etapas: true } } },
  })
  if (cadencias.length === 0) return null
  return {
    nomes: cadencias.map((c) => c.nome),
    mensagensPorCliente: Math.max(...cadencias.map((c) => c._count.etapas)),
  }
}

export type EtapaInput = {
  ordem: number
  delayMinutos: number
  /** Texto livre (só sai dentro da janela de 24h) OU referência do template. */
  templateBase: string
  /** Template aprovado na Meta. Fora da janela de 24h, é o ÚNICO jeito de chegar. */
  templateNome?: string | null
}

export type CadenciaInput = {
  nome: string
  pipelineId: string
  stageId: string
  /** Para coluna do funil é sempre `funil`. */
  gatilho?: string
  etapas: EtapaInput[]
}

/** Mesma regra da tela: `problemaParaColuna` mora no catálogo, que é puro. */
const problemaDoTemplate = problemaParaColuna

/**
 * A prévia de cada etapa, com os erros que a impediriam de ser salva. A tela
 * chama a cada edição; criar/atualizar chamam de novo no servidor.
 */
export async function validarEtapasCadencia(etapas: EtapaInput[]) {
  await exigirAuth()
  const contexto = { primeiro_nome: NOME_DE_PROVA }
  const corpos = await buscarCorposAprovados()

  return etapas.map((etapa, i) => {
    // Só régua de 2+ toques tem "última" a anunciar (ver `resincronizar.ts`).
    const ehUltima = i === etapas.length - 1 && etapas.length > 1
    const previas: Array<{ rotulo: string; texto: string; erros: string[] }> = []

    if (etapa.templateNome) {
      const problema = problemaDoTemplate(etapa.templateNome)
      const aprovado = corpos.get(etapa.templateNome)
      const erros = problema ? [problema] : []
      if (!problema && aprovado && aprovado.status !== 'APPROVED') erros.push(`A Meta diz ${aprovado.status} para "${etapa.templateNome}".`)
      const texto = aprovado
        ? renderizarCorpo(aprovado.corpo, [NOME_DE_PROVA])
        : '(a Meta não respondeu agora — o corpo aparece quando ela voltar)'
      previas.push({ rotulo: `template ${etapa.templateNome}`, texto, erros })
    } else {
      let textos: string[] = []
      const erros: string[] = [...validarTemplate(etapa.templateBase)]
      try {
        textos = expandirVariantes(etapa.templateBase).map((t, iv) => montarCopy(t, contexto, `prova:${iv}`))
      } catch (e) {
        erros.push(e instanceof CopyIncompleta ? `Usa ${e.faltando.join(', ')}, que um card do funil não tem.` : String(e))
      }
      textos.forEach((t, iv) => {
        for (const e of validarCopy(t, { ehUltima }).erros) erros.push(textos.length > 1 ? `variante ${iv + 1}: ${e}` : e)
      })
      erros.push('Sem template: só chega a quem falou com a loja nas últimas 24h. Para as demais, escolha um template aprovado.')
      previas.push({ rotulo: textos.length > 1 ? `texto livre — ${textos.length} variantes` : 'texto livre', texto: textos[0] ?? '', erros })
    }

    // O aviso de 24h não bloqueia: é informação. Só ele sozinho = ok.
    const bloqueantes = previas.flatMap((p) => p.erros).filter((e) => !e.startsWith('Sem template:'))
    return { ordem: etapa.ordem, ehUltima, previas, ok: bloqueantes.length === 0 }
  })
}

function validarInput(input: CadenciaInput) {
  if (!input.nome.trim()) throw new Error('Dê um nome à cadência.')
  if (!input.pipelineId || !input.stageId) throw new Error('Escolha o funil e a coluna.')
  if (input.etapas.length === 0) throw new Error('Configure ao menos uma mensagem.')
  if (input.etapas.length > TETO_POR_CADENCIA) throw new Error(`Máximo de ${TETO_POR_CADENCIA} mensagens por cadência.`)
  const gatilho = (input.gatilho ?? 'funil').trim()
  if (GATILHOS_INTOCAVEIS.has(gatilho) || ehGatilhoDeCampanha(gatilho)) {
    throw new Error('Campanha com data não se cria por aqui — ela tem calendário próprio.')
  }
  for (const e of input.etapas) {
    if (!Number.isInteger(e.delayMinutos) || e.delayMinutos < 0) throw new Error(`Espera inválida na mensagem ${e.ordem}.`)
    if (!e.templateBase.trim() && !e.templateNome) throw new Error(`Mensagem ${e.ordem} está vazia.`)
  }
}

async function assertCopyValida(etapas: EtapaInput[]) {
  const resultado = await validarEtapasCadencia(etapas)
  const ruins = resultado.filter((r) => !r.ok)
  if (ruins.length > 0) {
    const detalhe = ruins
      .map((r) => `mensagem ${r.ordem}: ${[...new Set(r.previas.flatMap((p) => p.erros).filter((e) => !e.startsWith('Sem template:')))].join('; ')}`)
      .join(' · ')
    throw new Error(`A mensagem não passou na validação — ${detalhe}`)
  }
}

function ehDuplicataDeCadencia(e: unknown): boolean {
  if ((e as { code?: string })?.code === 'P2002') return true
  return String(e).includes('Unique constraint failed')
}

function etapasParaGravar(etapas: EtapaInput[]) {
  return etapas.map((e, i) => ({
    ordem: e.ordem,
    delayMinutos: e.delayMinutos,
    // Com template, a referência é o corpo do catálogo — o texto que de fato sai.
    templateBase: e.templateBase.trim() || (CATALOGO.find((c) => c.nome === e.templateNome)?.corpo ?? e.templateNome ?? ''),
    templateNome: e.templateNome || null,
    ehUltima: i === etapas.length - 1,
  }))
}

/** Nasce DESLIGADA: ligar é um segundo ato, depois de ver o estoque. */
export async function criarCadencia(input: CadenciaInput) {
  const auth = await exigirAdmin()
  validarInput(input)
  await assertCopyValida(input.etapas)

  const stage = await prisma.stage.findFirst({ where: { id: input.stageId, pipelineId: input.pipelineId }, select: { id: true } })
  if (!stage) throw new Error('Essa coluna não pertence ao funil escolhido.')

  try {
    const criada = await prisma.mvCadencia.create({
      data: {
        nome: input.nome.trim(),
        gatilho: (input.gatilho ?? 'funil').trim(),
        pipelineId: input.pipelineId,
        stageId: input.stageId,
        ativo: false,
        etapas: { create: etapasParaGravar(input.etapas) },
      },
      select: { id: true },
    })
    await logAjuste('INFO', `Cadência criada (desligada): ${input.nome.trim()}`, auth.email, { cadenciaId: criada.id })
    revalidatePath('/maquina-vendas')
    return criada
  } catch (e) {
    if (ehDuplicataDeCadencia(e)) throw new Error('Já existe uma cadência desse tipo nesta coluna.')
    throw e
  }
}

export async function atualizarCadencia(cadenciaId: string, input: CadenciaInput) {
  const auth = await exigirAdmin()
  validarInput(input)
  await assertCopyValida(input.etapas)

  const atual = await prisma.mvCadencia.findUnique({ where: { id: cadenciaId }, select: { id: true, gatilho: true, stageId: true } })
  if (!atual) throw new Error('Cadência não encontrada.')
  if (GATILHOS_INTOCAVEIS.has(atual.gatilho) || ehGatilhoDeCampanha(atual.gatilho)) {
    throw new Error('A campanha do drop não se edita pela tela.')
  }
  if (!atual.stageId) {
    throw new Error('Cadência da loja (carrinho, pedido, marketing) é definida no código, com template aprovado na Meta — não pela tela.')
  }

  const stage = await prisma.stage.findFirst({ where: { id: input.stageId, pipelineId: input.pipelineId }, select: { id: true } })
  if (!stage) throw new Error('Essa coluna não pertence ao funil escolhido.')

  try {
    // Apaga e recria as etapas: a ordem é a chave natural e pode ter mudado.
    await prisma.$transaction([
      prisma.mvCadenciaEtapa.deleteMany({ where: { cadenciaId } }),
      prisma.mvCadencia.update({
        where: { id: cadenciaId },
        data: {
          nome: input.nome.trim(),
          gatilho: (input.gatilho ?? 'funil').trim(),
          pipelineId: input.pipelineId,
          stageId: input.stageId,
          etapas: { create: etapasParaGravar(input.etapas) },
        },
      }),
    ])
    // Mensagem AGENDADA com o texto antigo é realinhada; a que já saiu, nunca.
    const resync = await resincronizarCopy({ cadenciaId, aplicar: true })
    await logAjuste('INFO', `Cadência alterada: ${input.nome.trim()}`, auth.email, { cadenciaId, resync })
    revalidatePath('/maquina-vendas')
    return { mensagensRealinhadas: resync.realinhadas, mensagensJaAlinhadas: resync.jaAlinhadas, avisos: resync.problemas }
  } catch (e) {
    if (ehDuplicataDeCadencia(e)) throw new Error('Já existe uma cadência desse tipo nesta coluna.')
    throw e
  }
}

/** Apagar só sem histórico. Com histórico, desligue — o Resultados depende dela. */
export async function excluirCadencia(cadenciaId: string) {
  const auth = await exigirAdmin()
  const cad = await prisma.mvCadencia.findUnique({ where: { id: cadenciaId }, select: { nome: true, gatilho: true } })
  if (!cad) throw new Error('Cadência não encontrada.')
  if (GATILHOS_INTOCAVEIS.has(cad.gatilho)) throw new Error('A campanha do drop não se apaga.')
  const inscricoes = await prisma.mvInscricao.count({ where: { cadenciaId } })
  if (inscricoes > 0) {
    throw new Error(`Esta cadência já tem ${inscricoes} cliente(s) no histórico. Desligue em vez de apagar.`)
  }
  await prisma.mvCadencia.delete({ where: { id: cadenciaId } })
  await logAjuste('AVISO', `Cadência apagada: ${cad.nome}`, auth.email, { cadenciaId })
  revalidatePath('/maquina-vendas')
}

/** Antes de ligar: quantas clientes já estão paradas nesta coluna e quanto tempo a fila leva. */
export async function preverEstoqueDaCadencia(cadenciaId: string) {
  await exigirAuth()
  const cad = await prisma.mvCadencia.findUnique({
    where: { id: cadenciaId },
    select: { stageId: true, pipelineId: true, _count: { select: { etapas: true } } },
  })
  if (!cad) throw new Error('Cadência não encontrada.')
  if (!cad.stageId) {
    return { novos: 0, etapasPorCliente: cad._count.etapas, mensagens: 0, diasParaEsvaziar: 0, tetoDiario: (await obterAjustes()).tetoDiario, aplicavel: false }
  }

  const jaTiveram = await prisma.mvInscricao.findMany({
    where: { cadenciaId, dealId: { not: null } },
    select: { dealId: true },
    distinct: ['dealId'],
  })
  const excluir = jaTiveram.map((i) => i.dealId).filter((d): d is string => !!d)
  const novos = await prisma.deal.count({
    where: {
      stageId: cad.stageId,
      ...(cad.pipelineId ? { pipelineId: cad.pipelineId } : {}),
      status: 'OPEN',
      ...(excluir.length ? { id: { notIn: excluir } } : {}),
    },
  })
  const ajustes = await obterAjustes()
  const porCliente = Math.min(cad._count.etapas, TETO_POR_CADENCIA)
  return {
    novos,
    etapasPorCliente: porCliente,
    mensagens: novos * porCliente,
    diasParaEsvaziar: ajustes.tetoDiario > 0 ? Math.ceil((novos * porCliente) / ajustes.tetoDiario) : 0,
    tetoDiario: ajustes.tetoDiario,
    aplicavel: true,
  }
}

/**
 * Roda os observadores e as paradas agora, sem esperar o tique. NÃO despacha
 * e NÃO roda a campanha 10.10 — isso continua só no relógio.
 */
export async function rodarObservadorManual() {
  const auth = await exigirAdmin()
  const agora = new Date()
  const carrinhos = await observarCarrinhosAbandonados()
  const colunas = await observarColunas(agora)
  const p = await rodarParadas()
  await logAjuste('INFO', 'Observadores rodados pela tela', auth.email, { carrinhos, colunas: { ...colunas, detalhes: colunas.detalhes.slice(0, 20) }, paradas: p.paradas })
  revalidatePath('/maquina-vendas')
  return {
    carrinhos,
    inicializado: colunas.inicializado ?? false,
    eventosVistos: colunas.eventosVistos,
    inscricoesCriadas: colunas.inscricoesCriadas + carrinhos.inscritos,
    inscricoesComErro: colunas.inscricoesComErro,
    estoqueInscritos: colunas.estoqueInscritos,
    sobraramParaProximoTick: colunas.sobraramParaProximoTick,
    paradas: p.paradas,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// INSCRIÇÕES — pausar, retomar, cancelar
// ═══════════════════════════════════════════════════════════════════════════

async function inscricaoEditavel(inscricaoId: string) {
  const i = await prisma.mvInscricao.findUnique({
    where: { id: inscricaoId },
    select: { status: true, cadencia: { select: { gatilho: true } } },
  })
  if (!i) throw new Error('Inscrição não encontrada.')
  if (GATILHOS_INTOCAVEIS.has(i.cadencia.gatilho)) throw new Error('A campanha do drop não se altera cliente a cliente por aqui.')
  return i
}

export async function pausarInscricao(inscricaoId: string) {
  const auth = await exigirAdmin()
  const i = await inscricaoEditavel(inscricaoId)
  if (i.status !== INSCRICAO_STATUS.ATIVA) throw new Error('Só dá para pausar uma cadência ativa.')
  await prisma.mvInscricao.update({
    where: { id: inscricaoId },
    data: { status: INSCRICAO_STATUS.PAUSADA, motivoParada: `pausada na tela por ${auth.email}` },
  })
  revalidatePath('/maquina-vendas')
}

/** Ao retomar, o que venceu enquanto estava pausado é redistribuído na janela — nunca tudo de uma vez. */
export async function retomarInscricao(inscricaoId: string) {
  await exigirAdmin()
  const i = await inscricaoEditavel(inscricaoId)
  if (i.status !== INSCRICAO_STATUS.PAUSADA) throw new Error('Só dá para retomar uma cadência pausada.')

  const ajustes = await obterAjustes()
  const agora = new Date()
  const vencidas = await prisma.mvMensagem.findMany({
    where: { inscricaoId, status: MENSAGEM_STATUS.AGENDADA, agendadaPara: { lte: agora } },
    orderBy: { etapaOrdem: 'asc' },
    select: { id: true },
  })
  const horarios = distribuirNaJanela(agora, vencidas.length, parseJanela(ajustes.janelaInicio, ajustes.janelaFim))

  await prisma.$transaction([
    prisma.mvInscricao.update({ where: { id: inscricaoId }, data: { status: INSCRICAO_STATUS.ATIVA, motivoParada: null } }),
    ...vencidas.map((m, k) => prisma.mvMensagem.update({ where: { id: m.id }, data: { agendadaPara: horarios[k] } })),
  ])
  revalidatePath('/maquina-vendas')
}

export async function cancelarInscricao(inscricaoId: string) {
  const auth = await exigirAdmin()
  const i = await inscricaoEditavel(inscricaoId)
  const permitidos: string[] = [INSCRICAO_STATUS.ATIVA, INSCRICAO_STATUS.PAUSADA, INSCRICAO_STATUS.ERRO]
  if (!permitidos.includes(i.status)) throw new Error('Esta cadência não pode ser cancelada.')
  const motivo = `cancelada na tela por ${auth.email}`
  await prisma.$transaction([
    prisma.mvInscricao.update({ where: { id: inscricaoId }, data: { status: INSCRICAO_STATUS.CANCELADA, motivoParada: motivo } }),
    prisma.mvMensagem.updateMany({
      where: { inscricaoId, status: MENSAGEM_STATUS.AGENDADA },
      data: { status: MENSAGEM_STATUS.CANCELADA, erro: motivo },
    }),
  ])
  revalidatePath('/maquina-vendas')
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL (getMvDashboard)
// ═══════════════════════════════════════════════════════════════════════════

export type AvisoMv = {
  nivel: 'critico' | 'atencao' | 'info'
  titulo: string
  detalhe: string
}

/**
 * `periodo`: dias SP inclusivos ('YYYY-MM-DD'). Omitido = hoje; `null` = tudo.
 * Os avisos e o espaçamento são SEMPRE do agora — o período só recorta os cartões.
 */
export async function getMvDashboard(periodo?: { de: string; ate: string } | null) {
  await exigirAuth()
  const ajustes = await obterAjustes()
  const agora = new Date()
  const hoje = diaSP(agora)
  const dias = periodo === undefined ? { de: hoje, ate: hoje } : periodo

  const lista = listarIndicadores(agora, periodoDosDias(dias, agora, inicioDoDia))
  const contagens = await Promise.all(
    lista.map((ind) => (ind.mensagem ? prisma.mvMensagem.count({ where: ind.mensagem }) : prisma.mvInscricao.count({ where: ind.inscricao }))),
  )
  const indicadores = lista.map((ind, i) => ({
    id: ind.id,
    rotulo: ind.rotulo,
    unidade: ind.unidade,
    ajuda: ind.ajuda,
    grupo: ind.grupo,
    tom: ind.tom,
    base: ind.base ?? null,
    retrato: !!ind.retrato,
    valor: contagens[i],
  }))
  const valorDe = (id: string) => indicadores.find((i) => i.id === id)?.valor ?? 0

  // Quanto falta para o próximo envio poder sair (intervalo MÍNIMO desde o último).
  const ultimo = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_ULTIMO_ENVIO } })
  const ultimoEm = ultimo ? new Date(ultimo.valor) : null
  const liberaEm = ultimoEm && !Number.isNaN(ultimoEm.getTime()) ? ultimoEm.getTime() + ajustes.intervaloMinMinutos * 60_000 : 0
  const esperaMinutos = liberaEm > agora.getTime() ? Math.ceil((liberaEm - agora.getTime()) / 60_000) : 0

  return {
    periodo: descreverPeriodo(dias, hoje),
    hoje,
    indicadores,
    ativas: valorDe('ativas'),
    agendadasHoje: valorDe('agendadasHoje'),
    vencidas: valorDe('vencidas'),
    enviadasHoje: valorDe('enviadasHoje'),
    responderam: valorDe('responderam'),
    comErro: valorDe('comErro'),
    tetoDiario: ajustes.tetoDiario,
    envioPausado: ajustes.envioPausado,
    janelaAberta: dentroDaJanela(ajustes, agora),
    listaDeTeste: (numerosDeTeste() ?? []).map(mascarar),
    esperaMinutos,
    intervaloMin: ajustes.intervaloMinMinutos,
    intervaloMax: ajustes.intervaloMaxMinutos,
    avisos: await montarAvisos(ajustes, valorDe('vencidas'), valorDe('ativas')),
    pulso: await lerPulsoDoCanal(agora).catch((e) => {
      console.error('[maquina-vendas] pulso do canal ilegível:', e instanceof Error ? e.message : e)
      return null
    }),
  }
}

async function montarAvisos(ajustes: Ajustes, vencidas: number, ativas: number): Promise<AvisoMv[]> {
  const avisos: AvisoMv[] = []
  try {
    if (ajustes.envioPausado) {
      avisos.push({
        nivel: 'critico',
        titulo: 'Envio pausado',
        detalhe: 'Nenhuma cliente recebe mensagem enquanto isto estiver ligado. A fila continua crescendo. Desligar na aba Ritmo e limites.',
      })
    }
    const { canalConfigurado } = await import('@/lib/maquina-vendas/canal')
    if (!(await canalConfigurado())) {
      avisos.push({
        nivel: 'critico',
        titulo: 'Canal oficial sem credencial',
        detalhe: 'A integração Datafy (WhatsApp oficial) não está ativa no CRM. Nada sai.',
      })
    } else {
      const { statusDoNumero, canalSaudavel } = await import('@/lib/maquina-vendas/datafy')
      const s = await statusDoNumero()
      if (!canalSaudavel(s)) {
        avisos.push({
          nivel: 'critico',
          titulo: 'Número bloqueado ou fora do ar',
          detalhe: `A Meta diz: status ${s?.status ?? '?'} · qualidade ${s?.qualidade ?? '?'} · envio ${s?.podeEnviar ?? '?'}.`,
        })
      }
    }
    if (vencidas > ajustes.tetoDiario) {
      avisos.push({
        nivel: 'atencao',
        titulo: 'A fila não esvazia no ritmo atual',
        detalhe:
          `${vencidas} mensagens vencidas contra um teto de ${ajustes.tetoDiario}/dia. ` +
          `São ${Math.ceil(vencidas / Math.max(1, ajustes.tetoDiario))} dia(s) só para zerar o atraso, ` +
          `sem contar o que ${ativas} cadências ativas ainda vão gerar.`,
      })
    }
    if (ajustes.intervaloMinMinutos < CRON_MINUTOS) {
      avisos.push({
        nivel: 'atencao',
        titulo: `Intervalo mínimo abaixo de ${CRON_MINUTOS} min`,
        detalhe:
          `Está em ${ajustes.intervaloMinMinutos} min. O tique roda de ${CRON_MINUTOS} em ${CRON_MINUTOS}, então isto não acelera nada — ` +
          'só encosta o sorteio no piso e devolve a cadência de metrônomo, que é o padrão que derruba número.',
      })
    }
    const lista = numerosDeTeste()
    if (lista && lista.length) {
      avisos.push({
        nivel: 'info',
        titulo: 'Modo de teste',
        detalhe: `Só ${lista.length} número(s) da lista de teste recebem. Para qualquer outra cliente o envio é BLOQUEADO e registrado — nunca redirecionado.`,
      })
    }
    if (!numeroDeAlerta()) {
      avisos.push({
        nivel: 'atencao',
        titulo: 'Sem número de alerta',
        detalhe: 'MV_ALERTA_NUMERO não está configurado: se o canal adoecer, o vigia puxa o freio mas não avisa ninguém no WhatsApp.',
      })
    }
  } catch (e) {
    avisos.push({ nivel: 'atencao', titulo: 'Não consegui conferir o canal', detalhe: e instanceof Error ? e.message : String(e) })
  }
  return avisos
}

// ═══════════════════════════════════════════════════════════════════════════
// RITMO E LIMITES (getMvAjustes / salvarMvAjustes)
// ═══════════════════════════════════════════════════════════════════════════

export type CapacidadeDaTela = {
  /** Quantas mensagens o RELÓGIO consegue mandar num dia com esta janela. */
  mensagens: number
  tiques: number
  passoMinutos: number
  /** O que sai de fato: o menor entre o teto e o relógio. */
  efetivo: number
  /** Teto acima do que o relógio alcança — a tela avisa. */
  tetoInalcancavel: boolean
}

export type AjustesDaTela = {
  tetoDiario: number
  intervaloMinMinutos: number
  intervaloMaxMinutos: number
  janelaInicio: string
  janelaFim: string
  envioPausado: boolean
  atualizadoEm: Date | null
  atualizadoPor: string | null
}

function capacidade(a: { tetoDiario: number; intervaloMinMinutos: number; intervaloMaxMinutos: number; janelaInicio: string; janelaFim: string }): CapacidadeDaTela {
  const c = capacidadeDoDia({
    janela: parseJanela(a.janelaInicio, a.janelaFim),
    cronMinutos: CRON_MINUTOS,
    intervaloMinMinutos: a.intervaloMinMinutos,
    intervaloMaxMinutos: a.intervaloMaxMinutos,
    mensagensPorTick: MENSAGENS_POR_TIQUE,
  })
  return { ...c, efetivo: Math.min(a.tetoDiario, c.mensagens), tetoInalcancavel: a.tetoDiario > c.mensagens }
}

export async function getMvAjustes(): Promise<AjustesDaTela & { vindoDoPadrao: boolean; capacidade: CapacidadeDaTela; cupomCarrinho: string | null; descontoCarrinho: string | null }> {
  await exigirAuth()
  let linha: Awaited<ReturnType<typeof prisma.mvAjustes.findUnique>> = null
  try {
    linha = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  } catch (e) {
    if (!tabelaAusente(e)) throw e
  }
  const a = await obterAjustes()
  return {
    tetoDiario: a.tetoDiario,
    intervaloMinMinutos: a.intervaloMinMinutos,
    intervaloMaxMinutos: a.intervaloMaxMinutos,
    janelaInicio: a.janelaInicio,
    janelaFim: a.janelaFim,
    envioPausado: a.envioPausado,
    cupomCarrinho: a.cupomCarrinho,
    descontoCarrinho: a.descontoCarrinho,
    atualizadoEm: linha?.atualizadoEm ?? null,
    atualizadoPor: linha?.atualizadoPor ?? null,
    vindoDoPadrao: !linha,
    capacidade: capacidade(a),
  }
}

function validarRitmo(a: { tetoDiario: number; intervaloMinMinutos: number; intervaloMaxMinutos: number; janelaInicio: string; janelaFim: string }) {
  const teto = Math.trunc(Number(a.tetoDiario))
  const min = Math.trunc(Number(a.intervaloMinMinutos))
  const max = Math.trunc(Number(a.intervaloMaxMinutos))
  if (!Number.isFinite(teto) || teto < 1 || teto > TETO_DIARIO_MAXIMO)
    throw new Error(`Teto diário fora do aceito (1 a ${TETO_DIARIO_MAXIMO}). O limite é de propósito: número já foi bloqueado por volume.`)
  if (!Number.isFinite(min) || min < 1) throw new Error('O intervalo mínimo tem que ser ao menos 1 minuto.')
  if (!Number.isFinite(max) || max > 240) throw new Error('O intervalo máximo passou de 4 horas.')
  if (min > max) throw new Error('O intervalo mínimo ficou maior que o máximo.')
  if (min === max) throw new Error('Deixe uma folga entre o mínimo e o máximo: intervalo fixo tem cara de robô.')
  const janela = parseJanela(a.janelaInicio, a.janelaFim)
  if (janela.fimMin - janela.inicioMin < 120) throw new Error('A janela ficou com menos de 2 horas — não cabe a fila do dia.')
}

const resumoDoRitmo = (a: { tetoDiario: number; intervaloMinMinutos: number; intervaloMaxMinutos: number; janelaInicio: string; janelaFim: string; envioPausado: boolean }) =>
  `${a.tetoDiario}/dia · ${a.intervaloMinMinutos}-${a.intervaloMaxMinutos} min · ${a.janelaInicio}-${a.janelaFim}${a.envioPausado ? ' · PAUSADO' : ''}`

export async function salvarMvAjustes(input: Omit<AjustesDaTela, 'atualizadoEm' | 'atualizadoPor'>) {
  const auth = await exigirAdmin()
  const dados = {
    tetoDiario: Math.trunc(Number(input.tetoDiario)),
    intervaloMinMinutos: Math.trunc(Number(input.intervaloMinMinutos)),
    intervaloMaxMinutos: Math.trunc(Number(input.intervaloMaxMinutos)),
    janelaInicio: input.janelaInicio,
    janelaFim: input.janelaFim,
    envioPausado: Boolean(input.envioPausado),
  }
  validarRitmo(dados)
  const antes = await obterAjustes()
  await prisma.mvAjustes.upsert({
    where: { id: 'unico' },
    update: { ...dados, atualizadoPor: auth.email },
    create: { id: 'unico', ...antes, ...dados, atualizadoPor: auth.email },
  })
  await logAjuste(dados.envioPausado ? 'AVISO' : 'INFO', `Ritmo da Máquina alterado: ${resumoDoRitmo(dados)}`, auth.email, {
    de: resumoDoRitmo(antes),
    para: resumoDoRitmo(dados),
  })
  revalidatePath('/maquina-vendas')
  return { ok: true as const }
}

/** Toda mudança de quem fala com cliente fica no histórico, com quem mudou. */
async function logAjuste(nivel: 'INFO' | 'AVISO', titulo: string, por: string, dados: unknown) {
  try {
    await prisma.logEvento.create({
      data: {
        origem: 'maquina-vendas',
        nivel,
        tipo: 'mv_ajustes',
        titulo: titulo.slice(0, 200),
        detalhe: `por: ${por}`,
        dados: JSON.stringify(dados).slice(0, 4000),
      },
    })
  } catch (e) {
    // O ajuste já foi gravado; perder o histórico não o desfaz, mas não some calado.
    console.error('[maquina-vendas] não gravei o histórico do ajuste:', e instanceof Error ? e.message : e)
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CONVERSAS, DOSSIÊ, ATENÇÃO, DESEMPENHO
// ═══════════════════════════════════════════════════════════════════════════

export async function getMvConversas(filtro: FiltroDeConversas = {}) {
  await exigirAuth()
  const agora = new Date()
  const { conversas, total } = await listarConversas(filtro, agora)
  return { conversas, total, agora: agora.toISOString() }
}

export async function getDossieDoContato(inscricaoId: string) {
  await exigirAuth()
  const d = await dossieDaCliente(inscricaoId)
  // O link sai do servidor (CHATWOOT_URL + conta): a tela não carrega URL fixa
  // de instância — na origem ela era hardcoded e apontava para outra empresa.
  const { configChatwoot } = await import('@/lib/maquina-vendas/chatwoot-api')
  const cfg = configChatwoot()
  const linkChatwoot = cfg && d.conversaChatwootId ? `${cfg.url}/app/accounts/${cfg.conta}/conversations/${d.conversaChatwootId}` : null
  return { ...d, telefone: mascarar(d.telefone), linkChatwoot }
}

/** A fila de conversas que pedem uma pessoa (categorias da fala real da DL). */
export async function getFilaDeAtencao(dias = 30): Promise<FilaDeAtencao> {
  await exigirAuth()
  return montarFilaDeAtencao(new Date(Date.now() - dias * 86_400_000))
}

/** Qual toque da régua faz a cliente responder. */
export async function getDesempenhoPorToque(dias = 60, cadenciaId?: string): Promise<DesempenhoPorToque> {
  await exigirAuth()
  return medirDesempenhoPorToque({ desde: new Date(Date.now() - dias * 86_400_000), ...(cadenciaId ? { cadenciaId } : {}) })
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMAÇÃO — o que sai em cada dia
// ═══════════════════════════════════════════════════════════════════════════

export type { DiaProgramado, ItemProgramado, FatiaDeCadencia } from '@/lib/maquina-vendas/programacao'

export type ProgramacaoDaTela = {
  dias: DiaProgramado[]
  hoje: string
  tetoEfetivo: number
  tetoDiario: number
  capacidadeDoRelogio: number
  janelaInicio: string
  janelaFim: string
  envioPausado: boolean
  /** AGENDADAS de dias que já passaram — saem antes de tudo quando o envio voltar. */
  atrasadas: number
}

export async function getProgramacao(de: string, ate: string): Promise<ProgramacaoDaTela> {
  await exigirAuth()
  const ajustes = await getMvAjustes()
  const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)
  const hoje = diaSP(new Date())
  const [dias, atrasadas] = await Promise.all([
    programacaoDoIntervalo(prisma, de, ate, { tetoEfetivo: ajustes.capacidade.efetivo, janela }),
    prisma.mvMensagem.count({ where: { status: MENSAGEM_STATUS.AGENDADA, agendadaPara: { lt: inicioDoDia(hoje) } } }),
  ])
  return {
    dias,
    hoje,
    tetoEfetivo: ajustes.capacidade.efetivo,
    tetoDiario: ajustes.tetoDiario,
    capacidadeDoRelogio: ajustes.capacidade.mensagens,
    janelaInicio: ajustes.janelaInicio,
    janelaFim: ajustes.janelaFim,
    envioPausado: ajustes.envioPausado,
    atrasadas,
  }
}

export async function getProgramacaoDoDia(dia: string): Promise<ItemProgramado[]> {
  await exigirAuth()
  return programacaoDoDia(prisma, dia)
}

// ═══════════════════════════════════════════════════════════════════════════
// PRONTIDÃO — só admin, só leitura. NUNCA dispara mensagem.
// ═══════════════════════════════════════════════════════════════════════════

export type ChecagemDeProntidao = {
  id: string
  titulo: string
  /** `true` pronto · `false` não pronto · `null` não deu para medir agora. */
  ok: boolean | null
  detalhe: string
  /** Falha grave = nada sai, ou sai errado. As demais são aviso. */
  grave: boolean
}

export type Prontidao = {
  bateria: ResultadoDaBateria
  checagens: ChecagemDeProntidao[]
  medidoEm: string
}

async function medir(id: string, titulo: string, grave: boolean, fn: () => Promise<{ ok: boolean | null; detalhe: string }>): Promise<ChecagemDeProntidao> {
  try {
    return { id, titulo, grave, ...(await fn()) }
  } catch (e) {
    // Não conseguir medir NÃO é verde.
    return { id, titulo, grave, ok: null, detalhe: `não deu para medir: ${e instanceof Error ? e.message : String(e)}` }
  }
}

export async function getProntidao(): Promise<Prontidao> {
  await exigirAdmin()
  const agora = new Date()
  const bateria = rodarBateriaPura()

  const checagens = await Promise.all([
    medir('migracao', 'Banco migrado (paridade CarBoss)', true, async () => {
      try {
        await prisma.mvMensagem.findFirst({ select: { textoEntregue: true } })
        await prisma.mvInscricao.findFirst({ select: { perfil: true } })
        return { ok: true, detalhe: 'Colunas textoEntregue e perfil existem.' }
      } catch (e) {
        return { ok: false, detalhe: `A migration 20261004000001_mv_paridade_carboss não rodou: ${e instanceof Error ? e.message.slice(0, 160) : e}` }
      }
    }),
    medir('canal', 'Canal oficial com credencial', true, async () => {
      const { canalConfigurado } = await import('@/lib/maquina-vendas/canal')
      const ok = await canalConfigurado()
      return { ok, detalhe: ok ? 'Datafy configurada.' : 'Sem credencial da Datafy: nada sai.' }
    }),
    medir('numero', 'Número +55 62 9963-0120 saudável na Meta', true, async () => {
      const { statusDoNumero, canalSaudavel } = await import('@/lib/maquina-vendas/datafy')
      const s = await statusDoNumero()
      if (!s) return { ok: null, detalhe: 'A Meta não respondeu.' }
      return { ok: canalSaudavel(s), detalhe: `status ${s.status} · qualidade ${s.qualidade} · envio ${s.podeEnviar}` }
    }),
    medir('templates', 'Templates do catálogo aprovados', true, async () => {
      const { statusDosTemplates } = await import('@/lib/maquina-vendas/canal')
      const st = await statusDosTemplates()
      if (!st) return { ok: null, detalhe: 'A Meta não devolveu a lista de templates.' }
      const deCliente = CATALOGO.filter((t) => t.trilha !== 'operacao')
      const faltam = deCliente.filter((t) => st.get(t.nome) !== 'APPROVED').map((t) => `${t.nome} (${st.get(t.nome) ?? 'não existe'})`)
      const porta = CATALOGO.filter((t) => t.trilha === 'operacao').map((t) => `${t.nome}: ${st.get(t.nome) ?? 'não submetido'}`)
      return {
        ok: faltam.length === 0,
        detalhe: `${deCliente.length - faltam.length}/${deCliente.length} de cliente aprovados${faltam.length ? ` · faltam: ${faltam.join(', ')}` : ''} · ${porta.join(' · ')}`,
      }
    }),
    medir('disjuntor', 'Disjuntor do canal', true, async () => {
      // Quando desarma, o vigia pausa o envio e assina `atualizadoPor = "disjuntor · CÓDIGO"`.
      const linha = await prisma.mvAjustes.findUnique({ where: { id: 'unico' }, select: { envioPausado: true, atualizadoPor: true } })
      const c = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_DISJUNTOR } })
      const armado = !!linha?.envioPausado && (linha.atualizadoPor ?? '').startsWith('disjuntor')
      return {
        ok: !armado,
        detalhe: armado
          ? `O disjuntor puxou o freio (${linha?.atualizadoPor}). Ver o motivo no log antes de liberar.`
          : c ? `fechado · último código visto: ${c.valor}` : 'fechado · nunca desarmou',
      }
    }),
    medir('tique', 'Tique do relógio rodando', true, async () => {
      const ultimo = await prisma.logEvento.findFirst({
        where: { origem: 'maquina-vendas', tipo: { in: ['tique', 'tique_parcial', 'tique_falhou'] } },
        orderBy: { createdAt: 'desc' },
        select: { tipo: true, createdAt: true, titulo: true },
      })
      if (!ultimo) return { ok: false, detalhe: 'Nenhum tique registrado ainda.' }
      const min = Math.round((agora.getTime() - ultimo.createdAt.getTime()) / 60_000)
      if (ultimo.tipo !== 'tique') return { ok: false, detalhe: `Último tique (${min} min atrás) terminou como ${ultimo.tipo}: ${ultimo.titulo}` }
      return { ok: min <= 15, detalhe: `último tique completo há ${min} min${min > 15 ? ' — o n8n parou de chamar?' : ''}` }
    }),
    medir('segredos', 'Segredos de ambiente presentes', true, async () => {
      // APP_URL não é segredo e tem padrão em `rastreio.ts` — reprovar a prontidão por ela era alarme falso.
      const faltam = ['CRON_SECRET', 'JWT_SECRET'].filter((k) => !process.env[k])
      const base = process.env.APP_URL ? 'APP_URL definida' : 'APP_URL no padrão https://petalas.docelilium.com.br'
      return { ok: faltam.length === 0, detalhe: faltam.length ? `faltam: ${faltam.join(', ')}` : `CRON_SECRET e JWT_SECRET definidos (valores não exibidos) · ${base}.` }
    }),
    medir('lista', 'Lista de teste (MV_NUMEROS_TESTE)', false, async () => {
      const l = numerosDeTeste()
      if (l === null) return { ok: true, detalhe: 'Produção: sem lista, todas as clientes podem receber.' }
      if (l.length === 0) return { ok: false, detalhe: 'A env existe mas nenhum número presta: NINGUÉM recebe (falha fechada).' }
      return { ok: true, detalhe: `Modo teste: só ${l.map(mascarar).join(', ')} recebem. O resto é bloqueado e registrado.` }
    }),
    medir('pausa', 'Envio liberado', false, async () => {
      const a = await obterAjustes()
      return { ok: !a.envioPausado, detalhe: a.envioPausado ? 'Pausado na aba Ritmo e limites: a fila cresce e nada sai.' : resumoDoRitmo(a) }
    }),
    medir('alerta', 'Número de alerta do vigia', false, async () => {
      const n = numeroDeAlerta()
      return { ok: !!n, detalhe: n ? `alerta vai para ${mascarar(n)}` : 'MV_ALERTA_NUMERO ausente: o vigia freia mas só registra no log.' }
    }),
    medir('chatwoot', 'Chatwoot ligado', false, async () => {
      const { faltasDoChatwoot } = await import('@/lib/maquina-vendas/chatwoot-api')
      const f = faltasDoChatwoot()
      return { ok: f.length === 0, detalhe: f.length ? `faltam: ${f.join(', ')} — sem nota no Chatwoot e sem etiqueta de equipe` : 'URL, conta, caixa e token presentes.' }
    }),
    medir('briefing', 'Briefing do dia', false, async () => {
      const { numeroDoBriefing } = await import('@/lib/maquina-vendas/briefing')
      const n = numeroDoBriefing()
      const ultimo = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_BRIEFING } })
      return { ok: !!n, detalhe: n ? `vai para ${mascarar(n)}${ultimo ? ` · último: ${ultimo.valor}` : ' · nunca enviado'}` : 'MV_BRIEFING_NUMERO ausente: o briefing não sai.' }
    }),
    medir('campanha', 'Drop 10.10 presente e intocado', true, async () => {
      const cads = await prisma.mvCadencia.findMany({
        where: { gatilho: { in: [...GATILHOS_INTOCAVEIS] } },
        select: { gatilho: true, ativo: true, _count: { select: { inscricoes: true } } },
        orderBy: { gatilho: 'asc' },
      })
      return {
        ok: cads.length === GATILHOS_INTOCAVEIS.size,
        detalhe: cads.map((c) => `${c.gatilho}: ${c._count.inscricoes} inscrita(s)${c.ativo ? '' : ' (desligada)'}`).join(' · ') || 'nenhuma cadência do drop encontrada',
      }
    }),
    medir('pulso', 'Webhook da Meta chegando', false, async () => {
      // O cursor guarda JSON ({"em": ...}), não uma data — ler com `new Date(valor)` dava sempre
      // "nenhum webhook registrado". A leitura é a mesma da faixa do painel, para as duas não discordarem.
      const p = await lerPulsoDoCanal(agora)
      return { ok: p.nivel !== 'critico', detalhe: `${p.titulo} — ${p.detalhe}` }
    }),
  ])

  return { bateria, checagens, medidoEm: agora.toISOString() }
}

export type ResumoDeHoje = {
  dia: string
  enviadas: number
  restantes: number
  erros: number
  atrasadas: number
  amanha: number
  proxima: { hora: string; nome: string; cadenciaNome: string } | null
  envioPausado: boolean
  cabe: boolean
  janelaInicio: string
  janelaFim: string
}

/** O cartão "mensagens de hoje" do painel inicial. Só admin vê; para as demais, null. */
export async function getResumoDeHojeMv(): Promise<ResumoDeHoje | null> {
  if (!(await souAdmin())) return null
  try {
    const ajustes = await getMvAjustes()
    const janela = parseJanela(ajustes.janelaInicio, ajustes.janelaFim)
    const hoje = diaSP(new Date())
    const amanha = diaSP(new Date(inicioDoDia(hoje).getTime() + 26 * 3600 * 1000))

    const [dias, atrasadas, proximaLinha] = await Promise.all([
      programacaoDoIntervalo(prisma, hoje, amanha, { tetoEfetivo: ajustes.capacidade.efetivo, janela }),
      prisma.mvMensagem.count({ where: { status: MENSAGEM_STATUS.AGENDADA, agendadaPara: { lt: inicioDoDia(hoje) } } }),
      prisma.mvMensagem.findFirst({
        where: { status: MENSAGEM_STATUS.AGENDADA, agendadaPara: { gte: inicioDoDia(hoje), lt: fimDoDia(hoje) } },
        orderBy: { agendadaPara: 'asc' },
        select: { agendadaPara: true, inscricao: { select: { nomeSnapshot: true, cadencia: { select: { nome: true } } } } },
      }),
    ])
    const doDia = dias.find((d) => d.dia === hoje)
    const doDiaSeguinte = dias.find((d) => d.dia === amanha)
    return {
      dia: hoje,
      enviadas: doDia?.enviadas ?? 0,
      restantes: doDia?.agendadas ?? 0,
      erros: doDia?.erros ?? 0,
      atrasadas,
      amanha: doDiaSeguinte?.agendadas ?? 0,
      proxima: proximaLinha
        ? { hora: horaSP(proximaLinha.agendadaPara), nome: proximaLinha.inscricao.nomeSnapshot, cadenciaNome: proximaLinha.inscricao.cadencia.nome }
        : null,
      envioPausado: ajustes.envioPausado,
      cabe: doDia?.cabe ?? true,
      janelaInicio: ajustes.janelaInicio,
      janelaFim: ajustes.janelaFim,
    }
  } catch (e) {
    if (tabelaAusente(e)) return null
    throw e
  }
}
