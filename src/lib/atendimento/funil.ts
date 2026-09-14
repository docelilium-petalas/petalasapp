/**
 * O FUNIL DO WHATSAPP — a conversa com a IA aparecendo no CRM.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Até 14/09/2026 a conversa da IA morava só na memória (`MvResposta`) e nos
 * logs: nenhuma tela do CRM mostrava que uma cliente estava sendo atendida.
 * Aqui cada conversa vira UM negócio num funil próprio, "WhatsApp · Atendimento
 * IA", e cada fato da conversa vira atividade no negócio:
 *
 *   Novo contato        a cliente escreveu
 *   Viu produto         a IA mandou foto de peça
 *   Link enviado        a IA mandou link de produto ou de carrinho
 *   Atendimento humano  a IA passou para a Marília
 *   Comprou             reservado para o pedido pago
 *
 * O funil só ANDA PARA FRENTE pela ordem das etapas — a cliente que viu produto
 * e manda "oi" de novo não volta a "Novo contato". A exceção é o atendimento
 * humano, que vale sempre: é um pedido de socorro, não um passo da venda.
 *
 * Tudo aqui é best-effort: se o funil falhar, a conversa NÃO pode parar. Por
 * isso quem chama usa `registrarNoFunil(...)` sem await crítico e o erro vira log.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { chaveTelefone, apenasDigitos } from '@/lib/maquina-vendas/telefone'
import { temNome } from '@/lib/contato-exibicao'

export const NOME_FUNIL = 'WhatsApp · Atendimento IA'

export type EtapaFunil = 'novo' | 'produto' | 'link' | 'humano' | 'comprou'

const ETAPAS: { chave: EtapaFunil; nome: string; cor: string; probabilidade: number }[] = [
  { chave: 'novo', nome: 'Novo contato', cor: '#64748b', probabilidade: 10 },
  { chave: 'produto', nome: 'Viu produto', cor: '#a855f7', probabilidade: 30 },
  { chave: 'link', nome: 'Link enviado', cor: '#f59e0b', probabilidade: 60 },
  { chave: 'humano', nome: 'Atendimento humano', cor: '#ef4444', probabilidade: 50 },
  { chave: 'comprou', nome: 'Comprou', cor: '#22c55e', probabilidade: 100 },
]

export type DefinicaoEtapa = { nome: string; cor: string; probabilidade: number }

/** O funil e as etapas, criados na primeira vez com o dono do funil padrão. */
async function garantirFunil() {
  return garantirFunilDefinido(NOME_FUNIL, ETAPAS, 0)
}

/**
 * Qualquer funil do atendimento automático — WhatsApp, carrinho, pós-venda.
 * Cria o que falta e nunca apaga etapa: a Marília pode ter renomeado ou
 * acrescentado, e isso é dela.
 */
export async function garantirFunilDefinido(nome: string, etapas: DefinicaoEtapa[], ordemFunil: number) {
  const existente = await prisma.pipeline.findFirst({
    where: { nome },
    include: { stages: { orderBy: { ordem: 'asc' } } },
  })
  if (existente && etapas.every((e) => existente.stages.some((s) => s.nome === e.nome))) return existente

  const base =
    (await prisma.pipeline.findFirst({ where: { isDefault: true }, orderBy: { createdAt: 'asc' } })) ??
    (await prisma.pipeline.findFirst({ orderBy: { createdAt: 'asc' } }))
  if (!base && !existente) throw new Error('nenhum funil base para herdar dono e time')

  const funil =
    existente ??
    (await prisma.pipeline.create({
      data: { nome, userId: base!.userId, teamId: base!.teamId, isDefault: false, ordem: ordemFunil },
    }))

  const nomes = new Set((existente?.stages ?? []).map((s) => s.nome))
  for (const [i, e] of etapas.entries()) {
    if (nomes.has(e.nome)) continue
    await prisma.stage.create({
      data: { pipelineId: funil.id, nome: e.nome, cor: e.cor, ordem: i, probabilidade: e.probabilidade, slaHours: 24 },
    })
  }
  return prisma.pipeline.findFirstOrThrow({
    where: { id: funil.id },
    include: { stages: { orderBy: { ordem: 'asc' } } },
  })
}

type Registro = {
  e164: string
  nome?: string | null
  etapa: EtapaFunil
  /** Linha da linha do tempo do negócio: "Cliente: ...", "IA: ...", "[foto] ...". */
  atividade?: string
  produto?: string | null
}

