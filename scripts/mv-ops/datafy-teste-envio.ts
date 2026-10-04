/**
 * Manda UM template pelo canal oficial e devolve o `wamid`.
 *
 *   npx tsx scripts/mv-ops/datafy-teste-envio.ts 5562982444219
 *   npx tsx scripts/mv-ops/datafy-teste-envio.ts 5562982444219 dl_pedido_enviado_v1 pedido=1234 rastreio=api/r/rastreio/x.y
 *   npx tsx scripts/mv-ops/datafy-teste-envio.ts 5562982444219 dl_carrinho_lembrete_v1 --url https://docelilium.com.br/checkout/ab/qa
 *
 * Porte de `scripts/datafy-teste-envio.ts` da CarBoss. Usa o MESMO módulo que o
 * despachante (`canal.enviarTemplate`) — um teste que passa por outro caminho
 * prova o outro caminho. Por isso a lista de teste vale aqui também.
 *
 * Mais exigente que a origem em um ponto: SEM `MV_NUMEROS_TESTE` definida ele
 * RECUSA. Script de teste rodando com a produção aberta é o jeito de um número
 * digitado errado virar mensagem para cliente de verdade.
 *
 * ⚠️ Manda mensagem de VERDADE (template fora da janela é cobrado). Um por vez.
 */

import { cabecalho, mascarar, posicionais, opcao, prisma, rodar } from './_base'
import { enviarTemplate, ErroCanal, EnvioVetado } from '../../src/lib/maquina-vendas/canal'
import { statusDoNumero, descreverErro } from '../../src/lib/maquina-vendas/datafy'
import { numerosDeTeste, liberadoParaEnvio } from '../../src/lib/maquina-vendas/config'
import { CATALOGO, VARIAVEIS } from '../../src/lib/maquina-vendas/catalogo-templates'

/** UTILITY: o mais barato e o de menor risco para a qualidade do número. */
const PADRAO = 'dl_pagamento_aprovado_v1'

/** Valores de prova para cada variável conhecida — `chave=valor` sobrepõe. */
const PROVA: Record<string, string> = {
  primeiro_nome: 'Luan',
  peca: 'Vestido Alícia (teste)',
  pedido: 'QA-0001',
  prazo: '48 horas',
  rastreio: 'api/r/rastreio/qa.teste',
  colecao: 'Coleção 10.10',
}

rodar(async () => {
  cabecalho('ENVIO DE TESTE PELO CANAL OFICIAL', false)
  const [telefoneBruto, templateArg] = posicionais(['--url'])
  if (!telefoneBruto) throw new Error('uso: npx tsx scripts/mv-ops/datafy-teste-envio.ts <telefone> [template] [chave=valor…] [--url URL]')

  const lista = numerosDeTeste()
  if (lista === null) throw new Error('MV_NUMEROS_TESTE ausente — este script não roda com a produção aberta.')
  const para = `+${telefoneBruto.replace(/\D/g, '')}`
  if (!liberadoParaEnvio(para, lista)) throw new Error(`${mascarar(para)} não está em MV_NUMEROS_TESTE — recusado.`)

  const nome = templateArg && !templateArg.includes('=') ? templateArg : PADRAO
  const meta = CATALOGO.find((t) => t.nome === nome)
  if (!meta) throw new Error(`template desconhecido no catálogo: ${nome}`)

  const extras = Object.fromEntries(
    posicionais(['--url'])
      .filter((a) => a.includes('='))
      .map((a) => [a.slice(0, a.indexOf('=')), a.slice(a.indexOf('=') + 1)]),
  )
  const variaveis = (VARIAVEIS[nome] ?? []).map((v) => String(extras[v] ?? PROVA[v] ?? ''))
  const vazias = (VARIAVEIS[nome] ?? []).filter((_, i) => !variaveis[i])
  if (vazias.length) throw new Error(`faltam valores para ${vazias.join(', ')} (passe chave=valor)`)

  const botaoUrl = meta.botoes?.find((b) => b.tipo === 'URL' && 'url' in b && String(b.url).includes('{{1}}'))
  const urlBotao = opcao('--url') ?? (botaoUrl && 'exemplo' in botaoUrl ? String(botaoUrl.exemplo ?? '') : undefined) ?? undefined

  // Conferir o canal ANTES de gastar uma mensagem.
  const s = await statusDoNumero()
  console.log(`canal: ${s?.status ?? '?'} · qualidade ${s?.qualidade ?? '?'} · consegue enviar ${s?.podeEnviar ?? '?'}`)
  if (s?.podeEnviar === 'BLOCKED') throw new Error('a Meta diz que este número NÃO pode enviar — PARANDO.')

  console.log(`\nenviando "${nome}" para ${mascarar(para)} · variáveis ${JSON.stringify(variaveis)}${urlBotao ? ` · botão ${urlBotao}` : ''}`)
  try {
    const r = await enviarTemplate({ para, templateNome: nome, idioma: meta.idioma ?? 'pt_BR', variaveis, urlBotao: urlBotao || undefined })
    await prisma.logEvento.create({
      data: {
        origem: 'maquina-vendas',
        nivel: 'INFO',
        tipo: 'mv_teste_envio',
        titulo: `Envio de teste · ${nome}`,
        dados: JSON.stringify({ via: 'script', template: nome, para: mascarar(para), wamid: r.idExterno }),
      },
    })
    console.log(`\n✅ aceita pela Meta\n   wamid: ${r.idExterno}`)
    console.log('\nAgora: confira se chegou no celular. Entregue/lido chegam pelo webhook (pulso).')
  } catch (e) {
    if (e instanceof EnvioVetado) throw new Error(`vetado pela lista de teste: ${e.message}`)
    if (e instanceof ErroCanal) throw new Error(descreverErro(e.message, e.codigo ?? null))
    throw e
  }
})
