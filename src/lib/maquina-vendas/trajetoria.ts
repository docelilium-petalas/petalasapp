/**
 * A TRAJETÓRIA DE UMA CLIENTE — todos os motores numa linha do tempo só.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte de `trajetoria.ts` do CRM CarBoss. O problema é o mesmo: quem fala com
 * a cliente são VÁRIOS motores, cada um gravando num lugar, e a operação tira
 * conclusão sobre o silêncio olhando metade da conversa.
 *
 * Na Doce Lilium os motores são:
 *   Máquina de Vendas  → `MvMensagem` (com entrega e leitura da Meta)
 *   Atendimento (IA)   → turnos `loja` em `MvResposta.ultimasMsgs`
 *   Cliente            → turnos `cliente` em `MvResposta.ultimasMsgs`
 *   Equipe             → Chatwoot (mensagem de saída que não é eco) e o
 *                        cursor `atendimento:humano:<chave>`
 *   Pedido             → o card andando no funil (`DealStageHistory`)
 *
 * ── O que mudou em relação à origem ───────────────────────────────────────
 *  · Não há "funil n8n" com toque de 5 min: o motor paralelo daqui é a IA de
 *    atendimento, e o texto dela já está nos turnos — não precisa do Chatwoot.
 *  · O Chatwoot entra para o que só ele sabe: a fala da EQUIPE pelo painel.
 *    Sem as variáveis do Chatwoot a linha vem só do CRM, e diz isso
 *    (`chatwootLigado: false`) em vez de fingir completude.
 *  · Ficha de quiz/demonstração não existe aqui.
 *
 * SÓ LEITURA. Não escreve em tabela nenhuma.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { apenasDigitos, chaveTelefone, paraE164 } from './telefone'
import { configChatwoot, conversaDoTelefone, cw } from './chatwoot-api'
import { lerTurnosCrus } from './respostas'

export type OrigemPasso = 'maquina' | 'ia' | 'cliente' | 'equipe' | 'card'

export interface PassoTrajetoria {
  /** Instante do passo. Ordena a linha do tempo inteira. */
  em: Date
  origem: OrigemPasso
  /** "Máquina de Vendas", "Atendimento (IA)", "Cliente", "Equipe", "Pedido". */
  motor: string
  /** "Carrinho abandonado · toque 2/3", "Respondeu", "Moveu: A → B"… */
  passo: string
  /** O que a pessoa leu (ou escreveu). Vazio quando não recuperável. */
  texto: string
  templateNome?: string
  /** Só a Máquina tem: prova de entrega vinda do webhook da Meta. */
  entregue?: boolean
  lida?: boolean
  falha?: string
  /** Passo ainda no futuro (mensagem agendada que não saiu). */
  futuro?: boolean
}

export interface Trajetoria {
  telefone: string
  nome: string | null
  /** `false` quando falta variável do Chatwoot: a linha vem só do CRM. */
  chatwootLigado: boolean
  conversaId: number | null
  passos: PassoTrajetoria[]
}

interface MsgCw {
  id: number
  content: string | null
  message_type: number
  created_at: number
  private?: boolean
  content_attributes?: { from_echo?: boolean } | null
}

/**
 * A mesma fala aparece em dois lugares (turno do CRM e mensagem no Chatwoot).
 * Casa por texto dentro desta janela para não contar em dobro.
 */
const JANELA_CASAMENTO_MS = 10 * 60 * 1000

function rotuloEtapa(cadencia: string, ordem: number, total: number) {
  return `${cadencia} · toque ${ordem}/${total}`
}

const normalizar = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase()

