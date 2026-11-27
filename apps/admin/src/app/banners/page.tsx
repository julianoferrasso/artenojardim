'use client'

import { useState } from 'react'
import type { Banner } from '@ecommerce/shared/contracts'
import type { BannerPlacement } from '@ecommerce/shared/constants'
import { useBanners, useDeleteBanner } from '@/lib/banners'
import { BannerForm } from '@/components/banner-form'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Editing = { mode: 'create'; placement: BannerPlacement } | { mode: 'edit'; banner: Banner } | null

/** As duas vagas de banner da home, na ordem em que aparecem na página. */
const SECTIONS: { placement: BannerPlacement; title: string; empty: string }[] = [
  {
    placement: 'HERO',
    title: 'Topo da página (carrossel)',
    empty: 'Nenhum banner ainda. Sem banners, a loja mostra o slide padrão.',
  },
  {
    placement: 'MIDDLE',
    title: 'Meio da página — Presentear é criar memórias',
    empty: 'Nenhum banner ainda. Sem banners, a loja mostra a faixa padrão "Presentear é criar memórias".',
  },
]

/** Banners da home da loja: o carrossel do topo e a faixa do meio. Mesmo desenho da tela de categorias. */
export default function BannersPage() {
  const { data: banners, isLoading, error } = useBanners()
  const del = useDeleteBanner()
  const [editing, setEditing] = useState<Editing>(null)

  const onDelete = (banner: Banner) => {
    if (!confirm(`Excluir o banner "${banner.title}"?`)) return
    del.mutate(banner.id, {
      // Excluir o banner que está aberto fecha o formulário: salvar depois daria 404.
      onSuccess: () => setEditing((e) => (e?.mode === 'edit' && e.banner.id === banner.id ? null : e)),
      onError: (e) =>
        alert(e instanceof ApiError ? e.message : 'Não foi possível excluir o banner.'),
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Banners</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        O carrossel do topo e a faixa do meio da home. As alterações aparecem em até 1 minuto.
      </p>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-8">
          {SECTIONS.map((section) => (
            <BannerList
              key={section.placement}
              title={section.title}
              empty={section.empty}
              banners={banners?.filter((b) => b.placement === section.placement)}
              isLoading={isLoading}
              error={Boolean(error)}
              deleting={del.isPending}
              selectedId={editing?.mode === 'edit' ? editing.banner.id : null}
              onCreate={() => setEditing({ mode: 'create', placement: section.placement })}
              onEdit={(banner) => setEditing({ mode: 'edit', banner })}
              onDelete={onDelete}
            />
          ))}
        </div>

        <aside>
          {editing ? (
            <BannerForm
              key={editing.mode === 'edit' ? editing.banner.id : `new-${editing.placement}`}
              initial={editing.mode === 'edit' ? editing.banner : undefined}
              placement={editing.mode === 'create' ? editing.placement : undefined}
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

const BannerList = ({
  title,
  empty,
  banners,
  isLoading,
  error,
  deleting,
  selectedId,
  onCreate,
  onEdit,
  onDelete,
}: {
  title: string
  empty: string
  banners: Banner[] | undefined
  isLoading: boolean
  error: boolean
  deleting: boolean
  /** O banner aberto no formulário, destacado na lista. */
  selectedId: string | null
  onCreate: () => void
  onEdit: (banner: Banner) => void
  onDelete: (banner: Banner) => void
}) => (
  <section>
    <div className="mb-4 flex items-center justify-between">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      <button
        onClick={onCreate}
        className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        Novo banner
      </button>
    </div>

    {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
    {error && <p className="text-sm text-destructive">Falha ao carregar banners.</p>}
    {banners && banners.length === 0 && (
      <p className="text-sm text-muted-foreground">{empty}</p>
    )}

    {banners && banners.length > 0 && (
      <ul className="flex flex-col gap-2">
        {banners.map((banner) => (
          <li
            key={banner.id}
            className={cn(
              'relative flex items-center gap-3 rounded-md border bg-card px-3 py-2 transition-colors hover:bg-accent/50',
              banner.id === selectedId ? 'border-primary ring-1 ring-primary' : 'border-border',
            )}
          >
            {/* O card inteiro abre a edição: o ::after deste botão cobre o li, e
                Editar/Excluir ficam por cima dele (relative + z-10). */}
            <button
              type="button"
              onClick={() => onEdit(banner)}
              aria-label={`Editar o banner "${banner.title}"`}
              className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-md focus-visible:after:ring-2 focus-visible:after:ring-ring"
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
                  {banner.linkUrl ? ` · ${banner.linkUrl}` : ' · sem botão'}
                </span>
              </span>
            </button>

            <span className="relative z-10 flex shrink-0 gap-1">
              <button
                type="button"
                onClick={() => onEdit(banner)}
                className="rounded border border-border px-2 py-1 text-xs hover:bg-accent"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={() => onDelete(banner)}
                disabled={deleting}
                className="rounded border border-destructive/30 px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
              >
                Excluir
              </button>
            </span>
          </li>
        ))}
      </ul>
    )}
  </section>
)
