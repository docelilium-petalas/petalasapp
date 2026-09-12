/**
 * SUBMETE OS TEMPLATES DA DOCE LILIUM À META, PELO PROXY DA DATAFY.
 *
 *   npx tsx scripts/mv-submeter-templates.ts             # dry-run: mostra o que iria
 *   npx tsx scripts/mv-submeter-templates.ts --apply     # submete de verdade
 *   npx tsx scripts/mv-submeter-templates.ts --status    # só consulta a WABA
 *
 * Credenciais por ambiente: DATAFY_TOKEN, DATAFY_WABA_ID.
 * WABA medida no painel da Datafy em 12/09/2026: 1722319218643532.
 *
 * ── O QUE ENTRA ─────────────────────────────────────────────────────────────
 * Só o que a dona da marca aprovou na tela de revisão (status APROVADO), com o
 * texto DELA quando ela reescreveu. Mais os dois casos resolvidos fora da tela,
 * listados em RESOLVIDOS com o motivo. Pendente e "a ajustar" não vão — um
 * template aprovado tem nome imutável, e submeter o que ela não leu é gastar
 * um nome com texto que pode mudar.
 *
 * ── O QUE FICA DE FORA DE PROPÓSITO ─────────────────────────────────────────
 * Template com botão de URL cujo endereço fixo ainda não se conhece. A Meta
 * aprova o botão com um domínio FIXO terminado em variável; rastreio de
 * transportadora e página de coleção não têm domínio garantido hoje. O do
 * carrinho tem: é lido de um carrinho real da loja no momento da submissão,
 * nunca chutado.
 *
 * ── IDEMPOTÊNCIA ────────────────────────────────────────────────────────────
 * Template que já existe na WABA é PULADO. Reenviar cria duplicata ou erro.
 */

import prisma from '../src/lib/prisma'
import { CATALOGO, validarCatalogo, type TemplateMeta } from '../src/lib/maquina-vendas/catalogo-templates'
import { listarCarrinhosAbandonados } from '../src/lib/nuvemshop/loja'

const BASE = (process.env.DATAFY_BASE_URL || 'https://cloud.datafyapi.com.br/v1').replace(/\/+$/, '')
const TOKEN = process.env.DATAFY_TOKEN
const WABA = process.env.DATAFY_WABA_ID
const APLICAR = process.argv.includes('--apply')
const SO_STATUS = process.argv.includes('--status')

/**
 * Aprovados fora da tela de revisão, com o motivo. Cada linha aqui é uma
 * decisão da dona da marca registrada em outro canal — por isso o motivo é
 * obrigatório e fica versionado.
 */
const RESOLVIDOS: Record<string, string> = {
  dl_carrinho_duvida_v1:
    'Marcada "ajustar" por um "do o" que existia só na prévia (exemplo com artigo). ' +
    'Corrigido o exemplo em 12/09/2026; o texto dela fica como ela escreveu.',
  dl_carrinho_ultimo_v2:
    'Texto escrito pela própria dona da marca no grupo MKT Doce Lilium em 11/09/2026, 10h06, ' +
    'para substituir a v1 que prometia cupom.',
}

type Revisao = { nome: string; status: string; corpoRevisado: string | null }

