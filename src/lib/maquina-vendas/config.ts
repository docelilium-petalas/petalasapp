/**
 * OS NÚMEROS DA MÁQUINA — e a janela em que ela pode falar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Precedência, e o motivo de ser esta:
 *
 *     banco (maquina_vendas_ajustes)  →  env  →  default do código
 *
 * O banco ganha porque é o único lugar que a operação altera às 9h de um dia
 * de disparo, pela tela. A env é o valor de partida de um ambiente novo, e o
 * default do código é a rede de segurança de um banco vazio.
 *
 * Isso importa aqui mais do que na origem: o EasyPanel deste projeto não tem
 * `autoDeploy`, então TODO push exige Deploy manual. Um parâmetro que se muda
 * olhando o relógio não pode custar um deploy.
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'

export type Ajustes = {
  tetoDiario: number
  intervaloMinMinutos: number
  intervaloMaxMinutos: number
  janelaInicio: string
  janelaFim: string
  envioPausado: boolean
  /// Nulos quando ninguém configurou um cupom vigente — ver o schema.
  cupomCarrinho: string | null
  descontoCarrinho: string | null
}

const PADRAO: Ajustes = {
  tetoDiario: 40,
  intervaloMinMinutos: 3,
  intervaloMaxMinutos: 12,
  janelaInicio: '09:00',
  janelaFim: '20:00',
  // NASCE PAUSADO. A Máquina fala com cliente real; ela não deve começar a
  // falar por causa de um deploy, e sim porque alguém decidiu ligar.
  envioPausado: true,
  // Sem cupom inventado por omissão: prometer desconto que não existe na loja
  // é pior do que não mandar a última mensagem.
  cupomCarrinho: null,
  descontoCarrinho: null,
}

function daEnv(): Partial<Ajustes> {
  const num = (v: string | undefined) => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : undefined
  }
  return {
    tetoDiario: num(process.env.MV_TETO_DIARIO),
    intervaloMinMinutos: num(process.env.MV_INTERVALO_MIN_MINUTOS),
    intervaloMaxMinutos: num(process.env.MV_INTERVALO_MAX_MINUTOS),
    janelaInicio: process.env.MV_JANELA_INICIO || undefined,
    janelaFim: process.env.MV_JANELA_FIM || undefined,
    cupomCarrinho: process.env.MV_CUPOM_CARRINHO || undefined,
    descontoCarrinho: process.env.MV_DESCONTO_CARRINHO || undefined,
  }
}

/**
 * Sem cache de propósito: os números são editáveis pela tela a qualquer
 * momento, e um cache de processo faria a Máquina seguir com o teto velho até
 * o próximo deploy — o defeito mais chato de diagnosticar, porque funciona em
 * todo lugar menos onde importa.
 */
export async function obterAjustes(): Promise<Ajustes> {
  let doBanco: Partial<Ajustes> = {}
  let temLinha = false
  try {
    const linha = await prisma.mvAjustes.findUnique({ where: { id: 'unico' } })
    if (linha) {
      temLinha = true
      doBanco = {
        tetoDiario: linha.tetoDiario,
        intervaloMinMinutos: linha.intervaloMinMinutos,
        intervaloMaxMinutos: linha.intervaloMaxMinutos,
        janelaInicio: linha.janelaInicio,
        janelaFim: linha.janelaFim,
        envioPausado: linha.envioPausado,
        cupomCarrinho: linha.cupomCarrinho,
        descontoCarrinho: linha.descontoCarrinho,
      }
    }
  } catch {
    // tabela ainda não migrada: cai para env/default em vez de derrubar a tela
  }
  const env = daEnv()
  return {
    tetoDiario: doBanco.tetoDiario ?? env.tetoDiario ?? PADRAO.tetoDiario,
    intervaloMinMinutos: doBanco.intervaloMinMinutos ?? env.intervaloMinMinutos ?? PADRAO.intervaloMinMinutos,
    intervaloMaxMinutos: doBanco.intervaloMaxMinutos ?? env.intervaloMaxMinutos ?? PADRAO.intervaloMaxMinutos,
    janelaInicio: doBanco.janelaInicio ?? env.janelaInicio ?? PADRAO.janelaInicio,
    janelaFim: doBanco.janelaFim ?? env.janelaFim ?? PADRAO.janelaFim,
    envioPausado: doBanco.envioPausado ?? PADRAO.envioPausado,
    // Aqui a precedência é diferente das outras, de propósito. Nos números,
    // ausência no banco significa "não configurei, use o padrão". No cupom,
    // ausência significa "APAGUEI, não existe cupom vigente" — e apagar tem
    // que ganhar do env, senão a tela não consegue desligar a promessa de
    // desconto. Por isso: havendo linha no banco, o banco manda, inclusive
    // quando o que ele diz é "vazio".
    cupomCarrinho: temLinha ? doBanco.cupomCarrinho || null : env.cupomCarrinho ?? PADRAO.cupomCarrinho,
    descontoCarrinho: temLinha ? doBanco.descontoCarrinho || null : env.descontoCarrinho ?? PADRAO.descontoCarrinho,
  }
}

