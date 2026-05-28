import type { Metadata } from 'next'
import { Montserrat, Great_Vibes } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
})

const signature = Great_Vibes({
  weight: '400',
  variable: '--font-signature',
  subsets: ['latin'],
})

export const metadata: Metadata = {
  title: 'Doce Lilium Closet | Alma Feminina',
  description: 'A identidade visual da Doce Lílium Closet transmite delicadeza, feminilidade e elegância.',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${montserrat.variable} ${signature.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
