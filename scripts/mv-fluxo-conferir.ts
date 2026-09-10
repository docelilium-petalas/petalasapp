/**
 * O FLUXO INTEIRO, CONTRA UM BANCO DE VERDADE — sem falar com ninguém.
 *
 *   DATABASE_URL=<banco de PROVA> npx tsx scripts/mv-fluxo-conferir.ts
 *
 * ⚠️ ESCREVE NO BANCO. Aponte para um banco descartável, nunca para produção.
 * O script recusa rodar se o `DATABASE_URL` não terminar em `_prova`.
 *
 * O que ele prova, em ordem:
 *
 *   1. a semeadura de um carrinho de 27h não empilha as etapas
 *   2. as variáveis saem congeladas junto com a frase
 *   3. o despachante para no guard certo, e na ordem certa
 *   4. quem pediu para sair some da fila mesmo tendo sido semeado antes
 *
 * O único trecho que este script NÃO cobre é a conversa com a Nuvemshop e com
 * a Meta — as duas exigem credencial de produção. O resto do caminho é este.
 */

import prisma from '../src/lib/prisma'
import { inscrever } from '../src/lib/maquina-vendas/observador'
import { despachar } from '../src/lib/maquina-vendas/despachante'
import { obterAjustes } from '../src/lib/maquina-vendas/config'
import { tratarEventoPedido } from '../src/lib/maquina-vendas/gatilho-pedido'
import type { Pedido } from '../src/lib/nuvemshop/loja'

const url = process.env.DATABASE_URL ?? ''
if (!/_prova(\?|$)/.test(url)) {
  console.error('\nRecusado: DATABASE_URL precisa apontar para um banco terminado em `_prova`.')
  console.error('Este script escreve inscrições e mensagens — não roda contra banco com gente de verdade.\n')
  process.exit(1)
}

const fmt = (d: Date) =>
  d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

const titulo = (t: string) => console.log(`\n${'━'.repeat(72)}\n${t}\n${'━'.repeat(72)}`)

