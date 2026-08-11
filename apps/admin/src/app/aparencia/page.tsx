'use client'

import { useStoreTheme } from '@/lib/store-theme'
import { StoreThemeForm } from '@/components/store-theme-form'

export default function AparenciaPage() {
  const { data: theme, isLoading, error } = useStoreTheme()

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Aparência</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        As cores e o logo da sua loja. Vale para a loja pública, não para este painel.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar a aparência.</p>}

      {/*
        `key` força o formulário a renascer quando o tema chega ou muda no
        servidor: os defaultValues do React Hook Form só são lidos na montagem.
      */}
      {theme && <StoreThemeForm key={theme.logoId ?? 'sem-logo'} initial={theme} />}
    </div>
  )
}