export async function trajetoriaDaCliente(telefoneBruto: string, agora: Date = new Date()): Promise<Trajetoria> {
  const e164 = paraE164(telefoneBruto)
  const chave = chaveTelefone(telefoneBruto)
  if (!e164 || !chave) throw new Error(`telefone não normalizável: ${telefoneBruto}`)

  const passos: PassoTrajetoria[] = []

  // ── 1. O card andando no funil ──────────────────────────────────────────
  // `Contact.telefone` não tem formato garantido: filtra largo no banco (4
  // últimos dígitos) e confere a chave de 8 no código.
  const candidatos = await prisma.contact.findMany({
    where: { telefone: { contains: chave.slice(-4) } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, nome: true, telefone: true },
    take: 50,
  })
  const contatos = candidatos.filter((c) => apenasDigitos(c.telefone).endsWith(chave))
  const inscricoes = await prisma.mvInscricao.findMany({
    where: { telefoneKey: chave },
    include: {
      cadencia: { select: { nome: true } },
      mensagens: { orderBy: { etapaOrdem: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  })
  const nome = contatos[0]?.nome?.trim() || inscricoes[0]?.nomeSnapshot?.trim() || null

  if (contatos.length) {
    const historico = await prisma.dealStageHistory.findMany({
      where: { deal: { contactId: { in: contatos.map((c) => c.id) } } },
      orderBy: { mudouEm: 'asc' },
      include: { deStage: { select: { nome: true } }, paraStage: { select: { nome: true } } },
      take: 200,
    })
    for (const h of historico) {
      const de = h.deStage?.nome ?? null
      const para = h.paraStage?.nome ?? '?'
      passos.push({
        em: h.mudouEm,
        origem: 'card',
        motor: 'Pedido',
        passo: de ? `Moveu: ${de} → ${para}` : `Entrou em ${para}`,
        texto: h.fonte ?? '',
      })
    }
  }

  // ── 2. A Máquina de Vendas ──────────────────────────────────────────────
  for (const insc of inscricoes) {
    const total = insc.mensagens.length
    for (const m of insc.mensagens) {
      const saiu = m.status === 'ENVIADA' && m.enviadaEm
      const em = saiu ? m.enviadaEm! : m.agendadaPara
      passos.push({
        em,
        origem: 'maquina',
        motor: 'Máquina de Vendas',
        passo: rotuloEtapa(insc.cadencia.nome, m.etapaOrdem, total) + (saiu ? '' : ` · ${m.status.toLowerCase()}`),
        texto: m.textoEntregue ?? m.mensagemFinal ?? '',
        templateNome: m.templateNome ?? undefined,
        entregue: m.entregueEm ? true : undefined,
        lida: m.lidaEm ? true : undefined,
        falha: m.falhaMotivo ?? m.erro ?? undefined,
        futuro: !saiu && em.getTime() > agora.getTime(),
      })
    }
  }

  // ── 3. A conversa: cliente e IA, dos turnos do CRM ──────────────────────
  const conversa = await prisma.mvResposta.findUnique({ where: { telefoneKey: chave } })
  const turnos = lerTurnosCrus(conversa?.ultimasMsgs)
  const jaVistos: Array<{ em: number; texto: string }> = []
  turnos.forEach((t) => {
    const texto = t.texto
    jaVistos.push({ em: t.em.getTime(), texto: normalizar(texto) })
    passos.push(
      t.de === 'cliente'
        ? { em: t.em, origem: 'cliente', motor: 'Cliente', passo: 'Respondeu', texto }
        : { em: t.em, origem: 'ia', motor: 'Atendimento (IA)', passo: 'Respondeu a cliente', texto },
    )
  })

  const humano = await prisma.mvCursor.findUnique({ where: { chave: `atendimento:humano:${chave}` } })
  if (humano && !Number.isNaN(new Date(humano.valor).getTime())) {
    passos.push({ em: new Date(humano.valor), origem: 'equipe', motor: 'Equipe', passo: 'Assumiu a conversa (IA calada 12 h)', texto: '' })
  }

  // ── 4. O Chatwoot: o que a equipe falou pelo painel ─────────────────────
  const cfg = configChatwoot()
  let conversaId: number | null = null
  if (cfg) {
    conversaId = await conversaDoTelefone(cfg, e164)
    if (conversaId) {
      const msgs = (await cw<{ payload?: MsgCw[] }>(cfg, `/conversations/${conversaId}/messages`)).payload ?? []
      for (const m of msgs) {
        const conteudo = String(m.content ?? '').trim()
        if (!conteudo || m.private || m.message_type !== 1) continue
        // Eco do WhatsApp (template da Máquina, fala da IA) já está acima.
        if (m.content_attributes?.from_echo === true) continue
        if (/Template:\s*[a-z0-9_]+/i.test(conteudo)) continue
        const quando = new Date(m.created_at * 1000)
        const igual = jaVistos.some(
          (v) => v.texto === normalizar(conteudo) && Math.abs(v.em - quando.getTime()) <= JANELA_CASAMENTO_MS,
        )
        if (igual) continue
        passos.push({ em: quando, origem: 'equipe', motor: 'Equipe', passo: 'Falou com a cliente', texto: conteudo })
      }
    }
  }

  passos.sort((a, b) => a.em.getTime() - b.em.getTime())
  return { telefone: e164, nome, chatwootLigado: !!cfg, conversaId, passos }
}
