/**
 * O DOSSIÊ DE UMA CLIENTE, NO TERMINAL — só leitura. Porte de `ver-dossie.ts`.
 *
 *   npx tsx scripts/mv-ops/ver-dossie.ts                 # a inscrição mais recente
 *   npx tsx scripts/mv-ops/ver-dossie.ts <inscricaoId>
 *
 * A tela do dossiê junta a régua, o Chatwoot e a lista de templates da Meta.
 * Quando a tela mostra algo estranho, isto imprime os MESMOS dados que ela
 * recebe (`dossieDaCliente`), sem sessão e sem navegador. Telefone mascarado.
 */
import { brt, cabecalho, mascarar, posicionais, prisma, rodar } from './_base'
import { dossieDaCliente } from '../../src/lib/maquina-vendas/dossie'

rodar(async () => {
  cabecalho('DOSSIÊ DA CLIENTE (só leitura)', false)
  let id = posicionais()[0]
  if (!id) {
    const ultima = await prisma.mvInscricao.findFirst({ orderBy: { createdAt: 'desc' }, select: { id: true } })
    if (!ultima) throw new Error('nenhuma inscrição no banco')
    id = ultima.id
  }
  const d = await dossieDaCliente(id)
  console.log(`${d.nome} · ${mascarar(d.telefone)} · ${d.cadencia} · ${d.statusInscricao}${d.motivoParada ? ` (${d.motivoParada})` : ''}`)
  console.log(`perfil ${d.perfil} · Chatwoot ${d.chatwootLigado ? `conversa ${d.conversaChatwootId ?? '—'}` : 'desligado'} · catálogo Meta ${d.catalogoDisponivel ? 'lido' : 'NÃO consultado'}`)
  const r = d.resumo
  console.log(
    `régua ${r.totalNaRegua} · saíram ${r.jaSairam} · entregues ${r.entregues} · lidas ${r.lidas} · falharam ${r.falharam} · faltam ${r.aindaVaoSair}${r.proximaEm ? ` · próxima ${brt(r.proximaEm)}` : ''}`,
  )
  if (d.marcos.length) {
    console.log('\nMarcos')
    for (const m of d.marcos) console.log(`  ${brt(m.quando)}  ${m.tipo.padEnd(8)} ${m.titulo}${m.detalhe ? ` — ${m.detalhe}` : ''}`)
  }
  console.log('\nFluxo')
  for (const p of d.passos) {
    const prova = p.prova ? ` [${p.prova.nivel}]` : ''
    console.log(`  ${brt(p.quando)}  ${p.marcador.padEnd(4)} ${p.deQuem.padEnd(7)} ${p.estado}${prova}  ${p.titulo}`)
    if (p.template) console.log(`      template ${p.template.nome} (${p.template.status})`)
    if (p.texto) console.log(`      “${p.texto.replace(/\s+/g, ' ').slice(0, 140)}${p.texto.length > 140 ? '…' : ''}” (${p.textoOrigem})`)
    if (p.detalhe) console.log(`      ${p.detalheGrave ? '✗' : '·'} ${p.detalhe}`)
  }
  if (d.faltaNoPedido.length) console.log(`\nFalta no pedido: ${d.faltaNoPedido.map((m) => m.marco).join(' · ')}`)
})
