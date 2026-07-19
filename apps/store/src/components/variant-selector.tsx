'use client'

import { useMemo, useState } from 'react'
import Image from 'next/image'
import type { Product, Variant } from '@ecommerce/shared/contracts'
import { formatBRL } from '@/lib/utils'

/**
 * Seletor de variação — Client Component porque troca preço, imagem e
 * disponibilidade sem reload. A página é Server (SEO); só esta ilha é interativa.
 *
 * Deriva as opções das variantes (mesma lógica do admin/backend): para cada
 * opção, os valores possíveis; ao escolher todos, casa a variante exata.
 */
export const VariantSelector = ({ product }: { product: Product }) => {
  // Opções e seus valores, na ordem em que aparecem nas variantes.
  const options = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const v of product.variants) {
      for (const o of v.options) {
        const vals = map.get(o.option) ?? []
        if (!vals.includes(o.value)) vals.push(o.value)
        map.set(o.option, vals)
      }
    }
    return [...map.entries()].map(([name, values]) => ({ name, values }))
  }, [product.variants])

  const hasOptions = options.length > 0

  // Seleção inicial: a primeira variante ativa.
  const firstActive = product.variants.find((v) => v.isActive) ?? product.variants[0]!
  const [selected, setSelected] = useState<Record<string, string>>(
    () => Object.fromEntries(firstActive.options.map((o) => [o.option, o.value])),
  )

  // Variante que casa com a seleção atual.
  const current: Variant | undefined = useMemo(() => {
    if (!hasOptions) return firstActive
    return product.variants.find((v) =>
      v.options.every((o) => selected[o.option] === o.value),
    )
  }, [product.variants, selected, hasOptions, firstActive])

  const image = current?.imageId
    ? product.images.find((i) => i.id === current.imageId || i.uploadId === current.imageId)
    : undefined
  const displayImage = image ?? product.images[0]

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        {displayImage ? (
          <Image
            src={displayImage.url}
            alt={displayImage.alt ?? product.name}
            fill
            sizes="(max-width: 768px) 100vw, 50vw"
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            sem imagem
          </div>
        )}
      </div>

      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">{product.name}</h1>

        {current ? (
          <p className="text-2xl font-semibold">
            {formatBRL(current.price)}
            {current.compareAtPrice && current.compareAtPrice > current.price && (
              <span className="ml-2 text-base font-normal text-muted-foreground line-through">
                {formatBRL(current.compareAtPrice)}
              </span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">Combinação indisponível</p>
        )}

        {hasOptions &&
          options.map((opt) => (
            <div key={opt.name} className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{opt.name}</span>
              <div className="flex flex-wrap gap-2">
                {opt.values.map((value) => {
                  const active = selected[opt.name] === value
                  return (
                    <button
                      key={value}
                      onClick={() => setSelected({ ...selected, [opt.name]: value })}
                      className={
                        'rounded-md border px-3 py-1.5 text-sm transition-colors ' +
                        (active
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border hover:bg-accent')
                      }
                    >
                      {value}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

        <button
          disabled={!current || !current.isActive}
          className="mt-2 h-12 rounded-md bg-primary text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {/* O carrinho entra na Fase 1.8. Por ora o botão existe e é desabilitado
              quando a combinação não está disponível. */}
          Adicionar ao carrinho
        </button>

        {product.shortDescription && (
          <p className="text-sm text-muted-foreground">{product.shortDescription}</p>
        )}
        {product.description && (
          <div className="prose prose-sm mt-2 max-w-none text-foreground">
            <p className="whitespace-pre-wrap">{product.description}</p>
          </div>
        )}
      </div>
    </div>
  )
}