// ── A JANELA ──────────────────────────────────────────────────────────────
// Tudo é calculado na parede de São Paulo e gravado em UTC. Misturar os dois
// é como uma cadência de "2h depois" vira "1h depois" no horário de verão.

const FUSO = 'America/Sao_Paulo'

/** {hora, minuto, diaDaSemana} de um instante, na parede de São Paulo. */
export function paredeSP(quando: Date): { hora: number; minuto: number; diaSemana: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO,
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  })
  const partes = Object.fromEntries(fmt.formatToParts(quando).map((p) => [p.type, p.value]))
  const dias: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    hora: Number(partes.hour),
    minuto: Number(partes.minute),
    diaSemana: dias[partes.weekday ?? 'Mon'] ?? 1,
  }
}

function emMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (Number.isFinite(h) ? h : 9) * 60 + (Number.isFinite(m) ? m : 0)
}

/**
 * A Máquina pode falar AGORA?
 *
 * Fim de semana entra na janela de propósito: quem compra roupa compra no
 * sábado, e recuperar carrinho abandonado no domingo é o oposto de incômodo —
 * é o momento em que a pessoa está olhando. Isso difere das origens B2B, onde
 * sábado era invasão.
 */
export function dentroDaJanela(ajustes: Ajustes, quando: Date = new Date()): boolean {
  const { hora, minuto } = paredeSP(quando)
  const agora = hora * 60 + minuto
  return agora >= emMinutos(ajustes.janelaInicio) && agora < emMinutos(ajustes.janelaFim)
}

/** O próximo instante em que a janela abre, a partir de `quando`. */
export function proximaAbertura(ajustes: Ajustes, quando: Date = new Date()): Date {
  const alvo = new Date(quando)
  for (let i = 0; i < 8 * 24 * 60; i += 5) {
    alvo.setTime(quando.getTime() + i * 60_000)
    if (dentroDaJanela(ajustes, alvo)) return alvo
  }
  return alvo
}

/** Chaves de cursor usadas pelo módulo. */
export const CURSOR_ULTIMO_ENVIO = 'mv:ultimo_envio'
export const CURSOR_VARREDURA_CARRINHO = 'mv:varredura_carrinho'

// ── PORTADO DA CARBOSS (src/lib/maquina-vendas/config.ts) ─────────────────
// Os nomes de cursor ganham o prefixo `mv:` que este projeto já usa, para não
// colidir com os cursores do atendimento (`atendimento:*`) na mesma tabela.

/** Só existe status que algum guard discrimina. Superconjunto das duas origens. */
export const INSCRICAO_STATUS = {
  ATIVA: 'ATIVA',
  PAUSADA: 'PAUSADA',
  CONCLUIDA: 'CONCLUIDA',
  RESPONDEU: 'RESPONDEU',
  CONVERTEU: 'CONVERTEU',
  CANCELADA: 'CANCELADA',
  ERRO: 'ERRO',
  /** Pediu para parar: nunca mais é inscrita, em cadência nenhuma. */
  OPT_OUT: 'OPT_OUT',
  /** WhatsApp disse que o número não recebe (131026/133010). Ação: conferir cadastro. */
  NUMERO_INVALIDO: 'NUMERO_INVALIDO',
  /** A Meta recusou a entrega (131049 e parentes). Não se reenvia. */
  BLOQUEADA_META: 'BLOQUEADA_META',
} as const

