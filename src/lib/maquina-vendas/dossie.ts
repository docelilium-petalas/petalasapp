/**
 * O DOSSIÊ DE UMA CLIENTE — tudo o que ela recebeu e tudo o que ainda vai receber.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Porte de `dossie.ts` do CRM CarBoss. Responde a pergunta que quem atende faz
 * antes de chamar uma cliente: **"o que ela já leu, e o que ainda vai ler?"** —
 * com o texto na tela, na ordem, dizendo de quem é cada mensagem.
 *
 * Não cria dado nenhum. Junta três fontes que já existiam separadas:
 *   1. `MvMensagem` — a régua da Máquina, passado E futuro (é ela que agenda).
 *   2. `trajetoriaDaCliente()` — as falas da cliente, da IA e da equipe.
 *   3. A lista de templates da Meta — corpo aprovado E estado de aprovação.
 *
 * ── As duas regras que decidem o desenho (iguais à origem) ────────────────
 *  · NUNCA prometer o que não se controla. A régua do pedido (pago → enviado
 *    → entregue) depende da loja mover o pedido; ela aparece como "o que
 *    falta", SEM horário, e nunca como agendamento.
 *  · Texto de mensagem que JÁ SAIU não se renderiza de novo como se fosse
 *    prova. Com `textoEntregue`, ele ganha de tudo; sem ele, o estado é
 *    `reconstruido` e a tela é obrigada a avisar.
 *
 * ── O que mudou em relação à origem ───────────────────────────────────────
 *  · Sem ficha de quiz, sem demonstração marcada, sem T0/D1/R1/R2 do n8n.
 *  · Marcos de reunião/venda viram **pedido** (`converteuEm`).
 *  · `sdrFalouEm` vira `humanoFalouEm`; "lead" vira "cliente".
 *  · Os parâmetros do template vêm do `contexto` gravado na inscrição — o
 *    mesmo que o despachante usa — e não só do primeiro nome.
 *
 * SÓ LEITURA.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { MENSAGEM_STATUS } from './config'
import { provaDeEntrega, type Prova } from './prova'
import { templateDaEtapa, parametrosDoTemplate } from './templates'
import { buscarCorposAprovados, textoEntregueDoTemplate, type CorpoAprovado } from './corpo-template'
import { trajetoriaDaCliente } from './trajetoria'
import { marcadorDaEtapa, marcosQueFaltam, papelDoTemplate, type MarcoDoPedido, type MotorDaMensagem } from './papeis'
import type { Contexto } from './copy'
import { primeiroNome } from './telefone'

// ── Vocabulário da tela ─────────────────────────────────────────────────────

/** DE ONDE VEIO A FRASE QUE ESTÁ NA TELA — cada estado é uma promessa diferente. */
export type OrigemDoTextoNoFluxo =
  /** Carimbado no instante do envio. É exatamente o que a pessoa leu. */
  | 'entregue'
  /** Saiu como texto livre — aí a copy da régua É o entregue. */
  | 'livre'
  /** Ainda não saiu: o corpo aprovado de hoje com os nossos parâmetros. */
  | 'vai-sair'
  /** Era isto que sairia — e não vai sair, porque a régua parou antes. */
  | 'nao-vai-sair'
  /** JÁ saiu, mas sem carimbo: o corpo aprovado de HOJE, renderizado agora. */
  | 'reconstruido'
  /** A copy livre da régua. Não é template — pode não ser o que sai. */
  | 'copy-planejada'
  /** Saiu por template e o corpo se perdeu. NÃO mostrar copy no lugar. */
  | 'desconhecido'
  /** Não há texto recuperável para este passo. */
  | 'indisponivel'

/**
 * O ESTADO DO PASSO. Os cinco primeiros vêm de `prova.ts` sem recálculo — a
 * tabela da Máquina e esta tela nunca podem discordar sobre a mesma mensagem.
 */
export type EstadoDoPasso =
  | 'LIDA'
  | 'ENTREGUE'
  | 'SEM_PROVA'
  | 'FALHOU'
  | 'DEVOLVIDA'
  /** Agendada e ainda vai sair. */
  | 'AGENDADA'
  /** Agendada para um instante que JÁ PASSOU e continua parada (fila represada). */
  | 'ATRASADA'
  /** Não vai sair: a régua parou antes de chegar nela. */
  | 'CANCELADA'
  /** A régua pulou (janela, teto, guarda). */
  | 'PULADA'
  /** O guarda de copy vetou o texto. */
  | 'VETADA'
  /** Fala da cliente, da IA ou da equipe — aconteceu, sem prova da Meta. */
  | 'SAIU'

