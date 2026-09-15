import { NextResponse } from 'next/server'
import { observarCarrinhosAbandonados } from '@/lib/maquina-vendas/observador'
import { despachar } from '@/lib/maquina-vendas/despachante'
import { observarRastreios } from '@/lib/maquina-vendas/observador-rastreio'
import { sincronizarFunis } from '@/lib/maquina-vendas/funis-crm'
import { observarMarketing } from '@/lib/maquina-vendas/observador-marketing'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * O TIQUE DA MÁQUINA — o único ponto de entrada do relógio.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Toda a decisão vive AQUI, no CRM. O n8n do outro lado é um workflow de dois
 * nós: um gatilho de tempo e um GET nesta rota. É assim na CarBoss e na OCR, e
 * é o que faz o módulo ser portável — quem muda a cadência muda código, não
 * um fluxo visual com 69 nós.
 *
 * ── SEGURANÇA: FALHA FECHADA ──────────────────────────────────────────────
 * Nos dois projetos de origem o `CRON_SECRET` era FAIL-OPEN: quando a variável
 * não existia, a rota ficava aberta. Está registrado como pendência 🟡 na
 * descoberta da CarBoss, e o efeito é que qualquer um na internet dispara a
 * fila de mensagens de um número de WhatsApp real.
 *
 * Aqui é o contrário: sem segredo configurado, a rota RECUSA. Vale a pena o
 * incômodo de configurar — a alternativa é uma porta aberta que ninguém vê.
 * ══════════════════════════════════════════════════════════════════════════
 */
export async function GET(request: Request) {
  const segredo = process.env.CRON_SECRET
  if (!segredo) {
    return NextResponse.json(
      { erro: 'CRON_SECRET não configurado. A rota recusa em vez de ficar aberta.' },
      { status: 503 },
    )
  }

  const cabecalho = request.headers.get('authorization') ?? ''
  const informado = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : cabecalho
  if (informado !== segredo) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }

  const inicio = Date.now()
  try {
    // FASE 1 — OBSERVAR: quem entra na fila.
    //
    // Varredura, e não evento, porque a Nuvemshop não publica webhook de
    // carrinho abandonado. É a única porta que a plataforma abriu.
    const observacao = await observarCarrinhosAbandonados()

    // FASE 1b — RASTREIO: pedido pago que ganhou código de rastreio desde o
    // último tique. Reunião de 14/09: verificação de 5 em 5 minutos, que é
    // exatamente o ritmo deste tique. Falha aqui não segura o despacho.
    const rastreio = await observarRastreios().catch((e) => ({
      erro: e instanceof Error ? e.message : String(e),
    }))

    // FASE 1c — MARKETING: reativação 60 dias, coleção nova e peça que voltou
    // ao estoque. Roda de hora em hora (cursor próprio) e não segura o despacho.
    const marketing = await observarMarketing().catch((e) => ({
      erro: e instanceof Error ? e.message : String(e),
    }))

    // FASE 2 — DESPACHAR: o que sai agora.
    //
    // Ligada, e mesmo assim inerte por padrão: `envioPausado` nasce `true` e o
    // canal nasce sem credencial, então os dois primeiros guards do
    // despachante recusam. Ligar de verdade é uma decisão de quem opera — pela
    // tela, sem deploy — e não um efeito colateral deste código existir.
    const despacho = await despachar()

    // FASE 3 — FUNIS: o pipeline do CRM espelha o que a Máquina fez. Depois do
    // despacho, para a mensagem que acabou de sair já aparecer no negócio.
    const funis = await sincronizarFunis().catch((e) => ({
      erro: e instanceof Error ? e.message : String(e),
    }))

    const resultado = {
      ok: true,
      ms: Date.now() - inicio,
      observacao,
      rastreio,
      marketing,
      despacho,
      funis,
    }

    await registrar('INFO', 'tique', 'Tique da Máquina', resultado)
    return NextResponse.json(resultado)
  } catch (erro) {
    const msg = erro instanceof Error ? erro.message : String(erro)
    await registrar('ERRO', 'tique_falhou', 'Tique da Máquina falhou', { msg })
    // 200 de propósito: o cron do n8n não deve entrar em retentativa por uma
    // falha de tique. O próximo tique tenta de novo, e o erro fica no log.
    return NextResponse.json({ ok: false, erro: msg }, { status: 200 })
  }
}

/** Log de evento. Nunca derruba o tique — se a tabela não existe, segue. */
async function registrar(nivel: string, tipo: string, titulo: string, dados: unknown) {
  try {
    await prisma.logEvento.create({
      data: { origem: 'crm', nivel, tipo, titulo, dados: JSON.stringify(dados).slice(0, 4000) },
    })
  } catch {
    // tabela ainda não migrada, ou banco indisponível: o tique não depende disso
  }
}
