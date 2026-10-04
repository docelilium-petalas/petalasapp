/**
 * O BRIEFING DAS 08:00 — o que a Máquina vai falar hoje, e com quem a equipe
 * deve falar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte do `briefing.ts` do CRM CarBoss. O vigia avisa quando o canal está
 * doente; este arquivo responde a pergunta de manhã: *quem recebe mensagem
 * hoje, o que exatamente cada cliente vai ler, e em quem vale a Marília gastar
 * um contato pessoal.* Num texto só, no WhatsApp, pelo número oficial.
 *
 * ── As fontes ─────────────────────────────────────────────────────────────
 *   1. `MvMensagem` do dia  — AGENDADA + ENVIADA + ERRO, recorte igual ao do
 *      calendário (`programacao.ts`).
 *   2. Os corpos aprovados  — o texto que a cliente VAI ler, renderizado com
 *      os `variaveis` congelados na semeadura (o que a Meta recebe).
 *   3. `MvResposta`         — as falas da cliente (só turnos `cliente`; o eco
 *      da loja fica fora, senão a Máquina mede a própria voz como interesse).
 *   4. `Deal → Stage`       — só quando a inscrição veio de um card do funil.
 *
 * ── A fila de contato não é a lista do dia ────────────────────────────────
 * Quem responde tem a régua parada (`paradas.ts`): a cliente mais quente é
 * justamente a que NÃO tem mensagem hoje. Por isso a fila junta quem recebe
 * hoje E quem falou com a gente nas últimas 72 h.
 *
 * ── A janela de 24 h: BATER NA PORTA ──────────────────────────────────────
 *   08:00  texto livre recusado (131047) → `dl_relatorio_pronto_v1`, UTILITY,
 *                                          botão de RESPOSTA RÁPIDA
 *   toque em "Quero ver"                 → mensagem de entrada: abre a janela
 *   ≤5 min depois, no tique seguinte     → o relatório inteiro sai
 * O texto livre é tentado ANTES do template: com a janela aberta o relatório
 * chega direto, sem conversa paga. A porta é batida UMA vez por dia.
 *
 * ⚠️ Carimbo do relatório: DEPOIS da parte 1, ANTES das outras (duplicar o
 *    relatório é pior que perder a parte 3). Carimbo da porta: ANTES do envio
 *    (template em duplicata custa dinheiro todo tique).
 *
 * ── Diferenças da origem, todas de propósito ──────────────────────────────
 *  · Sem número embutido no código: `MV_BRIEFING_NUMERO` → `MV_ALERTA_NUMERO`;
 *    nenhum dos dois = o briefing não sai e diz por quê.
 *  · A Doce Lilium envia todos os dias (sem guarda de domingo).
 *  · O envio passa pela saída única do canal — com `MV_NUMEROS_TESTE` ligado,
 *    número fora da lista é VETADO (e registrado), nunca redirecionado.
 *  · Falha não é engolida: vira `LogEvento` ERRO e o tique reporta `erro`.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import {
  CURSOR_BRIEFING,
  CURSOR_BRIEFING_AVISO,
  CURSOR_BRIEFING_PORTA,
  MENSAGEM_STATUS,
  numeroDeAlerta,
  obterAjustes,
} from './config'
import { CODIGO_JANELA_FECHADA } from './datafy'
import { canalConfigurado, enviarMensagemLivre, enviarTemplate, ErroCanal } from './canal'
import { paraParedeSP } from './janela'
import { diaSP, horaSP, inicioDoDia, fimDoDia, mascararTelefone } from './programacao'
import { templateDaEtapa, templatesDaCadencia } from './templates'
import { buscarCorposAprovados, textoEntregueDoTemplate } from './corpo-template'
import { chaveTelefone, primeiroNome } from './telefone'
import { lerTurnosCrus } from './respostas'
import { lerTemperatura, seloDaTemperatura, type Leitura } from './temperatura'

const JANELA_CONVERSA_MS = 72 * 3600_000
const MAX_NA_FILA = 8
/** WhatsApp corta em 4096; 3.400 deixa folga para "(2/4)" e emoji. */
const LIMITE_DA_PARTE = 3400
const RESUMO_DO_TEXTO = 150
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const TIPO_LOG = 'mv_briefing'

