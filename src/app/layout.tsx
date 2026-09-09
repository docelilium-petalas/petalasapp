import type { Metadata } from 'next'
import { DM_Sans, Fraunces } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${dmSans.variable} ${fraunces.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
