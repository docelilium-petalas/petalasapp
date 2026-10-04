/**
 * NÍVEL 3 — o motor de VERDADE com o canal de VERDADE, só para a lista branca.
 *
 *   python comcofre.py npm run test:mv -- 3        (precisa das credenciais Datafy no env)
 *
 * Cobre os itens 3 e 7 do §9 do prompt do porte:
 *   3. Cadência de carrinho ponta a ponta, com tempo comprimido, para a esposa:
 *      os 3 toques saem na ordem certa pelo `despachar()` real.
 *   7. Drop 10.10 em ensaio: cadências-CLONE `qa_campanha_1010_*` com audiência
 *      = só os dois números. As cadências reais `campanha_1010_*` nunca são
 *      tocadas, e o script prova isso pela contagem antes/depois.
 *
 * ── Por que roda no banco local `_qa` e não em produção ──────────────────────
 * Em produção o envio está PAUSADO e a campanha d1 tem 47 mensagens vencidas:
 * despausar para testar dispararia a campanha para clientes reais. Aqui o
 * banco é a cópia, as inscrições alheias ficam PAUSADAS durante o teste e
 * voltam no fim, e o canal é o de produção — a mensagem chega de verdade.
 *
 * ── As três cercas ───────────────────────────────────────────────────────────
 *   1. o banco precisa ser local e terminar em `_qa`;
 *   2. `MV_NUMEROS_TESTE` é fixada AQUI nos dois números — o gate do motor roda;
 *   3. o `fetch` é embrulhado: POST de mensagem para fora da lista volta 403
 *      antes de sair da máquina, e qualquer outra escrita externa também.
 *
 * Gasta 9 envios (3 do carrinho + 3 ondas × 2 números). Mensagem real é cobrada.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const URL_BANCO = process.env.DATABASE_URL ?? ''
if (!/@(localhost|127\.0\.0\.1):\d+\/[A-Za-z0-9_]+_qa(\?|$)/.test(URL_BANCO)) {
  console.error('✗ Nível 3 só roda em banco LOCAL terminado em `_qa` (ex.: localhost:5434/petalas_qa).')
  process.exit(2)
}
if (!process.env.DATAFY_TOKEN || !process.env.DATAFY_PHONE_NUMBER_ID) {
  console.error('✗ Nível 3 manda mensagem de verdade: rode com as credenciais Datafy no ambiente (comcofre).')
  process.exit(2)
}

const LISTA = { esposa: '5562981191215', luan: '5562982444219' } as const
const NUMEROS: string[] = Object.values(LISTA)
process.env.MV_NUMEROS_TESTE = NUMEROS.join(',')
process.env.MV_RAMPA = 'off'
process.env.JWT_SECRET ||= 'segredo-de-teste-nao-usar-em-producao'
process.env.APP_URL ||= 'https://petalas.docelilium.com.br'
delete process.env.DATAFY_BASE_URL
delete process.env.MV_ALERTA_NUMERO
delete process.env.MV_BRIEFING_NUMERO
delete process.env.CHATWOOT_URL
delete process.env.CHATWOOT_TOKEN

// ── A cerca do canal ──────────────────────────────────────────────────────────
type Envio = { para: string; template: string; http: number; wamid: string | null; bloqueado: boolean }
const envios: Envio[] = []
const fetchReal = globalThis.fetch
const ehPostDeMensagem = (url: string, metodo: string) => metodo === 'POST' && /\/messages$/.test(url)
globalThis.fetch = (async (entrada: string | URL | Request, init?: RequestInit) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  const metodo = (init?.method ?? 'GET').toUpperCase()
  const negar = (motivo: string) =>
    new Response(JSON.stringify({ error: { message: `nível 3: ${motivo}` } }), { status: 403, headers: { 'content-type': 'application/json' } })
  if (metodo === 'GET') return fetchReal(entrada, init)
  if (!ehPostDeMensagem(url, metodo) || !/datafyapi\.com\.br\//.test(url)) return negar('escrita externa bloqueada')
  let corpo: { to?: string; template?: { name?: string } } = {}
  try {
    corpo = JSON.parse(String(init?.body ?? '{}'))
  } catch {
    return negar('corpo ilegível')
  }
  const para = String(corpo.to ?? '').replace(/\D/g, '')
  const template = corpo.template?.name ?? '(texto livre)'
  if (!NUMEROS.includes(para)) {
    envios.push({ para, template, http: 403, wamid: null, bloqueado: true })
    return negar('destino fora da lista')
  }
  const r = await fetchReal(entrada, init)
  let wamid: string | null = null
  try {
    const j = (await r.clone().json()) as { messages?: Array<{ id?: string }> }
    wamid = j.messages?.[0]?.id ?? null
  } catch {
    wamid = null
  }
  envios.push({ para, template, http: r.status, wamid, bloqueado: false })
  return r
}) as typeof fetch

import { grupo, checa, igual, fechar } from './_kit'

const mascarar = (t: string) => `${t.slice(0, 4)}•••••${t.slice(-3)}`

async function main() {
  const { default: prisma } = await import('../../src/lib/prisma')
  const { despachar } = await import('../../src/lib/maquina-vendas/despachante')
  const { inscrever } = await import('../../src/lib/maquina-vendas/observador')
  const { obterAjustes, CURSOR_ULTIMO_ENVIO } = await import('../../src/lib/maquina-vendas/config')
  const { chaveTelefone } = await import('../../src/lib/maquina-vendas/telefone')
  const { GATILHOS_INTOCAVEIS } = await import('../../src/lib/maquina-vendas/cadencias-seed')

  const ORIGEM = 'qa_nivel3'
  const PREFIXO = 'qa_'
  const chaves = NUMEROS.map((t) => chaveTelefone(t))
  const intocaveis = [...GATILHOS_INTOCAVEIS]

  async function retratoDaCampanha() {
    const ins = await prisma.mvInscricao.groupBy({
      by: ['status'],
      where: { cadencia: { gatilho: { in: intocaveis } } },
      _count: true,
    })
    const msg = await prisma.mvMensagem.groupBy({
      by: ['status'],
      where: { inscricao: { cadencia: { gatilho: { in: intocaveis } } } },
      _count: true,
    })
    const ord = <T extends { status: string }>(a: T[]) => [...a].sort((x, y) => x.status.localeCompare(y.status))
    return JSON.stringify({ ins: ord(ins), msg: ord(msg) })
  }

  /**
   * Apaga SÓ o que este teste criou: inscrições de origem `qa_nivel3` e as
   * cadências `qa_*`. Nunca por telefone — os dois números de teste são de
   * gente de verdade e têm história na cópia (o do Luan está na audiência da
   * 10.10; a primeira versão apagava por telefone e levou essa inscrição junto).
   */
  async function limpar() {
    const ids = (
      await prisma.mvInscricao.findMany({
        where: { OR: [{ origem: ORIGEM }, { cadencia: { gatilho: { startsWith: PREFIXO } } }] },
        select: { id: true },
      })
    ).map((i) => i.id)
    await prisma.mvMensagem.deleteMany({ where: { inscricaoId: { in: ids } } })
    await prisma.mvInscricao.deleteMany({ where: { id: { in: ids } } })
    await prisma.mvCadencia.deleteMany({ where: { gatilho: { startsWith: PREFIXO } } })
  }

  await limpar()
  const campanhaAntesDeTudo = await retratoDaCampanha()
  const pausadasPeloTeste = await prisma.mvInscricao.findMany({ where: { status: 'ATIVA' }, select: { id: true } })
  await prisma.mvInscricao.updateMany({
    where: { id: { in: pausadasPeloTeste.map((i) => i.id) } },
    data: { status: 'PAUSADA', motivoParada: 'qa_nivel3: banco descartável' },
  })
  const ajustesAntes = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
  const ajustesQa = { tetoDiario: 1000, intervaloMinMinutos: 0, intervaloMaxMinutos: 0, janelaInicio: '00:00', janelaFim: '23:59', envioPausado: false }
  await prisma.mvAjustes.upsert({ where: { id: 'unico' }, create: { id: 'unico', ...ajustesQa }, update: ajustesQa })
  // Retrato DURANTE o teste (já com as alheias pausadas): é contra ele que o
  // item 7 se mede. O retrato de antes de tudo é conferido depois de restaurar.
  const campanhaAntes = await retratoDaCampanha()

  type Etapa = { ordem: number; delayMinutos: number; templateNome: string | null }
  async function inscreverQa(cad: { id: string; etapas: Etapa[] }, tel: string, ref: string, contexto: Record<string, string>, retrato: Record<string, unknown> = {}) {
    await inscrever({
      ajustes: await obterAjustes(),
      cadenciaId: cad.id,
      etapas: cad.etapas as never,
      origem: ORIGEM,
      refExterna: ref,
      nome: `${contexto.primeiro_nome} Teste`,
      e164: tel,
      chave: chaveTelefone(tel),
      ancora: new Date(),
      contexto,
      retrato,
    })
    return prisma.mvInscricao.findFirstOrThrow({ where: { cadenciaId: cad.id, origem: ORIGEM, refExterna: ref } })
  }
  /** Comprime o tempo: a próxima vence agora; todo envio dos números de teste recua 21 h (anti-eco é por pessoa). */
  async function vencerProxima(inscricaoId: string) {
    const prox = await prisma.mvMensagem.findFirst({ where: { inscricaoId, status: 'AGENDADA' }, orderBy: { etapaOrdem: 'asc' } })
    if (prox) await prisma.mvMensagem.update({ where: { id: prox.id }, data: { agendadaPara: new Date(Date.now() - 60_000) } })
    const enviadas = await prisma.mvMensagem.findMany({
      where: { status: 'ENVIADA', inscricao: { origem: ORIGEM, telefoneKey: { in: chaves } } },
      select: { id: true, enviadaEm: true },
    })
    for (const e of enviadas) {
      if (e.enviadaEm && Date.now() - e.enviadaEm.getTime() < 20 * 3_600_000) {
        await prisma.mvMensagem.update({ where: { id: e.id }, data: { enviadaEm: new Date(e.enviadaEm.getTime() - 21 * 3_600_000) } })
      }
    }
    return prox
  }
  async function tique() {
    await prisma.mvCursor.deleteMany({ where: { chave: CURSOR_ULTIMO_ENVIO } })
    const r = await despachar()
    if (r.enviadas === 0) console.log(`      tique sem envio: ${r.motivo ?? '?'}${r.falhas.length ? ` · ${JSON.stringify(r.falhas)}` : ''}`)
    return r
  }
  const evidencias: Array<{ item: string; template: string; numero: string; wamid: string | null; status: string; enviadaEm: string | null }> = []
  async function anotar(item: string, inscricaoId: string, numero: string) {
    const ms = await prisma.mvMensagem.findMany({ where: { inscricaoId }, orderBy: { etapaOrdem: 'asc' } })
    for (const m of ms) {
      evidencias.push({ item, template: m.templateNome ?? '-', numero: mascarar(numero), wamid: m.idExterno, status: m.status, enviadaEm: m.enviadaEm?.toISOString() ?? null })
    }
    return ms
  }

  try {
    // ════════════════════════════════════════════════════════════════════════
    grupo('Item 3 · Carrinho ponta a ponta, tempo comprimido, para a esposa')
    {
      const cad = await prisma.mvCadencia.findFirstOrThrow({ where: { gatilho: 'carrinho_abandonado' }, include: { etapas: { orderBy: { ordem: 'asc' } } } })
      const insc = await inscreverQa(cad, LISTA.esposa, 'qa_n3_carrinho', { primeiro_nome: 'Teste', peca: 'Vestido Alícia (teste)' }, {
        url: 'https://www.docelilium.com.br/checkout/v3/qa',
      })
      for (let volta = 0; volta < cad.etapas.length + 1; volta++) {
        const p = await vencerProxima(insc.id)
        if (!p) break
        await tique()
      }
      const ms = await anotar('3', insc.id, LISTA.esposa)
      const fim = await prisma.mvInscricao.findUniqueOrThrow({ where: { id: insc.id } })
      igual(ms.filter((m) => m.status === 'ENVIADA').length, cad.etapas.length, `${cad.etapas.length} toques ENVIADOS`)
      igual(ms.map((m) => m.templateNome), cad.etapas.map((e) => e.templateNome), 'na ordem da régua')
      checa(ms.every((m) => !!m.idExterno && m.idExterno.startsWith('wamid.') && !m.idExterno.startsWith('wamid.qa_')), 'cada toque tem wamid REAL da Meta')
      checa(ms.every((m) => !!m.textoEntregue && !/\{\{/.test(m.textoEntregue)), 'textoEntregue carimbado, sem {{ }}')
      igual(fim.status, 'CONCLUIDA', 'inscrição CONCLUIDA')
    }

    // ════════════════════════════════════════════════════════════════════════
    grupo('Item 7 · Drop 10.10 em ensaio — clones qa_, audiência = os dois números')
    {
      const originais = await prisma.mvCadencia.findMany({
        where: { gatilho: { in: intocaveis } },
        include: { etapas: { orderBy: { ordem: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      })
      checa(originais.length === 3, 'as 3 cadências reais da campanha existem (só leitura)', originais.map((c) => c.gatilho))
      const ordem = ['save_the_date', 'vespera', 'chegou']
      originais.sort((a, b) => ordem.findIndex((o) => a.gatilho.endsWith(o)) - ordem.findIndex((o) => b.gatilho.endsWith(o)))
      for (const orig of originais) {
        const clone = await prisma.mvCadencia.create({
          data: {
            nome: `${PREFIXO}${orig.nome}`,
            gatilho: `${PREFIXO}${orig.gatilho}`,
            ativo: true,
            etapas: {
              create: orig.etapas.map((e) => ({
                ordem: e.ordem,
                delayMinutos: 0,
                ancoradaEm: e.ancoradaEm,
                templateBase: e.templateBase,
                templateNome: e.templateNome,
                ehUltima: e.ehUltima,
              })),
            },
          },
          include: { etapas: { orderBy: { ordem: 'asc' } } },
        })
        const inscs = []
        for (const [quem, tel] of Object.entries(LISTA)) {
          inscs.push({ tel, insc: await inscreverQa(clone, tel, `qa_n3_${orig.gatilho}_${quem}`, { primeiro_nome: quem === 'luan' ? 'Luan' : 'Teste' }) })
        }
        for (const { insc } of inscs) {
          await vencerProxima(insc.id)
          await tique()
        }
        for (const { tel, insc } of inscs) {
          const ms = await anotar('7', insc.id, tel)
          checa(
            ms.length > 0 && ms.every((m) => m.status === 'ENVIADA' && !!m.idExterno && !m.idExterno.startsWith('wamid.qa_')),
            `${clone.gatilho} → ${mascarar(tel)}: ENVIADA com wamid real`,
            ms.map((m) => [m.status, m.erro]),
          )
        }
      }
      igual(await retratoDaCampanha(), campanhaAntes, 'cadências reais campanha_1010_*: inscrições e mensagens idênticas antes/depois')
    }

    // ════════════════════════════════════════════════════════════════════════
    grupo('Fechamento · nada saiu fora da lista')
    {
      checa(envios.length > 0, `houve envio real (${envios.length})`)
      checa(envios.every((e) => !e.bloqueado), 'a cerca não precisou bloquear nada (o gate do motor segurou antes)')
      checa(envios.every((e) => NUMEROS.includes(e.para)), 'todo POST foi para um dos dois números')
      checa(envios.every((e) => e.http === 200 && !!e.wamid), 'a Meta aceitou todos (HTTP 200 + wamid)', envios.filter((e) => e.http !== 200))
    }
  } finally {
    const pasta = join(process.env.TEMP ?? process.env.TMPDIR ?? '.', 'mv-porte')
    try {
      mkdirSync(pasta, { recursive: true })
      writeFileSync(join(pasta, 'n3-motor.json'), JSON.stringify({ em: new Date().toISOString(), evidencias, envios: envios.map((e) => ({ ...e, para: mascarar(e.para) })) }, null, 2), 'utf8')
    } catch (e) {
      console.error('não gravei a evidência em disco:', e instanceof Error ? e.message : e)
    }
    console.log('\n  template                          número         wamid')
    for (const ev of evidencias) console.log(`  ${ev.template.padEnd(33)} ${ev.numero}  ${ev.status.padEnd(9)} ${ev.wamid ?? '-'}`)
    await limpar()
    await prisma.mvInscricao.updateMany({ where: { id: { in: pausadasPeloTeste.map((i) => i.id) } }, data: { status: 'ATIVA', motivoParada: null } })
    if (ajustesAntes) {
      const { id: _id, ...resto } = ajustesAntes
      void _id
      await prisma.mvAjustes.update({ where: { id: 'unico' }, data: resto })
    }
    grupo('Restauração · a cópia voltou ao que era')
    igual(await retratoDaCampanha(), campanhaAntesDeTudo, 'campanha 10.10 da cópia: igual ao retrato de antes do teste')
    await prisma.$disconnect()
  }
  fechar('Nível 3 (motor)')
}

main().catch((e) => {
  console.error('\n✗ nível 3 abortou:', e instanceof Error ? e.stack : e)
  process.exit(1)
})
