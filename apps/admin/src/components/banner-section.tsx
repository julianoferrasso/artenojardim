'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { Plus } from 'lucide-react'
import type { Banner } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Uma vaga de banner da home (topo ou meio): a lista de cards e, dentro do card
 * aberto, o formulário. Um contêiner só, com uma borda só, envolve o card e o
 * form — é o que diz "este formulário é deste banner". Só recebe props.
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
          <OpenShell>
            <div className="flex items-center gap-3 px-3 py-2">
              <Thumb url={null} label="novo" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Novo banner</span>
                <span className="block text-xs text-muted-foreground">
                  Preencha os campos e clique em Criar banner.
                </span>
              </span>
              <Button type="button" size="xs" variant="outline" onClick={onClose}>
                Fechar
              </Button>
            </div>
            <div className="border-t border-border">{renderForm(undefined)}</div>
          </OpenShell>
        )}

        {banners?.map((banner) => {
          const isOpen = open?.kind === 'edit' && open.id === banner.id
          const header = (
            <BannerHeader
              banner={banner}
              isOpen={isOpen}
              deleting={deleting}
              onToggle={() => onToggle(banner)}
              onDelete={() => onDelete(banner)}
            />
          )

          return isOpen ? (
            <OpenShell key={banner.id}>
              {header}
              <div className="border-t border-border">{renderForm(banner)}</div>
            </OpenShell>
          ) : (
            <li
              key={banner.id}
              className="rounded-lg border border-border bg-card transition-colors hover:border-primary/40"
            >
              {header}
            </li>
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

/**
 * O contêiner do card aberto. Ao abrir, traz o card para a tela: fechar um
 * card de cima desloca a página, e o form aberto podia nascer fora da vista.
 */
const OpenShell = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const { top } = el.getBoundingClientRect()
    if (top < 0 || top > window.innerHeight * 0.5) {
      el.scrollIntoView({ block: 'start', behavior: 'smooth' })
    }
  }, [])

  return (
    <li
      ref={ref}
      className="scroll-mt-4 rounded-lg border border-primary/50 bg-card shadow-sm ring-1 ring-primary/15"
    >
      {children}
    </li>
  )
}

/** O resumo do banner; clicar nele abre (ou fecha) o formulário. */
const BannerHeader = ({
  banner,
  isOpen,
  deleting,
  onToggle,
  onDelete,
}: {
  banner: Banner
  isOpen: boolean
  deleting: boolean
  onToggle: () => void
  onDelete: () => void
}) => (
  <div className={cn('relative flex items-center gap-3 px-3 py-2', isOpen && 'rounded-t-lg bg-accent/40')}>
    {/* O ::after deste botão cobre o cabeçalho inteiro (não o form), e as ações
        ficam por cima dele (relative + z-10). */}
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      aria-label={`${isOpen ? 'Fechar' : 'Editar'} o banner "${banner.title}"`}
      className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
    >
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
    </button>

    <span className="relative z-10 flex shrink-0 gap-1">
      <Button type="button" size="xs" variant="outline" onClick={onToggle}>
        {isOpen ? 'Fechar' : 'Editar'}
      </Button>
      <Button
        type="button"
        size="xs"
        variant="outline"
        onClick={onDelete}
        disabled={deleting}
        className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Excluir
      </Button>
    </span>
  </div>
)

const Thumb = ({ url, label }: { url: string | null; label: string }) =>
  url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-12 w-20 shrink-0 rounded object-cover" />
  ) : (
    <span className="flex h-12 w-20 shrink-0 items-center justify-center rounded bg-muted text-xs text-muted-foreground">
      {label}
    </span>
  )
