'use server'

/**
 * RESULTADOS — uma linha por CLIENTE. Porte de `actions/resultados.ts` da CarBoss.
 *
 * A Máquina responde "o que vai acontecer e o que está travado". Resultados
 * responde "o que aconteceu com quem a gente abordou".
 *
 * ⚠️ TUDO numa ação só, de propósito. O Next despacha server actions UMA POR
 *    VEZ por cliente: três chamadas da tela viram três idas e voltas em fila.
 *    O paralelismo mora aqui dentro (`Promise.all`).
 *
 * Tradução para a Doce Lilium:
 *   • o desfecho que conta é PEDIDO (lá era reunião → venda);
 *   • "coluna do funil" vira a ORIGEM da inscrição (carrinho, pedido, drop…);
 *   • telefone sai mascarado, como na Máquina;
 *   • a `getResultados(dias)` antiga continua existindo em `maquina-vendas.ts`
 *     para não quebrar nada que a chame.
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { janelaAtribuicaoDias } from '@/lib/maquina-vendas/respostas'
import { medirDesempenhoPorToque, type DesempenhoPorToque } from '@/lib/maquina-vendas/desempenho-toque'
import { mascararTelefone } from '@/lib/maquina-vendas/programacao'
import {
  ACAO_DO_BALDE,
  BALDES_DE_SUCESSO,
  BALDES_FORA_DA_CONTA,
  GRUPO_DO_BALDE,
  ORDEM_DOS_BALDES,
  ROTULO_DO_BALDE,
  TOM_DO_BALDE,
  baldeDaInscricao,
  type Balde,
  type GrupoDeBalde,
  type TomDoBalde,
} from '@/lib/maquina-vendas/resultado'

async function exigirAdmin() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  const auth = await verifyToken(token)
  const roles = await prisma.userRole.findMany({ where: { userId: auth.userId }, select: { role: true } })
  if (!roles.some((r) => r.role === 'ADMIN')) {
    throw new Error('O relatório de Resultados é só para administradoras.')
  }
  return auth
}

/** `true` quando o erro é "a tabela não existe" — Postgres 42P01. */
function tabelaAusente(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('42P01') || msg.includes('does not exist')
}

const ROTULO_DA_ORIGEM: Record<string, string> = {
  carrinho: 'Carrinho',
  pedido: 'Pedido',
  pedido_pago: 'Pedido pago',
  pedido_enviado: 'Rastreio',
  reativacao: 'Reativação',
  colecao_nova: 'Coleção nova',
  lista_desejos: 'Voltou ao estoque',
  campanha_1010: 'Drop 10.10',
  funil: 'Funil',
  pipeline: 'Funil',
}

export type FiltrosResultados = {
  /** Início do período, ISO. Recorta por quando a PRIMEIRA mensagem saiu. */
  de?: string
  ate?: string
  cadenciaId?: string
  busca?: string
  /** Balde selecionado. Fica FORA do recorte dos cartões — ver abaixo. */
  balde?: string
}

export type LinhaDoRelatorio = {
  id: string
  nome: string
  telefone: string
  cadencia: string
  cadenciaId: string
  origem: string
  enviadas: number
  respostas: number
  primeiroToque: string
  ultimoToque: string | null
  respondeuEm: string | null
  equipeFalouEm: string | null
  pedidoEm: string | null
  valor: number | null
  resultadoManual: string | null
  balde: Balde
  rotuloBalde: string
  tom: TomDoBalde
  /** A janela desta cliente ainda pode render pedido? */
  janelaAberta: boolean
  janelaFechaEm: string
}

export type CartaoDeBalde = {
  id: Balde
  rotulo: string
  acao: string
  tom: TomDoBalde
  grupo: GrupoDeBalde
  valor: number
}

