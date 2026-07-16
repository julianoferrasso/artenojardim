'use client'

import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/lib/auth'
import { ApiError } from '@/lib/api'

export const Providers = ({ children }: { children: ReactNode }) => {
  // useState e não módulo: um QueryClient no escopo do módulo é compartilhado
  // entre requisições no servidor, e um usuário veria o cache do outro.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Baixo de propósito: o admin opera pedido real e precisa de dado
            // fresco. É o oposto da loja, onde catálogo velho por 60s não dói.
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // 4xx é erro do cliente: repetir dá o mesmo resultado e só
              // consome a cota do rate limit.
              if (error instanceof ApiError && error.status < 500) return false
              return failureCount < 2
            },
            refetchOnWindowFocus: true,
          },
          mutations: { retry: false },
        },
      }),
  )

  return (
    <QueryClientProvider client={client}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  )
}