export interface LinhaDoBriefing {
  inscricaoId: string
  nome: string
  telefone: string
  hora: string
  status: string
  cadencia: string
  etapaOrdem: number
  totalEtapas: number
  coluna: string | null
  templateNome: string | null
  texto: string
  /** `true` = é a copy da cadência, NÃO o corpo aprovado. */
  textoIncerto: boolean
  respondeu: boolean
  leitura: Leitura
}

export interface NaFila {
  nome: string
  telefone: string
  coluna: string | null
  leitura: Leitura
  hojeRecebe: { hora: string; cadencia: string; etapaOrdem: number } | null
}

export interface BriefingDoDia {
  dia: string
  agora: Date
  pausado: boolean
  tetoDiario: number
  linhas: LinhaDoBriefing[]
  fila: NaFila[]
  vetados: Array<{ nome: string; motivo: string }>
  avisos: string[]
}

type FalaDaCliente = { ultima: Date | null; quantas: number; falas: string[] }

/** As falas de todas de uma vez — uma consulta, não uma por cliente. */
async function falasPorChave(chaves: string[]): Promise<Map<string, FalaDaCliente>> {
  const mapa = new Map<string, FalaDaCliente>()
  if (!chaves.length) return mapa
  const linhas = await prisma.mvResposta.findMany({
    where: { telefoneKey: { in: chaves } },
    select: { telefoneKey: true, ultimasMsgs: true },
  })
  for (const l of linhas) {
    const delas = lerTurnosCrus(l.ultimasMsgs)
      .filter((t) => t.de === 'cliente')
      .sort((a, b) => b.em.getTime() - a.em.getTime())
    mapa.set(l.telefoneKey, {
      ultima: delas[0]?.em ?? null,
      quantas: delas.length,
      falas: delas.slice(0, 3).map((t) => t.texto),
    })
  }
  return mapa
}

const SELECT_INSCRICAO = {
  id: true,
  nomeSnapshot: true,
  telefoneE164: true,
  telefoneKey: true,
  dealId: true,
  respondeuEm: true,
  humanoFalouEm: true,
  converteuEm: true,
  cadencia: { select: { nome: true } },
} as const

type InscricaoLida = {
  id: string
  nomeSnapshot: string
  telefoneE164: string
  telefoneKey: string
  dealId: string | null
  respondeuEm: Date | null
  humanoFalouEm: Date | null
  converteuEm: Date | null
  cadencia: { nome: string }
}

