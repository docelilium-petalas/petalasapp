/**
 * A AGENDA — quando cada etapa sai, e por que não pode sair tudo junto.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * O DEFEITO QUE ESTE ARQUIVO EXISTE PARA CONSERTAR.
 *
 * A régua original era "1h / 24h / 48h depois do abandono", com as três
 * etapas contando da mesma âncora: o `created_at` do checkout.
 *
 * Só que a Nuvemshop **não publica o carrinho na hora**. Medido em
 * 09/09/2026: o carrinho mais novo que a API mostrava tinha 27 horas. Quando
 * a varredura enxerga o carrinho, portanto, as três etapas JÁ VENCERAM — e
 * "etapa vencida sai agora" transforma a régua inteira em três mensagens no
 * mesmo minuto, para a mesma pessoa.
 *
 * Isso não é uma régua agressiva. É uma rajada, e rajada é o padrão que
 * derruba número no WhatsApp.
 *
 * ── A CORREÇÃO ────────────────────────────────────────────────────────────
 * O relógio da PRIMEIRA etapa conta do gatilho — ela deve mesmo sair assim
 * que a gente descobre o carrinho, porque descobrir é o nosso instante zero.
 *
 * O relógio das SEGUINTES conta da ENTREGA da anterior (`ancoradaEm:
 * 'entrega'`, campo que o schema já previa). "24h depois da anterior" é
 * verdade em qualquer atraso de publicação: um carrinho descoberto com 27h e
 * outro com 3 dias recebem a mesma sequência, do mesmo jeito, espaçada igual.
 *
 * A âncora do gatilho não é jogada fora — ela continua sendo a verdade do
 * evento, e é ela que decide se o carrinho é velho demais para entrar
 * (`idadeMaximaHoras`).
 * ══════════════════════════════════════════════════════════════════════════
 */

import prisma from '@/lib/prisma'
import { dentroDaJanela, proximaAbertura, type Ajustes } from './config'

/** Piso de segurança entre duas mensagens da MESMA pessoa. */
const ESPACO_MINIMO_MINUTOS = 60

export type EtapaAgendavel = {
  ordem: number
  delayMinutos: number
  /** `gatilho` conta da âncora do evento; `entrega` conta da etapa anterior. */
  ancoradaEm: string
}

/**
 * Calcula o instante de cada etapa, em ordem, sem nunca empilhar duas no
 * mesmo momento.
 *
 * Devolve um instante por etapa, na mesma ordem em que elas entraram.
 */
export function agendarEtapas(args: {
  ancora: Date
  etapas: EtapaAgendavel[]
  ajustes: Ajustes
  agora?: Date
}): Date[] {
  const agora = args.agora ?? new Date()
  const etapas = [...args.etapas].sort((a, b) => a.ordem - b.ordem)

  const saida: Date[] = []
  let anterior: Date | null = null

  for (const etapa of etapas) {
    // A base é o que muda tudo: gatilho olha para o evento, entrega olha para
    // a mensagem anterior.
    const base: Date = etapa.ancoradaEm === 'entrega' && anterior ? anterior : args.ancora
    let alvo: Date = new Date(base.getTime() + etapa.delayMinutos * 60_000)

    // Etapa vencida não sai "atrasada fingindo ser pontual": ela sai agora.
    // Só a primeira chega aqui vencida — as seguintes contam da anterior, que
    // já é futura.
    if (alvo < agora) alvo = agora

    // Piso de segurança. Não é a régua — é a rede embaixo dela, para uma
    // cadência mal configurada (todas as etapas no gatilho, por exemplo) não
    // conseguir produzir a rajada de novo.
    if (anterior) {
      const piso = new Date(anterior.getTime() + ESPACO_MINIMO_MINUTOS * 60_000)
      if (alvo < piso) alvo = piso
    }

    const quando: Date = dentroDaJanela(args.ajustes, alvo) ? alvo : proximaAbertura(args.ajustes, alvo)
    saida.push(quando)
    anterior = quando
  }

  return saida
}

/**
 * Depois que uma mensagem SAI DE VERDADE, reancora as seguintes.
 *
 * A semeadura agenda a fila inteira com datas previstas — é isso que permite
 * a tela mostrar a sequência antes de qualquer coisa sair. Mas previsão não é
 * entrega: se a etapa 1 esperou a janela abrir, ou tomou uma re-tentativa, o
 * "24h depois" das seguintes tem que contar do envio real, não do palpite.
 *
 * Só mexe em mensagem `AGENDADA` e só nas etapas ancoradas em `entrega`:
 * o que já saiu é história, e o que conta do gatilho não depende disto.
 *
 * Devolve quantas mensagens tiveram a data corrigida.
 */
export async function reancorarAposEnvio(args: {
  inscricaoId: string
  etapaOrdem: number
  enviadaEm: Date
  ajustes: Ajustes
}): Promise<number> {
  const inscricao = await prisma.mvInscricao.findUnique({
    where: { id: args.inscricaoId },
    select: { cadencia: { select: { etapas: { orderBy: { ordem: 'asc' } } } } },
  })
  if (!inscricao) return 0

  const seguintes = inscricao.cadencia.etapas.filter((e) => e.ordem > args.etapaOrdem)
  if (!seguintes.length) return 0

  const pendentes = await prisma.mvMensagem.findMany({
    where: { inscricaoId: args.inscricaoId, etapaOrdem: { gt: args.etapaOrdem }, status: 'AGENDADA' },
    select: { id: true, etapaOrdem: true },
  })
  if (!pendentes.length) return 0

  // Reagenda a cauda como se `enviadaEm` fosse a âncora da primeira seguinte.
  const datas = agendarEtapas({
    ancora: args.enviadaEm,
    etapas: seguintes.map((e, i) => ({
      ordem: e.ordem,
      delayMinutos: e.delayMinutos,
      // A primeira da cauda conta do envio que acabou de acontecer; as demais
      // seguem a regra própria delas.
      ancoradaEm: i === 0 ? 'gatilho' : e.ancoradaEm,
    })),
    ajustes: args.ajustes,
    agora: args.enviadaEm,
  })

  const porOrdem = new Map(seguintes.map((e, i) => [e.ordem, datas[i]]))

  let corrigidas = 0
  for (const msg of pendentes) {
    const nova = porOrdem.get(msg.etapaOrdem)
    if (!nova) continue
    await prisma.mvMensagem.update({ where: { id: msg.id }, data: { agendadaPara: nova } })
    corrigidas++
  }
  return corrigidas
}
