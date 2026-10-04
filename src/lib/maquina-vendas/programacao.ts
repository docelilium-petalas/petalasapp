/**
 * A PROGRAMAÇÃO — que mensagens caem em cada dia.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * A fila já existe no banco: `MvMensagem.agendadaPara` é gravada na INSCRIÇÃO,
 * com a régua inteira materializada de uma vez. Este arquivo não agenda nada —
 * ele só agrupa o que já está agendado pela data de parede de São Paulo, que é
 * a data que a operação enxerga.
 *
 * ── O que a tela precisa saber, e que a contagem sozinha não diz ───────────
 * `agendadaPara` é PLANO, não promessa. Três coisas movem a data depois de
 * gravada, e as três são invisíveis para quem só conta linhas:
 *
 *   1. O TETO. O despachante manda até o menor entre `tetoDiario` e a
 *      capacidade física do relógio (`capacidadeDoDia`). O que não couber
 *      escorrega — e um dia com 90 agendadas num teto de 60 não é um dia de 90
 *      envios, é um dia de 60 e uma dívida de 30 que ninguém vê.
 *
 *   2. DOMINGO (só na origem). Na CarBoss `dentroDaJanela` recusa domingo; na
 *      Doce Lilium o fim de semana entra na janela, então `envia` é sempre true.
 *
 *   3. A RESPOSTA DA CLIENTE. Quem responde tem o resto da régua cancelado. Toda
 *      contagem futura é, portanto, um teto — nunca um piso.
 *
 * Por isso cada dia volta com `cabe`, `envia` e `capacidadeRestante`: a tela
 * mostra o número E o que pode acontecer com ele. Contar sem isso seria repetir
 * o erro que `capacidadeDoDia` foi escrita para corrigir — a tela dizia 500, a
 * operação recebia 91, e nada acusava a diferença.
 * ══════════════════════════════════════════════════════════════════════════
 */

import type prismaPadrao from '@/lib/prisma'
type PrismaClient = typeof prismaPadrao
import { MENSAGEM_STATUS } from './config'
import { deParedeSP, paraParedeSP, type JanelaEnvio } from './janela'

const dois = (n: number) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' da parede SP. É a chave de agrupamento do calendário. */
export function diaSP(instante: Date): string {
  const p = paraParedeSP(instante)
  return `${p.ano}-${dois(p.mes)}-${dois(p.dia)}`
}

/** 'HH:mm' da parede SP. */
export function horaSP(instante: Date): string {
  const p = paraParedeSP(instante)
  return `${dois(p.hora)}:${dois(p.minuto)}`
}

/** O instante UTC das 00:00 de um 'YYYY-MM-DD' na parede SP. */
export function inicioDoDia(dia: string): Date {
  const [ano, mes, d] = dia.split('-').map(Number)
  return deParedeSP(ano!, mes!, d!, 0, 0)
}

/** O instante UTC do fim de um 'YYYY-MM-DD' na parede SP (exclusivo). */
export function fimDoDia(dia: string): Date {
  return new Date(inicioDoDia(dia).getTime() + 24 * 3600 * 1000)
}

/**
 * O telefone nunca aparece inteiro na tela.
 *
 * Mora aqui e não numa terceira cópia: `actions/maquina-vendas.ts` passou a
 * importar desta função em vez de manter a sua. (`actions/resultados.ts` tem a
 * dela, de outro módulo, e não foi tocada.)
 */
export function mascararTelefone(tel: string): string {
  if (tel.length < 8) return tel
  return `${tel.slice(0, 4)}•••••${tel.slice(-3)}`
}

export type ItemProgramado = {
  id: string
  inscricaoId: string
  /** ISO do instante que vale: `enviadaEm` quando já saiu, `agendadaPara` quando não. */
  quando: string
  hora: string
  status: string
  nome: string
  telefone: string
  cadenciaId: string
  cadenciaNome: string
  etapaOrdem: number
  /** Só vem no detalhe do dia — a vista de mês não carrega texto. */
  texto?: string
}

export type FatiaDeCadencia = {
  cadenciaId: string
  nome: string
  total: number
}

