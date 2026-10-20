'use client'

import { usePathname } from 'next/navigation'

/**
 * Troca a moldura da loja pela do checkout. É client só para ler a rota: o
 * layout raiz não a conhece, e route groups exigiriam mover todas as páginas.
 * As molduras chegam prontas do servidor, como props — continuam Server
 * Components.
 */
export const StoreChrome = ({
  header,
  footer,
  checkoutHeader,
  checkoutFooter,
  children,
}: {
  header: React.ReactNode
  footer: React.ReactNode
  checkoutHeader: React.ReactNode
  checkoutFooter: React.ReactNode
  children: React.ReactNode
}) => {
  const pathname = usePathname()
  const checkout = pathname === '/checkout' || pathname.startsWith('/checkout/')

  return (
    <>
      {checkout ? checkoutHeader : header}
      <div className="flex-1">{children}</div>
      {checkout ? checkoutFooter : footer}
    </>
  )
}