/** Monta o relato do dia. NÃO envia nada — o script imprime exatamente o que sairia. */
export async function montarBriefing(agora: Date = new Date()): Promise<BriefingDoDia> {
  const dia = diaSP(agora)
  const inicio = inicioDoDia(dia)
  const fim = fimDoDia(dia)
  const ajustes = await obterAjustes()

  const mensagens = await prisma.mvMensagem.findMany({
    where: {
      status: { in: [MENSAGEM_STATUS.AGENDADA, MENSAGEM_STATUS.ENVIADA, MENSAGEM_STATUS.ERRO] },
      OR: [{ agendadaPara: { gte: inicio, lt: fim } }, { enviadaEm: { gte: inicio, lt: fim } }],
    },
    orderBy: [{ agendadaPara: 'asc' }, { id: 'asc' }],
    take: 2000,
    select: {
      id: true,
      inscricaoId: true,
      etapaOrdem: true,
      status: true,
      agendadaPara: true,
      enviadaEm: true,
      mensagemFinal: true,
      textoEntregue: true,
      templateNome: true,
      variaveis: true,
      inscricao: { select: SELECT_INSCRICAO },
    },
  })
  const doDia = mensagens.filter((m) => {
    const quando = m.status === MENSAGEM_STATUS.ENVIADA && m.enviadaEm ? m.enviadaEm : m.agendadaPara
    return quando >= inicio && quando < fim
  })

  const recentes = (await prisma.mvInscricao.findMany({
    where: { respondeuEm: { gte: new Date(agora.getTime() - JANELA_CONVERSA_MS) } },
    select: SELECT_INSCRICAO,
    orderBy: { respondeuEm: 'desc' },
    take: 500,
  })) as InscricaoLida[]

  const dealIds = [
    ...new Set([...doDia.map((m) => m.inscricao.dealId), ...recentes.map((i) => i.dealId)].filter((d): d is string => !!d)),
  ]
  const deals = dealIds.length
    ? await prisma.deal.findMany({ where: { id: { in: dealIds } }, select: { id: true, stage: { select: { nome: true } } } })
    : []
  const colunaDoDeal = new Map(deals.map((d) => [d.id, d.stage?.nome ?? null] as const))
  const coluna = (i: { dealId: string | null }) => (i.dealId ? (colunaDoDeal.get(i.dealId) ?? null) : null)

  const chaves = [
    ...new Set([...doDia.map((m) => m.inscricao.telefoneKey), ...recentes.map((i) => i.telefoneKey)].filter((c) => c?.length === 8)),
  ]
  const falas = await falasPorChave(chaves)

  const temCanal = await canalConfigurado().catch(() => false)
  const corpos = await buscarCorposAprovados(agora.getTime())

  const totais = await prisma.mvMensagem.groupBy({
    by: ['inscricaoId'],
    where: { inscricaoId: { in: [...new Set(doDia.map((m) => m.inscricaoId))] } },
    _max: { etapaOrdem: true },
    orderBy: { inscricaoId: 'asc' },
  })
  const totalPorInscricao = new Map(totais.map((t) => [t.inscricaoId, t._max?.etapaOrdem ?? 0] as const))

  const leituraDe = (i: InscricaoLida): Leitura => {
    const conversa = falas.get(i.telefoneKey || chaveTelefone(i.telefoneE164))
    return lerTemperatura({
      agora,
      ultimaFalaEm: conversa?.ultima ?? null,
      falasDaCliente: conversa?.falas ?? [],
      quantasFalas: conversa?.quantas ?? 0,
      equipeFalouEm: i.humanoFalouEm,
      coluna: coluna(i),
      temPedido: i.converteuEm !== null,
    })
  }

  const linhas: LinhaDoBriefing[] = doDia.map((m) => {
    const i = m.inscricao as InscricaoLida
    const quando = m.status === MENSAGEM_STATUS.ENVIADA && m.enviadaEm ? m.enviadaEm : m.agendadaPara
    const daEtapa = templateDaEtapa(i.cadencia.nome, m.etapaOrdem, m.templateNome)
    const nomeTemplate = m.templateNome ?? daEtapa?.nome ?? null
    const aprovado = nomeTemplate ? corpos.get(nomeTemplate) : undefined
    const valores = Array.isArray(m.variaveis) ? (m.variaveis as unknown[]).map((v) => String(v ?? '')) : null

    // Ordem igual à do dossiê: carimbado > corpo aprovado > copy da cadência.
    let texto: string
    let textoIncerto = false
    if (m.textoEntregue) texto = m.textoEntregue
    else if (aprovado && valores) texto = textoEntregueDoTemplate(aprovado, valores)
    else {
      texto = m.mensagemFinal
      textoIncerto = nomeTemplate !== null
    }

    return {
      inscricaoId: i.id,
      nome: i.nomeSnapshot,
      telefone: i.telefoneE164,
      hora: horaSP(quando),
      status: m.status,
      cadencia: i.cadencia.nome,
      etapaOrdem: m.etapaOrdem,
      totalEtapas: templatesDaCadencia(i.cadencia.nome).length || totalPorInscricao.get(m.inscricaoId) || m.etapaOrdem,
      coluna: coluna(i),
      templateNome: nomeTemplate,
      texto,
      textoIncerto,
      respondeu: i.respondeuEm !== null,
      leitura: leituraDe(i),
    }
  })

  type Candidata = { nome: string; telefone: string; coluna: string | null; leitura: Leitura; hoje: LinhaDoBriefing | null }
  const candidatas = new Map<string, Candidata>()
  for (const l of linhas) {
    const atual = candidatas.get(l.inscricaoId)
    if (atual?.hoje && atual.hoje.hora <= l.hora) continue
    candidatas.set(l.inscricaoId, { nome: l.nome, telefone: l.telefone, coluna: l.coluna, leitura: l.leitura, hoje: l })
  }
  for (const i of recentes) {
    if (candidatas.has(i.id)) continue
    candidatas.set(i.id, { nome: i.nomeSnapshot, telefone: i.telefoneE164, coluna: coluna(i), leitura: leituraDe(i), hoje: null })
  }
  const todas = [...candidatas.values()]
  const fila: NaFila[] = todas
    .filter((c) => !c.leitura.naoLigar && c.leitura.temperatura !== 'FRIO')
    .sort((a, b) => b.leitura.pontos - a.leitura.pontos)
    .map((c) => ({
      nome: c.nome,
      telefone: c.telefone,
      coluna: c.coluna,
      leitura: c.leitura,
      hojeRecebe: c.hoje ? { hora: c.hoje.hora, cadencia: c.hoje.cadencia, etapaOrdem: c.hoje.etapaOrdem } : null,
    }))
  const vetados = todas.filter((c) => c.leitura.naoLigar).map((c) => ({ nome: exibir(c.nome), motivo: c.leitura.naoLigar! }))

  const avisos: string[] = []
  if (ajustes.envioPausado) avisos.push('⛔ O envio está PAUSADO na tela. Nenhuma destas sai.')
  if (!temCanal) avisos.push('Canal sem credencial: os textos abaixo podem ser a copy da cadência, não o corpo aprovado.')
  const agendadas = linhas.filter((l) => l.status === MENSAGEM_STATUS.AGENDADA).length
  if (agendadas > ajustes.tetoDiario) {
    avisos.push(`A fila de hoje (${agendadas}) passa do teto diário (${ajustes.tetoDiario}). O que não couber escorrega para amanhã.`)
  }
  const comErro = linhas.filter((l) => l.status === MENSAGEM_STATUS.ERRO).length
  if (comErro > 0) avisos.push(`${comErro} mensagem(ns) de hoje falharam — veja /logs.`)
  const respondentes = linhas.filter((l) => l.respondeu).length
  if (respondentes > 0) avisos.push(`${respondentes} da lista já responderam: a régua delas para no próximo tique.`)

  return {
    dia,
    agora,
    pausado: ajustes.envioPausado,
    tetoDiario: ajustes.tetoDiario,
    linhas,
    fila: fila.slice(0, MAX_NA_FILA),
    vetados,
    avisos,
  }
}

