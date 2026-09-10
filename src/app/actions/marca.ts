'use server'

/**
 * A MARCA — ler e gravar.
 *
 * ══════════════════════════════════════════════════════════════════════════
 * Ler NUNCA falha. A barra lateral e a tela de login chamam isto no primeiro
 * render; se a tabela ainda não existe no banco daquele ambiente, ou o banco
 * está fora, o certo é a tela aparecer com o padrão — e não a aplicação
 * inteira quebrar porque o nome da loja não pôde ser buscado.
 *
 * Gravar, ao contrário, é rigoroso: recusa e diz por quê.
 * ══════════════════════════════════════════════════════════════════════════
 */

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import prisma from '@/lib/prisma'
import { verifyToken } from '@/lib/auth'
import { MARCA_PADRAO, validarLogo, type Marca } from '@/lib/marca'

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

/** A marca configurada, ou o padrão. Nunca lança. */
export async function obterMarca(): Promise<Marca> {
  try {
    const linha = await prisma.marca.findUnique({ where: { id: 'unica' } })
    if (!linha) return MARCA_PADRAO
    return {
      nome: linha.nome,
      subtitulo: linha.subtitulo,
      logoDataUri: linha.logoDataUri,
      assinatura: linha.assinatura,
    }
  } catch {
    // Tabela ainda não migrada, ou banco fora. A tela abre com o padrão.
    return MARCA_PADRAO
  }
}

export async function salvarMarca(dados: Marca): Promise<{ ok: boolean; erros?: string[] }> {
  const auth = await exigirAuth()

  const erros: string[] = []
  const nome = dados.nome.trim()
  const subtitulo = dados.subtitulo.trim()
  const assinatura = dados.assinatura.trim()

  if (nome.length < 2) erros.push('O nome da marca precisa ter pelo menos 2 letras.')
  if (nome.length > 40) erros.push('O nome da marca passa de 40 caracteres e vai ser cortado na barra lateral.')
  if (subtitulo.length > 40) erros.push('A linha de apoio passa de 40 caracteres.')
  // 60 é o limite da Meta para o rodapé de template. Deixar passar aqui faria
  // a submissão ser recusada lá na frente, com uma mensagem em inglês.
  if (assinatura.length > 60) erros.push('A assinatura passa de 60 caracteres, que é o limite da Meta para o rodapé.')

  const erroLogo = validarLogo(dados.logoDataUri)
  if (erroLogo) erros.push(erroLogo)

  if (erros.length) return { ok: false, erros }

  try {
    await prisma.marca.upsert({
      where: { id: 'unica' },
      create: { id: 'unica', nome, subtitulo, assinatura, logoDataUri: dados.logoDataUri || null, atualizadoPor: auth.email },
      update: { nome, subtitulo, assinatura, logoDataUri: dados.logoDataUri || null, atualizadoPor: auth.email },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('42P01') || msg.includes('does not exist')) {
      return { ok: false, erros: ['A tabela da marca ainda não foi criada no banco deste ambiente.'] }
    }
    throw e
  }

  // A marca aparece na barra lateral de TODA página, então tudo precisa ser
  // revalidado — não só a tela de ajustes.
  revalidatePath('/', 'layout')
  return { ok: true }
}
