/**
 * NÍVEL 2 — integração do motor contra um banco DESCARTÁVEL, com o canal falso.
 *
 *   npm run test:mv -- 2        (exige DATABASE_URL local terminando em `_qa`)
 *
 * Porte de e2e-maquina-vendas / qa-integracao / loop-qa / bateria-mv /
 * teste-ponta-a-ponta-funil do CarBoss, reescrito sobre o motor da Doce Lilium.
 *
 * ── Como o tempo é comprimido ──────────────────────────────────────────────
 * `despachar()` lê o relógio de verdade. Em vez de mexer no relógio, o teste
 * move os CARIMBOS: a próxima etapa vira "vencida há 1 min" e o envio anterior
 * recua 21 h (passa a trava anti-eco de 20 h). É o mesmo que esperar o tempo
 * passar, sem esperar.
 *
 * ── Por que nada sai daqui ─────────────────────────────────────────────────
 * `fetch` é trocado por um falso ANTES de qualquer módulo do motor carregar:
 * a Datafy falsa devolve `wamid.qa_N`, todo o resto devolve lista vazia, e
 * qualquer escrita fora da Datafy volta 403. O banco precisa ser local e
 * terminar em `_qa` — o teste se recusa a rodar em qualquer outro.
 *
 * O banco `_qa` é uma cópia de `petalas_prova`. As inscrições ATIVAS que não
 * são do teste (a campanha 10.10 da cópia) são PAUSADAS durante a bateria e
 * voltam a ATIVA no fim — na cópia, nunca em produção.
 */

const URL_BANCO = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1):\d+\/[A-Za-z0-9_]+_qa(\?|$)/.test(URL_BANCO)) {
  console.error('✗ Nível 2 só roda em banco LOCAL terminado em `_qa` (ex.: localhost:5434/petalas_qa).')
  process.exit(2)
}

process.env.JWT_SECRET ||= 'segredo-de-teste-nao-usar-em-producao'
process.env.APP_URL ||= 'https://petalas.docelilium.com.br'
process.env.DATAFY_TOKEN = 'qa-token-falso'
process.env.DATAFY_PHONE_NUMBER_ID = 'qa-phone'
process.env.DATAFY_WABA_ID = 'qa-waba'
process.env.DATAFY_BASE_URL = 'https://datafy.qa.invalid/v1'
process.env.MV_RAMPA = 'off'
delete process.env.MV_ALERTA_NUMERO
delete process.env.MV_BRIEFING_NUMERO
delete process.env.CHATWOOT_URL
delete process.env.CHATWOOT_TOKEN

// Números de teste do nível 2 — nunca recebem nada (o canal é falso), mas o
// gate da lista branca roda de verdade sobre eles.
const TEL = {
  carrinho: '5562990001001',
  pago: '5562990001002',
  enviado: '5562990001003',
  colecao: '5562990001004',
  reativacao: '5562990001005',
  resposta: '5562990001006',
  optout: '5562990001007',
  pedido: '5562990001008',
  humano: '5562990001009',
  humanoTx: '5562990001010',
  pausa: '5562990001011',
  corrida1: '5562990001012',
  corrida2: '5562990001013',
  disjuntor: '5562990001014',
  foraDaLista: '5562990009999',
}
process.env.MV_NUMEROS_TESTE = Object.entries(TEL)
  .filter(([k]) => k !== 'foraDaLista')
  .map(([, v]) => v)
  .join(',')

// ── O canal falso ─────────────────────────────────────────────────────────
type Chamada = { url: string; metodo: string; corpo: Record<string, unknown> | null; em: number }
const chamadas: Chamada[] = []
let lento = false
let seq = 0
const resp = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } })

globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  const metodo = (init?.method ?? 'GET').toUpperCase()
  let corpo: Record<string, unknown> | null = null
  try {
    corpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null
  } catch {
    corpo = null
  }
  chamadas.push({ url, metodo, corpo, em: Date.now() })
  if (url.startsWith('https://datafy.qa.invalid/')) {
    if (metodo === 'POST' && url.endsWith('/messages')) {
      if (lento) await new Promise((r) => setTimeout(r, 400))
      return resp({ messages: [{ id: `wamid.qa_${++seq}` }] })
    }
    if (url.includes('fields=health_status')) return resp({ health_status: { can_send_message: 'AVAILABLE', entities: [] } })
    if (url.includes('fields=')) return resp({ status: 'CONNECTED', quality_rating: 'GREEN', name_status: 'APPROVED', verified_name: 'QA' })
    if (url.includes('message_templates')) return resp({ data: [] })
    return resp({})
  }
  if (metodo !== 'GET') return resp({ erro: 'nível 2: escrita externa bloqueada' }, 403)
  return resp([])
}) as typeof fetch

