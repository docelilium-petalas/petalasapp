/**
 * O CONTRATO DA MARCA — tipo, padrão e a validação da logo.
 *
 * Módulo comum, e não dentro de `actions/marca.ts`: num arquivo `'use server'`
 * todo export vira referência de server action, inclusive constante. Já custou
 * um build uma vez (`CAMPOS_IMPORTAVEIS.filter is not a function`), e a lição
 * está aqui para não custar de novo.
 */

export type Marca = {
  nome: string
  subtitulo: string
  logoDataUri: string | null
  assinatura: string
}

/**
 * O que aparece quando ninguém configurou nada.
 *
 * São os valores que estavam cravados no código antes de a marca virar dado —
 * então um banco vazio produz exatamente a tela de sempre.
 */
export const MARCA_PADRAO: Marca = {
  nome: 'Doce Lilium',
  subtitulo: 'Operação CRM',
  logoDataUri: null,
  assinatura: 'Doce Lilium',
}

/** Caminho da logo de fábrica, usada quando não há upload. */
export const LOGO_PADRAO = '/logo.png'

/**
 * Teto do data URI da logo, em caracteres de base64.
 *
 * 400 KB de texto ≈ 300 KB de imagem. O limite existe porque esta string viaja
 * no HTML de TODA página: uma logo de 4 MB não deixa o app lento só na tela de
 * ajustes — deixa lento em todas, para todo mundo, para sempre.
 */
export const LIMITE_LOGO = 400_000

const TIPOS_ACEITOS = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

/** Devolve a mensagem de erro, ou `null` quando a logo serve. */
export function validarLogo(dataUri: string | null | undefined): string | null {
  if (!dataUri) return null

  const cabecalho = dataUri.slice(0, 60)
  if (!cabecalho.startsWith('data:')) {
    return 'A logo precisa ser um arquivo de imagem enviado pela tela.'
  }
  const tipo = cabecalho.slice(5, cabecalho.indexOf(';'))
  if (!TIPOS_ACEITOS.includes(tipo)) {
    return `Formato ${tipo || 'desconhecido'} não serve. Use PNG, JPG, WEBP ou SVG.`
  }
  if (dataUri.length > LIMITE_LOGO) {
    const kb = Math.round((dataUri.length * 0.75) / 1024)
    return `A imagem tem cerca de ${kb} KB. O limite é 300 KB — ela viaja em toda página do sistema.`
  }
  return null
}
