import type { Metadata } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { AppToaster } from '@/components/ui/AppToaster'
import { MarcaProvider } from '@/context/MarcaContext'
import { obterMarca } from '@/app/actions/marca'
import { ConfirmHost } from '@/components/ui/ConfirmSheet'

/**
 * Duas famílias, com papéis separados — ver o bloco de tipografia em
 * globals.css para o porquê de cada uma.
 *
 * A Montserrat saiu porque era geométrica e larga: pesada no título e, com o
 * corpo em peso 300, apagada no texto miúdo, que é onde um CRM vive.
 */
const dmSans = DM_Sans({
  variable: '--font-dm-sans',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
})

/**
 * Só título. Serifa de eixo suave — a voz editorial da marca.
 *
 * Sem `weight`: é fonte variável, e declarar `axes` junto com uma lista de
 * pesos é erro de build. Sem a lista, o eixo `wght` vem inteiro, e o `opsz`
 * é o que faz a letra engrossar sozinha nos tamanhos pequenos.
 */
const fraunces = Fraunces({
  variable: '--font-fraunces',
  subsets: ['latin', 'latin-ext'],
  axes: ['SOFT', 'WONK', 'opsz'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Pétalas · Doce Lilium',
  description: 'CRM Operacional e Gestão de Leads',
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // Lida aqui, no servidor, para chegar no primeiro HTML: a barra lateral
  // aparece em toda página, e buscá-la no cliente faria o nome padrão piscar
  // antes de virar o verdadeiro.
  const marca = await obterMarca()
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      {/*
        Os dois hosts globais moram AQUI, e não em cada página.

        Era esse o defeito: o `ConfirmHost` não estava montado em lugar nenhum,
        e `confirmar()` nega por omissão quando não acha o host — então toda
        confirmação desenhada resolveria "não" em silêncio, e a ação do usuário
        simplesmente não aconteceria. O `AppToaster` estava montado em 3 das 20
        páginas, o que fazia o aviso de sucesso aparecer em umas e sumir em
        outras.

        Um host que cada página precisa lembrar de montar é um host que metade
        das páginas esquece.
      */}
      <body className="min-h-full flex flex-col font-sans">
        <MarcaProvider marca={marca}>
          <AuthProvider>{children}</AuthProvider>
        </MarcaProvider>
        <AppToaster />
        <ConfirmHost />
      </body>
    </html>
  )
}
