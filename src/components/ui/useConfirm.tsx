'use client'

import React, { useCallback } from 'react'
import { confirmar } from './ConfirmSheet'

interface ConfirmOptions {
  title: string
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

/**
 * Adaptador do `useConfirm` antigo sobre o `<ConfirmHost />` global.
 *
 * ⚠️ Este hook já renderizava um diálogo próprio (`ConfirmDialog`), e mesmo assim o
 * app tinha DOIS sistemas de confirmação: este, adotado só por `/settings`, e 20
 * `window.confirm()` nativos em todo o resto. O que travava a adoção era a
 * ergonomia — cada página precisava lembrar de renderizar `{confirmDialog}` no
 * JSX, e quem esquecia via a Promise pendurar para sempre, sem erro visível.
 *
 * Agora o host é único e vive no `AppLayout`, então `confirmDialog` não precisa
 * mais ser renderizado. Ele continua exportado (como `null`) para que as chamadas
 * existentes em `/settings` sigam funcionando sem edição, e para que o diálogo
 * ganhe de graça o tratamento de bottom sheet no mobile.
 *
 * Em código novo, prefira `confirmar()` direto — não precisa de hook.
 */
export function useConfirm() {
  const confirm = useCallback((options: ConfirmOptions) => {
    return confirmar({
      titulo: options.title,
      // `description` aceitava `ReactNode`; o sheet recebe texto. Nó não-string
      // vira `undefined` em vez de imprimir "[object Object]" na tela.
      descricao: typeof options.description === 'string' ? options.description : undefined,
      confirmar: options.confirmLabel,
      cancelar: options.cancelLabel,
      destrutivo: options.destructive ?? false,
    })
  }, [])

  return { confirm, confirmDialog: null }
}

export default useConfirm