export const MENSAGEM_STATUS = {
  AGENDADA: 'AGENDADA',
  ENVIADA: 'ENVIADA',
  CANCELADA: 'CANCELADA',
  PULADA: 'PULADA',
  /** Recusada por guarda antes de sair (copy, template ausente, fora da lista de teste). */
  VETADA: 'VETADA',
  ERRO: 'ERRO',
} as const

/**
 * Recorte padrão da tabela: o que já saiu e o que vai sair. É filtro, não
 * remoção — a tela diz quantas linhas ficaram de fora e oferece o clique.
 */
export const STATUS_DA_REGUA = [MENSAGEM_STATUS.ENVIADA, MENSAGEM_STATUS.AGENDADA] as const

export const CURSOR_PULSO_WEBHOOK = 'mv:datafy_ultimo_webhook'
export const CURSOR_PULSO_STATUS = 'mv:datafy_ultimo_status'
export const CURSOR_HANDOFF = 'mv:handoff_relogio'
export const CURSOR_BRIEFING = 'mv:briefing_diario'
export const CURSOR_BRIEFING_AVISO = 'mv:briefing_diario_aviso'
export const CURSOR_BRIEFING_PORTA = 'mv:briefing_diario_porta'
export const CURSOR_DISJUNTOR = 'mv:disjuntor_ultimo_codigo'
export const CURSOR_CHATWOOT_NOTA = 'mv:chatwoot_nota'
/** Até onde o observador de colunas do funil já leu `DealStageHistory`. */
export const CURSOR_OBSERVADOR_COLUNAS = 'mv:observador_colunas'

/** Sobreposição de varredura: o que entrou nos últimos 10 min é relido. */
export const OVERLAP_MS = 10 * 60 * 1000

/** A rampa de aberturas só limita com `MV_RAMPA=on` (a conta DL já tem histórico). */
export function rampaLigada(): boolean {
  return process.env.MV_RAMPA === 'on'
}

/**
 * LISTA DE TESTE — `MV_NUMEROS_TESTE`, números separados por vírgula.
 *
 * Diferente da origem (`MV_NUMERO_DEV`, que REDIRECIONAVA todo envio para um
 * número só), aqui a lista BLOQUEIA: com ela definida, quem está fora não
 * recebe e a mensagem vira VETADA com motivo registrado. Redirecionar é o jeito
 * de a cliente A receber, no teste, o pedido da cliente B — e de um teste
 * "verde" esconder que a copy saiu com o nome errado.
 *
 * Ausente/vazia = produção normal. Comparação pelos últimos 8 dígitos, que é a
 * chave que o resto do módulo já usa (`telefoneKey`), para o 9º dígito e o DDI
 * não decidirem quem passa.
 */
export function numerosDeTeste(valor: string | undefined = process.env.MV_NUMEROS_TESTE): string[] | null {
  // O parâmetro existe para a bateria testar a leitura SEM mexer na env do
  // processo: na aba Prontidão ela roda dentro do servidor, e trocar a env ali
  // abriria a lista branca para um tique que rodasse no mesmo instante.
  const bruto = (valor ?? '').trim()
  if (!bruto) return null
  const lista = bruto
    .split(/[,;\s]+/)
    .map((n) => n.replace(/\D/g, ''))
    .filter((n) => n.length >= 8)
  // Falha fechada: a env existe mas nenhum número presta → ninguém passa.
  // Cair em `null` aqui transformaria um erro de digitação em produção aberta.
  return lista
}

export function liberadoParaEnvio(telefone: string, lista: string[] | null = numerosDeTeste()): boolean {
  if (!lista) return true
  const chave = telefone.replace(/\D/g, '').slice(-8)
  return chave.length === 8 && lista.some((n) => n.slice(-8) === chave)
}

/** Quem recebe o alerta do vigia/disjuntor por WhatsApp. Ausente = só LogEvento. */
export function numeroDeAlerta(): string | null {
  const n = (process.env.MV_ALERTA_NUMERO ?? '').replace(/\D/g, '')
  return n.length >= 12 ? n : null
}
