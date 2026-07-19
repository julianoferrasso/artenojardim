'use client'

import type { ReactNode } from 'react'
import { AuthProvider } from '@/lib/auth'

/**
 * Providers client no topo da loja. A maior parte da loja é Server Component;
 * o AuthProvider só faz efeito nas ilhas que usam useAuth (header, conta, e o
 * carrinho na Fase 1.8). Não força a árvore inteira a virar client.
 */
export const Providers = ({ children }: { children: ReactNode }) => {
  return <AuthProvider>{children}</AuthProvider>
}