export type DiaProgramado = {
  /** 'YYYY-MM-DD' na parede SP. */
  dia: string
  /** Na origem era falso no domingo. Na DL todo dia envia (ver `config.ts`). */
  envia: boolean
  agendadas: number
  enviadas: number
  erros: number
  porCadencia: FatiaDeCadencia[]
  /** Até 4, por hora. É o que o quadradinho do mês mostra. */
  amostra: ItemProgramado[]
  /** Quantas ainda cabem no dia depois do que já saiu. */
  capacidadeRestante: number
  /** `agendadas` passa do que o dia comporta? */
  cabe: boolean
}

type LinhaCrua = {
  id: string
  inscricaoId: string
  agendadaPara: Date
  enviadaEm: Date | null
  status: string
  etapaOrdem: number
  inscricao: {
    nomeSnapshot: string
    telefoneE164: string
    cadenciaId: string
    cadencia: { nome: string }
  }
}

const paraItem = (l: LinhaCrua): ItemProgramado => {
  const quando = l.status === MENSAGEM_STATUS.ENVIADA && l.enviadaEm ? l.enviadaEm : l.agendadaPara
  return {
    id: l.id,
    inscricaoId: l.inscricaoId,
    quando: quando.toISOString(),
    hora: horaSP(quando),
    status: l.status,
    nome: l.inscricao.nomeSnapshot,
    telefone: mascararTelefone(l.inscricao.telefoneE164),
    cadenciaId: l.inscricao.cadenciaId,
    cadenciaNome: l.inscricao.cadencia.nome,
    etapaOrdem: l.etapaOrdem,
  }
}

const SELECT_LINHA = {
  id: true,
  inscricaoId: true,
  agendadaPara: true,
  enviadaEm: true,
  status: true,
  etapaOrdem: true,
  inscricao: {
    select: {
      nomeSnapshot: true,
      telefoneE164: true,
      cadenciaId: true,
      cadencia: { select: { nome: true } },
    },
  },
} as const

/**
 * O recorte da régua, igual ao da tabela.
 *
 * ⚠️ CANCELADA fica de fora, e é a mesma decisão de `STATUS_DA_REGUA`: em 18/08
 * a tabela tinha 690 linhas das quais 515 eram canceladas — três de cada
 * quatro. Cancelada não é mensagem, é o registro de um toque desmarcado porque
 * a cliente respondeu. Num calendário isso pintaria de cheio um dia em que nada
 * sai. PULADA fica de fora pelo mesmo motivo.
 *
 * ERRO entra, mas contado à parte: falha de entrega sumindo em silêncio troca
 * um problema de ruído por um de cegueira.
 */
const STATUS_DO_CALENDARIO = [
  MENSAGEM_STATUS.AGENDADA,
  MENSAGEM_STATUS.ENVIADA,
  MENSAGEM_STATUS.ERRO,
]

/**
 * Monta os dias entre `de` e `ate` (inclusive), ambos 'YYYY-MM-DD' parede SP.
 *
 * Devolve TODOS os dias do intervalo, inclusive os vazios — o calendário
 * precisa desenhar o quadrado mesmo sem nada dentro, e deixar a tela inventar
 * os buracos é como se perde um dia na virada do mês.
 */