// ── O texto que vai para o WhatsApp ─────────────────────────────────────────

const encurtar = (t: string, n: number) => {
  const limpo = String(t ?? '').replace(/\s+/g, ' ').trim()
  return limpo.length <= n ? limpo : `${limpo.slice(0, n - 1)}…`
}

/** `primeiroNome` devolve null para cadastro sem nome de gente; aqui o snapshot cru volta. */
const exibir = (nome: string) => primeiroNome(nome) || String(nome ?? '').trim() || 'sem nome no cadastro'

function conselhoDe(n: NaFila, indice: number): string {
  const partes = [
    `${indice}. ${seloDaTemperatura(n.leitura.temperatura)} ${exibir(n.nome)} · ${n.telefone}`,
    `   ${n.coluna ? `${n.coluna} · ` : ''}${n.leitura.motivos.join(' · ')}`,
  ]
  if (n.leitura.frase) partes.push(`   Disse: "${encurtar(n.leitura.frase, 120)}"`)
  partes.push(
    n.hojeRecebe
      ? `   ↳ Fale ANTES das ${n.hojeRecebe.hora} — é a hora do toque ${n.hojeRecebe.etapaOrdem} da Máquina.`
      : '   ↳ Não recebe mensagem hoje: sem contato da equipe, o silêncio é o que ela vai ouvir.',
  )
  return partes.join('\n')
}

function blocoDaLinha(l: LinhaDoBriefing): string {
  const marca = l.status === MENSAGEM_STATUS.ERRO ? '❌' : l.status === MENSAGEM_STATUS.ENVIADA ? '✅' : '•'
  const temp = l.leitura.temperatura === 'FRIO' || l.leitura.naoLigar ? '' : ` · ${seloDaTemperatura(l.leitura.temperatura)}`
  const partes = [
    `${marca} ${l.hora} ${exibir(l.nome)} · ${mascararTelefone(l.telefone)}`,
    `   ${l.coluna ? `${l.coluna} · ` : ''}toque ${l.etapaOrdem}/${l.totalEtapas}${temp}`,
    `   💬 ${encurtar(l.texto, RESUMO_DO_TEXTO)}`,
  ]
  if (l.textoIncerto) partes.push('   ⚠️ texto acima é a copy, não o corpo aprovado')
  if (l.respondeu) partes.push('   ↳ já respondeu: este toque deve ser cancelado')
  return partes.join('\n')
}

