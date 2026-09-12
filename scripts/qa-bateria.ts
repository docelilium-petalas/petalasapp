/**
 * QA SEM TELA — o que dá para provar sem clicar em nada.
 *
 *   npx tsx --env-file=.env scripts/qa-bateria.ts
 *
 * ⚠️ Cria um usuário de teste no banco apontado por DATABASE_URL. Roda contra
 * o banco LOCAL de desenvolvimento, nunca contra produção — o script recusa se
 * o endereço não for localhost.
 *
 * Existe porque metade do que foi entregue hoje é regra, não pixel: se a régua
 * colapsa, se a importação duplica contato, se uma rota aceita corpo sem
 * segredo. Isso se prova por medição, e medição não depende de mouse — que
 * nesta máquina é disputado por duas sessões e pelo próprio dono.
 */

import bcrypt from 'bcryptjs'
import prisma from '../src/lib/prisma'
import { validarCatalogo, esqueletoNomeado, VARIAVEIS, CATALOGO } from '../src/lib/maquina-vendas/catalogo-templates'
import { pediuParaSair } from '../src/lib/maquina-vendas/opt-out'
import { agendarEtapas } from '../src/lib/maquina-vendas/agenda'
import { julgar, type ContatoExistente } from '../src/lib/importar-contatos'
import { lerCsv, detectarSeparador } from '../src/lib/csv'
import { chaveTelefone, paraE164 } from '../src/lib/maquina-vendas/telefone'
import { validarLogo, MARCA_PADRAO } from '../src/lib/marca'
import type { Ajustes } from '../src/lib/maquina-vendas/config'
import { sufixoDoBotao } from '../src/lib/maquina-vendas/canal'
import { createHmac } from 'node:crypto'

const BASE = process.env.QA_BASE ?? 'http://localhost:3000'
const EMAIL = 'qa.local@petalas.test'
const SENHA = 'qa-local-nao-e-producao'

let passou = 0
let falhou = 0
const falhas: string[] = []

function checar(n: number, titulo: string, ok: boolean, detalhe = ''): void {
  if (ok) {
    passou++
    console.log(`  ${String(n).padStart(2)}. ✓ ${titulo}${detalhe ? '  — ' + detalhe : ''}`)
  } else {
    falhou++
    falhas.push(`${n}. ${titulo}${detalhe ? ' — ' + detalhe : ''}`)
    console.log(`  ${String(n).padStart(2)}. ✗ ${titulo}${detalhe ? '  — ' + detalhe : ''}`)
  }
}

const AJUSTES: Ajustes = {
  tetoDiario: 40,
  intervaloMinMinutos: 3,
  intervaloMaxMinutos: 12,
  janelaInicio: '09:00',
  janelaFim: '20:00',
  envioPausado: true,
  cupomCarrinho: null,
  descontoCarrinho: null,
}