export async function registrarNoFunil(r: Registro): Promise<void> {
  const chave = chaveTelefone(r.e164)
  if (!chave) return
  const funil = await garantirFunil()
  const etapaAlvo = funil.stages.find((s) => s.nome === ETAPAS.find((e) => e.chave === r.etapa)!.nome)!
  const digitos = apenasDigitos(r.e164)

  // Contato: casa pelos 8 últimos dígitos, que é a chave da Máquina inteira.
  let contato = await prisma.contact.findFirst({
    where: { telefone: { endsWith: chave } },
    orderBy: { createdAt: 'asc' },
  })
  const nomeLimpo = (r.nome ?? '').trim()
  if (!contato) {
    contato = await prisma.contact.create({
      data: {
        userId: funil.userId,
        nome: nomeLimpo.length >= 2 ? nomeLimpo : `WhatsApp ${digitos.slice(-4)}`,
        telefone: digitos,
        firstUtmSource: 'whatsapp-ia',
        lastUtmSource: 'whatsapp-ia',
        firstUtmAt: new Date(),
        lastUtmAt: new Date(),
      },
    })
  } else if (temNome({ nome: nomeLimpo }) && (!temNome(contato) || /^WhatsApp \d{4}$/.test(contato.nome))) {
    // Contato que chegou sem nome (ou com "æ", "WhatsApp 1215") ganha o nome do
    // perfil do WhatsApp na primeira mensagem — reunião de 14/09/2026.
    contato = await prisma.contact.update({ where: { id: contato.id }, data: { nome: nomeLimpo, sobrenome: null } })
    await prisma.deal.updateMany({
      where: { contactId: contato.id, titulo: { startsWith: 'WhatsApp ·' } },
      data: { titulo: `WhatsApp · ${nomeLimpo}` },
    })
  }

  let negocio = await prisma.deal.findFirst({
    where: { pipelineId: funil.id, contactId: contato.id, status: 'OPEN' },
    include: { stage: true },
    orderBy: { createdAt: 'desc' },
  })

  if (!negocio) {
    const criado = await prisma.deal.create({
      data: {
        pipelineId: funil.id,
        stageId: etapaAlvo.id,
        contactId: contato.id,
        userId: funil.userId,
        titulo: `WhatsApp · ${contato.nome}`,
        origem: 'whatsapp-ia',
        telefone: digitos,
        produtoInteresse: r.produto ?? null,
      },
    })
    await prisma.dealStageHistory.create({
      data: { dealId: criado.id, deStageId: null, paraStageId: etapaAlvo.id, mudouPor: 'IA de atendimento', fonte: 'ai' },
    })
    negocio = await prisma.deal.findFirstOrThrow({ where: { id: criado.id }, include: { stage: true } })
  } else {
    const anda = r.etapa === 'humano' ? negocio.stageId !== etapaAlvo.id : etapaAlvo.ordem > negocio.stage.ordem
    if (anda) {
      await prisma.deal.update({
        where: { id: negocio.id },
        data: { stageId: etapaAlvo.id, ...(r.produto ? { produtoInteresse: r.produto } : {}) },
      })
      await prisma.dealStageHistory.create({
        data: {
          dealId: negocio.id,
          deStageId: negocio.stageId,
          paraStageId: etapaAlvo.id,
          mudouPor: 'IA de atendimento',
          fonte: 'ai',
        },
      })
    } else if (r.produto && r.produto !== negocio.produtoInteresse) {
      await prisma.deal.update({ where: { id: negocio.id }, data: { produtoInteresse: r.produto } })
    }
  }

  if (r.atividade) {
    const agora = new Date()
    await prisma.activity.create({
      data: {
        userId: funil.userId,
        dealId: negocio.id,
        contactId: contato.id,
        tipo: 'WhatsApp',
        titulo: r.atividade.replace(/\s+/g, ' ').slice(0, 180),
        descricao: r.atividade.slice(0, 2000),
        status: 'DONE',
        doneAt: agora,
        dueAt: agora,
      },
    })
  }
}

/** Nunca derruba a conversa: erro do funil vira log e segue. */
export async function funilSemFalhar(r: Registro): Promise<void> {
  try {
    await registrarNoFunil(r)
  } catch (e) {
    await prisma.logEvento
      .create({
        data: {
          origem: 'atendimento',
          nivel: 'ERRO',
          tipo: 'funil_falhou',
          titulo: 'Conversa não atualizou o funil',
          dados: JSON.stringify({ etapa: r.etapa, erro: e instanceof Error ? e.message : String(e) }).slice(0, 1000),
        },
      })
      .catch(() => undefined)
  }
}

/** Link de produto ou de carrinho da loja dentro de um texto da IA. */
export function temLinkDaLoja(texto: string): boolean {
  return /docelilium\.com\.br\/(produtos|checkout)\//i.test(texto)
}
