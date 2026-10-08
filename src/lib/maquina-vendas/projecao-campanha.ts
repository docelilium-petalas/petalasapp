/**
 * A PROJEÇÃO DA CAMPANHA DATADA — o que vai sair num dia que ainda não chegou.
 *
 * Nasceu em 08/10/2026: filtrando 09/10 e 10/10 o painel mostrava zero. Não
 * era defeito de filtro — a onda da campanha só ENTRA na fila às 09:00 do
 * próprio dia (`campanha-datada.ts`), então antes disso não existe linha em
 * `MvMensagem` para contar. Quem programou a véspera precisa ver QUEM vai
 * receber e O QUE vai receber antes da manhã do dia, não depois.
 *
 * Este arquivo NÃO grava nada. Ele refaz, em leitura, a mesma conta do
 * semeador, com as mesmas peças:
 *   · quem entra: a onda anterior (`seguirOnda`), lida do banco — e, se a
 *     anterior também ainda não semeou, a projeção dela (a corrente d1→d2→d3);
 *   · quem sai da conta: sem primeiro nome e opt-out, igual ao semeador;
 *   · o texto: o esqueleto da etapa com o nome dela e a MESMA semente
 *     (`chave:onda:ordem`), então a variação sorteada é a que vai sair.
 *
 * O horário é ESTIMATIVA: a onda abre às 09:00 e o despachante solta uma por
 * vez no passo médio do relógio. Carrinho e pedido passam na frente (prioridade
 * menor), então o relógio real só pode atrasar — nunca adiantar.
 *
 * Onda 1 (base da loja) não é projetada: a base vem da Nuvemshop e é medida na
 * manhã do dia. Para o drop 10.10 ela já semeou em 01/10.
 */

import type prismaPadrao from '@/lib/prisma'
import { ONDAS, ORIGEM_CAMPANHA, cursorDaOnda, type Onda } from './campanha-datada'
import { montarCopy } from './copy'
import { esqueletoNomeado } from './catalogo-templates'
import { MENSAGEM_STATUS } from './config'
import { diaSP, horaSP, inicioDoDia, mascararTelefone } from './programacao'

type PrismaClient = typeof prismaPadrao

export type ItemPrevisto = {
  /** `prev:<onda>:<chave>` — não é id de banco: a linha ainda não existe. */
  id: string
  ondaId: string
  cadenciaId: string | null
  cadenciaNome: string
  templateNome: string
  dia: string
  /** ISO do horário ESTIMADO. */
  quando: string
  hora: string
  nome: string
  telefone: string
  texto: string | null
  /** Algo que pode impedir esta cliente de receber (ex.: a Meta recusou a onda anterior). */
  aviso: string | null
  /** Cabe no dia pelo teto e pela janela? */
  cabe: boolean
}

export type OndaNaProjecao = {
  id: string
  nome: string
  gatilho: string
  template: string
  dia: string
  abreEm: string
  cadenciaId: string | null
  cadenciaAtiva: boolean
  /** Já entrou na fila? Então os números reais estão em `MvMensagem`. */
  semeadaEm: string | null
  /** Pessoas que a onda alcança (projetado) ou alcançou (semeada). */
  total: number
  semNome: number
  optOut: number
  /** O que impediria a onda de sair, em palavras. Nulo = nada no caminho. */
  impedimento: string | null
  /** O texto com um nome de exemplo — o que a cliente lê. */
  textoExemplo: string | null
}

export type Projecao = { ondas: OndaNaProjecao[]; itens: ItemPrevisto[] }

type Pessoa = { chave: string; e164: string; nome: string | null }