import { grupo, checa, igual, fechar } from './_kit'

const postsDeEnvio = () => chamadas.filter((c) => c.metodo === 'POST' && c.url.endsWith('/messages'))
const tplDe = (c: Chamada) => (c.corpo?.template as { name?: string } | undefined)?.name
const paraDe = (c: Chamada) => String(c.corpo?.to ?? '')

async function main() {
  // Import dinâmico: as envs e o fetch falso precisam existir antes do motor.
  const { default: prisma } = await import('../../src/lib/prisma')
  const { despachar } = await import('../../src/lib/maquina-vendas/despachante')
  const { inscrever } = await import('../../src/lib/maquina-vendas/observador')
  const { obterAjustes, CURSOR_ULTIMO_ENVIO, liberadoParaEnvio } = await import('../../src/lib/maquina-vendas/config')
  const { rodarParadas } = await import('../../src/lib/maquina-vendas/paradas')
  const { registrarRespostas } = await import('../../src/lib/maquina-vendas/respostas')
  const { tratarEventoPedido } = await import('../../src/lib/maquina-vendas/gatilho-pedido')
  const { rodarVigia } = await import('../../src/lib/maquina-vendas/vigia')
  const { pediuParaSair } = await import('../../src/lib/maquina-vendas/opt-out')
  const { chaveTelefone } = await import('../../src/lib/maquina-vendas/telefone')
  const { distribuirNaJanela, parseJanela } = await import('../../src/lib/maquina-vendas/janela')
  const { GATILHOS_INTOCAVEIS } = await import('../../src/lib/maquina-vendas/cadencias-seed')
  const { HUMANO_HORAS } = await import('../../src/lib/atendimento/conversa')

  const ORIGEM = 'qa_nivel2'
  const chaves = Object.values(TEL).map((t) => chaveTelefone(t))
  const fmt = (d: Date | null | undefined) => (d ? d.toISOString() : 'null')

  // ── Limpeza e preparo ───────────────────────────────────────────────────
  async function limpar() {
    const ids = (await prisma.mvInscricao.findMany({ where: { telefoneKey: { in: chaves } }, select: { id: true } })).map((i) => i.id)
    await prisma.mvMensagem.deleteMany({ where: { inscricaoId: { in: ids } } })
    await prisma.mvInscricao.deleteMany({ where: { id: { in: ids } } })
    await prisma.mvOptOut.deleteMany({ where: { telefoneKey: { in: chaves } } })
    await prisma.mvResposta.deleteMany({ where: { telefoneKey: { in: chaves } } })
    await prisma.mvCursor.deleteMany({ where: { chave: { in: chaves.map((k) => `atendimento:humano:${k}`) } } })
  }
  await limpar()
  const pausadasPeloTeste = await prisma.mvInscricao.findMany({
    where: { status: 'ATIVA', NOT: { telefoneKey: { in: chaves } } },
    select: { id: true },
  })
  await prisma.mvInscricao.updateMany({
    where: { id: { in: pausadasPeloTeste.map((i) => i.id) } },
    data: { status: 'PAUSADA', motivoParada: 'qa_nivel2: banco descartável' },
  })
  await prisma.logEvento.deleteMany({ where: { tipo: 'disjuntor' } })
  const ajustesAntes = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  const ajustesQa = {
    tetoDiario: 1000,
    intervaloMinMinutos: 0,
    intervaloMaxMinutos: 0,
    janelaInicio: '00:00',
    janelaFim: '23:59',
    envioPausado: false,
  }
  await prisma.mvAjustes.upsert({ where: { id: 'unico' }, create: { id: 'unico', ...ajustesQa }, update: ajustesQa })

  // ── Utilidades ──────────────────────────────────────────────────────────
  async function cadencia(gatilho: string) {
    return prisma.mvCadencia.findFirstOrThrow({ where: { gatilho }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
  }
  const CONTEXTO = {
    primeiro_nome: 'Qa',
    peca: 'Vestido Qa',
    pedido: '#9001',
    prazo: '7 dias',
    rastreio: 'api/r/rastreio/qa.0000',
    colecao: 'Coleção Qa',
    link: 'https://www.docelilium.com.br/',
  }
  async function inscreverQa(
    gatilho: string,
    tel: string,
    ref: string,
    retrato: Record<string, unknown> = {},
    origem: string = ORIGEM,
  ) {
    const cad = await cadencia(gatilho)
    await inscrever({
      ajustes: await obterAjustes(),
      cadenciaId: cad.id,
      etapas: cad.etapas,
      origem,
      refExterna: ref,
      nome: 'Qa Teste',
      e164: tel,
      chave: chaveTelefone(tel),
      ancora: new Date(),
      contexto: CONTEXTO,
      retrato,
    })
    const insc = await prisma.mvInscricao.findFirstOrThrow({ where: { cadenciaId: cad.id, origem, refExterna: ref } })
    return { insc, cad }
  }
  /**
   * Isola o grupo: o que sobrou VIVO dos grupos anteriores (ex.: a régua de
   * pedido pago aberta no grupo 4) sai da fila. Sem isto, a próxima vencida de
   * outro grupo passa na frente e o tique mede a coisa errada.
   */
  async function isolar() {
    const vivas = await prisma.mvInscricao.findMany({
      where: { telefoneKey: { in: chaves }, status: { in: ['ATIVA', 'PAUSADA'] } },
      select: { id: true },
    })
    const ids = vivas.map((i) => i.id)
    await prisma.mvMensagem.updateMany({ where: { inscricaoId: { in: ids }, status: 'AGENDADA' }, data: { status: 'CANCELADA', erro: 'qa: isolamento' } })
    await prisma.mvInscricao.updateMany({ where: { id: { in: ids } }, data: { status: 'CANCELADA', motivoParada: 'qa: isolamento' } })
  }
  /** Comprime o tempo: a próxima etapa vence agora e o envio anterior recua 21 h. */
  async function vencerProxima(inscricaoId: string) {
    const prox = await prisma.mvMensagem.findFirst({
      where: { inscricaoId, status: 'AGENDADA' },
      orderBy: { etapaOrdem: 'asc' },
    })
    if (prox) await prisma.mvMensagem.update({ where: { id: prox.id }, data: { agendadaPara: new Date(Date.now() - 60_000) } })
    const enviadas = await prisma.mvMensagem.findMany({ where: { inscricaoId, status: 'ENVIADA' }, select: { id: true, enviadaEm: true } })
    for (const e of enviadas) {
      if (e.enviadaEm && Date.now() - e.enviadaEm.getTime() < 20 * 3_600_000) {
        await prisma.mvMensagem.update({ where: { id: e.id }, data: { enviadaEm: new Date(e.enviadaEm.getTime() - 21 * 3_600_000) } })
      }
    }
    return prox
  }
  async function tique() {
    await prisma.mvCursor.deleteMany({ where: { chave: CURSOR_ULTIMO_ENVIO } })
    return despachar()
  }
  async function msgs(inscricaoId: string) {
    return prisma.mvMensagem.findMany({ where: { inscricaoId }, orderBy: { etapaOrdem: 'asc' } })
  }

  try {
    // ════════════════════════════════════════════════════════════════════
    grupo('1 · Cada cadência fora da campanha chega a CONCLUIDA')
    const reguas: Array<[string, string, Record<string, unknown>]> = [
      ['carrinho_abandonado', TEL.carrinho, { url: 'https://www.docelilium.com.br/checkout/v3/qa' }],
      ['pedido_pago', TEL.pago, {}],
      ['pedido_enviado', TEL.enviado, {}],
      ['colecao_nova', TEL.colecao, {}],
      ['reativacao_60d', TEL.reativacao, {}],
    ]
    for (const [gatilho, tel, retrato] of reguas) {
      const antes = postsDeEnvio().length
      const { insc, cad } = await inscreverQa(gatilho, tel, `qa_${gatilho}`, retrato)
      for (let volta = 0; volta < cad.etapas.length + 2; volta++) {
        const p = await vencerProxima(insc.id)
        if (!p) break
        await tique()
      }
      const fim = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: insc.id } })
      const ms = await msgs(insc.id)
      const novos = postsDeEnvio().slice(antes)
      igual(fim.status, 'CONCLUIDA', `${cad.nome}: inscrição CONCLUIDA`)
      igual(ms.filter((m) => m.status === 'ENVIADA').length, cad.etapas.length, `${cad.nome}: ${cad.etapas.length} etapa(s) ENVIADA(s)`)
      checa(ms.every((m) => m.idExterno?.startsWith('wamid.qa_')), `${cad.nome}: toda ENVIADA tem wamid`)
      checa(
        ms.every((m) => !!m.textoEntregue && !/\{\{/.test(m.textoEntregue)),
        `${cad.nome}: textoEntregue carimbado e sem {{ }}`,
        ms.map((m) => m.textoEntregue),
      )
      igual(novos.map((c) => tplDe(c) ?? null), cad.etapas.map((e) => e.templateNome), `${cad.nome}: templates na ordem da régua`)
      checa(novos.every((c) => paraDe(c) === tel), `${cad.nome}: tudo para o número da inscrição`)
      igual(fim.tentativas, cad.etapas.length, `${cad.nome}: tentativas = etapas`)
      if (gatilho === 'carrinho_abandonado') {
        const comps = (novos[0]?.corpo?.template as { components?: Array<{ type: string; parameters?: Array<{ text?: string }> }> })?.components ?? []
        const botao = comps.find((c) => c.type === 'button')
        igual(botao?.parameters?.[0]?.text, 'checkout/v3/qa', 'carrinho: botão leva só o sufixo da URL')
      }
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('2 · Para quando a cliente responde')
    {
      await isolar()
      const { insc } = await inscreverQa('carrinho_abandonado', TEL.resposta, 'qa_resposta')
      await vencerProxima(insc.id)
      await tique()
      const enviada = (await msgs(insc.id)).find((m) => m.status === 'ENVIADA')
      checa(!!enviada, 'etapa 1 saiu')
      const fala = new Date(Date.now() + 1000)
      await prisma.mvResposta.create({
        data: {
          telefoneKey: chaveTelefone(TEL.resposta),
          telefoneE164: TEL.resposta,
          respondidoEm: fala,
          ultimasMsgs: [
            { em: fala.toISOString(), de: 'cliente', texto: 'Oi! Ainda tem no M?' },
          ],
          origem: 'qa',
        },
      })
      const rr = await registrarRespostas(new Date(Date.now() + 5000))
      checa(rr.respondeu >= 1, 'registrarRespostas marcou respondeuEm', rr)
      const p = await rodarParadas()
      checa(p.paradas >= 1, 'rodarParadas parou a inscrição')
      const fim = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: insc.id } })
      igual(fim.status, 'RESPONDEU', 'status RESPONDEU')
      checa(!!fim.respondeuEm, 'respondeuEm gravado')
      const restantes = (await msgs(insc.id)).filter((m) => m.etapaOrdem > 1)
      checa(restantes.every((m) => m.status === 'CANCELADA'), 'etapas seguintes CANCELADAS')
      const antes = postsDeEnvio().length
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes, 'nenhum envio depois da resposta')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('3 · Opt-out: "parar", "sair", frase inequívoca e o botão')
    {
      await isolar()
      checa(pediuParaSair('parar').saiu, '"parar" é saída')
      checa(pediuParaSair('Sair, por favor').saiu, '"Sair, por favor" é saída (cortesia não muda a intenção)')
      checa(pediuParaSair('Não quero mais receber').saiu, '"Não quero mais receber" é saída')
      checa(pediuParaSair('qualquer', 'Parar de receber').saiu, 'botão "Parar de receber" é saída')
      checa(!pediuParaSair('vou parar no shopping e passo aí').saiu, '"parar" no meio de frase NÃO é saída')
      checa(!pediuParaSair('não quero mais esse, tem o azul?').saiu, '"não quero mais esse" NÃO é saída (vira RESPONDEU)')
      const a = await inscreverQa('carrinho_abandonado', TEL.optout, 'qa_optout_carrinho')
      const b = await inscreverQa('colecao_nova', TEL.optout, 'qa_optout_colecao')
      await vencerProxima(a.insc.id)
      await tique()
      const fala = new Date(Date.now() + 1000)
      await prisma.mvResposta.create({
        data: {
          telefoneKey: chaveTelefone(TEL.optout),
          telefoneE164: TEL.optout,
          respondidoEm: fala,
          ultimasMsgs: [{ em: fala.toISOString(), de: 'cliente', texto: 'parar' }],
          origem: 'qa',
        },
      })
      await rodarParadas()
      const ia = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: a.insc.id } })
      const ib = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: b.insc.id } })
      igual(ia.status, 'OPT_OUT', 'carrinho: OPT_OUT')
      igual(ib.status, 'OPT_OUT', 'coleção do mesmo número: OPT_OUT também')
      checa(!!(await prisma.mvOptOut.findUnique({ where: { telefoneKey: chaveTelefone(TEL.optout) } })), 'MvOptOut gravado')
      const c = await inscreverQa('reativacao_60d', TEL.optout, 'qa_optout_depois')
      const antes = postsDeEnvio().length
      await vencerProxima(c.insc.id)
      await tique()
      const ic = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: c.insc.id } })
      igual(ic.status, 'OPT_OUT', 'inscrição semeada DEPOIS do opt-out é encerrada no despacho')
      igual(postsDeEnvio().length, antes, 'nenhum envio para quem saiu')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('4 · Pedido pago encerra o carrinho e abre a régua de pedido')
    {
      await isolar()
      // Origem real do observador: o gatilho de pedido só encerra `origem = carrinho`.
      const { insc } = await inscreverQa('carrinho_abandonado', TEL.pedido, 'qa_pedido', {}, 'carrinho')
      await vencerProxima(insc.id)
      await tique()
      const pedido = {
        id: 900001,
        number: 9001,
        total: '199.90',
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        contact_phone: TEL.pedido,
        contact_name: 'Qa Teste',
        customer: { name: 'Qa Teste', phone: TEL.pedido },
        products: [{ name: 'Vestido Qa', product_id: 1, variant_id: 1 }],
      }
      const r = await tratarEventoPedido('order/paid', pedido as never)
      igual(r.cadenciasEncerradas, 1, 'uma régua de carrinho encerrada')
      const fim = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: insc.id } })
      igual(fim.status, 'CONVERTEU', 'carrinho: CONVERTEU')
      igual(Number(fim.valorConvertido), 199.9, 'valor do pedido pago gravado')
      checa((await msgs(insc.id)).filter((m) => m.etapaOrdem > 1).every((m) => m.status === 'CANCELADA'), 'etapas seguintes CANCELADAS')
      checa(r.inscritoEmPedido, 'régua de pedido pago aberta', r)
      const ped = await prisma.mvInscricao.findFirst({ where: { origem: 'pedido', refExterna: '900001' } })
      igual(ped?.prioridade, 0, 'quem comprou entra na frente da fila (prioridade 0)')
      const r2 = await tratarEventoPedido('order/paid', pedido as never)
      checa(!r2.inscritoEmPedido && r2.motivo === 'já inscrito', 'reentrega do webhook não duplica a régua', r2)
    }

    // ════════════════════════════════════════════════════════════════════
    grupo(`5 · Equipe falou: silêncio de ${HUMANO_HORAS} h só para marketing`)
    {
      await isolar()
      const chave = chaveTelefone(TEL.humano)
      const { insc } = await inscreverQa('colecao_nova', TEL.humano, 'qa_humano')
      const desde = new Date(Date.now() - 3_600_000)
      await prisma.mvCursor.upsert({
        where: { chave: `atendimento:humano:${chave}` },
        create: { chave: `atendimento:humano:${chave}`, valor: desde.toISOString() },
        update: { valor: desde.toISOString() },
      })
      const antes = postsDeEnvio().length
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes, 'marketing não sai com a equipe atendendo')
      const m = (await msgs(insc.id))[0]
      const esperado = desde.getTime() + HUMANO_HORAS * 3_600_000 + 60_000
      checa(Math.abs(m.agendadaPara.getTime() - esperado) < 2000, `adiada para o fim das ${HUMANO_HORAS} h (+1 min)`, fmt(m.agendadaPara))
      // 13 h depois: o relógio venceu, sai.
      await prisma.mvCursor.update({
        where: { chave: `atendimento:humano:${chave}` },
        data: { valor: new Date(Date.now() - (HUMANO_HORAS + 1) * 3_600_000).toISOString() },
      })
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes + 1, `depois de ${HUMANO_HORAS} h o marketing sai`)

      const chaveTx = chaveTelefone(TEL.humanoTx)
      await prisma.mvCursor.upsert({
        where: { chave: `atendimento:humano:${chaveTx}` },
        create: { chave: `atendimento:humano:${chaveTx}`, valor: new Date().toISOString() },
        update: { valor: new Date().toISOString() },
      })
      const tx = await inscreverQa('pedido_enviado', TEL.humanoTx, 'qa_humano_tx')
      const antesTx = postsDeEnvio().length
      await vencerProxima(tx.insc.id)
      await tique()
      igual(postsDeEnvio().length, antesTx + 1, 'transacional (UTILITY) sai mesmo com a equipe atendendo')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('6 · Pausar, retomar, cancelar — e o freio geral')
    {
      await isolar()
      const { insc } = await inscreverQa('carrinho_abandonado', TEL.pausa, 'qa_pausa')
      await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { envioPausado: true } })
      await vencerProxima(insc.id)
      const antes = postsDeEnvio().length
      const r1 = await tique()
      igual(r1.motivo, 'envio pausado nos ajustes', 'freio geral: nada sai')
      igual(postsDeEnvio().length, antes, 'freio geral: zero POST')
      await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { envioPausado: false } })

      await prisma.mvInscricao.update({ where: { id: insc.id }, data: { status: 'PAUSADA' } })
      await tique()
      igual(postsDeEnvio().length, antes, 'inscrição PAUSADA não sai')
      // Retomar — o mesmo que `retomarInscricao`: o que venceu é redistribuído.
      const aj = await obterAjustes()
      const agora = new Date()
      const vencidas = await prisma.mvMensagem.findMany({
        where: { inscricaoId: insc.id, status: 'AGENDADA', agendadaPara: { lte: agora } },
        orderBy: { etapaOrdem: 'asc' },
      })
      const horarios = distribuirNaJanela(agora, vencidas.length, parseJanela(aj.janelaInicio, aj.janelaFim))
      await prisma.$transaction([
        prisma.mvInscricao.update({ where: { id: insc.id }, data: { status: 'ATIVA', motivoParada: null } }),
        ...vencidas.map((m, k) => prisma.mvMensagem.update({ where: { id: m.id }, data: { agendadaPara: horarios[k] } })),
      ])
      checa(horarios.every((h) => h.getTime() >= agora.getTime() - 1000), 'retomar não agenda nada no passado')
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes + 1, 'retomada: volta a sair')
      // Cancelar
      await prisma.$transaction([
        prisma.mvInscricao.update({ where: { id: insc.id }, data: { status: 'CANCELADA', motivoParada: 'qa' } }),
        prisma.mvMensagem.updateMany({ where: { inscricaoId: insc.id, status: 'AGENDADA' }, data: { status: 'CANCELADA', erro: 'qa' } }),
      ])
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes + 1, 'cancelada: nada mais sai')
      checa((await msgs(insc.id)).every((m) => m.status !== 'AGENDADA'), 'cancelada: nenhuma AGENDADA sobra')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('7 · Lista branca: fora dela, VETADA e registrada — nunca redirecionada')
    {
      await isolar()
      checa(!liberadoParaEnvio(TEL.foraDaLista), 'número fora de MV_NUMEROS_TESTE não é liberado')
      const logAntes = await prisma.logEvento.count({ where: { tipo: 'envio_vetado_teste' } })
      const { insc } = await inscreverQa('pedido_pago', TEL.foraDaLista, 'qa_fora_da_lista')
      const antes = postsDeEnvio().length
      await vencerProxima(insc.id)
      await tique()
      igual(postsDeEnvio().length, antes, 'nenhum POST')
      const m = (await msgs(insc.id))[0]
      igual(m.status, 'VETADA', 'mensagem VETADA')
      igual(m.erro, 'fora_da_lista_de_teste', 'motivo gravado')
      checa((await prisma.logEvento.count({ where: { tipo: 'envio_vetado_teste' } })) > logAntes, 'LogEvento envio_vetado_teste criado')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('8 · Corrida: dois tiques ao mesmo tempo não mandam em dobro')
    {
      await isolar()
      const a = await inscreverQa('pedido_pago', TEL.corrida1, 'qa_corrida_1')
      const b = await inscreverQa('pedido_pago', TEL.corrida2, 'qa_corrida_2')
      await vencerProxima(a.insc.id)
      await vencerProxima(b.insc.id)
      await prisma.mvCursor.deleteMany({ where: { chave: CURSOR_ULTIMO_ENVIO } })
      const antes = postsDeEnvio().length
      lento = true
      const [r1, r2] = await Promise.all([despachar(), despachar()])
      lento = false
      const novos = postsDeEnvio().slice(antes)
      const porDestino = new Map<string, number>()
      for (const c of novos) porDestino.set(paraDe(c), (porDestino.get(paraDe(c)) ?? 0) + 1)
      checa([...porDestino.values()].every((n) => n === 1), 'nenhuma mensagem enviada duas vezes', Object.fromEntries(porDestino))
      igual(novos.length, 1, 'só um dos dois tiques envia (o intervalo vale entre tiques simultâneos)')
      checa(r1.enviadas + r2.enviadas === novos.length, 'o placar dos tiques bate com os POSTs', { r1, r2 })
      const wamids = await prisma.mvMensagem.findMany({ where: { idExterno: { startsWith: 'wamid.qa_' } }, select: { idExterno: true } })
      igual(new Set(wamids.map((w) => w.idExterno)).size, wamids.length, 'nenhum wamid repetido no banco')
      checa(
        [r1.motivo, r2.motivo].includes('outro tique está despachando'),
        'o perdedor da corrida diz por que não enviou',
        { r1: r1.motivo, r2: r2.motivo },
      )
      igual(await prisma.mvCursor.count({ where: { chave: 'mv:despacho_trava' } }), 0, 'a trava foi solta depois do tique')
      // Trava órfã (tique que morreu no meio) vence sozinha em 2 min.
      await prisma.mvCursor.create({ data: { chave: 'mv:despacho_trava', valor: `${new Date(Date.now() - 3 * 60_000).toISOString()}|orfa` } })
      await vencerProxima(b.insc.id)
      await vencerProxima(a.insc.id)
      const r3 = await tique()
      checa(r3.motivo !== 'outro tique está despachando', 'trava órfã de 3 min é tomada', r3)
      await prisma.mvCursor.create({ data: { chave: 'mv:despacho_trava', valor: `${new Date().toISOString()}|viva` } })
      const r4 = await tique()
      igual(r4.motivo, 'outro tique está despachando', 'trava viva segura o tique')
      await prisma.mvCursor.deleteMany({ where: { chave: 'mv:despacho_trava' } })
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('9 · Disjuntor abre com falha em série e o despacho para')
    {
      await isolar()
      const { insc } = await inscreverQa('reativacao_60d', TEL.disjuntor, 'qa_disjuntor')
      const base = await prisma.mvMensagem.findFirstOrThrow({ where: { inscricaoId: insc.id } })
      await prisma.mvMensagem.createMany({
        data: [2, 3, 4].map((ordem) => ({
          inscricaoId: insc.id,
          etapaOrdem: ordem,
          mensagemFinal: base.mensagemFinal,
          agendadaPara: new Date(),
          status: 'ERRO',
          erro: 'qa: falha de canal simulada',
          naturezaFalha: 'CANAL_FORA',
          templateNome: base.templateNome,
        })),
      })
      const v = await rodarVigia(new Date())
      checa(!('erro' in v), 'vigia rodou', v)
      if (!('erro' in v)) {
        igual(v.veredito.codigo, 'FALHA_EM_SERIE', 'veredito FALHA_EM_SERIE')
        checa(v.pausou, 'vigia pausou o envio')
      }
      igual((await prisma.mvAjustes.findUniqueOrThrow({ where: { id: 'unico' } })).envioPausado, true, 'envioPausado = true no banco')
      checa((await prisma.logEvento.count({ where: { tipo: 'disjuntor', nivel: 'ERRO' } })) >= 1, 'LogEvento disjuntor nível ERRO')
      await vencerProxima(insc.id)
      const r = await tique()
      igual(r.motivo, 'envio pausado nos ajustes', 'despacho parado pelo disjuntor')
      await prisma.mvMensagem.deleteMany({ where: { inscricaoId: insc.id, status: 'ERRO' } })
      await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { envioPausado: false } })
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('10 · "Atualizar" e observadores: nunca enviam, nunca escrevem no CRM')
    {
      const { observarCarrinhosAbandonados } = await import('../../src/lib/maquina-vendas/observador')
      const { observarColunas } = await import('../../src/lib/maquina-vendas/observador-colunas')
      const { observarRastreios } = await import('../../src/lib/maquina-vendas/observador-rastreio')
      const { observarMarketing } = await import('../../src/lib/maquina-vendas/observador-marketing')
      const { observarCampanhas } = await import('../../src/lib/maquina-vendas/campanha-datada')
      const contar = async () => ({
        deal: await prisma.deal.count(),
        stage: await prisma.stage.count(),
        pipeline: await prisma.pipeline.count(),
        contact: await prisma.contact.count(),
        activity: await prisma.activity.count(),
        dealStageHistory: await prisma.dealStageHistory.count(),
        campanha: await prisma.mvInscricao.count({ where: { cadencia: { gatilho: { in: [...GATILHOS_INTOCAVEIS] } } } }),
      })
      const antes = await contar()
      const chamadasAntes = chamadas.length
      const falhas: string[] = []
      const passo = async (nome: string, f: () => Promise<unknown>) => {
        try {
          await f()
        } catch (e) {
          falhas.push(`${nome}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      // A sequência exata de `rodarObservadorManual` (o botão Atualizar)…
      await passo('carrinhos', () => observarCarrinhosAbandonados())
      await passo('colunas', () => observarColunas(new Date()))
      await passo('paradas', () => rodarParadas())
      // …e o resto dos observadores do tique.
      await passo('rastreio', () => observarRastreios())
      await passo('marketing', () => observarMarketing())
      await passo('campanha', () => observarCampanhas())
      const depois = await contar()
      igual(depois, antes, 'contagens de Deal/Stage/Pipeline/Contact/Activity/DealStageHistory/campanha iguais')
      const novas = chamadas.slice(chamadasAntes)
      igual(novas.filter((c) => c.metodo !== 'GET').length, 0, 'zero chamada externa que não seja GET (nada enviado, nada escrito na Nuvemshop)')
      if (falhas.length) console.log(`      (observadores sem credencial de loja na cópia: ${falhas.join(' · ')})`)
      const fs = await import('node:fs')
      const fonte = fs.readFileSync('src/app/actions/maquina-vendas.ts', 'utf8')
      const corpo = fonte.slice(fonte.indexOf('export async function rodarObservadorManual'), fonte.indexOf('// INSCRIÇÕES'))
      checa(corpo.length > 0 && !/despachar\(|observarCampanhas\(/.test(corpo), 'o botão Atualizar não chama despachar nem a campanha (fonte)')
    }

    // ════════════════════════════════════════════════════════════════════
    grupo('11 · Fechamento: nada saiu fora da lista')
    {
      const posts = postsDeEnvio()
      checa(posts.length > 0, `houve envio no canal falso (${posts.length})`)
      checa(posts.every((c) => liberadoParaEnvio(paraDe(c))), 'todo POST foi para número da lista branca')
      checa(chamadas.every((c) => !/datafyapi\.com\.br|graph\.facebook\.com/.test(c.url)), 'nenhuma chamada ao canal real')
    }
  } finally {
    await limpar()
    await prisma.mvInscricao.updateMany({
      where: { id: { in: pausadasPeloTeste.map((i) => i.id) } },
      data: { status: 'ATIVA', motivoParada: null },
    })
    if (ajustesAntes) {
      const { id: _id, ...resto } = ajustesAntes
      void _id
      await prisma.mvAjustes.update({ where: { id: 'unico' }, data: resto })
    }
    await prisma.$disconnect()
  }
  fechar('Nível 2')
}

main().catch((e) => {
  console.error('\n✗ nível 2 abortou:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
