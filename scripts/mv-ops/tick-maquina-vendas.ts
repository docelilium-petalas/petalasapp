/**
 * UM TIQUE MANUAL da Máquina — a mesma ordem do cron (`api/cron/maquina-vendas`).
 *
 *   npx tsx scripts/mv-ops/tick-maquina-vendas.ts                  # só diz o que rodaria
 *   npx tsx scripts/mv-ops/tick-maquina-vendas.ts --apply          # roda o núcleo + entorno
 *   npx tsx scripts/mv-ops/tick-maquina-vendas.ts --apply --com-campanha
 *
 * Porte de `scripts/tick-maquina-vendas.ts` da CarBoss. Duas diferenças:
 *
 *  1. Aqui o tique GRAVA (observador inscreve, paradas encerram, despachante
 *     envia se o freio estiver solto) — então exige `--apply`. Na origem a
 *     ausência de `MV_DISPARO_WEBHOOK_URL` desligava o envio; aqui quem segura
 *     é o freio (`envioPausado`) e a lista de teste (`MV_NUMEROS_TESTE`).
 *  2. A fase `campanha` (semeadura do drop datado) fica DE FORA por padrão: a
 *     decisão sobre a campanha 10.10 é do Owner. `--com-campanha` inclui.
 */

import { APLICAR, cabecalho, prisma, rodar, tem } from './_base'
import { observarCarrinhosAbandonados } from '../../src/lib/maquina-vendas/observador'
import { observarColunas } from '../../src/lib/maquina-vendas/observador-colunas'
import { observarRastreios } from '../../src/lib/maquina-vendas/observador-rastreio'
import { observarMarketing } from '../../src/lib/maquina-vendas/observador-marketing'
import { observarCampanhas } from '../../src/lib/maquina-vendas/campanha-datada'
import { registrarRespostas } from '../../src/lib/maquina-vendas/respostas'
import { rodarParadas } from '../../src/lib/maquina-vendas/paradas'
import { rodarVigia } from '../../src/lib/maquina-vendas/vigia'
import { despachar } from '../../src/lib/maquina-vendas/despachante'
import { sincronizarFunis } from '../../src/lib/maquina-vendas/funis-crm'
import { obterAjustes, numerosDeTeste } from '../../src/lib/maquina-vendas/config'

const COM_CAMPANHA = tem('--com-campanha')

rodar(async () => {
  cabecalho('TIQUE MANUAL DA MÁQUINA')
  const ajustes = await obterAjustes()
  const lista = numerosDeTeste()
  console.log(`freio: ${ajustes.envioPausado ? 'PUXADO (nada sai)' : 'SOLTO (pode sair)'}`)
  console.log(`lista de teste: ${lista === null ? 'AUSENTE (produção aberta)' : `${lista.length} número(s)`}`)
  console.log(`campanha datada: ${COM_CAMPANHA ? 'INCLUÍDA' : 'fora (use --com-campanha)'}\n`)

  const fases: Array<[string, () => Promise<unknown>]> = [
    ['observar carrinhos', () => observarCarrinhosAbandonados()],
    ['observar colunas', () => observarColunas(new Date())],
    ['rastreio', () => observarRastreios()],
    ['marketing', () => observarMarketing()],
    ...(COM_CAMPANHA ? ([['campanha', () => observarCampanhas()]] as Array<[string, () => Promise<unknown>]>) : []),
    ['respostas', () => registrarRespostas(new Date())],
    ['paradas', () => rodarParadas()],
    ['vigia', () => rodarVigia(new Date())],
    // Tirar a fase `campanha` não basta: o despachante pega a fila inteira, e a
    // fila do drop já semeada sairia por aqui. Sem `--com-campanha`, com freio
    // solto e drop vencido na fila, o despacho NÃO roda.
    [
      'despachar',
      async () => {
        if (!COM_CAMPANHA && !ajustes.envioPausado) {
          const doDrop = await prisma.mvMensagem.count({
            where: { status: 'AGENDADA', agendadaPara: { lte: new Date() }, inscricao: { cadencia: { gatilho: { startsWith: 'campanha_' } } } },
          })
          if (doDrop > 0) return { pulou: `${doDrop} mensagem(ns) do drop vencida(s) na fila — use --com-campanha para despachar` }
        }
        return despachar()
      },
    ],
    ['funis', () => sincronizarFunis()],
  ]

  if (!APLICAR) {
    console.log('rodaria, nesta ordem:')
    for (const [nome] of fases) console.log(`  · ${nome}`)
    console.log('\n(dry-run — nada rodou. --apply para valer)')
    return
  }

  let falhas = 0
  for (const [nome, f] of fases) {
    try {
      const r = await f()
      console.log(`✓ ${nome}: ${JSON.stringify(r).slice(0, 600)}`)
    } catch (e) {
      falhas++
      console.log(`✗ ${nome}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  await prisma.logEvento.create({
    data: {
      origem: 'maquina-vendas',
      nivel: falhas ? 'ERRO' : 'INFO',
      tipo: falhas ? 'tique_parcial' : 'tique',
      titulo: `Tique manual (script) · ${falhas} falha(s)`,
      dados: JSON.stringify({ via: 'script', comCampanha: COM_CAMPANHA }),
    },
  })
  // Como o cron: falha não é silêncio.
  if (falhas) process.exitCode = 1
})