/** O relato em blocos que não podem ser partidos ao meio. */
export function blocosDoBriefing(b: BriefingDoDia): string[] {
  const p = paraParedeSP(b.agora)
  const blocos: string[] = []
  const pessoas = new Set(b.linhas.map((l) => l.inscricaoId)).size
  const cabecalho = [
    '🌸 *Doce Lilium · o dia da Máquina*',
    `${DIAS[p.diaSemana]}, ${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}`,
    '',
    b.linhas.length === 0
      ? 'Hoje a Máquina não fala com ninguém — não há mensagem na fila.'
      : `${b.linhas.length} mensagem(ns) para ${pessoas} cliente(s). Teto do dia: ${b.tetoDiario}.`,
  ]
  if (b.avisos.length) cabecalho.push('', ...b.avisos.map((a) => `⚠️ ${a}`))
  blocos.push(cabecalho.join('\n'))

  const porCadencia = new Map<string, LinhaDoBriefing[]>()
  for (const l of b.linhas) porCadencia.set(l.cadencia, [...(porCadencia.get(l.cadencia) ?? []), l])
  for (const [cadencia, lista] of [...porCadencia.entries()].sort((a, c) => c[1].length - a[1].length)) {
    blocos.push(`━━━ *${cadencia}* (${lista.length}) ━━━`)
    for (const l of lista.sort((x, y) => x.hora.localeCompare(y.hora))) blocos.push(blocoDaLinha(l))
  }

  blocos.push('━━━━━━━━━━━━━━━━━━━━')
  if (b.fila.length === 0) {
    blocos.push('💬 *Quem vale um contato da equipe hoje*\n\nNinguém passou do corte nem conversou nos últimos 3 dias — hoje é dia de deixar a Máquina trabalhar.')
  } else {
    blocos.push(`💬 *Quem vale um contato da equipe hoje* (${b.fila.length})\nOrdem de temperatura: quem falou mais perto de agora e disse a coisa mais quente.`)
    b.fila.forEach((n, i) => blocos.push(conselhoDe(n, i + 1)))
  }
  if (b.vetados.length) blocos.push(`🚫 *Não procurar:* ${b.vetados.map((v) => `${v.nome} (${v.motivo})`).join(' · ')}`)
  blocos.push('_Responda qualquer coisa aqui para manter a janela de 24h aberta — é o que garante que o resumo de amanhã chegue no horário._')
  return blocos
}

/** Junta os blocos em mensagens sem partir bloco nenhum. Bloco gigante sai sozinho e cortado. */
export function emPartes(blocos: string[], limite = LIMITE_DA_PARTE): string[] {
  const partes: string[] = []
  let atual = ''
  for (const bloco of blocos) {
    const pedaco = bloco.length > limite ? `${bloco.slice(0, limite - 1)}…` : bloco
    if (atual === '') atual = pedaco
    else if (atual.length + 2 + pedaco.length <= limite) atual = `${atual}\n\n${pedaco}`
    else {
      partes.push(atual)
      atual = pedaco
    }
  }
  if (atual !== '') partes.push(atual)
  return partes.length <= 1 ? partes : partes.map((t, i) => `(${i + 1}/${partes.length}) ${t}`)
}

export function formatarBriefing(b: BriefingDoDia): string[] {
  return emPartes(blocosDoBriefing(b))
}

// ── Envio ───────────────────────────────────────────────────────────────────

/** Sem fallback embutido: número pessoal não mora no código. */
export function numeroDoBriefing(): string | null {
  const n = (process.env.MV_BRIEFING_NUMERO ?? '').replace(/\D/g, '')
  return n.length >= 12 ? n : numeroDeAlerta()
}

/** Nome em env: template aprovado não se edita — corrigir = `_v2` + trocar a env. */
const TEMPLATE_DA_PORTA = () => process.env.MV_BRIEFING_TEMPLATE?.trim() || 'dl_relatorio_pronto_v1'