async function main() {
  const url = process.env.DATABASE_URL ?? ''
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error('\nRecusado: esta bateria cria usuário e só roda contra banco local.\n')
    process.exit(1)
  }

  console.log('\n═══ REGRAS (sem tela, sem rede) ═══\n')

  // ── catálogo de mensagens ────────────────────────────────────────────────
  const erros = validarCatalogo()
  checar(1, 'catálogo da Meta sem erro de forma', erros.length === 0, erros[0] ?? `${CATALOGO.length} templates`)

  const nomesInvalidos = Object.values(VARIAVEIS).flat().filter((v) => !['primeiro_nome', 'peca', 'pedido', 'cupom', 'desconto', 'rastreio', 'colecao', 'prazo', 'link'].includes(v))
  checar(2, 'vocabulário de variáveis unificado', nomesInvalidos.length === 0, nomesInvalidos.join(',') || 'todos existem no contexto')

  const duvida = esqueletoNomeado('dl_carrinho_duvida_v1')
  checar(3, 'sem preposição colada em variável com artigo', !/\bde \{\{peca\}\}/.test(duvida), duvida.split('\n')[0].slice(0, 58))

  // ── a régua que colapsava ────────────────────────────────────────────────
  const regua = [
    { ordem: 1, delayMinutos: 0, ancoradaEm: 'gatilho' },
    { ordem: 2, delayMinutos: 1440, ancoradaEm: 'entrega' },
    { ordem: 3, delayMinutos: 2880, ancoradaEm: 'entrega' },
  ]
  for (const [i, idade] of [1, 27, 71].entries()) {
    const datas = agendarEtapas({ ancora: new Date(Date.now() - idade * 3_600_000), etapas: regua, ajustes: AJUSTES })
    const gaps = datas.slice(1).map((d, k) => (+d - +datas[k]) / 3_600_000)
    checar(4 + i, `carrinho de ${idade}h não vira rajada`, gaps.every((g) => g >= 23), gaps.map((g) => '+' + g.toFixed(0) + 'h').join(' '))
  }

  // ── detector de opt-out ──────────────────────────────────────────────────
  const casos: [string, boolean][] = [
    ['para', true], ['para, por favor', true], ['não quero mais receber', true],
    ['me tira dessa lista', true], ['Não tenho interesse', true],
    ['Parabéns pelo atendimento!', false], ['Guardei para você, obrigada!', false],
    ['Quanto sai o frete para Goiânia?', false], ['não quero mais o azul, quero o rosa', false],
  ]
  const errosOptOut = casos.filter(([t, e]) => pediuParaSair(t).saiu !== e)
  checar(7, 'detector de "quero sair" nas 9 frases', errosOptOut.length === 0, errosOptOut.map(([t]) => t).join(' | ') || `${casos.length}/${casos.length}`)
  checar(8, 'botão de saída é definitivo', pediuParaSair(null, 'Parar de receber').origem === 'botao')

  // ── leitor de planilha ───────────────────────────────────────────────────
  const excelBr = '﻿Nome;Telefone\nMaria;"(62) 99963-0120"\n'
  checar(9, 'CSV do Excel brasileiro (ponto e vírgula + BOM)', detectarSeparador(excelBr) === ';' && lerCsv(excelBr)[1][0] === 'Maria')
  checar(10, 'aspas protegem a vírgula de dentro', lerCsv('a,b\n"Costa, João",2\n')[1][0] === 'Costa, João')

  // ── importação: a duplicata que não pode acontecer ───────────────────────
  const existentes: ContatoExistente[] = [{ id: 'c1', telefone: '556299630120', email: 'ja@tem.com', cidade: null, estado: null, documento: null, sobrenome: null }]
  const chaveDe = (t: string) => { const e = paraE164(t); return e ? chaveTelefone(e) : '' }
  const r = julgar([
    { nome: 'Marina', telefone: '(62) 99963-0120', email: 'outro@x.com', cidade: 'Goiânia' },
    { nome: 'Bruna', telefone: '62998887777' },
    { nome: 'Bruna', telefone: '(62) 99888-7777' },
    { nome: 'X', telefone: '62997776666' },
  ], existentes, chaveDe)
  checar(11, 'telefone de 13 dígitos casa com contato de 12', r.vereditos[0].contatoId === 'c1', 'sem criar duplicata')
  checar(12, 'planilha não sobrescreve e-mail já preenchido', !r.vereditos[0].camposAtualizados?.includes('e-mail'))
  checar(13, 'repetido no próprio arquivo é recusado', r.vereditos[2].acao === 'ignorar', r.vereditos[2].motivo)
  checar(14, 'nome de uma letra é recusado', r.vereditos[3].acao === 'ignorar', r.vereditos[3].motivo)

  // ── marca ────────────────────────────────────────────────────────────────
  checar(15, 'logo gigante é recusada antes de salvar', !!validarLogo('data:image/png;base64,' + 'A'.repeat(500000)))
  checar(16, 'formato inválido de logo é recusado', !!validarLogo('data:application/pdf;base64,AAA'))
  checar(17, 'marca tem padrão quando ninguém configurou', MARCA_PADRAO.nome === 'Doce Lilium')

  // ── O retorno da Marília, 11/09/2026 ───────────────────────────────────
  const semArtigo = CATALOGO.filter((t) => (VARIAVEIS[t.nome] ?? []).includes('peca'))
    .every((t) => !/^(o|a|os|as) /i.test(t.exemplos[(VARIAVEIS[t.nome] ?? []).indexOf('peca')] ?? ''))
  checar(31, 'exemplo da peça sem artigo — o "do o" da prévia', semArtigo)
  const v2 = CATALOGO.find((t) => t.nome === 'dl_carrinho_ultimo_v2')
  checar(32, 'último toque sem cupom (v2 no lugar da v1)', !!v2 && !/cupom/i.test(v2.corpo) && !CATALOGO.some((t) => t.nome === 'dl_carrinho_ultimo_v1'))
  checar(
    33,
    'botão de URL manda só o caminho',
    sufixoDoBotao('https://loja.com.br/checkout/v3/abc?x=1') === 'checkout/v3/abc?x=1',
    sufixoDoBotao('https://loja.com.br/checkout/v3/abc?x=1'),
  )

  // ── banco ────────────────────────────────────────────────────────────────
  console.log('\n═══ BANCO ═══\n')
  const cadCarrinho = await prisma.mvCadencia.findFirst({ where: { gatilho: 'carrinho_abandonado' }, include: { etapas: true } })
  checar(18, 'cadência de carrinho semeada com teto de idade', cadCarrinho?.idadeMaximaHoras === 72, `${cadCarrinho?.etapas.length ?? 0} etapas`)
  checar(19, 'última etapa se anuncia como última', !!cadCarrinho?.etapas.some((e) => e.ehUltima))
  const ultimaEtapa = cadCarrinho?.etapas.sort((a, b) => b.ordem - a.ordem)[0]
  checar(34, 'régua de carrinho com 3 toques, o último é a v2', cadCarrinho?.etapas.length === 3 && ultimaEtapa?.templateNome === 'dl_carrinho_ultimo_v2' && !!ultimaEtapa?.ehUltima)
  const cadPedido = await prisma.mvCadencia.findFirst({ where: { gatilho: 'pedido_pago' }, include: { etapas: true } })
  checar(20, 'cadência de pedido pago semeada', (cadPedido?.etapas.length ?? 0) === 1)
  checar(21, 'envio nasce PAUSADO', (await prisma.mvAjustes.findUnique({ where: { id: 'unico' } }))?.envioPausado !== false, 'sem linha = padrão pausado')

  // ── rotas ────────────────────────────────────────────────────────────────
  console.log('\n═══ ROTAS (servidor de verdade) ═══\n')
  const senhaHash = await bcrypt.hash(SENHA, 10)
  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    create: { email: EMAIL, passwordHash: senhaHash },
    update: { passwordHash: senhaHash },
  })
  await prisma.userRole.upsert({ where: { userId_role: { userId: user.id, role: 'ADMIN' } }, create: { userId: user.id, role: 'ADMIN' }, update: {} })

  const login = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: SENHA }),
  })
  const cookie = login.headers.get('set-cookie')?.split(';')[0] ?? ''
  checar(22, 'login com a senha certa devolve sessão', login.status === 200 && cookie.includes('ocr_auth_token'), `HTTP ${login.status}`)

  const errado = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: 'senha-errada' }),
  })
  checar(23, 'senha errada devolve 401 (e não 500)', errado.status === 401, `HTTP ${errado.status}`)

  const telas = ['/dashboard', '/pipeline', '/contacts', '/activities', '/settings', '/maquina-vendas', '/maquina-vendas/templates', '/resultados', '/desafios', '/radar', '/bussola', '/cadencias', '/caixa-rapido', '/arquivados']
  const ruins: string[] = []
  for (const t of telas) {
    const res = await fetch(`${BASE}${t}`, { headers: { cookie }, redirect: 'manual' })
    if (res.status !== 200) ruins.push(`${t}=${res.status}`)
  }
  checar(24, `as ${telas.length} telas abrem logado`, ruins.length === 0, ruins.join(' ') || 'todas 200')

  // `/relatorios` e `/utm-analytics` NAO sao telas: foram consolidadas na
  // Bussola e hoje so redirecionam. Um teste que so olha o codigo HTTP
  // acusaria as duas como quebradas — o que importa e PARA ONDE elas mandam.
  const consolidadas: string[] = []
  for (const t of ['/relatorios', '/utm-analytics']) {
    const res = await fetch(`${BASE}${t}`, { headers: { cookie }, redirect: 'manual' })
    const destino = res.headers.get('location') ?? ''
    if (!destino.includes('/bussola')) consolidadas.push(`${t}->${destino || res.status}`)
  }
  checar(25, 'telas consolidadas levam para a Bússola', consolidadas.length === 0, consolidadas.join(' ') || 'as duas')

  const semCookie = await fetch(`${BASE}/pipeline`, { redirect: 'manual' })
  checar(26, 'tela protegida sem sessão redireciona', semCookie.status === 307, `HTTP ${semCookie.status}`)

  // ── portas para fora ─────────────────────────────────────────────────────
  console.log('\n═══ SEGURANÇA DAS PORTAS ═══\n')
  const cronSemSegredo = await fetch(`${BASE}/api/cron/maquina-vendas`)
  checar(27, 'cron recusa sem o segredo certo', cronSemSegredo.status === 401 || cronSemSegredo.status === 503, `HTTP ${cronSemSegredo.status}`)

  const zap = await fetch(`${BASE}/api/webhook/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"entry":[]}' })
  checar(28, 'webhook do WhatsApp falha FECHADA', zap.status === 401 || zap.status === 503, `HTTP ${zap.status}`)

  const zapGet = await fetch(`${BASE}/api/webhook/whatsapp?hub.mode=subscribe&hub.challenge=123&hub.verify_token=errado`)
  checar(29, 'verificação da Meta recusa token errado', zapGet.status === 403 || zapGet.status === 503, `HTTP ${zapGet.status}`)

  const lgpd = await fetch(`${BASE}/api/webhook/nuvemshop/lgpd/inexistente`, { method: 'POST', body: '{}' })
  checar(30, 'rota de LGPD recusa tipo desconhecido', lgpd.status === 404, `HTTP ${lgpd.status}`)

  // A assinatura da Datafy: `x-datafy-signature-256`, HMAC do corpo cru com o
  // `whsec_…`. Só dá para provar com o segredo local de teste no ambiente.
  const segredoDatafy = process.env.DATAFY_WEBHOOK_SECRET
  if (segredoDatafy) {
    const corpoTeste = '{"entry":[]}'
    const assinado = createHmac('sha256', segredoDatafy).update(corpoTeste, 'utf8').digest('hex')
    const certo = await fetch(`${BASE}/api/webhook/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-datafy-signature-256': `sha256=${assinado}` }, body: corpoTeste })
    checar(35, 'webhook aceita a assinatura da Datafy', certo.status === 200, `HTTP ${certo.status}`)
    const forjado = await fetch(`${BASE}/api/webhook/whatsapp`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-datafy-signature-256': 'sha256=' + '0'.repeat(64) }, body: corpoTeste })
    checar(36, 'webhook recusa assinatura forjada', forjado.status === 401, `HTTP ${forjado.status}`)
  } else {
    checar(35, 'webhook aceita a assinatura da Datafy', false, 'DATAFY_WEBHOOK_SECRET ausente no ambiente local')
  }

  // ── limpeza ──────────────────────────────────────────────────────────────
  await prisma.userRole.deleteMany({ where: { userId: user.id } })
  await prisma.user.delete({ where: { id: user.id } })

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`  ${passou} passaram · ${falhou} falharam`)
  if (falhas.length) {
    console.log('\n  o que falhou:')
    falhas.forEach((f) => console.log('    ' + f))
  }
  console.log()
}

main()
  .then(() => process.exit(falhou > 0 ? 1 : 0))
  .catch((e) => {
    console.error('\nbateria quebrou:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
