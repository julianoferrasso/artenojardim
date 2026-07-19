import type { Metadata } from 'next'
import { Providers } from '@/components/providers'
import { AuthGuard } from '@/components/auth-guard'
import { AppShell } from '@/components/app-shell'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'Admin — Arte no Jardim',
    template: '%s | Admin',
  },
  // O painel nunca deve aparecer em busca.
  robots: { index: false, follow: false },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        <Providers>
          <AuthGuard>
            <AppShell>{children}</AppShell>
          </AuthGuard>
        </Providers>
      </body>
    </html>
  )
}
