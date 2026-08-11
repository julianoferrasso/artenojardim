'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * Carrega o logo da loja até um Client Component que não pode buscá-lo sozinho.
 *
 * Existe por causa de /entrar: a tela tem estado (aba login/cadastro), então é
 * client, e Client Component não faz `await getStore()`. O layout da rota — que
 * é server — busca e injeta aqui.
 *
 * Contexto e não prop porque `layout.tsx` só consegue passar `children`, e não
 * props, para a página do App Router.
 */

const BrandLogoContext = createContext<string | null>(null)

export const BrandLogoProvider = ({
  logoUrl,
  children,
}: {
  logoUrl: string | null
  children: ReactNode
}) => <BrandLogoContext.Provider value={logoUrl}>{children}</BrandLogoContext.Provider>

/** `null` = sem logo configurado; o StoreLogo cai no arquivo de fallback. */
export const useBrandLogo = (): string | null => useContext(BrandLogoContext)
