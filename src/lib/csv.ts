/**
 * LEITOR DE CSV — pequeno, e correto nas três coisas que quebram.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Não usei biblioteca porque as três armadilhas reais são pequenas e as
 * bibliotecas vêm com um custo de bundle que não se justifica para uma tela
 * que a pessoa abre uma vez por ano:
 *
 *  1. SEPARADOR. O Excel brasileiro salva com PONTO E VÍRGULA, porque a
 *     vírgula é o separador decimal aqui. Um leitor que assume vírgula lê a
 *     planilha inteira como uma coluna só e não dá erro nenhum — só mostra
 *     tudo errado.
 *  2. ASPAS. "Silva, Maria" é UM campo. Quebrar na vírgula de dentro das
 *     aspas embaralha todas as colunas seguintes daquela linha.
 *  3. BOM. Arquivo salvo pelo Excel começa com `﻿`, que gruda no nome da
 *     primeira coluna: o cabeçalho vira `﻿nome` e o mapeamento
 *     automático não encontra "nome".
 * ══════════════════════════════════════════════════════════════════════════
 */

/**
 * Adivinha o separador contando ocorrências FORA de aspas na primeira linha.
 *
 * Contar no arquivo todo erraria: um campo de endereço com vírgulas dentro de
 * aspas venceria a votação num arquivo separado por ponto e vírgula.
 */
export function detectarSeparador(texto: string): string {
  const primeiraLinha = texto.split(/\r?\n/)[0] ?? ''
  let dentroDeAspas = false
  const contagem: Record<string, number> = { ',': 0, ';': 0, '\t': 0 }
  for (const ch of primeiraLinha) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas
    else if (!dentroDeAspas && ch in contagem) contagem[ch]++
  }
  const vencedor = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0]
  return vencedor && vencedor[1] > 0 ? vencedor[0] : ','
}

/**
 * Quebra o texto em linhas de campos.
 *
 * Percorre caractere a caractere porque `split` não sabe de aspas. Aspas
 * duplas dentro de campo entre aspas (`""`) viram uma aspa literal, que é a
 * convenção do próprio Excel.
 */
export function lerCsv(texto: string, separador?: string): string[][] {
  const limpo = texto.replace(/^﻿/, '')
  const sep = separador ?? detectarSeparador(limpo)

  const linhas: string[][] = []
  let campo = ''
  let linha: string[] = []
  let dentroDeAspas = false

  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i]

    if (dentroDeAspas) {
      if (ch === '"') {
        if (limpo[i + 1] === '"') {
          campo += '"'
          i++
        } else dentroDeAspas = false
      } else campo += ch
      continue
    }

    if (ch === '"') dentroDeAspas = true
    else if (ch === sep) {
      linha.push(campo)
      campo = ''
    } else if (ch === '\n') {
      linha.push(campo)
      linhas.push(linha)
      linha = []
      campo = ''
    } else if (ch !== '\r') campo += ch
  }

  if (campo !== '' || linha.length) {
    linha.push(campo)
    linhas.push(linha)
  }

  // Linha totalmente vazia é ruído do fim do arquivo, não um registro.
  return linhas.filter((l) => l.some((c) => c.trim() !== ''))
}

/** Minúsculas, sem acento e sem pontuação — para casar cabeçalho com campo. */
export function chaveDeCabecalho(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}
