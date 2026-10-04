'use client'

/**
 * O dossiê de uma cliente dentro da Máquina de Vendas.
 *
 * ⚠️ Nesta versão do Next, `params` é uma Promise — inclusive em Client
 *    Component, onde se abre com o `use()` do React. Ler `params.inscricaoId`
 *    direto compila e devolve `undefined` em runtime.
 *
 * A página é fina de propósito: quem desenha é `DossieContato`, quem monta o
 * dado é a server action.
 */

import { use } from 'react'
import { AppLayout } from '@/components/AppLayout'
import { DossieContato } from '@/components/maquina-vendas/DossieContato'

export default function DossieDaClientePage({ params }: { params: Promise<{ inscricaoId: string }> }) {
  const { inscricaoId } = use(params)
  return (
    <AppLayout>
      <div className="flex flex-col h-full bg-background text-foreground overflow-y-auto scrollbar-thin">
        <DossieContato inscricaoId={inscricaoId} />
      </div>
    </AppLayout>
  )
}
