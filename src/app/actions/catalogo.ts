'use server'

import { cookies } from 'next/headers'
import { verifyToken } from '@/lib/auth'
import { catalogoDaLoja, type ProdutoCatalogo } from '@/lib/nuvemshop/catalogo'

async function exigirAuth() {
  const store = await cookies()
  const token = store.get('ocr_auth_token')?.value
  if (!token) throw new Error('Não autorizado.')
  return verifyToken(token)
}

export type EstadoCatalogo = { ok: true; produtos: ProdutoCatalogo[]; lidoEm: string } | { ok: false; erro: string }

/** O mesmo catálogo que a IA consulta — a tela mostra exatamente o que ela oferece. */
export async function getCatalogo(forcar = false): Promise<EstadoCatalogo> {
  await exigirAuth()
  try {
    return { ok: true, produtos: await catalogoDaLoja(forcar), lidoEm: new Date().toISOString() }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
}
