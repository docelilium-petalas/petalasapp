import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { chaveTelefone, paraE164 } from '@/lib/maquina-vendas/telefone'
import { pediuParaSair } from '@/lib/maquina-vendas/opt-out'
import { classificar } from '@/lib/maquina-vendas/canal'
import { registrarTurno } from '@/lib/atendimento/conversa'
import { agendarAtendimento } from '@/lib/atendimento/encaminhar'

export const dynamic = 'force-dynamic'

/**
 * O CAMINHO DE VOLTA — sem ele, metade dos guards é enfeite.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O despachante recusa enviar para quem RESPONDEU e para quem PEDIU PARA SAIR.
 * Só que, até esta rota existir, nada no sistema escrevia nenhuma das duas
 * coisas: `respondeuEm` e a tabela de opt-out eram lidas na tela e nos guards,
 * e gravadas em lugar nenhum. Os guards passavam sempre — não porque estavam
 * certos, mas porque a informação nunca chegava.
 *
 * Aqui chegam três fatos, e cada um muda uma decisão:
 *
 *   ENTREGA   `sent` não é `delivered`, e `delivered` não é `read`. O que a
 *             API aceitou nunca foi prova de que alguém recebeu.
 *   RESPOSTA  a pessoa falou. Ela sai da régua na hora — insistir depois da
 *             resposta é o defeito que mais irrita.
 *   RECUSA    "para", o botão de saída. Vira opt-out permanente, e cancela o
 *             que estava agendado antes de o próximo tique acontecer.
 *
 * ── SEGURANÇA: FALHA FECHADA ──────────────────────────────────────────────
 * Sem nenhum segredo configurado, a rota RECUSA. Uma rota que aceita qualquer
 * corpo da internet marca qualquer telefone como opt-out — e é o jeito mais
 * barato de desligar a operação inteira de fora.
 *
 * Aceita três provas, porque o caminho pode vir da Meta direto ou pela Datafy:
 *   · `x-datafy-signature-256`, HMAC-SHA256 do corpo CRU com o `whsec_…` do
 *     painel da Datafy — é o caminho em uso na Doce Lilium
 *   · `x-hub-signature-256`, HMAC-SHA256 do corpo CRU (padrão da Meta)
 *   · `Authorization: Bearer`, segredo combinado
 *
 * O `whsec_…` foi, por semanas, "um segredo de formato desconhecido" nos
 * documentos deste projeto. Era isto: a chave de assinatura dos webhooks da
 * Datafy, medido no painel dela em 12/09/2026.
 * ══════════════════════════════════════════════════════════════════════════
 */

/** A Meta confere a rota antes de assinar: devolve o desafio dela. */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const modo = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const desafio = url.searchParams.get('hub.challenge')

  const esperado = process.env.WHATSAPP_VERIFY_TOKEN
  if (!esperado) {
    return NextResponse.json({ erro: 'WHATSAPP_VERIFY_TOKEN não configurado.' }, { status: 503 })
  }
  if (modo === 'subscribe' && token === esperado && desafio) {
    // Texto puro, e não JSON: a Meta compara o corpo com o desafio que mandou.
    return new Response(desafio, { status: 200, headers: { 'content-type': 'text/plain' } })
  }
  return NextResponse.json({ erro: 'Verificação recusada.' }, { status: 403 })
}

export async function POST(request: Request) {
  const cru = await request.text()

  const autorizado = await conferirOrigem(request, cru)
  if (autorizado !== true) return autorizado

  let corpo: PayloadMeta
  try {
    corpo = JSON.parse(cru) as PayloadMeta
  } catch {
    return NextResponse.json({ erro: 'Corpo inválido.' }, { status: 400 })
  }

  let statuses = 0
  let respostas = 0
  let saidas = 0

  try {
    for (const entry of corpo.entry ?? []) {
      for (const mudanca of entry.changes ?? []) {
        const valor = mudanca.value ?? {}

        for (const st of valor.statuses ?? []) {
          if (await tratarStatus(st)) statuses++
        }

        const nomes = new Map((valor.contacts ?? []).map((c) => [c.wa_id ?? '', c.profile?.name ?? null]))
        for (const msg of valor.messages ?? []) {
          const r = await tratarMensagem(msg, nomes.get(msg.from ?? '') ?? null)
          if (r.contou) respostas++
          if (r.saiu) saidas++
        }
      }
    }
  } catch (e) {
    await logar('ERRO', 'webhook_whatsapp', 'Falha ao tratar', e)
  }

  // Autorizado e nada casou: o formato pode não ser o da Meta (a Datafy
  // embrulha?). Guarda só a FORMA — chaves, campos e tipos —, sem conteúdo.
  // `sent` e status de mensagem que não é da Máquina são normais e ficam fora.
  const forma = (corpo.entry ?? []).flatMap((e) =>
    (e.changes ?? []).map((c) => ({
      campos: Object.keys((c.value ?? {}) as object),
      statuses: (c.value?.statuses ?? []).map((s) => s.status),
    })),
  )
  const conhecido = forma.some((f) => f.campos.some((k) => ['statuses', 'messages', 'message_template_status_update', 'event'].includes(k)))
  if (statuses + respostas + saidas === 0 && !conhecido) {
    await logar('INFO', 'webhook_sem_efeito', 'Webhook do WhatsApp sem efeito', {
      raiz: Object.keys(corpo as object),
      forma,
    })
  }

  // Sempre 200: a Meta re-entrega em quem não devolve 2XX, e uma falha nossa
  // não deve virar tempestade de reentrega.
  return NextResponse.json({ ok: true, statuses, respostas, saidas })
}

