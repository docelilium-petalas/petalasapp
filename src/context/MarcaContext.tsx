'use client'

import React, { createContext, useContext } from 'react'
import { MARCA_PADRAO, type Marca } from '@/lib/marca'

/**
 * A marca, lida UMA vez no servidor e distribuída por contexto.
 *
 * Podia ser um `fetch` dentro da barra lateral, e seria pior: a barra aparece
 * em toda página, então cada navegação faria uma consulta ao banco para
 * descobrir um nome que muda uma vez por ano — e, pior, a barra piscaria com
 * o nome padrão antes de trocar pelo verdadeiro.
 *
 * Lido no layout raiz, ele já chega no primeiro HTML.
 */
const Contexto = createContext<Marca>(MARCA_PADRAO)

export function MarcaProvider({ marca, children }: { marca: Marca; children: React.ReactNode }) {
  return <Contexto.Provider value={marca}>{children}</Contexto.Provider>
}

export function useMarca(): Marca {
  return useContext(Contexto)
}
