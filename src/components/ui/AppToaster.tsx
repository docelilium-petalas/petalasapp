'use client'

import { Toaster } from 'sonner'
import { useIsMobile } from '@/hooks/useIsMobile'

/**
 * Toaster único do app.
 *
 * ⚠️ Existe porque as 10 páginas montavam `<Toaster position="top-right" />` na
 * mão. No desktop tudo bem; num aparelho de 360px "top-right" ocupa a largura
 * inteira e cobre o header — o título da página e o botão de busca sumiam atrás
 * do toast, justamente enquanto o usuário quer conferir o que acabou de fazer.
 *
 * No mobile o toast vai para baixo, acima da tab bar: fica no polegar (onde o
 * botão "Desfazer" precisa estar) e não tampa nada do topo.
 */
export function AppToaster() {
  const isMobile = useIsMobile()

  return (
    <Toaster
      theme="dark"
      richColors
      closeButton={!isMobile}
      position={isMobile ? 'bottom-center' : 'top-right'}
      // Acima da tab bar (4rem) + home indicator. No desktop, respiro do header.
      offset={isMobile ? 'calc(5rem + env(safe-area-inset-bottom, 0px))' : '1rem'}
      toastOptions={{ className: 'select-text' }}
    />
  )
}
