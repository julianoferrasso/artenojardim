import type { Metadata } from 'next'
import { Cormorant_Garamond, Figtree } from 'next/font/google'
import { getStore, getCategoryTree } from '@/lib/catalog'
import { SiteHeader } from '@/components/site-header'
import { Providers } from '@/components/providers'
import './globals.css'

// Par tipográfico da marca: serifada elegante (a wordmark do logo é serifada)
// para títulos, humanista legível para o corpo. O CSS lê via --font-display/--font-sans.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-cormorant',
})

const figtree = Figtree({
  subsets: ['latin'],
  variable: '--font-figtree',
})

export async function generateMetadata(): Promise<Metadata> {
  // O nome/descrição da loja vêm da API — na Fase 4 (multi-tenant) cada loja
  // tem os seus, e este layout não muda.
  const store = await getStore().catch(() => null)
  return {
    title: {
      default: store?.name ?? 'Arte no Jardim',
      template: `%s | ${store?.name ?? 'Arte no Jardim'}`,
    },
    description: 'Vasos e peças artesanais para o seu jardim.',
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Store e categorias em paralelo — o header precisa dos dois.
  const [store, categories] = await Promise.all([
    getStore().catch(() => null),
    getCategoryTree().catch(() => []),
  ])

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${cormorant.variable} ${figtree.variable} flex min-h-svh flex-col font-sans`}>
        <Providers>
          <SiteHeader storeName={store?.name ?? 'Arte no Jardim'} categories={categories} />
          <div className="flex-1">{children}</div>
          <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
            <p>{store?.name ?? 'Arte no Jardim'} · feito à mão</p>
          </footer>
        </Providers>
      </body>
    </html>
  )
}
