'use client'

import type { ReactNode } from 'react'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'

/**
 * Casca das telas de credencial que ficam FORA do site (confirmar e-mail,
 * redefinir senha, confirmar troca de e-mail): logo, título e um cartão.
 *
 * Estava copiada literalmente em cada uma delas. A quarta cópia foi o momento em
 * que uma ficaria para trás numa correção — o mesmo raciocínio que o layout da
 * área da conta já registra.
 */
export function AuthShell({ title, children }: { title: string; children?: ReactNode }) {
  const logoUrl = useBrandLogo()

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <StoreLogo src={logoUrl} alt="" size={64} className="size-16" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">{children}</div>
    </main>
  )
}
