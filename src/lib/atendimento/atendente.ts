/**
 * QUANDO A PESSOA ASSUME — a IA se cala e a conversa ganha dona.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Havia UM caminho para calar a IA: ela mesma pedir, chamando
 * `/api/agente/humano` quando entendia que não dava conta. Isso cobre o caso
 * educado — a cliente pede uma pessoa, o agente passa a bola.
 *
 * Não cobre o caso real: **a Marília abre o WhatsApp no celular e responde.**
 * Aí ninguém avisa ninguém. A IA continua achando que a conversa é dela,
 * responde por cima, e a cliente vê duas vozes discordando no mesmo balão. Foi
 * esse o buraco.
 *
 * Agora o próprio fato de alguém ter digitado é o aviso: o eco da mensagem
 * volta pelo webhook (ver `maquina-vendas/eco.ts`), e quem chega aqui já
 * passou pelo crivo do `wamid`.
 *
 * ── As três coisas que acontecem juntas ───────────────────────────────────
 *   1. A IA se cala por `HUMANO_HORAS` — o mesmo relógio do pedido educado,
 *      para não existirem duas regras de silêncio discordando.
 *   2. A fala entra no histórico como `loja`. Sem isso a IA, quando voltar,
 *      responde como se nada tivesse sido dito e repete o que a pessoa já
 *      respondeu.
 *   3. O negócio vai para "Atendimento humano" **com dona**. Conversa que a
 *      IA larga e ninguém pega é pior que conversa sem IA: some da fila de
 *      todo mundo.
 *
 * ── Por que o silêncio tem prazo ──────────────────────────────────────────
 * Calar para sempre é o defeito que a CarBoss mediu e corrigiu: a etiqueta
 * `atendimento-humano` ficava na conversa até alguém lembrar de tirar, e
 * ninguém lembra. Uma conversa puxada numa terça continuava sem agente em
 * setembro, e quem respondesse em agosto falava com o silêncio. Aqui o prazo é
 * o mesmo `HUMANO_HORAS` — e QUALQUER fala nova, de gente ou de cliente,
 * reinicia a contagem, porque conversa viva é conversa que alguém está
 * trabalhando.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { HUMANO_HORAS, marcarHumano, registrarTurno } from './conversa'
import { funilSemFalhar } from './funil'

/**
 * A dona padrão de uma conversa que a IA largou.
 *
 * Ordem, e o porquê de ser esta:
 *
 *   1. `ATENDIMENTO_USUARIO_PADRAO` — e-mail na env. É o único jeito de
 *      apontar uma pessoa específica sem depender de como o nome dela foi
 *      digitado no cadastro.
 *   2. Perfil cujo nome começa com "Maril" — pega "Marília" e "Marilia", que é
 *      exatamente o par que sempre diverge entre um cadastro e outro.
 *   3. O dono do funil padrão. Nunca fica sem ninguém: negócio sem responsável
 *      não aparece na fila de trabalho de pessoa nenhuma.
 *
 * Devolve `null` só se o CRM não tiver usuário algum — e aí o negócio segue
 * sem dona, que é o comportamento de antes, não uma regressão.
 */
export async function usuarioPadrao(): Promise<string | null> {
  const porEmail = process.env.ATENDIMENTO_USUARIO_PADRAO?.trim().toLowerCase()
  if (porEmail) {
    const u = await prisma.user.findFirst({ where: { email: porEmail }, select: { id: true } }).catch(() => null)
    if (u) return u.id
    // Env preenchida e e-mail que não existe é erro de digitação, e erro de
    // digitação calado vira "por que a Marília não recebe nada?" seis semanas
    // depois. Registra e segue para o próximo critério.
    await logar('AVISO', 'atendente_sem_usuario', 'ATENDIMENTO_USUARIO_PADRAO não casa com nenhum usuário', {
      email: porEmail,
    })
  }

  const perfil = await prisma.profile
    .findFirst({
      where: { nome: { startsWith: 'Maril', mode: 'insensitive' } },
      orderBy: { createdAt: 'asc' },
      select: { userId: true },
    })
    .catch(() => null)
  if (perfil) return perfil.userId

  const funil = await prisma.pipeline
    .findFirst({ where: { isDefault: true }, orderBy: { createdAt: 'asc' }, select: { userId: true } })
    .catch(() => null)
  if (funil) return funil.userId

  const qualquer = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } }).catch(() => null)
  return qualquer?.id ?? null
}

export interface FalaDaPessoa {
  /** Telefone da cliente, só dígitos com DDI. */
  e164: string
  /** O que a pessoa escreveu. Pode vir vazio quando foi mídia sem legenda. */
  texto: string
  quando: Date
  /** O id da Meta, para o histórico conseguir casar com o eco depois. */
  wamid?: string | null
}

export interface ResultadoAssumir {
  assumiu: boolean
  motivo: string
  /** Quem ficou com a conversa. */
  responsavelId: string | null
}

/**
 * Uma pessoa do time respondeu por fora. Cala a IA e entrega a conversa.
 *
 * Best-effort de ponta a ponta: nada aqui pode derrubar o webhook. Um erro no
 * funil não pode impedir a IA de se calar — se tiver que falhar, que falhe do
 * lado de deixar o humano trabalhar em paz.
 */
export async function assumirConversa(f: FalaDaPessoa): Promise<ResultadoAssumir> {
  const responsavelId = await usuarioPadrao().catch(() => null)

  // 1 · O silêncio. É o efeito que importa; vem primeiro e sem rede de apoio
  //     de ninguém — se este falhar, a função inteira falhou.
  await marcarHumano(f.e164)

  // 2 · A memória. Sem `await` crítico: histórico perdido é ruim, IA falando
  //     por cima é pior, e o passo 1 já resolveu o pior.
  const texto = f.texto.trim() || '[a loja respondeu com uma mídia]'
  await registrarTurno(f.e164, {
    em: f.quando.toISOString(),
    de: 'loja',
    texto,
    id: f.wamid ?? undefined,
  }).catch(() => undefined)

  // 3 · A dona. `funilSemFalhar` já engole o próprio erro.
  await funilSemFalhar({
    e164: f.e164,
    etapa: 'humano',
    atividade: `Atendente (pelo celular): ${texto}`,
    responsavelId,
  })

  await logar('INFO', 'atendente_assumiu', 'Atendente respondeu pelo celular — IA pausada', {
    telefone: f.e164.slice(-4).padStart(f.e164.length, '*'),
    horas: HUMANO_HORAS,
    responsavelId,
    wamid: f.wamid ?? null,
  })

  return { assumiu: true, motivo: `IA pausada por ${HUMANO_HORAS}h`, responsavelId }
}

async function logar(nivel: string, tipo: string, titulo: string, dados: unknown): Promise<void> {
  await prisma.logEvento
    .create({
      data: {
        origem: 'atendimento',
        nivel,
        tipo,
        titulo,
        dados: JSON.stringify(dados).slice(0, 4000),
      },
    })
    .catch(() => undefined)
}