export interface TemplateNoFluxo {
  nome: string
  /**
   * APPROVED · PENDING · REJECTED · PAUSED · DISABLED — direto da Meta.
   *   `NAO_ENCONTRADO` — a Meta respondeu e este nome NÃO está na conta (o
   *      132001 esperando para acontecer).
   *   `NAO_CONSULTADO` — não deu para perguntar. É "não sei", e aparece assim.
   *   `CATALOGO` — só o catálogo local respondeu (a Meta não).
   */
  status: string
  categoria: string | null
  botoes: string[]
}

export interface PassoDoFluxo {
  chave: string
  motor: MotorDaMensagem | 'conversa'
  /** QUEM FALOU — decide de que lado o cartão se desenha. */
  deQuem: 'nos' | 'cliente' | 'ia' | 'equipe'
  marcador: string
  titulo: string
  subtitulo: string | null
  porque: string | null
  /** ISO. A tela formata. */
  quando: string
  futuro: boolean
  estado: EstadoDoPasso
  prova: Prova | null
  texto: string
  textoOrigem: OrigemDoTextoNoFluxo
  textoAviso: string | null
  template: TemplateNoFluxo | null
  detalhe: string | null
  /** `true` só quando `detalhe` é falha do envio ATUAL (ver origem). */
  detalheGrave: boolean
}

/** Um fato que não é mensagem: entrou, respondeu, a equipe assumiu, comprou, parou. */
export interface MarcoDoDossie {
  quando: string
  tipo: 'entrada' | 'resposta' | 'equipe' | 'pedido' | 'parada'
  titulo: string
  detalhe: string | null
}

export interface Dossie {
  inscricaoId: string
  nome: string
  /** Inteiro aqui — a action decide se mascara. */
  telefone: string
  cadencia: string
  statusInscricao: string
  motivoParada: string | null
  perfil: string
  colunaAtual: string | null
  colunaDeEntrada: string | null
  conversaChatwootId: number | null
  chatwootLigado: boolean
  /** `false` = não deu para perguntar à Meta. */
  catalogoDisponivel: boolean
  agora: string
  resumo: {
    totalNaRegua: number
    jaSairam: number
    entregues: number
    lidas: number
    falharam: number
    aindaVaoSair: number
    proximaEm: string | null
  }
  marcos: MarcoDoDossie[]
  passos: PassoDoFluxo[]
  /** Só em régua de pedido: os marcos que a loja ainda não moveu. Sem horário, de propósito. */
  faltaNoPedido: MarcoDoPedido[]
}

const iso = (d: Date) => d.toISOString()

/** Nunca `APPROVED` por omissão: sem resposta da Meta é NAO_CONSULTADO. */
function montarTemplate(
  nome: string | null | undefined,
  catalogo: Map<string, CorpoAprovado>,
  catalogoDisponivel: boolean,
): TemplateNoFluxo | null {
  if (!nome) return null
  const achado = catalogo.get(nome)
  if (achado) return { nome, status: achado.status, categoria: achado.categoria, botoes: achado.botoes }
  return { nome, status: catalogoDisponivel ? 'NAO_ENCONTRADO' : 'NAO_CONSULTADO', categoria: null, botoes: [] }
}

/** Só para mensagem antiga sem `variaveis`: o que dá para saber da inscrição. */
function contextoMinimo(nomeSnapshot: string): Contexto {
  return { primeiro_nome: primeiroNome(nomeSnapshot) ?? '' } as Contexto
}

