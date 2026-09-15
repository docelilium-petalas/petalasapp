/**
 * REATIVAÇÃO E NOVIDADES — as três trilhas de marketing que dependem da loja.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Ligadas em 15/09/2026, com os templates aprovados pela Meta:
 *
 *   dl_reativacao_60d_v1        quem comprou há 60 dias e não voltou
 *   dl_colecao_nova_v1          uma coleção nova entrou no ar na loja
 *   dl_lista_desejos_voltou_v1  a peça que ela quis voltou ao estoque
 *
 * As três são MARKETING: o despachante aplica janela (9h–20h), teto do dia e
 * anti-eco a cada mensagem, e todo template tem o botão "Parar de receber".
 * Aqui só se decide QUEM entra na fila.
 *
 * ── De hora em hora, e não a cada tique ───────────────────────────────────
 * Ler todos os pedidos, as categorias e o catálogo inteiro a cada 5 minutos
 * gastaria a cota da Nuvemshop à toa: nenhuma destas trilhas é urgente. O
 * cursor `mv:varredura_marketing` segura a varredura em uma por hora.
 *
 * ── A primeira varredura não dispara nada ─────────────────────────────────
 * Coleção nova e estoque que voltou são MUDANÇAS. Na primeira vez, o que
 * existe na loja vira a foto de referência (`mv:colecoes_vistas`,
 * `mv:estoque`) e ninguém é inscrito — senão ligar a trilha anunciaria como
 * "nova" toda coleção antiga, para a base inteira, no mesmo dia.
 *
 * ── Lista de desejos ──────────────────────────────────────────────────────
 * A Nuvemshop não expõe os favoritos da loja pela API. O "interesse" é o que o
 * CRM enxerga: peça deixada num carrinho que não virou compra, e a peça que a
 * cliente pediu na conversa com a IA (`produtoInteresse` do funil do WhatsApp).
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { listarTudo } from '@/lib/nuvemshop/cliente'
import { listarPedidos, primeiroNome, type Pedido } from '@/lib/nuvemshop/loja'
import { catalogoDaLoja, dobrar, type ProdutoCatalogo } from '@/lib/nuvemshop/catalogo'
import { NOME_FUNIL } from '@/lib/atendimento/funil'
import { chaveTelefone, paraE164 } from './telefone'
import { obterAjustes, type Ajustes } from './config'
import { inscrever } from './observador'
import { CopyIncompleta, type Contexto } from './copy'
import { esqueletoNomeado } from './catalogo-templates'
import { statusDosTemplates } from './canal'

export const ORIGEM_REATIVACAO = 'reativacao'
export const ORIGEM_COLECAO = 'colecao_nova'
export const ORIGEM_DESEJO = 'lista_desejos'

const TRILHAS = {
  reativacao: { gatilho: 'reativacao_60d', nome: 'Reativação 60 dias', template: 'dl_reativacao_60d_v1' },
  colecao: { gatilho: 'colecao_nova', nome: 'Coleção nova', template: 'dl_colecao_nova_v1' },
  desejo: { gatilho: 'lista_desejos_voltou', nome: 'Voltou ao estoque', template: 'dl_lista_desejos_voltou_v1' },
} as const
type Trilha = (typeof TRILHAS)[keyof typeof TRILHAS]

const CURSOR_VARREDURA = 'mv:varredura_marketing'
const CURSOR_COLECOES = 'mv:colecoes_vistas'
const CURSOR_ESTOQUE = 'mv:estoque'
const CURSOR_DESTAQUE = 'mv:colecao_destaque'

const MINUTOS_ENTRE_VARREDURAS = 60
/** Reativação: a partir de 60 dias sem comprar, e só até 90 — uma vez por última compra. */
const REATIVAR_DE_DIAS = 60
const REATIVAR_ATE_DIAS = 90
/** Coleção nova: espera a loja terminar de montar antes de anunciar. */
const COLECAO_ESPERA_MINUTOS = 60
const COLECAO_MIN_PRODUTOS = 2
const COLECAO_DESISTE_DIAS = 14
/** A base do anúncio: quem comprou no último ano. */
const BASE_DIAS = 365
/** Interesse numa peça vale por 60 dias. */
const INTERESSE_DIAS = 60
/** Prioridade na fila: carrinho e pedido (0–1) saem antes do anúncio em massa. */
const PRIORIDADE_EM_MASSA = 2

