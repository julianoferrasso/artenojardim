'use client'

import type { ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { Banner } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { InlineEditItem, NewItemShell, Thumb } from '@/components/inline-edit'
import { cn } from '@/lib/utils'

/**
 * Uma vaga de banner da home (topo ou meio): a lista de cards e, dentro do card
 * aberto, o formulário. Só recebe props.
 */

/** O que está aberto nesta seção: um banner existente, um novo, ou nada. */
export type OpenItem = { kind: 'edit'; id: string } | { kind: 'new' } | null

type Props = {
  title: string
  description: string
  empty: string
  banners: Banner[] | undefined
  isLoading: boolean
  error: boolean
  deleting: boolean
  open: OpenItem
  onCreate: () => void
  /** Abre o banner, ou fecha se ele já estiver aberto. */
  onToggle: (banner: Banner) => void
  onClose: () => void
  onDelete: (banner: Banner) => void
  /** O formulário do card aberto; `undefined` = banner novo. */
  renderForm: (banner: Banner | undefined) => ReactNode
}

export const BannerSection = ({
  title,
  description,
  empty,
  banners,
  isLoading,
  error,
  deleting,
  open,
  onCreate,
  onToggle,
  onClose,
  onDelete,
  renderForm,
}: Props) => {
  const creating = open?.kind === 'new'

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" onClick={onCreate} disabled={creating} className="shrink-0">
          <Plus />
          Novo banner
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar banners.</p>}

      <ul className="flex flex-col gap-2">
        {creating && (
          <NewItemShell title="Novo banner" hint="Preencha os campos e clique em Criar banner." onClose={onClose}>
            {renderForm(undefined)}
          </NewItemShell>
        )}

        {banners?.map((banner) => {
          const isOpen = open?.kind === 'edit' && open.id === banner.id
          return (
            <InlineEditItem
              key={banner.id}
              open={isOpen}
              label={`o banner "${banner.title}"`}
              summary={<BannerSummary banner={banner} />}
              onToggle={() => onToggle(banner)}
              onDelete={() => onDelete(banner)}
              deleting={deleting}
            >
              {isOpen && renderForm(banner)}
            </InlineEditItem>
          )
        })}
      </ul>

      {banners && banners.length === 0 && !creating && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      )}
    </section>
  )
}

const BannerSummary = ({ banner }: { banner: Banner }) => (
  <>
    <Thumb url={banner.imageUrl} label="sem foto" />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-sm">
        <span className={cn('truncate font-medium', !banner.isActive && 'text-muted-foreground line-through')}>
          {banner.title}
        </span>
        {!banner.isActive && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">inativo</span>
        )}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        posição {banner.position}
        {banner.linkUrl ? ` · ${banner.linkUrl}` : ' · sem botão'}
      </span>
    </span>
  </>
)
