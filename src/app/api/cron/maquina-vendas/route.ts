import { NextResponse } from 'next/server'
import { observarCarrinhosAbandonados } from '@/lib/maquina-vendas/observador'
import { observarColunas } from '@/lib/maquina-vendas/observador-colunas'
import { despachar } from '@/lib/maquina-vendas/despachante'
import { observarRastreios } from '@/lib/maquina-vendas/observador-rastreio'
import { sincronizarFunis } from '@/lib/maquina-vendas/funis-crm'
import { observarMarketing } from '@/lib/maquina-vendas/observador-marketing'
import { observarCampanhas } from '@/lib/maquina-vendas/campanha-datada'
import { registrarRespostas } from '@/lib/maquina-vendas/respostas'
import { rodarParadas } from '@/lib/maquina-vendas/paradas'
import { rodarVigia } from '@/lib/maquina-vendas/vigia'
import { anotarTextosNoChatwoot } from '@/lib/maquina-vendas/chatwoot-nota'
import { expirarHandoffs } from '@/lib/maquina-vendas/handoff'
import { rodarBriefingDiario } from '@/lib/maquina-vendas/briefing'
import { entregarAvisosPendentes } from '@/lib/atendimento/aviso-equipe'
import prisma from '@/lib/prisma'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O TIQUE DA MÁQUINA — o único ponto de entrada do relógio (n8n, de 5 em 5 min).
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Toda a decisão vive AQUI, no CRM. O n8n do outro lado é um gatilho de tempo
 * e um GET nesta rota.
 *
 * ── SEGURANÇA: FALHA FECHADA ──────────────────────────────────────────────
 * Sem `CRON_SECRET`, a rota RECUSA (503). Nunca `if (secret) {...}`: isso
 * deixa a porta aberta no dia em que a env some.
 *
 * ── ERRO NÃO É 200 ────────────────────────────────────────────────────────
 * Antes do porte, este tique devolvia 200 em erro e cada fase engolia a
 * própria falha com `.catch`. O n8n via verde e ninguém via nada.
 *
 * Agora há duas classes de fase, como na CarBoss:
 *   NÚCLEO   — observar, ler respostas, parar, vigiar, despachar. Se uma
 *              delas cai, o tique PARA ali e devolve 500: mandar mensagem com
 *              a leitura do mundo pela metade é pior do que não mandar.
 *   ENTORNO  — rastreio, marketing, campanha, funis, nota no Chatwoot,
 *              expirar handoff, briefing. Falha de uma não impede a Máquina
 *              de MANDAR (trocaria um problema de visibilidade por um de
 *              operação) — mas o tique termina com 500 e a falha vai para o
 *              LogEvento como ERRO. Nada some.
 *
 * ── A ORDEM É DECISÃO ─────────────────────────────────────────────────────
 *   1. observadores      quem entra na fila.
 *   2. respostas         ANTES das paradas e do handoff: ler quem respondeu
 *                        não decide nada e vale para todo mundo; expirar um
 *                        handoff antes de ler a resposta devolveria a palavra
 *                        à IA sem ninguém saber que a cliente acabou de escrever.
 *   3. paradas           quem respondeu/saiu deixa a régua.
 *   4. vigia             ANTES do despachante: é quem pode puxar o freio.
 *   5. despachar         o que sai agora.
 *   6. funis             o pipeline espelha o que acabou de sair.
 *   7. nota no Chatwoot  DEPOIS do despacho: descreve mensagem que JÁ saiu.
 *   8. expirar handoff   depois das respostas (ver 2).
 *   9. briefing          POR ÚLTIMO: descreve o dia, incluindo este tique.
 *
 * ⚠️ A campanha 10.10 (`observarCampanhas`) roda exatamente como antes do
 *    porte. Decisão do Owner em 04/10/2026: não mexer nela agora.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    console.error('[maquina-vendas] CRON_SECRET ausente — rota fechada')
    return NextResponse.json(
      { ok: false, erro: 'CRON_SECRET não configurado. A rota recusa em vez de ficar aberta.' },
      { status: 503 },
    )
  }

  const cabecalho = request.headers.get('authorization') ?? ''
  const informado = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : cabecalho
  if (informado !== segredo) {
    return NextResponse.json({ ok: false, erro: 'Não autorizado.' }, { status: 401 })
  }

  const inicio = Date.now()
  const falhas: Array<{ fase: string; erro: string }> = []

  /** Fase do ENTORNO: a falha é anotada, o tique segue, e no fim vira 500. */
  async function entorno<T>(fase: string, f: () => Promise<T>): Promise<T | null> {
    try {
      const r = await f()
      // Algumas fases já devolvem `{ erro }` em vez de lançar (vigia, briefing).
      if (r && typeof r === 'object' && 'erro' in r && (r as { erro?: unknown }).erro) {
        falhas.push({ fase, erro: String((r as { erro: unknown }).erro) })
      }
      return r
    } catch (e) {
      const erro = textoDoErro(e)
      console.error(`[maquina-vendas] ${fase} falhou:`, erro)
      falhas.push({ fase, erro })
      return null
    }
  }

  let fase = 'observar carrinhos'
  try {
    // 1 · OBSERVAR (núcleo: carrinho e colunas do funil).
    const observacao = await observarCarrinhosAbandonados()
    fase = 'observar colunas'
    const colunas = await observarColunas(new Date())

    // 1b · OBSERVADORES DO ENTORNO.
    const rastreio = await entorno('rastreio', () => observarRastreios())
    const marketing = await entorno('marketing', () => observarMarketing())
    const campanha = await entorno('campanha', () => observarCampanhas())

    // 2 · RESPOSTAS.
    fase = 'registrar respostas'
    const respostas = await registrarRespostas(new Date())

    // 3 · PARADAS.
    fase = 'paradas'
    const paradas = await rodarParadas()

    // 4 · VIGIA — devolve `{ erro }` em vez de lançar; aqui isso é núcleo.
    fase = 'vigia'
    const vigia = await rodarVigia(new Date())
    if ('erro' in vigia && vigia.erro) throw new Error(`vigia: ${vigia.erro}`)

    // 5 · DESPACHAR.
    fase = 'despachar'
    const despacho = await despachar()

    // 6–9 · ENTORNO depois do despacho.
    const funis = await entorno('funis', () => sincronizarFunis())
    const notas = await entorno('nota no Chatwoot', () => anotarTextosNoChatwoot(new Date()))
    const handoff = await entorno('expirar handoff', () => expirarHandoffs(new Date()))
    const briefing = await entorno('briefing', () => rodarBriefingDiario(new Date()))
    const avisosEquipe = await entorno('avisos de passagem', () => entregarAvisosPendentes(new Date()))

    const resultado = {
      ok: falhas.length === 0,
      ms: Date.now() - inicio,
      falhas,
      observacao,
      colunas,
      rastreio,
      marketing,
      campanha,
      respostas,
      paradas,
      vigia,
      despacho,
      funis,
      notas,
      handoff,
      briefing,
      avisosEquipe,
    }

    if (falhas.length) {
      await registrar('ERRO', 'tique_parcial', `Tique da Máquina com ${falhas.length} falha(s): ${falhas.map((f) => f.fase).join(', ')}`, resultado)
      return NextResponse.json(resultado, { status: 500 })
    }
    await registrar('INFO', 'tique', 'Tique da Máquina', resultado)
    return NextResponse.json(resultado)
  } catch (erro) {
    const msg = textoDoErro(erro)
    console.error(`[maquina-vendas] tique falhou em "${fase}":`, msg)
    await registrar('ERRO', 'tique_falhou', `Tique da Máquina falhou em: ${fase}`, { fase, msg, falhas })
    // Nunca um 200 que esconde o problema.
    return NextResponse.json({ ok: false, fase, erro: msg, falhas }, { status: 500 })
  }
}

function textoDoErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Log de evento. Não derruba o tique (o tique já decidiu o status HTTP), mas
 * também não some: se o banco recusar, vai para o console do container.
 */
async function registrar(nivel: string, tipo: string, titulo: string, dados: unknown) {
  try {
    await prisma.logEvento.create({
      data: { origem: 'maquina-vendas', nivel, tipo, titulo: titulo.slice(0, 200), dados: JSON.stringify(dados).slice(0, 4000) },
    })
  } catch (e) {
    console.error('[maquina-vendas] não consegui gravar o LogEvento do tique:', textoDoErro(e))
  }
}