/**
 * Categoria que é seção da loja, e não coleção: "Chegou a coleção Vestidos"
 * não é frase que a Doce Lilium mandaria.
 */
const GENERICAS = /^(todas?|todos|produtos?|vestidos?|saias?|partes? de cima|blusas?|calcas?|shorts?|conjuntos?|acessorios?|sales?|sale|promo\w*|liquida\w*|outlet|novidades?|lancamentos?)$/

type Contagem = Map<string, number>
export type ResultadoTrilha = { inscritos: number; pulados: { motivo: string; quantos: number }[] }
export type ResultadoMarketing =
  | { rodou: false; motivo: string }
  | { rodou: true; reativacao: ResultadoTrilha; colecao: ResultadoTrilha; desejo: ResultadoTrilha }

function contar(m: Contagem, motivo: string, n = 1) {
  m.set(motivo, (m.get(motivo) ?? 0) + n)
}
function resultado(inscritos: number, m: Contagem): ResultadoTrilha {
  return { inscritos, pulados: [...m].map(([motivo, quantos]) => ({ motivo, quantos })) }
}

// ── Cursores (chave → texto) ────────────────────────────────────────────────

async function lerCursor<T>(chave: string): Promise<T | null> {
  const c = await prisma.mvCursor.findUnique({ where: { chave } })
  if (!c) return null
  try {
    return JSON.parse(c.valor) as T
  } catch {
    return null
  }
}
async function gravarCursor(chave: string, valor: unknown) {
  const texto = JSON.stringify(valor)
  await prisma.mvCursor.upsert({ where: { chave }, create: { chave, valor: texto }, update: { valor: texto } })
}

// ── Cadência e liberação ────────────────────────────────────────────────────