/** O contrato de parâmetros de cada porta conhecida. Fora da tabela = recusa, sem chute. */
const PARAMS_DA_PORTA: Record<string, (b: BriefingDoDia) => string[]> = {
  dl_relatorio_pronto_v1: () => [],
}

export type ResultadoDaPorta = { bateu: true } | { bateu: false; motivo: string }

export type ResultadoBriefing =
  | { pulou: string }
  | { erro: string }
  | { enviou: true; partes: number; falharam: number; dia: string }
  | { enviou: false; janelaFechada: boolean; erro: string; dia: string; porta: ResultadoDaPorta | null }

async function log(nivel: 'INFO' | 'AVISO' | 'ERRO', titulo: string, detalhe: string, dados: unknown) {
  await prisma.logEvento.create({
    data: { origem: 'maquina-vendas', nivel, tipo: TIPO_LOG, titulo, detalhe, dados: JSON.stringify(dados) },
  })
}

async function carimbar(chave: string, agora: Date) {
  await prisma.mvCursor.upsert({
    where: { chave },
    create: { chave, valor: agora.toISOString() },
    update: { valor: agora.toISOString() },
  })
}

async function carimbadoHoje(chave: string, agora: Date): Promise<boolean> {
  const c = await prisma.mvCursor.findUnique({ where: { chave } })
  if (!c?.valor) return false
  const d = new Date(c.valor)
  return !Number.isNaN(d.getTime()) && diaSP(d) === diaSP(agora)
}

const textoDoErro = (e: unknown) => (e instanceof Error ? e.message : String(e))
const codigoDoErro = (e: unknown) => (e instanceof ErroCanal ? (e.codigo ?? null) : null)

async function baterNaPorta(b: BriefingDoDia, agora: Date, numero: string): Promise<ResultadoDaPorta> {
  if (await carimbadoHoje(CURSOR_BRIEFING_PORTA, agora)) return { bateu: false, motivo: 'já bati na porta hoje' }
  await carimbar(CURSOR_BRIEFING_PORTA, agora)

  const nome = TEMPLATE_DA_PORTA()
  const montar = PARAMS_DA_PORTA[nome]
  if (!montar) {
    await log(
      'ERRO',
      `Não sei que parâmetros o template "${nome}" pede`,
      `MV_BRIEFING_TEMPLATE aponta para "${nome}", fora de PARAMS_DA_PORTA (briefing.ts). Mandar no chute levaria 132000.`,
      { dia: b.dia, template: nome, conhecidos: Object.keys(PARAMS_DA_PORTA) },
    )
    return { bateu: false, motivo: `template "${nome}" sem contrato de parâmetros` }
  }
  try {
    await enviarTemplate({ para: `+${numero}`, templateNome: nome, idioma: 'pt_BR', variaveis: montar(b) })
    await log(
      'INFO',
      'Bati na porta: template enviado para abrir a janela',
      `"${nome}" saiu para ${mascararTelefone(numero)} (${b.linhas.length} mensagem(ns), ${b.fila.length} para contato). O relatório sai no tique seguinte ao toque.`,
      { dia: b.dia, template: nome },
    )
    return { bateu: true }
  } catch (e) {
    const motivo = textoDoErro(e)
    await log('ERRO', 'Não consegui bater na porta', `"${nome}": ${motivo}. Confira se está APROVADO (scripts/mv-submeter-templates.ts --status).`, {
      dia: b.dia,
      template: nome,
      codigo: codigoDoErro(e),
    })
    return { bateu: false, motivo }
  }
}