export async function dossieDaCliente(inscricaoId: string, agora: Date = new Date()): Promise<Dossie> {
  const insc = await prisma.mvInscricao.findUnique({
    where: { id: inscricaoId },
    include: {
      cadencia: { select: { nome: true, stageId: true, etapas: { select: { ordem: true, templateNome: true } } } },
      mensagens: { orderBy: [{ etapaOrdem: 'asc' }, { agendadaPara: 'asc' }] },
    },
  })
  if (!insc) throw new Error('inscrição não encontrada')

  const [contato, colunaEntrada, trajetoria, catalogo] = await Promise.all([
    insc.contactId
      ? prisma.contact.findUnique({
          where: { id: insc.contactId },
          select: { deals: { orderBy: { updatedAt: 'desc' }, take: 1, select: { stage: { select: { nome: true } } } } },
        })
      : null,
    insc.cadencia.stageId ? prisma.stage.findUnique({ where: { id: insc.cadencia.stageId }, select: { nome: true } }) : null,
    // Sem Chatwoot o dossiê continua valendo pela metade que o CRM controla.
    trajetoriaDaCliente(insc.telefoneE164, agora).catch(() => null),
    buscarCorposAprovados(agora.getTime()).catch(() => new Map<string, CorpoAprovado>()),
  ])

  const catalogoDisponivel = catalogo.size > 0 && [...catalogo.values()].some((c) => c.status !== 'CATALOGO')
  const contexto = contextoMinimo(insc.nomeSnapshot)
  const passos: PassoDoFluxo[] = []

  // ═══ 1. A régua da Máquina ════════════════════════════════════════════════
  const totalEtapas = Math.max(insc.mensagens.length, insc.cadencia.etapas.length)
  const templatesQueSairam = new Set<string>()

  for (const m of insc.mensagens) {
    const prova = provaDeEntrega(m, agora)
    const saiu = Boolean(m.enviadaEm)
    const quando = saiu ? m.enviadaEm! : m.agendadaPara

    const estado: EstadoDoPasso =
      m.status === MENSAGEM_STATUS.CANCELADA
        ? 'CANCELADA'
        : m.status === MENSAGEM_STATUS.PULADA
          ? 'PULADA'
          : m.status === MENSAGEM_STATUS.VETADA
            ? 'VETADA'
            : prova.nivel === 'NAO_SAIU'
              ? quando.getTime() > agora.getTime()
                ? 'AGENDADA'
                : 'ATRASADA'
              : (prova.nivel as EstadoDoPasso)

    const daEtapa = insc.cadencia.etapas.find((e) => e.ordem === m.etapaOrdem)?.templateNome ?? null
    const doMapa = templateDaEtapa(insc.cadencia.nome, m.etapaOrdem, m.templateNome ?? daEtapa)
    const nomeDoTemplate = m.templateNome ?? doMapa?.nome ?? null
    if (saiu && nomeDoTemplate) templatesQueSairam.add(nomeDoTemplate)
    const aprovado = nomeDoTemplate ? catalogo.get(nomeDoTemplate) : undefined
    // Os valores congelados na semeadura ganham: são os que a Meta recebe.
    // `inscricao.contexto` é o RETRATO (itens, total), não o `Contexto` da copy.
    const valores = Array.isArray(m.variaveis)
      ? (m.variaveis as unknown[]).map((v) => String(v ?? ''))
      : doMapa
        ? parametrosDoTemplate(doMapa, contexto).valores
        : []

    let texto = ''
    let textoOrigem: OrigemDoTextoNoFluxo
    let textoAviso: string | null = null

    if (m.textoEntregue) {
      texto = m.textoEntregue
      textoOrigem = 'entregue'
    } else if (saiu && nomeDoTemplate && aprovado) {
      texto = textoEntregueDoTemplate(aprovado, valores)
      textoOrigem = 'reconstruido'
      textoAviso =
        `Reconstruído do corpo aprovado HOJE em "${nomeDoTemplate}". ` +
        'Se o template foi editado depois do envio, esta não é exatamente a frase que a cliente leu.'
    } else if (saiu && nomeDoTemplate) {
      texto = m.mensagemFinal
      textoOrigem = 'desconhecido'
      textoAviso =
        `Saiu pelo template "${nomeDoTemplate}" e o corpo não foi carimbado. ` +
        'O texto acima é a copy da régua, NÃO o que a cliente recebeu.'
    } else if (saiu) {
      texto = m.mensagemFinal
      textoOrigem = 'livre'
    } else if (nomeDoTemplate && aprovado) {
      texto = textoEntregueDoTemplate(aprovado, valores)
      textoOrigem = 'vai-sair'
    } else {
      texto = m.mensagemFinal
      textoOrigem = 'copy-planejada'
      textoAviso = nomeDoTemplate
        ? `O toque usa o template "${nomeDoTemplate}", cujo corpo não consegui buscar na Meta. Abaixo está a copy da régua.`
        : 'Este toque não tem template: só sai se a cliente falou com a loja nas últimas 24 h.'
    }
    if (textoOrigem === 'vai-sair' && (estado === 'CANCELADA' || estado === 'PULADA' || estado === 'VETADA')) {
      textoOrigem = 'nao-vai-sair'
    }

    const papel = papelDoTemplate(nomeDoTemplate)
    passos.push({
      chave: `mv-${m.id}`,
      motor: papel?.motor ?? 'marketing',
      deQuem: 'nos',
      marcador: papel?.marco ?? marcadorDaEtapa(m.etapaOrdem),
      titulo: papel?.papel ?? `Toque ${m.etapaOrdem}`,
      subtitulo: `${insc.cadencia.nome} · toque ${m.etapaOrdem} de ${totalEtapas}`,
      porque: papel?.porque ?? null,
      quando: iso(quando),
      futuro: !saiu && quando.getTime() > agora.getTime(),
      estado,
      prova: saiu ? prova : null,
      texto,
      textoOrigem,
      textoAviso,
      template: montarTemplate(nomeDoTemplate, catalogo, catalogoDisponivel),
      detalhe:
        m.falhaMotivo ?? m.erro ?? (estado === 'CANCELADA' ? (insc.motivoParada ?? 'A régua parou antes deste toque.') : null),
      detalheGrave: estado === 'FALHOU',
    })
  }

  // ═══ 2. A conversa: cliente, IA e equipe ══════════════════════════════════
  // Os passos `maquina` e `card` da trajetória ficam de fora: a Máquina já
  // entrou acima com prova de entrega, e contar de novo seria envio em dobro.
  for (const p of trajetoria?.passos ?? []) {
    if (p.origem === 'maquina' || p.origem === 'card') continue
    const deQuem = p.origem === 'cliente' ? 'cliente' : p.origem === 'ia' ? 'ia' : 'equipe'
    passos.push({
      chave: `cv-${p.origem}-${p.em.getTime()}`,
      motor: 'conversa',
      deQuem,
      marcador: deQuem === 'cliente' ? '←' : deQuem === 'ia' ? 'IA' : 'EQ',
      titulo: deQuem === 'cliente' ? 'A cliente escreveu' : deQuem === 'ia' ? 'A IA respondeu' : p.passo,
      subtitulo: deQuem === 'equipe' ? 'Fala humana, fora da régua' : 'WhatsApp',
      porque: null,
      quando: iso(p.em),
      futuro: false,
      estado: 'SAIU',
      prova: null,
      texto: p.texto,
      textoOrigem: p.texto ? 'entregue' : 'indisponivel',
      textoAviso: null,
      template: null,
      detalhe: null,
      detalheGrave: false,
    })
  }
  passos.sort((a, b) => a.quando.localeCompare(b.quando))

  // ═══ 3. Os marcos ═════════════════════════════════════════════════════════
  const marcos: MarcoDoDossie[] = [
    {
      quando: iso(insc.createdAt),
      tipo: 'entrada',
      titulo: `Entrou na régua "${insc.cadencia.nome}"`,
      detalhe: colunaEntrada?.nome ? `Pela coluna ${colunaEntrada.nome}` : `Origem: ${insc.origem}`,
    },
  ]
  if (insc.respondeuEm) {
    marcos.push({
      quando: iso(insc.respondeuEm),
      tipo: 'resposta',
      titulo: 'A cliente respondeu',
      detalhe: insc.respostas > 0 ? `${insc.respostas} mensagem(ns) dela` : null,
    })
  }
  if (insc.humanoFalouEm) {
    marcos.push({ quando: iso(insc.humanoFalouEm), tipo: 'equipe', titulo: 'Alguém da equipe entrou na conversa', detalhe: null })
  }
  if (insc.converteuEm) {
    const valor = insc.valorConvertido ? Number(insc.valorConvertido) : null
    marcos.push({
      quando: iso(insc.converteuEm),
      tipo: 'pedido',
      titulo: 'Fez pedido',
      detalhe: valor ? valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'Valor ainda não confirmado (pedido criado, não pago)',
    })
  }
  if (insc.status !== 'ATIVA' && insc.motivoParada) {
    marcos.push({ quando: iso(insc.updatedAt), tipo: 'parada', titulo: `Régua parou · ${insc.status.toLowerCase()}`, detalhe: insc.motivoParada })
  }
  marcos.sort((a, b) => a.quando.localeCompare(b.quando))

  // ═══ 4. O resumo ══════════════════════════════════════════════════════════
  // Cancelada não é "na régua"; atrasada AINDA vai sair (fila represada).
  const daRegua = passos.filter((p) => p.motor !== 'conversa' && p.estado !== 'CANCELADA')
  const pendentes = passos.filter((p) => p.estado === 'AGENDADA' || p.estado === 'ATRASADA')

  return {
    inscricaoId: insc.id,
    nome: insc.nomeSnapshot,
    telefone: insc.telefoneE164,
    cadencia: insc.cadencia.nome,
    statusInscricao: insc.status,
    motivoParada: insc.motivoParada,
    perfil: insc.perfil,
    colunaAtual: contato?.deals?.[0]?.stage?.nome ?? null,
    colunaDeEntrada: colunaEntrada?.nome ?? null,
    conversaChatwootId: trajetoria?.conversaId ?? null,
    chatwootLigado: trajetoria?.chatwootLigado ?? false,
    catalogoDisponivel,
    agora: iso(agora),
    resumo: {
      totalNaRegua: daRegua.length,
      jaSairam: insc.mensagens.filter((m) => m.enviadaEm !== null).length,
      entregues: insc.mensagens.filter((m) => m.entregueEm !== null).length,
      lidas: insc.mensagens.filter((m) => m.lidaEm !== null).length,
      falharam: insc.mensagens.filter((m) => m.codigoErro !== null || m.status === MENSAGEM_STATUS.ERRO).length,
      aindaVaoSair: pendentes.length,
      proximaEm: pendentes[0]?.quando ?? null,
    },
    marcos,
    passos,
    faltaNoPedido: insc.origem === 'pedido' || insc.origem === 'pedido_enviado' ? marcosQueFaltam(templatesQueSairam) : [],
  }
}