export async function programacaoDoIntervalo(
  db: PrismaClient,
  de: string,
  ate: string,
  opts: { tetoEfetivo: number; janela: JanelaEnvio },
): Promise<DiaProgramado[]> {
  const inicio = inicioDoDia(de)
  const fim = fimDoDia(ate)

  /**
   * Uma consulta só, com OR nos dois instantes.
   *
   * O que já saiu conta no dia em que SAIU (`enviadaEm`); o que não saiu conta
   * no dia em que está marcado (`agendadaPara`). São campos diferentes porque
   * são perguntas diferentes — e uma mensagem de terça que só saiu na quarta
   * pertence à quarta na leitura de quem quer saber o que aconteceu.
   */
  const linhas = (await db.mvMensagem.findMany({
    where: {
      status: { in: STATUS_DO_CALENDARIO },
      OR: [
        { agendadaPara: { gte: inicio, lt: fim } },
        { enviadaEm: { gte: inicio, lt: fim } },
      ],
    },
    orderBy: { agendadaPara: 'asc' },
    select: SELECT_LINHA,
  })) as LinhaCrua[]

  const porDia = new Map<string, LinhaCrua[]>()
  for (const l of linhas) {
    const quando = l.status === MENSAGEM_STATUS.ENVIADA && l.enviadaEm ? l.enviadaEm : l.agendadaPara
    if (quando < inicio || quando >= fim) continue // a outra ponta do OR
    const chave = diaSP(quando)
    const lista = porDia.get(chave)
    if (lista) lista.push(l)
    else porDia.set(chave, [l])
  }

  const dias: DiaProgramado[] = []
  for (let d = new Date(inicio); d < fim; d = new Date(d.getTime() + 24 * 3600 * 1000)) {
    const chave = diaSP(d)
    const lista = (porDia.get(chave) ?? []).slice().sort((a, b) => {
      const qa = a.status === MENSAGEM_STATUS.ENVIADA && a.enviadaEm ? a.enviadaEm : a.agendadaPara
      const qb = b.status === MENSAGEM_STATUS.ENVIADA && b.enviadaEm ? b.enviadaEm : b.agendadaPara
      return qa.getTime() - qb.getTime()
    })

    const agendadas = lista.filter((l) => l.status === MENSAGEM_STATUS.AGENDADA).length
    const enviadas = lista.filter((l) => l.status === MENSAGEM_STATUS.ENVIADA).length
    const erros = lista.filter((l) => l.status === MENSAGEM_STATUS.ERRO).length

    const fatias = new Map<string, FatiaDeCadencia>()
    for (const l of lista) {
      if (l.status === MENSAGEM_STATUS.ERRO) continue
      const atual = fatias.get(l.inscricao.cadenciaId)
      if (atual) atual.total += 1
      else {
        fatias.set(l.inscricao.cadenciaId, {
          cadenciaId: l.inscricao.cadenciaId,
          nome: l.inscricao.cadencia.nome,
          total: 1,
        })
      }
    }

    const capacidadeRestante = Math.max(0, opts.tetoEfetivo - enviadas)

    dias.push({
      dia: chave,
      // DL: fim de semana ENTRA na janela (`config.ts`) — quem compra roupa
      // compra no sábado. O campo fica para a tela não precisar mudar.
      envia: true,
      agendadas,
      enviadas,
      erros,
      porCadencia: [...fatias.values()].sort((a, b) => b.total - a.total),
      amostra: lista.slice(0, 4).map(paraItem),
      capacidadeRestante,
      cabe: agendadas <= capacidadeRestante,
    })
  }

  return dias
}

/**
 * O dia inteiro, com o texto de cada mensagem.
 *
 * Separado do intervalo porque o texto é o campo caro: um mês de 60/dia são
 * ~1.800 copies completas para desenhar quadradinhos que mostram quatro nomes.
 * A tela do mês carrega o leve; o dia carrega o pesado quando alguém clica.
 */
export async function programacaoDoDia(
  db: PrismaClient,
  dia: string,
): Promise<ItemProgramado[]> {
  const inicio = inicioDoDia(dia)
  const fim = fimDoDia(dia)

  const linhas = await db.mvMensagem.findMany({
    where: {
      status: { in: STATUS_DO_CALENDARIO },
      OR: [
        { agendadaPara: { gte: inicio, lt: fim } },
        { enviadaEm: { gte: inicio, lt: fim } },
      ],
    },
    orderBy: { agendadaPara: 'asc' },
    select: {
      ...SELECT_LINHA,
      mensagemFinal: true,
      textoEntregue: true,
    },
  })

  return linhas
    .filter((l) => {
      const quando = l.status === MENSAGEM_STATUS.ENVIADA && l.enviadaEm ? l.enviadaEm : l.agendadaPara
      return quando >= inicio && quando < fim
    })
    .map((l) => ({
      ...paraItem(l as LinhaCrua),
      /**
       * ⚠️ `textoEntregue` GANHA de `mensagemFinal` quando existe.
       *
       * Quando o envio sai por template, `mensagemFinal` é a copy livre e NÃO é
       * o que a pessoa recebeu — o entregue é o corpo aprovado pela Meta. Mostrar
       * `mensagemFinal` numa mensagem já enviada é exibir uma frase que a cliente
       * nunca viu, que é pior que campo vazio: tem cara de certo.
       */
      texto: l.textoEntregue ?? l.mensagemFinal,
    }))
    .sort((a, b) => a.quando.localeCompare(b.quando))
}