export async function projetarCampanhas(
  db: PrismaClient,
  opts: {
    /** 'YYYY-MM-DD' inclusivos. Nulo = sem corte (todas as ondas futuras). */
    de: string | null
    ate: string | null
    passoMinutos: number
    tetoEfetivo: number
    janelaInicioMin: number
    janelaFimMin: number
  },
): Promise<Projecao> {
  const armada = process.env.MV_CAMPANHA_1010 === '1'

  const [cursores, cadencias, optOuts, recusadas] = await Promise.all([
    db.mvCursor.findMany({ where: { chave: { in: ONDAS.map((o) => cursorDaOnda(o.id)) } }, select: { chave: true, valor: true } }),
    db.mvCadencia.findMany({
      where: { gatilho: { in: ONDAS.map((o) => o.gatilho) } },
      select: { id: true, nome: true, gatilho: true, ativo: true, etapas: { orderBy: { ordem: 'asc' }, select: { ordem: true, templateBase: true } } },
    }),
    db.mvOptOut.findMany({ select: { telefoneKey: true } }),
    // Quem a Meta recusou numa onda anterior: provável que recuse de novo (131049 é limite por cliente).
    db.mvMensagem.findMany({
      where: { status: MENSAGEM_STATUS.ERRO, inscricao: { origem: ORIGEM_CAMPANHA } },
      select: { codigoErro: true, inscricao: { select: { telefoneKey: true } } },
    }),
  ])
  const semeada = new Map(cursores.map((c) => [c.chave, c.valor]))
  const cadPorGatilho = new Map(cadencias.map((c) => [c.gatilho, c]))
  const saiu = new Set(optOuts.map((o) => o.telefoneKey))
  const recusou = new Map(recusadas.map((r) => [r.inscricao.telefoneKey, r.codigoErro]))

  const ondas: OndaNaProjecao[] = []
  const itens: ItemPrevisto[] = []
  /** A audiência da onda anterior, real ou projetada. */
  const audiencia = new Map<string, Pessoa[]>()

  for (const onda of ONDAS) {
    const cad = cadPorGatilho.get(onda.gatilho) ?? null
    const etapa = cad?.etapas[0] ?? null
    const esqueleto = etapa?.templateBase ?? esqueletoNomeado(onda.template)
    const ordem = etapa?.ordem ?? 1
    const dia = diaSP(new Date(onda.abreEm))
    const quandoSemeou = semeada.get(cursorDaOnda(onda.id)) ?? null
    const texto = (p: Pessoa) => {
      try {
        return montarCopy(esqueleto, { primeiro_nome: p.nome }, `${p.chave}:${onda.id}:${ordem}`)
      } catch {
        return null
      }
    }

    const linha: OndaNaProjecao = {
      id: onda.id,
      nome: onda.nome,
      gatilho: onda.gatilho,
      template: onda.template,
      dia,
      abreEm: onda.abreEm,
      cadenciaId: cad?.id ?? null,
      cadenciaAtiva: !!cad?.ativo,
      semeadaEm: quandoSemeou,
      total: 0,
      semNome: 0,
      optOut: 0,
      impedimento: null,
      textoExemplo: texto({ chave: '00000000', e164: '', nome: 'Ana' }),
    }

    if (quandoSemeou) {
      const inscritas = await db.mvInscricao.findMany({
        where: { origem: ORIGEM_CAMPANHA, refExterna: { endsWith: `:${onda.id}` } },
        orderBy: { createdAt: 'asc' },
        select: { telefoneKey: true, telefoneE164: true, nomeSnapshot: true },
      })
      audiencia.set(onda.id, inscritas.map((i) => ({ chave: i.telefoneKey, e164: i.telefoneE164, nome: i.nomeSnapshot })))
      linha.total = inscritas.length
      ondas.push(linha)
      continue
    }

    if (!onda.seguirOnda) {
      linha.impedimento = 'A base desta onda vem da loja (Nuvemshop) e só é medida na manhã do dia.'
      ondas.push(linha)
      continue
    }

    if (dia < diaSP(new Date())) {
      linha.impedimento = 'O dia desta onda passou sem ela entrar na fila — verificar o log do tique.'
      ondas.push(linha)
      continue
    }

    const anteriores = audiencia.get(onda.seguirOnda) ?? []
    const alcancaveis: Pessoa[] = []
    for (const p of anteriores) {
      if (!p.nome) linha.semNome++
      else if (saiu.has(p.chave)) linha.optOut++
      else alcancaveis.push(p)
    }
    audiencia.set(onda.id, alcancaveis)
    linha.total = alcancaveis.length
    linha.impedimento = impedimentoDa(onda, cad, armada)
    ondas.push(linha)

    if ((opts.de && dia < opts.de) || (opts.ate && dia > opts.ate)) continue

    const abre = new Date(onda.abreEm).getTime()
    const inicioJanela = inicioDoDia(dia).getTime() + opts.janelaInicioMin * 60_000
    const fimJanela = inicioDoDia(dia).getTime() + opts.janelaFimMin * 60_000
    const comeco = Math.max(abre, inicioJanela)
    alcancaveis.forEach((p, i) => {
      const quando = new Date(comeco + i * opts.passoMinutos * 60_000)
      const codigo = recusou.get(p.chave)
      itens.push({
        id: `prev:${onda.id}:${p.chave}`,
        ondaId: onda.id,
        cadenciaId: cad?.id ?? null,
        cadenciaNome: cad?.nome ?? onda.nome,
        templateNome: onda.template,
        dia,
        quando: quando.toISOString(),
        hora: horaSP(quando),
        nome: p.nome!,
        telefone: mascararTelefone(p.e164),
        texto: texto(p),
        aviso: codigo ? `a Meta recusou uma mensagem anterior da campanha (${codigo}) — pode recusar de novo` : null,
        cabe: i < opts.tetoEfetivo && quando.getTime() < fimJanela,
      })
    })
  }

  return { ondas, itens }
}

function impedimentoDa(onda: Onda, cad: { ativo: boolean } | null, armada: boolean): string | null {
  if (!armada) return 'Campanha não armada (MV_CAMPANHA_1010) — a onda é medida mas ninguém entra na fila.'
  if (!cad) return `A cadência ${onda.nome} ainda não existe — é criada na primeira passada do tique.`
  if (!cad.ativo) return `A cadência ${onda.nome} está desligada — a onda não semeia.`
  return null
}
