/**
 * A TRAJETÓRIA DE UMA CLIENTE, PASSO A PASSO — só leitura.
 * Porte de `trajetoria-lead-carboss.ts`.
 *
 *   npx tsx scripts/mv-ops/trajetoria-cliente.ts <telefone>
 *
 * A tela da Máquina mostra só o que a Máquina mandou; quem fala com a cliente
 * são dois motores (régua e IA) mais a equipe. Ver metade da conversa leva a
 * concluir "não saiu nada" sobre quem recebeu mensagem cinco minutos depois.
 * Isto costura tudo numa linha do tempo. Telefone mascarado na saída.
 */
import { brt, cabecalho, mascarar, posicionais, rodar } from './_base'
import { trajetoriaDaCliente } from '../../src/lib/maquina-vendas/trajetoria'

rodar(async () => {
  cabecalho('TRAJETÓRIA DA CLIENTE (só leitura)', false)
  const tel = posicionais()[0]
  if (!tel) throw new Error('uso: trajetoria-cliente.ts <telefone>')
  const t = await trajetoriaDaCliente(tel)
  console.log(`${t.nome ?? '(sem nome)'} · ${mascarar(t.telefone)} · Chatwoot ${t.chatwootLigado ? `conversa ${t.conversaId ?? '—'}` : 'desligado — só o CRM'}`)
  if (!t.passos.length) {
    console.log('\nNenhum passo registrado para este número.')
    return
  }
  console.log('')
  for (const p of t.passos) {
    const selo = p.futuro ? 'agendado' : p.falha ? `✗ ${p.falha}` : p.lida ? 'lida' : p.entregue ? 'entregue' : ''
    console.log(`  ${brt(p.em)}  ${p.motor.padEnd(18)} ${p.passo}${selo ? `  [${selo}]` : ''}`)
    if (p.templateNome) console.log(`      template ${p.templateNome}`)
    if (p.texto) console.log(`      “${p.texto.replace(/\s+/g, ' ').slice(0, 140)}${p.texto.length > 140 ? '…' : ''}”`)
  }
})