/** A cadência de um toque, criada na primeira vez. Desligada no banco, fica desligada. */
async function garantirCadencia(t: Trilha) {
  const existente = await prisma.mvCadencia.findFirst({
    where: { gatilho: t.gatilho },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (existente && existente.etapas.length) return existente
  const cadencia =
    existente ?? (await prisma.mvCadencia.create({ data: { nome: t.nome, gatilho: t.gatilho, idadeMaximaHoras: null, ativo: true } }))
  await prisma.mvCadenciaEtapa.create({
    data: {
      cadenciaId: cadencia.id,
      ordem: 1,
      delayMinutos: 0,
      ancoradaEm: 'gatilho',
      templateBase: esqueletoNomeado(t.template),
      templateNome: t.template,
      ehUltima: true,
    },
  })
  return prisma.mvCadencia.findFirstOrThrow({ where: { id: cadencia.id }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
}
type Cadencia = Awaited<ReturnType<typeof garantirCadencia>>

async function bloqueio(cadencia: Cadencia, t: Trilha): Promise<string | null> {
  if (!cadencia.ativo) return `cadência ${t.nome} desligada`
  const status = await statusDosTemplates()
  if (!status) return 'sem como conferir a aprovação do template (DATAFY_WABA_ID ou canal)'
  const s = status.get(t.template)
  if (s !== 'APPROVED') return `template ${t.template} ${s ? s.toLowerCase() : 'ausente'} na Meta`
  return null
}

// ── A base de clientes ──────────────────────────────────────────────────────

type Cliente = {
  chave: string
  e164: string
  nome: string | null
  ultimoPagoEm: Date
  ultimoPedidoId: number
  /** `produto_id` de tudo que comprou, com a data — para não avisar \"voltou\" de peça já comprada. */
  comprados: Map<number, Date>
}

function pagoEm(p: Pedido): Date {
  return new Date(p.paid_at || p.created_at)
}

async function clientesDaLoja(): Promise<{ clientes: Map<string, Cliente>; semTelefone: number }> {
  const pedidos = await listarPedidos(new Date(Date.now() - (BASE_DIAS + REATIVAR_ATE_DIAS) * 86_400_000))
  const clientes = new Map<string, Cliente>()
  let semTelefone = 0
  for (const p of pedidos) {
    if (p.payment_status !== 'paid' || p.status === 'cancelled') continue
    const e164 = paraE164(p.contact_phone)
    const chave = e164 ? chaveTelefone(e164) : ''
    if (!e164 || !chave) {
      semTelefone++
      continue
    }
    const quando = pagoEm(p)
    const c = clientes.get(chave)
    if (!c) {
      clientes.set(chave, {
        chave,
        e164,
        nome: primeiroNome(p.contact_name),
        ultimoPagoEm: quando,
        ultimoPedidoId: p.id,
        comprados: new Map((p.products ?? []).map((i) => [i.product_id, quando])),
      })
      continue
    }
    if (quando > c.ultimoPagoEm) {
      c.ultimoPagoEm = quando
      c.ultimoPedidoId = p.id
      c.nome = primeiroNome(p.contact_name) ?? c.nome
    }
    for (const i of p.products ?? []) {
      const antes = c.comprados.get(i.product_id)
      if (!antes || quando > antes) c.comprados.set(i.product_id, quando)
    }
  }
  return { clientes, semTelefone }
}

async function saiu(chave: string): Promise<boolean> {
  return !!(await prisma.mvOptOut.findUnique({ where: { telefoneKey: chave }, select: { telefoneKey: true } }))
}

/** Inscreve e traduz as recusas esperadas em motivo. */
async function tentarInscrever(
  pulados: Contagem,
  args: Parameters<typeof inscrever>[0],
): Promise<boolean> {
  try {
    await inscrever(args)
    return true
  } catch (e) {
    if (e instanceof CopyIncompleta) contar(pulados, `copy sem ${e.faltando.join('/')}`)
    else if (e instanceof Error && e.name === 'JaInscrito') contar(pulados, 'já inscrito')
    else throw e
    return false
  }
}

// ── Coleções ────────────────────────────────────────────────────────────────

type Traduzivel = { pt?: string; es?: string } | string | null | undefined
type CategoriaLoja = { id: number; name?: Traduzivel; handle?: Traduzivel; created_at?: string }
type Colecao = { id: number; nome: string; url: string }

function pt(v: Traduzivel): string {
  if (!v) return ''
  return typeof v === 'string' ? v : (v.pt ?? v.es ?? '')
}

function origemDaLoja(produtos: ProdutoCatalogo[]): string {
  for (const p of produtos) {
    try {
      if (p.link) return new URL(p.link).origin
    } catch {
      // link relativo: tenta o próximo
    }
  }
  return 'https://www.docelilium.com.br'
}

function ehColecao(nome: string): boolean {
  return !!nome.trim() && !GENERICAS.test(dobrar(nome).trim())
}

/** A coleção que a reativação cita: a última anunciada, ou a de produto recente. */
async function colecaoEmDestaque(produtos: ProdutoCatalogo[], categorias: CategoriaLoja[]): Promise<Colecao | null> {
  const guardada = await lerCursor<Colecao & { em: string }>(CURSOR_DESTAQUE)
  if (guardada && Date.now() - new Date(guardada.em).getTime() < REATIVAR_DE_DIAS * 86_400_000) return guardada
  const recente = Date.now() - 45 * 86_400_000
  const origem = origemDaLoja(produtos)
  for (const p of produtos) {
    if (!p.disponivel || !p.criadoEm || new Date(p.criadoEm).getTime() < recente) continue
    for (const nome of p.categorias) {
      if (!ehColecao(nome)) continue
      const cat = categorias.find((c) => dobrar(pt(c.name)) === dobrar(nome))
      const handle = cat ? pt(cat.handle) : ''
      if (cat && handle) return { id: cat.id, nome: pt(cat.name).trim(), url: `${origem}/${handle}/` }
    }
  }
  return null
}

// ── TRILHA 1 · REATIVAÇÃO ───────────────────────────────────────────────────

async function reativar(
  ajustes: Ajustes,
  clientes: Map<string, Cliente>,
  destaque: Colecao | null,
): Promise<ResultadoTrilha> {
  const pulados: Contagem = new Map()
  const cadencia = await garantirCadencia(TRILHAS.reativacao)
  const b = await bloqueio(cadencia, TRILHAS.reativacao)
  if (b) return resultado(0, new Map([[b, 1]]))

  const candidatos = [...clientes.values()].filter((c) => {
    const dias = (Date.now() - c.ultimoPagoEm.getTime()) / 86_400_000
    return dias >= REATIVAR_DE_DIAS && dias < REATIVAR_ATE_DIAS
  })
  if (candidatos.length && !destaque) return resultado(0, new Map([['nenhuma coleção recente para citar', candidatos.length]]))

  let inscritos = 0
  for (const c of candidatos) {
    if (await saiu(c.chave)) {
      contar(pulados, 'opt-out')
      continue
    }
    if (!c.nome) {
      contar(pulados, 'sem primeiro nome')
      continue
    }
    // Quem está no meio de outra régua (carrinho, pedido) não recebe reativação agora.
    const ocupada = await prisma.mvInscricao.findFirst({ where: { telefoneKey: c.chave, status: 'ATIVA' }, select: { id: true } })
    if (ocupada) {
      contar(pulados, 'em outra régua')
      continue
    }
    const contexto: Contexto = { primeiro_nome: c.nome, colecao: destaque!.nome }
    const ok = await tentarInscrever(pulados, {
      ajustes,
      cadenciaId: cadencia.id,
      etapas: cadencia.etapas,
      origem: ORIGEM_REATIVACAO,
      // Uma vez por ÚLTIMA compra: comprou de novo, pode ser reativada de novo daqui a 60 dias.
      refExterna: `${c.chave}:${c.ultimoPedidoId}`,
      nome: c.nome,
      e164: c.e164,
      chave: c.chave,
      ancora: new Date(),
      contexto,
      retrato: {
        url: destaque!.url,
        colecao: destaque!.nome,
        ultimoPedidoId: c.ultimoPedidoId,
        ultimaCompraEm: c.ultimoPagoEm.toISOString(),
      },
      prioridade: PRIORIDADE_EM_MASSA,
    })
    if (ok) inscritos++
  }
  return resultado(inscritos, pulados)
}

// ── TRILHA 2 · COLEÇÃO NOVA ─────────────────────────────────────────────────

type FotoColecoes = { vistas: number[]; pendentes: Record<string, string> }

async function anunciarColecoes(
  ajustes: Ajustes,
  clientes: Map<string, Cliente>,
  produtos: ProdutoCatalogo[],
  categorias: CategoriaLoja[],
): Promise<ResultadoTrilha> {
  const pulados: Contagem = new Map()
  const foto = await lerCursor<FotoColecoes>(CURSOR_COLECOES)
  if (!foto) {
    await gravarCursor(CURSOR_COLECOES, { vistas: categorias.map((c) => c.id), pendentes: {} } satisfies FotoColecoes)
    return resultado(0, new Map([['primeira varredura: coleções atuais guardadas como referência', categorias.length]]))
  }

  const vistas = new Set(foto.vistas)
  const pendentes = { ...foto.pendentes }
  for (const c of categorias) if (!vistas.has(c.id) && !pendentes[c.id]) pendentes[c.id] = new Date().toISOString()

  const cadencia = await garantirCadencia(TRILHAS.colecao)
  const b = await bloqueio(cadencia, TRILHAS.colecao)
  const origem = origemDaLoja(produtos)
  let inscritos = 0

  for (const [id, desde] of Object.entries(pendentes)) {
    const cat = categorias.find((c) => String(c.id) === id)
    const idade = (Date.now() - new Date(desde).getTime()) / 60_000
    const nome = cat ? pt(cat.name).trim() : ''
    const handle = cat ? pt(cat.handle) : ''

    if (!cat || !ehColecao(nome) || !handle) {
      // Apagada, ou é seção e não coleção: sai da espera sem anúncio.
      vistas.add(Number(id))
      delete pendentes[id]
      if (cat) contar(pulados, `\"${nome}\" não é coleção`)
      continue
    }
    const pecas = produtos.filter((p) => p.disponivel && p.categorias.some((n) => dobrar(n) === dobrar(nome))).length
    if (idade < COLECAO_ESPERA_MINUTOS || pecas < COLECAO_MIN_PRODUTOS) {
      if (idade > COLECAO_DESISTE_DIAS * 1440) {
        vistas.add(Number(id))
        delete pendentes[id]
        contar(pulados, `\"${nome}\" ficou ${COLECAO_DESISTE_DIAS} dias sem peças`)
      } else {
        contar(pulados, `\"${nome}\" aguardando (${pecas} peça(s), ${Math.round(idade)} min)`)
      }
      continue
    }
    if (b) {
      // Bloqueada: a coleção continua pendente e é anunciada quando a trilha liberar.
      contar(pulados, b)
      continue
    }

    const colecao: Colecao = { id: cat.id, nome, url: `${origem}/${handle}/` }
    await gravarCursor(CURSOR_DESTAQUE, { ...colecao, em: new Date().toISOString() })
    const base = [...clientes.values()].filter((c) => Date.now() - c.ultimoPagoEm.getTime() < BASE_DIAS * 86_400_000)
    for (const c of base) {
      if (await saiu(c.chave)) {
        contar(pulados, 'opt-out')
        continue
      }
      if (!c.nome) {
        contar(pulados, 'sem primeiro nome')
        continue
      }
      const ok = await tentarInscrever(pulados, {
        ajustes,
        cadenciaId: cadencia.id,
        etapas: cadencia.etapas,
        origem: ORIGEM_COLECAO,
        refExterna: `${cat.id}:${c.chave}`,
        nome: c.nome,
        e164: c.e164,
        chave: c.chave,
        ancora: new Date(),
        contexto: { primeiro_nome: c.nome, colecao: nome },
        retrato: { url: colecao.url, colecao: nome, categoriaId: cat.id },
        prioridade: PRIORIDADE_EM_MASSA,
      })
      if (ok) inscritos++
    }
    vistas.add(cat.id)
    delete pendentes[id]
  }

  await gravarCursor(CURSOR_COLECOES, { vistas: [...vistas], pendentes } satisfies FotoColecoes)
  return resultado(inscritos, pulados)
}

// ── TRILHA 3 · VOLTOU AO ESTOQUE ────────────────────────────────────────────

type Interessada = { chave: string; e164: string; nome: string; desde: Date }

function mesmaPeca(texto: string | null | undefined, produto: ProdutoCatalogo): boolean {
  if (!texto) return false
  const a = dobrar(texto).trim()
  const b = dobrar(produto.nome).trim()
  return !!b && (a === b || a.startsWith(`${b} (`) || a.split(/\s*[,;]\s*/).some((x) => x === b || x.startsWith(`${b} (`)))
}

async function interessadasEm(produto: ProdutoCatalogo): Promise<Interessada[]> {
  const desde = new Date(Date.now() - INTERESSE_DIAS * 86_400_000)
  const achadas = new Map<string, Interessada>()

  // Carrinho que não virou compra.
  const carrinhos = await prisma.mvInscricao.findMany({
    where: { origem: 'carrinho', createdAt: { gte: desde }, status: { not: 'CONVERTEU' } },
    select: { telefoneKey: true, telefoneE164: true, nomeSnapshot: true, contexto: true, createdAt: true },
  })
  for (const c of carrinhos) {
    const itens = ((c.contexto ?? {}) as { itens?: { nome: string }[] }).itens ?? []
    if (!itens.some((i) => mesmaPeca(i.nome, produto))) continue
    if (!achadas.has(c.telefoneKey)) achadas.set(c.telefoneKey, { chave: c.telefoneKey, e164: c.telefoneE164, nome: c.nomeSnapshot, desde: c.createdAt })
  }

  // A peça pedida na conversa com a IA.
  const conversas = await prisma.deal.findMany({
    where: { pipeline: { nome: NOME_FUNIL }, status: { not: 'WON' }, updatedAt: { gte: desde }, produtoInteresse: { not: null } },
    select: { produtoInteresse: true, telefone: true, updatedAt: true, contact: { select: { nome: true, telefone: true } } },
  })
  for (const d of conversas) {
    if (!mesmaPeca(d.produtoInteresse, produto)) continue
    const e164 = paraE164(d.telefone || d.contact.telefone)
    const chave = e164 ? chaveTelefone(e164) : ''
    if (!e164 || !chave || achadas.has(chave)) continue
    achadas.set(chave, { chave, e164, nome: d.contact.nome, desde: d.updatedAt })
  }
  return [...achadas.values()]
}

async function avisarVoltaAoEstoque(
  ajustes: Ajustes,
  clientes: Map<string, Cliente>,
  produtos: ProdutoCatalogo[],
): Promise<ResultadoTrilha> {
  const pulados: Contagem = new Map()
  const anterior = await lerCursor<Record<string, boolean>>(CURSOR_ESTOQUE)
  const agora: Record<string, boolean> = Object.fromEntries(produtos.map((p) => [String(p.id), p.disponivel]))
  await gravarCursor(CURSOR_ESTOQUE, agora)
  if (!anterior) return resultado(0, new Map([['primeira varredura: estoque atual guardado como referência', produtos.length]]))

  const voltaram = produtos.filter((p) => p.disponivel && anterior[String(p.id)] === false)
  if (!voltaram.length) return resultado(0, pulados)

  const cadencia = await garantirCadencia(TRILHAS.desejo)
  const b = await bloqueio(cadencia, TRILHAS.desejo)
  if (b) return resultado(0, new Map([[b, voltaram.length]]))

  const hoje = new Date().toISOString().slice(0, 10)
  let inscritos = 0
  for (const produto of voltaram) {
    for (const pessoa of await interessadasEm(produto)) {
      if (await saiu(pessoa.chave)) {
        contar(pulados, 'opt-out')
        continue
      }
      const comprou = clientes.get(pessoa.chave)?.comprados.get(produto.id)
      if (comprou && comprou >= pessoa.desde) {
        contar(pulados, 'já comprou a peça')
        continue
      }
      const nome = primeiroNome(pessoa.nome)
      if (!nome) {
        contar(pulados, 'sem primeiro nome')
        continue
      }
      const ok = await tentarInscrever(pulados, {
        ajustes,
        cadenciaId: cadencia.id,
        etapas: cadencia.etapas,
        origem: ORIGEM_DESEJO,
        // Uma vez por volta ao estoque: esgotou e voltou de novo, avisa de novo.
        refExterna: `${produto.id}:${hoje}:${pessoa.chave}`,
        nome,
        e164: pessoa.e164,
        chave: pessoa.chave,
        ancora: new Date(),
        contexto: { primeiro_nome: nome, peca: produto.nome },
        retrato: { url: produto.link, peca: produto.nome, produtoId: produto.id, itens: [{ nome: produto.nome, qtd: 1 }] },
        // A intenção é dela: sai junto com carrinho, antes do anúncio em massa.
        prioridade: 1,
      })
      if (ok) inscritos++
    }
  }
  return resultado(inscritos, pulados)
}

// ── A varredura ─────────────────────────────────────────────────────────────

export async function observarMarketing(forcar = false): Promise<ResultadoMarketing> {
  const ultima = await prisma.mvCursor.findUnique({ where: { chave: CURSOR_VARREDURA } })
  if (!forcar && ultima && Date.now() - new Date(ultima.valor).getTime() < MINUTOS_ENTRE_VARREDURAS * 60_000) {
    return { rodou: false, motivo: 'varredura de marketing é de hora em hora' }
  }
  // Grava ANTES de varrer: se a Nuvemshop falhar, o tique seguinte não martela a API.
  await prisma.mvCursor.upsert({
    where: { chave: CURSOR_VARREDURA },
    create: { chave: CURSOR_VARREDURA, valor: new Date().toISOString() },
    update: { valor: new Date().toISOString() },
  })

  const ajustes = await obterAjustes()
  const [{ clientes }, produtos, categorias] = await Promise.all([
    clientesDaLoja(),
    catalogoDaLoja(true),
    listarTudo<CategoriaLoja>('categories'),
  ])

  // Coleção antes da reativação: a coleção anunciada agora é a que a reativação cita.
  const colecao = await anunciarColecoes(ajustes, clientes, produtos, categorias)
  const destaque = await colecaoEmDestaque(produtos, categorias)
  const reativacao = await reativar(ajustes, clientes, destaque)
  const desejo = await avisarVoltaAoEstoque(ajustes, clientes, produtos)
  return { rodou: true, reativacao, colecao, desejo }
}
