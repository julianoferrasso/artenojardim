import { getStore } from '@/lib/catalog'
import { BrandLogoProvider } from '@/components/brand-logo-provider'

/**
 * A tela de login é Client Component (tem estado de aba login/cadastro), então
 * não pode chamar `getStore()`. Este layout — que é server — busca o logo e o
 * entrega por contexto.
 *
 * Sem isto, /entrar seria a única tela da loja a mostrar o logo antigo depois de
 * o lojista trocar a marca.
 */
export default async function EntrarLayout({ children }: { children: React.ReactNode }) {
  const store = await getStore().catch(() => null)

  return <BrandLogoProvider logoUrl={store?.theme?.logoUrl ?? null}>{children}</BrandLogoProvider>
}