// ── Autorização ───────────────────────────────────────────────────────────

async function conferirOrigem(request: Request, cru: string): Promise<true | Response> {
  const appSecret = process.env.WHATSAPP_APP_SECRET
  const bearer = process.env.WHATSAPP_WEBHOOK_SECRET
  const datafy = process.env.DATAFY_WEBHOOK_SECRET?.trim()

  if (!appSecret && !bearer && !datafy) {
    return NextResponse.json(
      { erro: 'Nenhum segredo configurado para o webhook. A rota recusa em vez de ficar aberta.' },
      { status: 503 },
    )
  }

  if (datafy) {
    // O header pode vir como `sha256=<hex>` ou só o hex, e a chave pode ter
    // sido usada com ou sem o prefixo `whsec_`. As variantes derivam do MESMO
    // segredo — não afrouxam nada. Chutar uma só e errar deixaria a operação
    // muda sem ninguém entender por quê. Mesma decisão da CarBoss.
    const cabecalho = request.headers.get('x-datafy-signature-256') ?? ''
    const assinatura = cabecalho.includes('=') ? cabecalho.split('=').pop()!.trim() : cabecalho.trim()
    const chaves = datafy.startsWith('whsec_') ? [datafy, datafy.slice('whsec_'.length)] : [datafy]
    // A Datafy NÃO assina o corpo cru: assina `<x-datafy-timestamp>.<corpo>`,
    // com o segredo completo (com `whsec_`), em hex. Descoberto no CRM OCR em
    // 17/08/2026 e confirmado aqui em 13/09, quando TODO aviso de entrega vinha
    // sendo recusado (401) — nenhuma leitura, resposta ou opt-out chegava.
    // O corpo cru fica como segunda tentativa, caso a convenção mude.
    const carimbo = request.headers.get('x-datafy-timestamp')?.trim()
    const mensagens = carimbo ? [`${carimbo}.${cru}`, cru] : [cru]
    for (const msg of mensagens) {
      for (const chave of chaves) {
        if (assinatura && (await hmacConfere(msg, assinatura, chave))) return true
      }
    }
  }

  if (appSecret) {
    const cabecalho = request.headers.get('x-hub-signature-256') ?? ''
    const assinatura = cabecalho.startsWith('sha256=') ? cabecalho.slice(7) : cabecalho
    if (assinatura && (await hmacConfere(cru, assinatura, appSecret))) return true
  }

  if (bearer) {
    const cabecalho = request.headers.get('authorization') ?? ''
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : cabecalho
    if (token && tempoConstante(token, bearer)) return true
  }

  // Recusa calada foi o que escondeu, em 13/09, que nenhum status de entrega
  // voltava. Registra QUE chegou e QUAIS cabeçalhos de prova vieram — nunca
  // o valor deles nem o corpo.
  const provas = [...request.headers.keys()].filter((k) => /sign|auth|hub|datafy/i.test(k))
  await logar('AVISO', 'webhook_recusado', 'Webhook do WhatsApp recusado (401)', {
    cabecalhos: provas,
    bytes: cru.length,
    temSegredo: { datafy: !!datafy, appSecret: !!appSecret, bearer: !!bearer },
  })
  return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
}

async function hmacConfere(corpo: string, assinatura: string, segredo: string): Promise<boolean> {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo))
  const esperado = Buffer.from(new Uint8Array(mac)).toString('hex')
  return tempoConstante(assinatura.trim().toLowerCase(), esperado)
}

