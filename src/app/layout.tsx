import type { Metadata } from 'next'
import { Montserrat } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'

const montserrat = Montserrat({
  variable: '--font-montserrat',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'Pétalas App',
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
      className={`${montserrat.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sans font-light">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
