'use client'

import { useState } from 'react'
import type { Banner } from '@ecommerce/shared/contracts'
import type { BannerPlacement } from '@ecommerce/shared/constants'
import { useBanners, useDeleteBanner } from '@/lib/banners'
import { BannerForm } from '@/components/banner-form'
import { BannerSection, type OpenItem } from '@/components/banner-section'
import { useDirtyGuard } from '@/components/inline-edit'
import { ApiError } from '@/lib/api'

type Editing = { kind: 'edit'; id: string } | { kind: 'new'; placement: BannerPlacement } | null

/** As duas vagas de banner da home, na ordem em que aparecem na página. */
const SECTIONS: { placement: BannerPlacement; title: string; description: string; empty: string }[] = [
  {
    placement: 'HERO',
    title: 'Topo da página',
    description: 'O carrossel de abertura da home.',
    empty: 'Nenhum banner ainda. Sem banners, a loja mostra o slide padrão.',
  },
  {
    placement: 'MIDDLE',
    title: 'Meio da página',
    description: 'A faixa "Presentear é criar memórias", entre as categorias e os destaques.',
    empty: 'Nenhum banner ainda. Sem banners, a loja mostra a faixa padrão "Presentear é criar memórias".',
  },
]

const DISCARD_MESSAGE = 'Descartar as alterações deste banner?'

/** Banners da home da loja: o carrossel do topo e a faixa do meio. */
export default function BannersPage() {
  const { data: banners, isLoading, error } = useBanners()
  const del = useDeleteBanner()
  const [editing, setEditing] = useState<Editing>(null)

  const { onDirtyChange, guard, reset } = useDirtyGuard(DISCARD_MESSAGE)

  /** Troca o que está aberto; com alteração não salva, pergunta antes. */
  const changeEditing = (next: Editing) => guard(() => setEditing(next))

  const onDelete = (banner: Banner) => {
    if (!confirm(`Excluir o banner "${banner.title}"?`)) return
    del.mutate(banner.id, {
      // Excluir o banner que está aberto fecha o formulário: salvar depois daria 404.
      onSuccess: () => {
        if (editing?.kind === 'edit' && editing.id === banner.id) {
          reset()
          setEditing(null)
        }
      },
      onError: (e) =>
        alert(e instanceof ApiError ? e.message : 'Não foi possível excluir o banner.'),
    })
  }

  const onDone = () => {
    reset()
    setEditing(null)
  }

  const openIn = (placement: BannerPlacement): OpenItem => {
    if (editing?.kind === 'new') return editing.placement === placement ? { kind: 'new' } : null
    if (editing?.kind === 'edit') return { kind: 'edit', id: editing.id }
    return null
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Banners</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        O carrossel do topo e a faixa do meio da home. Clique num banner para editar. As alterações
        aparecem na loja em até 1 minuto.
      </p>

      <div className="flex flex-col gap-10">
        {SECTIONS.map((section) => (
          <BannerSection
            key={section.placement}
            title={section.title}
            description={section.description}
            empty={section.empty}
            banners={banners?.filter((b) => b.placement === section.placement)}
            isLoading={isLoading}
            error={Boolean(error)}
            deleting={del.isPending}
            open={openIn(section.placement)}
            onCreate={() => changeEditing({ kind: 'new', placement: section.placement })}
            onToggle={(banner) =>
              changeEditing(
                editing?.kind === 'edit' && editing.id === banner.id ? null : { kind: 'edit', id: banner.id },
              )
            }
            onClose={() => changeEditing(null)}
            onDelete={onDelete}
            renderForm={(banner) => (
              <BannerForm
                key={banner?.id ?? `new-${section.placement}`}
                initial={banner}
                placement={section.placement}
                onDirtyChange={onDirtyChange}
                onDone={onDone}
                onCancel={() => changeEditing(null)}
              />
            )}
          />
        ))}
      </div>
    </div>
  )
}