async function main() {
  const cadencia = await prisma.mvCadencia.findFirst({
    where: { gatilho: 'carrinho_abandonado', ativo: true },
    include: { etapas: { orderBy: { ordem: 'asc' } } },
  })
  if (!cadencia) {
    console.error('\nSem cadência. Rode antes: npx tsx scripts/mv-cadencia-carrinho.ts\n')
    process.exit(1)
  }

  // Limpa só o que este script cria, para poder rodar de novo.
  await prisma.mvInscricao.deleteMany({ where: { refExterna: { startsWith: 'PROVA-' } } })
  await prisma.mvOptOut.deleteMany({ where: { telefoneKey: { in: ['99630120', '99630121'] } } })
  await prisma.mvCursor.deleteMany({})
  // Volta os ajustes de fábrica: sem isto, a segunda execução começa
  // despausada por causa da primeira, e o passo 2 prova a coisa errada.
  await prisma.mvAjustes.deleteMany({})

  const ajustes = await obterAjustes()

  titulo('1 · SEMEADURA DE UM CARRINHO DE 27 HORAS')
  const ancora = new Date(Date.now() - 27 * 3_600_000)
  await inscrever({
    ajustes,
    cadenciaId: cadencia.id,
    etapas: cadencia.etapas,
    origem: 'carrinho',
    refExterna: 'PROVA-27h',
    nome: 'Marina',
    e164: '+5562999630120',
    chave: '99630120',
    ancora,
    contexto: { primeiro_nome: 'Marina', peca: 'o vestido Alícia', link: 'https://exemplo/checkout/ab/1' },
    retrato: { total: '289.90', moeda: 'BRL', itens: [{ nome: 'Vestido Alícia', qtd: 1 }] },
  })

  const semeadas = await prisma.mvMensagem.findMany({
    where: { inscricao: { refExterna: 'PROVA-27h' } },
    orderBy: { etapaOrdem: 'asc' },
  })
  console.log(`abandono: ${fmt(ancora)}  (27h atrás)\n`)
  let anterior: Date | null = null
  for (const m of semeadas) {
    const gap = anterior ? `  (+${((+m.agendadaPara - +anterior) / 3_600_000).toFixed(1)}h)` : ''
    console.log(`  etapa ${m.etapaOrdem}  ${fmt(m.agendadaPara)}${gap}`)
    console.log(`           template: ${m.templateNome}`)
    console.log(`           variáveis congeladas: ${JSON.stringify(m.variaveis)}`)
    console.log(`           frase: ${m.mensagemFinal.split('\n')[0]}`)
    anterior = m.agendadaPara
  }
  const colapsou = semeadas.length > 1 && +semeadas[1].agendadaPara - +semeadas[0].agendadaPara < 3_600_000
  console.log(`\n  ${colapsou ? '✗ COLAPSOU' : '✓ etapas espaçadas'}`)

  titulo('2 · O DESPACHANTE, COM OS AJUSTES DE FÁBRICA')
  console.log('  ', await despachar())

  titulo('3 · DESPAUSADO, MAS SEM CANAL')
  await prisma.mvAjustes.upsert({
    where: { id: 'unico' },
    create: { id: 'unico', envioPausado: false },
    update: { envioPausado: false },
  })
  console.log('  ', await despachar())

  titulo('4 · COM CANAL FALSO — prova que passou por TODOS os guards')
  process.env.DATAFY_PHONE_NUMBER_ID = '000000000000000'
  process.env.DATAFY_TOKEN = 'token-de-prova-que-nao-existe'
  process.env.DATAFY_BASE_URL = 'https://127.0.0.1:9/v1' // porta morta de propósito
  console.log('  ', await despachar())

  titulo('5 · A PESSOA PEDE PARA SAIR, DEPOIS DE JÁ SEMEADA')
  await prisma.mvMensagem.updateMany({
    where: { inscricao: { refExterna: 'PROVA-27h' } },
    data: { status: 'AGENDADA', erro: null, naturezaFalha: null, agendadaPara: new Date(Date.now() - 60_000) },
  })
  await prisma.mvInscricao.updateMany({ where: { refExterna: 'PROVA-27h' }, data: { status: 'ATIVA' } })
  await prisma.mvCursor.deleteMany({})
  await prisma.mvOptOut.create({ data: { telefoneKey: '99630120', telefoneE164: '+5562999630120', origem: 'prova' } })
  console.log('  ', await despachar())

  const depois = await prisma.mvInscricao.findFirst({ where: { refExterna: 'PROVA-27h' } })
  const restantes = await prisma.mvMensagem.count({
    where: { inscricao: { refExterna: 'PROVA-27h' }, status: 'AGENDADA' },
  })
  console.log(`\n  inscrição virou: ${depois?.status} (${depois?.motivoParada})`)
  console.log(`  mensagens ainda agendadas: ${restantes}`)
  console.log(`  ${depois?.status === 'OPT_OUT' && restantes === 0 ? '✓ saiu da fila' : '✗ continua na fila'}`)

  titulo('6 · A PESSOA COMPRA — o carrinho para, o pedido comeca')
  await prisma.mvOptOut.deleteMany({ where: { telefoneKey: '99630121' } })
  await prisma.mvInscricao.deleteMany({ where: { refExterna: { startsWith: 'PROVA-' } } })
  await inscrever({
    ajustes,
    cadenciaId: cadencia.id,
    etapas: cadencia.etapas,
    origem: 'carrinho',
    refExterna: 'PROVA-comprou',
    nome: 'Bruna',
    e164: '+5562999630121',
    chave: '99630121',
    ancora: new Date(Date.now() - 30 * 3_600_000),
    contexto: { primeiro_nome: 'Bruna', peca: 'a saia Lis', link: 'https://exemplo/checkout/ab/2' },
    retrato: {},
  })

  const pedido = {
    id: 991, number: 1042, contact_name: 'Bruna Alves', contact_phone: '62999630121',
    status: 'open', payment_status: 'paid', total: '289.90', currency: 'BRL',
    products: [{ name: 'Saia Lis', quantity: 1 }], created_at: new Date().toISOString(),
    paid_at: new Date().toISOString(),
  } as unknown as Pedido

  console.log('   order/created:', await tratarEventoPedido('order/created', { ...pedido, payment_status: 'pending' }))
  const antes = await prisma.mvInscricao.findFirst({ where: { refExterna: 'PROVA-comprou' } })
  console.log(`   -> carrinho: ${antes?.status}, valor gravado: ${antes?.valorConvertido ?? 'nenhum'}  (certo: nenhum, nao pagou ainda)`)

  console.log('\n   order/paid   :', await tratarEventoPedido('order/paid', pedido))
  const depoisPago = await prisma.mvInscricao.findFirst({ where: { refExterna: 'PROVA-comprou' } })
  const doPedido = await prisma.mvInscricao.findFirst({ where: { origem: 'pedido', refExterna: '991' }, include: { mensagens: true } })
  console.log(`   -> carrinho: ${depoisPago?.status}, valor: R$ ${depoisPago?.valorConvertido ?? '—'}`)
  console.log(`   -> pedido  : ${doPedido ? `inscrito, ${doPedido.mensagens.length} mensagem, prioridade ${doPedido.prioridade}` : 'NAO inscrito'}`)
  console.log(`   ${depoisPago?.valorConvertido && doPedido ? '✓ contabilidade e trilha certas' : '✗'}`)

  titulo('7 · FORA DA JANELA — transacional sai, marketing espera')
  // Janela fechada de proposito: 03:00 as 03:01.
  await prisma.mvAjustes.update({ where: { id: 'unico' }, data: { janelaInicio: '03:00', janelaFim: '03:01' } })
  await prisma.mvCursor.deleteMany({})
  const r = await despachar()
  const enviada = await prisma.mvMensagem.findFirst({
    where: { inscricao: { origem: 'pedido' } },
    select: { templateNome: true, status: true, naturezaFalha: true },
  })
  console.log('  ', r)
  console.log(`   a que o despachante escolheu: ${enviada?.templateNome} (${enviada?.status}${enviada?.naturezaFalha ? ', ' + enviada.naturezaFalha : ''})`)
  console.log(`   ${enviada?.templateNome === 'dl_pagamento_aprovado_v1' ? '✓ pegou a transacional, e nao a de marketing' : '✗ pegou a errada'}`)

  console.log()
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('\nfalhou:', e)
    process.exit(1)
  })