export type RelatorioDeResultados = {
  migrado: boolean
  consultadoEm: string
  periodo: { de: string; ate: string }
  janelaDias: number
  total: number
  janelaAberta: number
  alcancadas: number
  sucessos: number
  taxaSucesso: number
  receita: number
  baldes: CartaoDeBalde[]
  cadencias: { id: string; nome: string }[]
  linhas: LinhaDoRelatorio[]
  desempenhoPorToque: DesempenhoPorToque | null
}

/**
 * O relatório inteiro numa consulta.
 *
 * ── As duas datas que parecem a mesma e não são ────────────────────────────
 * O PERÍODO decide QUEM entra: inscrições cuja primeira mensagem saiu no
 * intervalo. A JANELA DE ATRIBUIÇÃO decide se o pedido daquela cliente CONTA:
 * N dias depois do último toque. Elas não terminam juntas — a mesma consulta,
 * rodada semana que vem, pode mostrar MAIS pedidos para o MESMO período. É
 * correto, e parece defeito; por isso `janelaAberta` sai daqui e a tela diz.
 */
export async function getRelatorioDeResultados(filtros: FiltrosResultados = {}): Promise<RelatorioDeResultados> {
  await exigirAdmin()
  const consultadoEm = new Date()
  const dias = janelaAtribuicaoDias()
  const de = filtros.de ? new Date(filtros.de) : new Date(consultadoEm.getTime() - 30 * 24 * 3600_000)
  const ate = filtros.ate ? new Date(filtros.ate) : consultadoEm

  const vazio: RelatorioDeResultados = {
    migrado: false,
    consultadoEm: consultadoEm.toISOString(),
    periodo: { de: de.toISOString(), ate: ate.toISOString() },
    janelaDias: dias,
    total: 0, janelaAberta: 0, alcancadas: 0, sucessos: 0, taxaSucesso: 0, receita: 0,
    baldes: [], cadencias: [], linhas: [], desempenhoPorToque: null,
  }

  const where: Record<string, unknown> = {
    // Recorte pela PRIMEIRA MENSAGEM ENVIADA, não pelo `createdAt`: quem foi
    // inscrita em julho e só recebeu ontem pertence ao relatório de ontem.
    // Inscrição sem envio entra pelo `createdAt`, senão "aguardando o
    // primeiro envio" nunca apareceria em relatório nenhum.
    OR: [
      { mensagens: { some: { status: 'ENVIADA', enviadaEm: { gte: de, lte: ate } } } },
      { tentativas: 0, createdAt: { gte: de, lte: ate } },
    ],
  }
  if (filtros.cadenciaId) where.cadenciaId = filtros.cadenciaId
  if (filtros.busca?.trim()) {
    const b = filtros.busca.trim()
    const digitos = b.replace(/\D/g, '')
    where.AND = [{
      OR: [
        { nomeSnapshot: { contains: b, mode: 'insensitive' } },
        ...(digitos ? [{ telefoneE164: { contains: digitos } }] : []),
      ],
    }]
  }

  try {
    const [desempenhoPorToque, inscricoes, cadencias] = await Promise.all([
      // Mesmo `de`/`ate` da tabela: recortes diferentes mostrariam duas taxas
      // de resposta na mesma tela.
      medirDesempenhoPorToque({ desde: de, ate, cadenciaId: filtros.cadenciaId }),
      prisma.mvInscricao.findMany({
        where,
        select: {
          id: true, nomeSnapshot: true, telefoneE164: true, status: true, origem: true,
          tentativas: true, respondeuEm: true, respostas: true, humanoFalouEm: true,
          converteuEm: true, valorConvertido: true, resultadoManual: true, createdAt: true,
          cadencia: { select: { id: true, nome: true } },
          mensagens: { where: { status: 'ENVIADA' }, select: { enviadaEm: true }, orderBy: { enviadaEm: 'desc' } },
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,
      }),
      prisma.mvCadencia.findMany({ select: { id: true, nome: true }, orderBy: { nome: 'asc' } }),
    ])

    const linhas: LinhaDoRelatorio[] = inscricoes.map((i) => {
      const ultimoToque = i.mensagens[0]?.enviadaEm ?? null
      const fechaEm = new Date((ultimoToque ?? i.createdAt).getTime() + dias * 24 * 3600_000)
      const balde = baldeDaInscricao(i)
      return {
        id: i.id,
        nome: i.nomeSnapshot,
        telefone: mascararTelefone(i.telefoneE164),
        cadencia: i.cadencia.nome,
        cadenciaId: i.cadencia.id,
        origem: ROTULO_DA_ORIGEM[i.origem] ?? i.origem.replace(/_/g, ' '),
        enviadas: i.tentativas,
        respostas: i.respostas,
        primeiroToque: (i.mensagens[i.mensagens.length - 1]?.enviadaEm ?? i.createdAt).toISOString(),
        ultimoToque: ultimoToque?.toISOString() ?? null,
        respondeuEm: i.respondeuEm?.toISOString() ?? null,
        equipeFalouEm: i.humanoFalouEm?.toISOString() ?? null,
        pedidoEm: i.converteuEm?.toISOString() ?? null,
        valor: i.valorConvertido ? Number(i.valorConvertido) : null,
        resultadoManual: i.resultadoManual,
        balde,
        rotuloBalde: ROTULO_DO_BALDE[balde],
        tom: TOM_DO_BALDE[balde],
        janelaAberta: fechaEm > consultadoEm,
        janelaFechaEm: fechaEm.toISOString(),
      }
    })

    // ⚠️ Os cartões contam SEM o balde selecionado: com ele dentro, escolher
    // um balde zeraria todos os outros e a operadora perderia a noção do todo
    // exatamente quando está investigando uma parte dele.
    const porBalde = new Map<Balde, number>()
    for (const l of linhas) porBalde.set(l.balde, (porBalde.get(l.balde) ?? 0) + 1)
    const visiveis = filtros.balde ? linhas.filter((l) => l.balde === filtros.balde) : linhas
    const naConta = linhas.filter((l) => !BALDES_FORA_DA_CONTA.includes(l.balde))
    const sucesso = linhas.filter((l) => BALDES_DE_SUCESSO.includes(l.balde))

    return {
      migrado: true,
      consultadoEm: consultadoEm.toISOString(),
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      janelaDias: dias,
      total: linhas.length,
      janelaAberta: linhas.filter((l) => l.janelaAberta).length,
      alcancadas: naConta.length,
      sucessos: sucesso.length,
      // Sobre quem foi alcançada de verdade — o total inflaria o denominador.
      taxaSucesso: naConta.length ? Math.round((sucesso.length / naConta.length) * 1000) / 10 : 0,
      receita: sucesso.reduce((s, l) => s + (l.valor ?? 0), 0),
      baldes: ORDEM_DOS_BALDES.map((b) => ({
        id: b,
        rotulo: ROTULO_DO_BALDE[b],
        acao: ACAO_DO_BALDE[b],
        tom: TOM_DO_BALDE[b],
        grupo: GRUPO_DO_BALDE[b],
        valor: porBalde.get(b) ?? 0,
      })),
      cadencias,
      linhas: visiveis,
      desempenhoPorToque,
    }
  } catch (e) {
    if (tabelaAusente(e)) return vazio
    throw e
  }
}

/**
 * Marcação manual, com desfazer. A heurística erra e quem abriu a conversa
 * sabe mais. Não apaga nada e não mexe na cadência: só muda o balde.
 * Desfazer é passar `null` — e limpa os três campos, senão a linha guarda um
 * "quem" de uma marcação que não existe mais.
 */
export async function marcarResultado(inscricaoId: string, marca: 'CONTATO_ERRADO' | 'DESCONSIDERAR' | null) {
  const auth = await exigirAdmin()
  await prisma.mvInscricao.update({
    where: { id: inscricaoId },
    data: {
      resultadoManual: marca,
      resultadoManualEm: marca ? new Date() : null,
      resultadoManualPor: marca ? auth.userId : null,
    },
  })
  revalidatePath('/resultados')
}