/** Comparação sem vazar o tamanho da diferença pelo tempo gasto. */
function tempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let d = 0
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return d === 0
}

// ── Os três fatos ─────────────────────────────────────────────────────────

/**
 * `sent` → `delivered` → `read`, ou `failed`.
 *
 * Só avança: a Meta manda fora de ordem, e um `sent` que chega depois do
 * `read` não pode apagar o `read`. Por isso cada campo é gravado apenas se
 * ainda estiver vazio.
 */
async function tratarStatus(st: StatusMeta): Promise<boolean> {
  if (!st.id) return false
  const msg = await prisma.mvMensagem.findFirst({
    where: { idExterno: st.id },
    select: { id: true, entregueEm: true, lidaEm: true, inscricaoId: true },
  })
  if (!msg) {
    // Envio que não saiu da Máquina (teste manual, disparo pelo painel). A
    // linha não existe para guardar a falha, mas o MOTIVO é justamente o que
    // se precisa ver quando "a Meta aceitou e não chegou" — 131042 (pagamento),
    // 131049 (limite de marketing), 131026 (número). Sem isto ele sumia calado.
    if (st.status === 'failed') {
      await logar('ERRO', 'envio_falhou', `Falha de entrega fora da Máquina (${st.errors?.[0]?.code ?? '?'})`, st)
    }
    return false
  }

  const quando = st.timestamp ? new Date(Number(st.timestamp) * 1000) : new Date()

  if (st.status === 'delivered' && !msg.entregueEm) {
    await prisma.mvMensagem.update({ where: { id: msg.id }, data: { entregueEm: quando } })
    return true
  }
  if (st.status === 'read') {
    await prisma.mvMensagem.update({
      where: { id: msg.id },
      data: { lidaEm: msg.lidaEm ?? quando, entregueEm: msg.entregueEm ?? quando },
    })
    return true
  }
  if (st.status === 'failed') {
    const erro = st.errors?.[0]
    const { natureza } = classificar(erro?.code)
    await prisma.mvMensagem.update({
      where: { id: msg.id },
      data: {
        status: 'ERRO',
        codigoErro: erro?.code ?? null,
        falhaMotivo: (erro?.title || erro?.message || 'falha sem detalhe').slice(0, 200),
        naturezaFalha: natureza,
      },
    })
    // Número inválido ou conta bloqueada encerram a régua: insistir com quem
    // a Meta já recusou só gasta reputação.
    if (natureza === 'NUMERO_INVALIDO' || natureza === 'BLOQUEADA_META') {
      await encerrarInscricao(msg.inscricaoId, natureza, erro?.title ?? natureza)
    }
    return true
  }
  return false
}

