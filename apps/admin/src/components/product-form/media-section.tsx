'use client'

import { useState } from 'react'
import { ArrowLeft, ArrowRight, GripVertical, Trash2, TriangleAlert } from 'lucide-react'
import type { Upload } from '@ecommerce/shared/contracts'
import { ImageUploader } from '@/components/image-uploader'
import { imageFromUpload, isSmallImage, type DraftImage } from '@/lib/product-draft'
import { cn } from '@/lib/utils'
import { Section } from './section'

type Props = {
  images: DraftImage[]
  /** Funcional de propósito: o upload termina depois, e a lista pode ter mudado no meio. */
  onChange: (update: (prev: DraftImage[]) => DraftImage[]) => void
  /** Só na edição: na criação as variações ainda não têm id. */
  linkableVariants?: Array<{ id: string; label: string }>
  error?: string | undefined
}

/**
 * Galeria do produto: a 1ª foto é a capa. Reordena arrastando, ou pelas setas
 * (teclado e toque, onde arrastar não existe).
 */
export function MediaSection({ images, onChange, linkableVariants = [], error }: Props) {
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  const move = (from: number, to: number) =>
    onChange((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev
      const next = [...prev]
      const [item] = next.splice(from, 1)
      if (item) next.splice(to, 0, item)
      return next
    })

  const patch = (uploadId: string, change: Partial<DraftImage>) =>
    onChange((prev) => prev.map((img) => (img.uploadId === uploadId ? { ...img, ...change } : img)))

  const add = (upload: Upload) =>
    // A mesma foto duas vezes é sempre engano (e a API recusa a galeria inteira).
    onChange((prev) => (prev.some((img) => img.uploadId === upload.id) ? prev : [...prev, imageFromUpload(upload)]))

  const remove = (uploadId: string) => onChange((prev) => prev.filter((img) => img.uploadId !== uploadId))

  const hasSmall = images.some(isSmallImage)

  return (
    <Section
      title="Fotos"
      description="A primeira é a capa. Arraste para mudar a ordem."
    >
      {error && (
        <p data-invalid="true" className="text-sm text-destructive">
          {error}
        </p>
      )}

      {images.length === 0 ? (
        <ImageUploader folder="products" multiple onUploaded={add} />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
          {images.map((img, i) => (
            <li
              key={img.uploadId}
              draggable
              onDragStart={(e) => {
                setDragFrom(i)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                setDragOver(i)
              }}
              onDragLeave={() => setDragOver((cur) => (cur === i ? null : cur))}
              onDrop={(e) => {
                if (dragFrom === null) return
                e.preventDefault()
                move(dragFrom, i)
                setDragFrom(null)
                setDragOver(null)
              }}
              onDragEnd={() => {
                setDragFrom(null)
                setDragOver(null)
              }}
              className={cn(
                'group flex flex-col gap-2 rounded-md border bg-background p-2 transition-colors',
                dragOver === i && dragFrom !== i ? 'border-primary bg-accent' : 'border-border',
                dragFrom === i && 'opacity-50',
              )}
            >
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.alt}
                  draggable={false}
                  className="aspect-square w-full cursor-grab rounded object-cover active:cursor-grabbing"
                />
                {i === 0 && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground">
                    Capa
                  </span>
                )}
                <GripVertical
                  aria-hidden
                  className="absolute right-1.5 top-1.5 size-5 rounded bg-background/80 p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                />
                {isSmallImage(img) && (
                  <span
                    title={`Foto pequena (${img.width}×${img.height}): o zoom da loja não mostra detalhes.`}
                    className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded bg-warning px-1.5 py-0.5 text-xs text-warning-foreground"
                  >
                    <TriangleAlert className="size-3" />
                    {img.width}×{img.height}
                  </span>
                )}
              </div>

              <input
                value={img.alt}
                maxLength={200}
                onChange={(e) => patch(img.uploadId, { alt: e.target.value })}
                placeholder="Descreva a foto (acessibilidade)"
                aria-label="Texto alternativo"
                className="h-8 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />

              {linkableVariants.length > 0 && (
                <select
                  value={img.variantId ?? ''}
                  onChange={(e) => patch(img.uploadId, { variantId: e.target.value || null })}
                  aria-label="Variação desta foto"
                  className="h-8 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Todas as variações</option>
                  {linkableVariants.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Mover para trás"
                    className="rounded border border-border p-1 hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowLeft className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === images.length - 1}
                    aria-label="Mover para frente"
                    className="rounded border border-border p-1 hover:bg-accent disabled:opacity-30"
                  >
                    <ArrowRight className="size-3.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => remove(img.uploadId)}
                  aria-label="Remover foto"
                  title="Remover foto"
                  className="rounded p-1 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
          <li className="min-h-28">
            <ImageUploader folder="products" multiple compact onUploaded={add} />
          </li>
        </ul>
      )}

      {linkableVariants.length > 0 && images.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Fotos em “Todas as variações” aparecem sempre. Vinculada a uma variação, a foto só aparece quando o
          cliente escolhe aquela variação.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {hasSmall
          ? 'Há fotos pequenas: para o zoom da loja mostrar detalhes, envie com 1600 px ou mais no lado maior.'
          : 'Para o zoom da loja mostrar detalhes, envie fotos com 1600 px ou mais no lado maior.'}
      </p>
    </Section>
  )
}
