import type { Metadata } from 'next'
import { Cormorant_Garamond, Figtree } from 'next/font/google'
import { getStore, getCategoryTree } from '@/lib/catalog'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { Providers } from '@/components/providers'
import { ThemeStyle } from '@/components/theme-style'
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
    description: 'Velas e peças artesanais para deixar a sua casa mais acolhedora.',
    openGraph: {
      images: [store?.theme?.logoUrl ?? '/18521.jpg'],
    },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Store e categorias em paralelo — o header precisa dos dois.
  const [store, categories] = await Promise.all([
    getStore().catch(() => null),
    getCategoryTree().catch(() => []),
  ])

  const storeName = store?.name ?? 'Arte no Jardim'
  // `?.theme?.` e não `?.theme.`: a loja e a API sobem em momentos diferentes, e
  // uma resposta antiga em cache (sem `theme`) derrubaria a página inteira.
  // Sem o tema, o globals.css sustenta as cores — é degradar, não quebrar.
  const logoUrl = store?.theme?.logoUrl ?? null

  return (
    <html lang="pt-BR" suppressHydrationWarning>
      {/* Depois do import do globals.css: mesma especificidade, vence por ordem. */}
      {store?.theme && <ThemeStyle theme={store.theme} />}
      <body className={`${cormorant.variable} ${figtree.variable} flex min-h-svh flex-col font-sans`}>
        <Providers>
          <SiteHeader storeName={storeName} logoUrl={logoUrl} categories={categories} />
          <div className="flex-1">{children}</div>
          <SiteFooter store={store} logoUrl={logoUrl} />
        </Providers>
      </body>
    </html>
  )
}
