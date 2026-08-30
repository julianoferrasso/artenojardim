'use client'

import { useState } from 'react'
import type { Banner } from '@ecommerce/shared/contracts'
import { useBanners, useDeleteBanner } from '@/lib/banners'
import { BannerForm } from '@/components/banner-form'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Editing = { mode: 'create' } | { mode: 'edit'; banner: Banner } | null

/** Banners do carrossel da home da loja. Mesmo desenho da tela de categorias. */
export default function BannersPage() {
  const { data: banners, isLoading, error } = useBanners()
  const del = useDeleteBanner()
  const [editing, setEditing] = useState<Editing>(null)

  const onDelete = (banner: Banner) => {
    if (!confirm(`Excluir o banner "${banner.title}"?`)) return
    del.mutate(banner.id, {
      onError: (e) =>
        alert(e instanceof ApiError ? e.message : 'Não foi possível excluir o banner.'),
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Banners</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        O carrossel do topo da loja. As alterações aparecem em até 1 minuto.
      </p>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Carrossel</h2>
            <button
              onClick={() => setEditing({ mode: 'create' })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Novo banner
            </button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && <p className="text-sm text-destructive">Falha ao carregar banners.</p>}
          {banners && banners.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum banner ainda. Sem banners, a loja mostra o slide padrão.
            </p>
          )}

          {banners && banners.length > 0 && (
            <ul className="flex flex-col gap-2">
              {banners.map((banner) => (
                <li
                  key={banner.id}
                  className="group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
                >
                  {banner.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={banner.imageUrl}
                      alt=""
                      className="h-12 w-20 shrink-0 rounded object-cover"
                    />
                  ) : (
                    <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
                      sem foto
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm">
                      <span className={cn('truncate', !banner.isActive && 'text-muted-foreground line-through')}>
                        {banner.title}
                      </span>
                      {!banner.isActive && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          inativo
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      posição {banner.position}
                      {banner.linkUrl ? ` · ${banner.linkUrl}` : ''}
                    </span>
                  </span>

                  <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      onClick={() => setEditing({ mode: 'edit', banner })}
                      className="rounded px-2 py-1 text-xs hover:bg-accent"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => onDelete(banner)}
                      disabled={del.isPending}
                      className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside>
          {editing ? (
            <BannerForm
              key={editing.mode === 'edit' ? editing.banner.id : 'new'}
              initial={editing.mode === 'edit' ? editing.banner : undefined}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Selecione um banner para editar, ou crie um novo.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
