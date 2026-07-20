'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { CartProvider } from '@/lib/cart'
import { FavoritesProvider } from '@/lib/favorites'
import { MiniCart } from '@/components/mini-cart'
import { ApiError } from '@/lib/api'

/**
 * Providers client no topo da loja. A maior parte da loja é Server Component;
 * estes contextos só fazem efeito nas ilhas que usam useAuth/useCart/useQuery
 * (header, conta, carrinho). Não forçam a árvore inteira a virar client.
 *
 * CartProvider DENTRO de AuthProvider: o carrinho reage ao login (merge do
 * anônimo) via useAuth. A ordem importa.
 *
 * QueryClientProvider POR FORA de tudo: o logout precisa limpar o cache, e para
 * isso o AuthProvider tem que enxergar o client.
 */
export const Providers = ({ children }: { children: ReactNode }) => {
  // Em useState e não em escopo de módulo: no servidor, um client de módulo
  // seria compartilhado entre requisições de clientes diferentes — e o pedido
  // de um apareceria na tela do outro.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 1 minuto: o cliente não opera o pedido, dado levemente velho não
            // atrapalha ninguém — e evita refetch a cada volta de aba.
            staleTime: 60_000,
            // Nada de insistir em 4xx: um 404 de pedido inexistente ou um 401
            // não melhoram na terceira tentativa, só demoram três vezes mais
            // para mostrar a mensagem.
            retry: (failureCount, error) =>
              error instanceof ApiError && error.status < 500 ? false : failureCount < 2,
          },
          mutations: { retry: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CartProvider>
          {/* Favoritos: localStorage puro, sem dependência de auth nem carrinho. */}
          <FavoritesProvider>
            {children}
            {/* Uma instância só, no topo: retorna null enquanto fechado. */}
            <MiniCart />
          </FavoritesProvider>
        </CartProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