/** Manda o relatório do dia. NÃO decide se é hora — isso é `rodarBriefingDiario`. */
export async function enviarBriefing(agora: Date = new Date()): Promise<ResultadoBriefing> {
  if (!(await canalConfigurado().catch(() => false))) return { pulou: 'canal sem credencial' }
  const numero = numeroDoBriefing()
  if (!numero) return { pulou: 'sem número do briefing (MV_BRIEFING_NUMERO / MV_ALERTA_NUMERO)' }

  const briefing = await montarBriefing(agora)
  const partes = formatarBriefing(briefing)

  // A parte 1 é o teste da janela: se não passa, nada é marcado e o tique tenta de novo.
  try {
    await enviarMensagemLivre(`+${numero}`, { tipo: 'texto', texto: partes[0]! })
  } catch (e) {
    const janelaFechada = codigoDoErro(e) === CODIGO_JANELA_FECHADA
    return {
      enviou: false,
      janelaFechada,
      erro: textoDoErro(e),
      dia: briefing.dia,
      // Só porta fechada tem chave; canal fora/token vencido não se resolve com template.
      porta: janelaFechada ? await baterNaPorta(briefing, agora, numero) : null,
    }
  }

  await carimbar(CURSOR_BRIEFING, agora)

  let falharam = 0
  const erros: string[] = []
  for (const parte of partes.slice(1)) {
    // Três POSTs no mesmo instante já chegaram embaralhados.
    await new Promise((r) => setTimeout(r, 1000))
    try {
      await enviarMensagemLivre(`+${numero}`, { tipo: 'texto', texto: parte })
    } catch (e) {
      falharam++
      erros.push(textoDoErro(e))
    }
  }

  await log(
    falharam > 0 ? 'AVISO' : 'INFO',
    `Briefing do dia enviado · ${briefing.linhas.length} mensagem(ns), ${briefing.fila.length} para contato`,
    falharam > 0
      ? `${falharam} de ${partes.length} partes não saíram — o relatório chegou incompleto. ${erros.join(' | ')}`
      : `${partes.length} parte(s) para ${mascararTelefone(numero)}.`,
    {
      dia: briefing.dia,
      mensagens: briefing.linhas.length,
      fila: briefing.fila.map((f) => ({ nome: exibir(f.nome), pontos: f.leitura.pontos, temperatura: f.leitura.temperatura })),
    },
  )
  return { enviou: true, partes: partes.length, falharam, dia: briefing.dia }
}

/** 'HH:mm' → minutos. Inválido cai no padrão, sem lançar. */
export function minutosDaHora(bruto: string | undefined, padrao: number): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(bruto ?? '').trim())
  if (!m) return padrao
  const h = Number(m[1])
  const min = Number(m[2])
  return h > 23 || min > 59 ? padrao : h * 60 + min
}

/**
 * O guard do tique: já passou da hora (`MV_BRIEFING_HORA`, padrão 08:00) e
 * ainda não mandei hoje? Desligado com `MV_BRIEFING=0`.
 *
 * Não derruba o tique (monitoramento que derruba faz a Máquina parar de MANDAR
 * porque não conseguiu CONTAR) — mas também NÃO engole: a falha vira
 * `LogEvento` ERRO e volta como `{ erro }`, que o cron conta como falha.
 */
export async function rodarBriefingDiario(agora: Date = new Date()): Promise<ResultadoBriefing> {
  try {
    if (process.env.MV_BRIEFING === '0') return { pulou: 'briefing desligado (MV_BRIEFING=0)' }
    const alvo = minutosDaHora(process.env.MV_BRIEFING_HORA, 8 * 60)
    const p = paraParedeSP(agora)
    if (p.hora * 60 + p.minuto < alvo) return { pulou: 'ainda não deu a hora' }
    if (await carimbadoHoje(CURSOR_BRIEFING, agora)) return { pulou: 'já enviei hoje' }

    const r = await enviarBriefing(agora)

    // Aviso de "não saiu" UMA vez por dia: o tique repica de 5 em 5 min.
    if ('enviou' in r && r.enviou === false && !(await carimbadoHoje(CURSOR_BRIEFING_AVISO, agora))) {
      await carimbar(CURSOR_BRIEFING_AVISO, agora)
      await log(
        'AVISO',
        r.janelaFechada ? 'Briefing esperando a porta abrir' : 'Briefing não saiu',
        r.janelaFechada
          ? r.porta?.bateu
            ? 'Janela de 24h fechada. O template já foi entregue: ao tocar no botão, o próximo tique (≤5 min) manda o relatório.'
            : `Janela de 24h fechada e a porta não foi batida (${r.porta?.motivo ?? 'sem tentativa'}). Responder qualquer coisa ao número oficial destrava.`
          : r.erro,
        r,
      )
    }
    return r
  } catch (e) {
    const erro = textoDoErro(e)
    await log('ERRO', 'Briefing falhou', erro, { em: agora.toISOString() }).catch(() => undefined)
    return { erro }
  }
}
