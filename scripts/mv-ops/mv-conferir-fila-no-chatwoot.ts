/**
 * ANTES DE DEIXAR SAIR, OLHA A CONVERSA NO CHATWOOT. Só leitura.
 *
 *   npx tsx scripts/mv-ops/mv-conferir-fila-no-chatwoot.ts            # próximos 2 dias
 *   npx tsx scripts/mv-ops/mv-conferir-fila-no-chatwoot.ts --dias 3
 *
 * Ambiente: DATABASE_URL e CHATWOOT_URL/_ACCOUNT_ID/_INBOX_ID/_TOKEN.
 *
 * Porte de `scripts/mv-conferir-fila-no-chatwoot.ts` da CarBoss. As paradas
 * leem `MvResposta` e o relógio de 12 h do handoff — o caminho normal. Mas a
 * equipe trabalha no Chatwoot, e uma conversa pode estar viva lá sem ter
 * chegado ao CRM (webhook fora, telefone com/sem o 9, tique que ainda não
 * rodou). Este script não conserta nada: cruza a fila com a conversa e aponta
 * quem não deveria receber template frio agora.
 *
 * Classificação, a mesma do webhook do Chatwoot:
 *  · entrada → cliente;
 *  · saída com `from_echo` ou remetente bot → loja automática (Máquina/IA);
 *  · qualquer outra saída pública → gente da equipe.
 * Nota privada não conta. A fila inteira entra (inclusive a campanha): é leitura.
 */

import { cabecalho, mascarar, opcao, prisma, rodar } from './_base'
import { configChatwoot, conversaDoTelefone, cw } from '../../src/lib/maquina-vendas/chatwoot-api'

type MsgCw = { content?: string | null; private?: boolean; message_type?: number; created_at?: number; content_attributes?: { from_echo?: boolean } | null; sender?: { type?: string } | null }
type Fala = { quando: Date; de: 'cliente' | 'automatica' | 'equipe'; texto: string }

rodar(async () => {
  cabecalho('CONFERIR FILA NO CHATWOOT (só leitura)', false)
  const cfg = configChatwoot()
  if (!cfg) throw new Error('Chatwoot não configurado (CHATWOOT_URL/_ACCOUNT_ID/_INBOX_ID/_TOKEN).')
  const dias = Number(opcao('--dias') ?? 2)
  if (!Number.isFinite(dias) || dias <= 0 || dias > 30) throw new Error('--dias entre 1 e 30')
  const ate = new Date(Date.now() + dias * 86_400_000)

  const fila = await prisma.mvMensagem.findMany({
    where: { status: 'AGENDADA', agendadaPara: { lte: ate }, inscricao: { status: 'ATIVA' } },
    select: { etapaOrdem: true, agendadaPara: true, inscricao: { select: { nomeSnapshot: true, telefoneE164: true, cadencia: { select: { nome: true } } } } },
    orderBy: { agendadaPara: 'asc' },
  })
  console.log(`${fila.length} mensagem(ns) agendada(s) até ${dias} dia(s) à frente.\n`)
  if (!fila.length) return

  const porTelefone = new Map<string, typeof fila>()
  for (const m of fila) porTelefone.set(m.inscricao.telefoneE164, [...(porTelefone.get(m.inscricao.telefoneE164) ?? []), m])

  const alertas: string[] = []
  const limpos: string[] = []
  for (const [telefone, msgs] of porTelefone) {
    const p = msgs[0]
    const rotulo = `${p.inscricao.nomeSnapshot.padEnd(14).slice(0, 14)} ${mascarar(telefone)}`
    const quando = p.agendadaPara.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
    let falas: Fala[] = []
    try {
      const conversa = await conversaDoTelefone(cfg, telefone)
      if (conversa) {
        const r = await cw<{ payload?: MsgCw[] }>(cfg, `/conversations/${conversa}/messages`)
        falas = (r?.payload ?? [])
          .filter((m) => m.content && !m.private && (m.message_type === 0 || m.message_type === 1))
          .map((m) => {
            const auto = m.content_attributes?.from_echo === true || ['agent_bot', 'agentbot'].includes(String(m.sender?.type ?? '').toLowerCase())
            return { quando: new Date((m.created_at ?? 0) * 1000), de: m.message_type === 0 ? 'cliente' : auto ? 'automatica' : 'equipe', texto: String(m.content).replace(/\s+/g, ' ').slice(0, 90) } as Fala
          })
          .sort((a, b) => a.quando.getTime() - b.quando.getTime())
      }
    } catch (e) {
      alertas.push(`❓ ${rotulo} — não consegui ler o Chatwoot: ${e instanceof Error ? e.message : e}`)
      continue
    }
    if (!falas.length) {
      limpos.push(`   ${quando}  ${rotulo} sem conversa no Chatwoot`)
      continue
    }
    const ultima = falas[falas.length - 1]
    const idade = Math.floor((Date.now() - ultima.quando.getTime()) / 86_400_000)
    const equipeRecente = falas.some((f) => f.de === 'equipe' && Date.now() - f.quando.getTime() <= 2 * 86_400_000)
    const quem = ultima.de === 'cliente' ? 'A CLIENTE' : ultima.de === 'equipe' ? 'A EQUIPE' : 'a Máquina/IA'
    const linha = `   ${quando}  ${rotulo} última fala há ${String(idade).padStart(2)}d (${quem})`
    if (ultima.de === 'cliente' || equipeRecente) {
      alertas.push(`⚠️ ${linha}\n      "${ultima.texto}"\n      vai receber: ${p.inscricao.cadencia.nome} · etapa ${p.etapaOrdem}`)
    } else {
      limpos.push(linha)
    }
  }
  console.log(alertas.length ? '════════ OLHAR ANTES DE DEIXAR SAIR ════════\n' : 'Nenhuma conversa viva por baixo da fila.\n')
  for (const a of alertas) console.log(a + '\n')
  console.log(`════════ SEM RESSALVA (${limpos.length}) ════════`)
  for (const l of limpos) console.log(l)
})
