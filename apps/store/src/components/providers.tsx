'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth'
import { CartProvider } from '@/lib/cart'

/**
 * Providers client no topo da loja. A maior parte da loja é Server Component;
 * estes contextos só fazem efeito nas ilhas que usam useAuth/useCart (header,
 * conta, carrinho). Não forçam a árvore inteira a virar client.
 *
 * CartProvider DENTRO de AuthProvider: o carrinho reage ao login (merge do
 * anônimo) via useAuth. A ordem importa.
 */
export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <AuthProvider>
      <CartProvider>{children}</CartProvider>
    </AuthProvider>
  )
}
