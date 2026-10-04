/**
 * "DESLIGADA" NÃO É UM ESTADO — SÃO TRÊS, E ELES PEDEM COISAS DIFERENTES.
 *
 * Porta de `situacao.ts` da CarBoss. O banco só tem `ativo: boolean`, e com um
 * rótulo cinza só, desligada-por-decisão, desligada-por-esquecimento e
 * aposentada ficam idênticas — foi assim que quatro cadências ficaram mudas lá
 * sem ninguém notar.
 *
 * A situação é DERIVADA do que já existe: o seed (`cadencias-seed.ts`, que
 * carrega `ativo` e `porque`), o `templateNome` das etapas e o arquivamento da
 * coluna do CRM quando a cadência é de coluna (`funis-crm`). "Desligada de
 * propósito" exige uma linha escrita no seed.
 *
 * Diferença do destino: aqui o template mora na ETAPA (`templateNome`), não num
 * mapa à parte, então "ligada e muda" = nenhuma etapa com template.
 */

import { CADENCIAS } from './cadencias-seed'

export type EstadoDaCadencia =
  | 'ligada'
  | 'ligada_muda'
  | 'desligada_por_decisao'
  | 'desligada_sem_motivo'
  | 'aposentada'

export type SituacaoDaCadencia = {
  estado: EstadoDaCadencia
  resumo: string
  oQueFazer: string
  pedeAtencao: boolean
  /** Ordem de exibição: o que pede ação primeiro, o aposentado por último. */
  peso: number
}

function primeiraLinha(texto: string): string {
  const l = texto.split('\n').map((s) => s.trim()).filter(Boolean)[0] ?? ''
  return l.length > 220 ? `${l.slice(0, 217)}…` : l
}

export function situacaoDaCadencia(cadencia: {
  nome: string
  gatilho?: string
  ativo: boolean
  colunaArquivada: boolean
  inscricoes: number
  /** Quantas etapas têm `templateNome`. */
  etapasComTemplate: number
}): SituacaoDaCadencia {
  const { nome, gatilho, ativo, colunaArquivada, inscricoes, etapasComTemplate } = cadencia
  const noSeed = CADENCIAS.find((c) => c.nome === nome || (gatilho && c.gatilho === gatilho))

  if (colunaArquivada) {
    return {
      estado: 'aposentada',
      resumo: `A coluna desta cadência foi arquivada${inscricoes ? ` · ${inscricoes} cliente(s) no histórico` : ''}.`,
      oQueFazer: inscricoes
        ? 'Nada. Ela fica aqui porque o histórico dela ainda conta no relatório.'
        : 'Pode apagar: nenhuma cliente passou por ela.',
      pedeAtencao: false,
      peso: 90,
    }
  }

  // Sem template, nada sai com a janela de 24h fechada — e quase toda
  // mensagem da Máquina é de janela fechada.
  if (etapasComTemplate === 0) {
    if (ativo) {
      return {
        estado: 'ligada_muda',
        resumo: 'Ligada, mas nenhuma etapa tem template aprovado — nada sai com a janela de 24h fechada.',
        oQueFazer: 'Escolher o template de cada etapa ou desligar. Do jeito que está, ela só enche a fila.',
        pedeAtencao: true,
        peso: 1,
      }
    }
    return {
      estado: 'aposentada',
      resumo: `Sem template em nenhuma etapa: não abre conversa${inscricoes ? ` · ${inscricoes} cliente(s) no histórico` : ''}.`,
      oQueFazer: inscricoes ? 'Nada, o histórico dela ainda conta.' : 'Pode apagar.',
      pedeAtencao: false,
      peso: 91,
    }
  }

  if (ativo) {
    return {
      estado: 'ligada',
      resumo: 'Ligada. Quem dispara o gatilho entra na programação.',
      oQueFazer: '',
      pedeAtencao: false,
      peso: 10,
    }
  }

  if (noSeed && noSeed.ativo === false) {
    return {
      estado: 'desligada_por_decisao',
      resumo: primeiraLinha(noSeed.porque) || 'Desligada por decisão registrada no seed.',
      oQueFazer: 'Ligar é decisão de gente, na tela, olhando o teto diário.',
      pedeAtencao: false,
      peso: 50,
    }
  }

  return {
    estado: 'desligada_sem_motivo',
    resumo: noSeed
      ? 'Desligada, e o seed a declara LIGADA — alguém desligou sem deixar registro.'
      : 'Desligada, e não existe registro nenhum de por quê.',
    oQueFazer: 'Ligar, ou apagar. Enquanto ficar assim, o gatilho dela não inscreve ninguém e ninguém sabe se é de propósito.',
    pedeAtencao: true,
    peso: 2,
  }
}