/** A pessoa falou. */
async function tratarMensagem(msg: MensagemMeta, nomeWhatsApp: string | null): Promise<{ contou: boolean; saiu: boolean }> {
  const e164 = paraE164(msg.from)
  const chave = e164 ? chaveTelefone(e164) : ''
  if (!chave) return { contou: false, saiu: false }

  // Idempotência pelo id da mensagem: a Meta re-entrega, e contar a mesma
  // resposta duas vezes estraga o número da tela.
  if (msg.id) {
    const marca = `whatsapp:msg:${msg.id}`
    try {
      const visto = await prisma.eventIngestLog.findFirst({ where: { source: marca }, select: { id: true } })
      if (visto) return { contou: false, saiu: false }
      await prisma.eventIngestLog.create({ data: { source: marca, payload: '', status: 'received' } })
    } catch {
      // sem o log a rota ainda funciona; perde só a proteção contra repetição
    }
  }

  const texto = msg.text?.body ?? msg.button?.text ?? msg.interactive?.button_reply?.title ?? null
  const rotuloBotao = msg.button?.text ?? msg.interactive?.button_reply?.title ?? null
  const quando = msg.timestamp ? new Date(Number(msg.timestamp) * 1000) : new Date()

  // Reação e figurinha não são fala: não viram turno nem acordam a IA.
  if (msg.type === 'reaction' || msg.type === 'sticker' || msg.type === 'unsupported' || msg.type === 'system') {
    return { contou: false, saiu: false }
  }
  const textoDoTurno = texto ?? descreverMidia(msg)

  // O turno entra no histórico da conversa — é a memória da IA — e move
  // `respondidoEm`, que é o que a Máquina lê.
  await registrarTurno(e164!, { em: quando.toISOString(), de: 'cliente', texto: textoDoTurno, id: msg.id })

  // Sai da régua na hora — e não só no próximo tique.
  await prisma.mvInscricao.updateMany({
    where: { telefoneKey: chave, status: 'ATIVA' },
    data: { respondeuEm: quando, respostas: { increment: 1 } },
  })

  const recusa = pediuParaSair(texto, rotuloBotao)
  if (!recusa.saiu) {
    if (msg.id) {
      const respondida = msg.context?.id
        ? await prisma.mvMensagem.findFirst({ where: { idExterno: msg.context.id }, select: { templateNome: true } }).catch(() => null)
        : null
      await agendarAtendimento({
        e164: e164!,
        msgId: msg.id,
        nome: nomeWhatsApp,
        tipo: msg.type ?? 'text',
        respondendoTemplate: respondida?.templateNome ?? null,
      }).catch((e) => logar('ERRO', 'atendimento_falhou', 'Não consegui agendar o atendimento', e))
    }
    return { contou: true, saiu: false }
  }

  await prisma.mvOptOut.upsert({
    where: { telefoneKey: chave },
    create: {
      telefoneKey: chave,
      telefoneE164: e164,
      origem: recusa.origem,
      // O que a pessoa escreveu, para auditar um falso positivo do detector
      // sem precisar abrir a conversa dela.
      trecho: (texto ?? '').slice(0, 300),
      despedidaEm: quando,
    },
    update: {},
  })

  const ativas = await prisma.mvInscricao.findMany({
    where: { telefoneKey: chave, status: { in: ['ATIVA', 'PAUSADA'] } },
    select: { id: true },
  })
  for (const i of ativas) await encerrarInscricao(i.id, 'OPT_OUT', `pediu para sair: ${recusa.motivo ?? 'botão'}`)

  await logar('INFO', 'opt_out', `Opt-out por ${recusa.origem}`, { chave, motivo: recusa.motivo })
  return { contou: true, saiu: true }
}

async function encerrarInscricao(id: string, status: string, motivo: string): Promise<void> {
  await prisma.$transaction([
    prisma.mvMensagem.updateMany({
      where: { inscricaoId: id, status: 'AGENDADA' },
      data: { status: 'CANCELADA', erro: motivo.slice(0, 200) },
    }),
    prisma.mvInscricao.update({ where: { id }, data: { status, motivoParada: motivo.slice(0, 200) } }),
  ])
}

async function logar(nivel: string, tipo: string, titulo: string, dados: unknown) {
  try {
    await prisma.logEvento.create({
      data: {
        origem: 'whatsapp',
        nivel,
        tipo,
        titulo,
        dados: JSON.stringify(dados instanceof Error ? dados.message : dados).slice(0, 4000),
      },
    })
  } catch {
    // tabela ainda não migrada
  }
}

// ── O formato da Meta ─────────────────────────────────────────────────────

type StatusMeta = {
  id?: string
  status?: string
  timestamp?: string
  recipient_id?: string
  errors?: { code?: number; title?: string; message?: string }[]
}

/**
 * Mensagem sem texto vira uma frase que a IA entende. Ela ainda não vê foto
 * nem ouve áudio — e dizer isso é melhor do que responder a nada.
 */
function descreverMidia(msg: MensagemMeta): string {
  switch (msg.type) {
    case 'image':
      return `[a cliente mandou uma foto${msg.image?.caption ? `: "${msg.image.caption}"` : ''}]`
    case 'video':
      return `[a cliente mandou um vídeo${msg.video?.caption ? `: "${msg.video.caption}"` : ''}]`
    case 'audio':
      return '[a cliente mandou um áudio, que você ainda não consegue ouvir]'
    case 'document':
      return `[a cliente mandou um arquivo${msg.document?.filename ? ` (${msg.document.filename})` : ''}]`
    case 'location':
      return '[a cliente mandou uma localização]'
    default:
      return `[a cliente mandou uma mensagem do tipo ${msg.type ?? 'desconhecido'}]`
  }
}

type MensagemMeta = {
  id?: string
  from?: string
  timestamp?: string
  type?: string
  context?: { id?: string }
  image?: { caption?: string }
  video?: { caption?: string }
  document?: { caption?: string; filename?: string }
  text?: { body?: string }
  button?: { text?: string; payload?: string }
  interactive?: { button_reply?: { id?: string; title?: string } }
}

type PayloadMeta = {
  entry?: {
    changes?: {
      value?: {
        statuses?: StatusMeta[]
        messages?: MensagemMeta[]
        contacts?: { wa_id?: string; profile?: { name?: string } }[]
      }
    }[]
  }[]
}