async function api(caminho: string, init?: RequestInit) {
  const r = await fetch(`${BASE}${caminho}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const texto = await r.text()
  let json: unknown
  try {
    json = JSON.parse(texto)
  } catch {
    json = texto
  }
  if (!r.ok) {
    const msg = (json as { error?: { message?: string } })?.error?.message ?? texto.slice(0, 300)
    throw new Error(`HTTP ${r.status}: ${msg}`)
  }
  return json as Record<string, unknown>
}

async function listarWaba(): Promise<Array<{ name: string; status: string; category: string; language: string }>> {
  const r = await api(`/${WABA}/message_templates?limit=200`)
  return (r.data as Array<{ name: string; status: string; category: string; language: string }>) ?? []
}

/** Confere o texto que vai sair contra as regras de forma da Meta e contra o original. */
function errosDeForma(t: TemplateMeta, corpo: string): string[] {
  const erros: string[] = []
  if (corpo.length > 1024) erros.push(`corpo com ${corpo.length} caracteres (limite 1024)`)
  if (/^\{\{\d+\}\}/.test(corpo)) erros.push('corpo começa com variável')
  if (/\{\{\d+\}\}$/.test(corpo.trim())) erros.push('corpo termina com variável')
  if (/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(corpo)) erros.push('variáveis vizinhas')
  const nums = (s: string) => [...new Set([...s.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1])))].sort()
  if (nums(corpo).join(',') !== nums(t.corpo).join(',')) {
    erros.push(`variáveis ${nums(corpo).join(',')} diferentes das do catálogo (${nums(t.corpo).join(',')})`)
  }
  return erros
}

/** O domínio fixo do checkout, lido de um carrinho real — nunca chutado. */
async function baseDoCheckout(): Promise<string | null> {
  const desde = new Date(Date.now() - 30 * 24 * 3600 * 1000)
  const carrinhos = await listarCarrinhosAbandonados(desde)
  const url = carrinhos.map((c) => c.abandoned_checkout_url).find(Boolean)
  if (!url) return null
  return `${new URL(url).origin}/`
}

function ehBotaoDeCheckout(t: TemplateMeta): boolean {
  return (t.botoes ?? []).some((b) => b.tipo === 'URL' && /\/checkout\//.test(b.exemplo ?? ''))
}

function temBotaoUrl(t: TemplateMeta): boolean {
  return (t.botoes ?? []).some((b) => b.tipo === 'URL')
}

function montar(t: TemplateMeta, corpo: string, base: string | null) {
  const componentes: unknown[] = [
    {
      type: 'BODY',
      text: corpo,
      ...(t.exemplos.length ? { example: { body_text: [t.exemplos] } } : {}),
    },
  ]
  if (t.rodape) componentes.push({ type: 'FOOTER', text: t.rodape })
  if (t.botoes?.length) {
    componentes.push({
      type: 'BUTTONS',
      buttons: t.botoes.map((b) => {
        if (b.tipo === 'QUICK_REPLY') return { type: 'QUICK_REPLY', text: b.texto }
        const sufixoExemplo = new URL(b.exemplo!).pathname.replace(/^\/+/, '')
        return { type: 'URL', text: b.texto, url: `${base}{{1}}`, example: [`${base}${sufixoExemplo}`] }
      }),
    })
  }
  return { name: t.nome, language: t.idioma, category: t.categoria, components: componentes }
}

async function main() {
  if (!TOKEN || !WABA) throw new Error('DATAFY_TOKEN e DATAFY_WABA_ID são obrigatórios.')

  const existentes = await listarWaba()
  const naWaba = new Map(existentes.map((t) => [t.name, t]))

  if (SO_STATUS) {
    console.log(`${existentes.length} template(s) na WABA ${WABA}:\n`)
    for (const t of existentes.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  ${t.status.padEnd(10)} ${t.category.padEnd(10)} ${t.language.padEnd(6)} ${t.name}`)
    }
    return
  }

  const errosCatalogo = validarCatalogo()
  if (errosCatalogo.length) {
    throw new Error(`catálogo com ${errosCatalogo.length} erro(s):\n  ${errosCatalogo.join('\n  ')}`)
  }

  const revisoes = new Map(
    ((await prisma.mvTemplateRevisao.findMany()) as Revisao[]).map((r) => [r.nome, r]),
  )
  const precisaCheckout = CATALOGO.some(ehBotaoDeCheckout)
  const base = precisaCheckout ? await baseDoCheckout() : null

  const vao: Array<{ t: TemplateMeta; corpo: string; origem: string }> = []
  const ficam: string[] = []
  for (const t of CATALOGO) {
    const rev = revisoes.get(t.nome)
    const aprovado = rev?.status === 'APROVADO' || t.nome in RESOLVIDOS
    if (!aprovado) {
      ficam.push(`${t.nome} — ${rev ? `status ${rev.status}` : 'não revisado'}`)
      continue
    }
    if (temBotaoUrl(t) && !ehBotaoDeCheckout(t)) {
      ficam.push(`${t.nome} — botão de URL sem domínio fixo definido`)
      continue
    }
    if (ehBotaoDeCheckout(t) && !base) {
      ficam.push(`${t.nome} — nenhum carrinho real para ler o domínio do checkout`)
      continue
    }
    const corpo = (rev?.corpoRevisado?.trim() || t.corpo).trim()
    const erros = errosDeForma(t, corpo)
    if (erros.length) {
      ficam.push(`${t.nome} — REPROVADO na forma: ${erros.join('; ')}`)
      continue
    }
    vao.push({ t, corpo, origem: rev?.corpoRevisado ? 'texto dela' : 'texto do catálogo' })
  }

  console.log(`WABA ${WABA} · ${existentes.length} template(s) já existentes`)
  if (base) console.log(`domínio fixo do checkout (lido de carrinho real): ${base}`)
  console.log(`\nVÃO (${vao.length}):`)
  for (const { t, origem } of vao) {
    const ja = naWaba.get(t.nome)
    console.log(`  ${ja ? '·' : '→'} ${t.nome.padEnd(30)} ${t.categoria.padEnd(9)} ${origem}${ja ? `  (já existe: ${ja.status})` : ''}`)
  }
  console.log(`\nFICAM (${ficam.length}):`)
  for (const f of ficam) console.log(`  · ${f}`)

  const novos = vao.filter(({ t }) => !naWaba.has(t.nome))
  if (novos.length === 0) {
    console.log('\nNada novo a submeter.')
    return
  }
  if (!APLICAR) {
    console.log(`\nDRY-RUN — nada foi enviado. ${novos.length} a submeter com --apply.`)
    return
  }

  console.log('')
  let falhas = 0
  for (const { t, corpo } of novos) {
    try {
      const r = await api(`/${WABA}/message_templates`, {
        method: 'POST',
        body: JSON.stringify(montar(t, corpo, base)),
      })
      // A Meta devolve a categoria que ELA atribuiu, que pode não ser a pedida.
      const cat = String(r.category ?? '?')
      console.log(`  ${cat === t.categoria ? '✓' : '⚠'} ${t.nome.padEnd(30)} ${String(r.status ?? '?').padEnd(9)} categoria: ${cat}`)
    } catch (e) {
      falhas++
      console.log(`  ✗ ${t.nome} — ${e instanceof Error ? e.message : e}`)
    }
  }
  if (falhas) {
    console.log(`\n${falhas} falha(s). Rode de novo: os já submetidos são pulados.`)
    process.exitCode = 1
  } else {
    console.log('\nSubmetidos. Acompanhe a revisão da Meta com --status.')
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error('\nfalhou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
