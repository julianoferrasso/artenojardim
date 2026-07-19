import type { Metadata } from 'next'
import { getStore, getCategoryTree } from '@/lib/catalog'
import { SiteHeader } from '@/components/site-header'
import './globals.css'

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
      <body className="flex min-h-svh flex-col">
        <SiteHeader storeName={store?.name ?? 'Arte no Jardim'} categories={categories} />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
          <p>{store?.name ?? 'Arte no Jardim'} · feito à mão</p>
        </footer>
      </body>
    </html>
  )
}
