/**
 * O CONTRATO DA IMPORTAÇÃO — campos e formatos, fora do arquivo de ações.
 *
 * ⚠️ Isto NÃO pode morar em `app/actions/importar.ts`. Num módulo `'use server'`
 * todo export vira uma referência de server action, inclusive constante: a tela
 * recebia uma função no lugar do array e o build quebrava com
 * `CAMPOS_IMPORTAVEIS.filter is not a function`, só na hora de prerenderizar
 * `/contacts` — longe da causa.
 *
 * Num módulo comum, servidor e tela leem exatamente a mesma definição.
 */

export const CAMPOS_IMPORTAVEIS = [
  { chave: 'nome', rotulo: 'Nome', obrigatorio: true },
  { chave: 'sobrenome', rotulo: 'Sobrenome', obrigatorio: false },
  { chave: 'telefone', rotulo: 'Telefone', obrigatorio: true },
  { chave: 'email', rotulo: 'E-mail', obrigatorio: false },
  { chave: 'cidade', rotulo: 'Cidade', obrigatorio: false },
  { chave: 'estado', rotulo: 'Estado', obrigatorio: false },
  { chave: 'documento', rotulo: 'CPF/CNPJ', obrigatorio: false },
  { chave: 'origem', rotulo: 'Origem', obrigatorio: false },
] as const

export type CampoImportavel = (typeof CAMPOS_IMPORTAVEIS)[number]['chave']

export type LinhaImportada = Partial<Record<CampoImportavel, string>>

export type Veredito = {
  /** Número da linha na planilha, contando o cabeçalho. É o que a pessoa vê no Excel. */
  linha: number
  acao: 'criar' | 'atualizar' | 'ignorar'
  motivo?: string
  nome?: string
  telefone?: string
  contatoId?: string
  /** Os campos que a atualização preencheria — vazios não sobrescrevem. */
  camposAtualizados?: string[]
}

export type Relatorio = {
  criar: number
  atualizar: number
  ignorar: number
  vereditos: Veredito[]
}

/** O que o julgamento precisa saber de um contato que já existe. */
export type ContatoExistente = {
  id: string
  telefone: string
  email: string | null
  cidade: string | null
  estado: string | null
  documento: string | null
  sobrenome: string | null
}

function limpar(v?: string): string {
  return (v ?? '').trim()
}

/**
 * O DESTINO DE CADA LINHA — função pura, e é de propósito.
 *
 * Toda a decisão da importação mora aqui: o que entra, o que completa, o que
 * fica de fora e por quê. Sem banco e sem sessão, então dá para exercitar as
 * regras contra dezenas de planilhas esquisitas sem escrever nada em lugar
 * nenhum. O arquivo de ações só busca os contatos, chama isto, e grava.
 *
 * A ordem das recusas é a ordem em que elas ajudam quem vai consertar a
 * planilha: primeiro o que falta, depois o que está inválido, por último o
 * que é repetido.
 */
export function julgar(
  linhas: LinhaImportada[],
  existentes: ContatoExistente[],
  chaveDe: (telefone: string) => string,
): Relatorio {
  const porChave = new Map<string, ContatoExistente>()
  for (const c of existentes) {
    const k = chaveDe(c.telefone)
    if (k && !porChave.has(k)) porChave.set(k, c)
  }

  const vistasNoArquivo = new Map<string, number>()
  const vereditos: Veredito[] = []

  linhas.forEach((l, i) => {
    // +2: a linha 1 é o cabeçalho, e o Excel conta a partir de 1.
    const linha = i + 2
    const nome = limpar(l.nome)
    const telefoneCru = limpar(l.telefone)

    if (!nome && !telefoneCru) {
      vereditos.push({ linha, acao: 'ignorar', motivo: 'linha vazia' })
      return
    }
    if (nome.length < 2) {
      vereditos.push({ linha, acao: 'ignorar', motivo: 'sem nome (ou com uma letra só)', telefone: telefoneCru })
      return
    }

    const chave = chaveDe(telefoneCru)
    if (!chave) {
      vereditos.push({ linha, acao: 'ignorar', motivo: 'telefone inválido', nome, telefone: telefoneCru })
      return
    }

    const jaVista = vistasNoArquivo.get(chave)
    if (jaVista) {
      vereditos.push({ linha, acao: 'ignorar', motivo: `mesmo telefone da linha ${jaVista}`, nome, telefone: telefoneCru })
      return
    }
    vistasNoArquivo.set(chave, linha)

    const existente = porChave.get(chave)
    if (!existente) {
      vereditos.push({ linha, acao: 'criar', nome, telefone: telefoneCru })
      return
    }

    // Atualizar só preenche BURACO. Uma planilha com a coluna de e-mail vazia
    // não pode apagar o e-mail que alguém já cadastrou na mão.
    const campos: string[] = []
    if (!existente.email && limpar(l.email)) campos.push('e-mail')
    if (!existente.cidade && limpar(l.cidade)) campos.push('cidade')
    if (!existente.estado && limpar(l.estado)) campos.push('estado')
    if (!existente.documento && limpar(l.documento)) campos.push('documento')
    if (!existente.sobrenome && limpar(l.sobrenome)) campos.push('sobrenome')

    if (campos.length === 0) {
      vereditos.push({ linha, acao: 'ignorar', motivo: 'já existe, e nada de novo a acrescentar', nome, telefone: telefoneCru, contatoId: existente.id })
      return
    }
    vereditos.push({ linha, acao: 'atualizar', nome, telefone: telefoneCru, contatoId: existente.id, camposAtualizados: campos })
  })

  return {
    criar: vereditos.filter((v) => v.acao === 'criar').length,
    atualizar: vereditos.filter((v) => v.acao === 'atualizar').length,
    ignorar: vereditos.filter((v) => v.acao === 'ignorar').length,
    vereditos,
  }
}
