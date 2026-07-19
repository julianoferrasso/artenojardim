'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { CreateProductInput, Upload } from '@ecommerce/shared/contracts'
import { useCreateProduct } from '@/lib/products'
import { useCategoryTree, flattenForSelect } from '@/lib/categories'
import { VariantEditor } from '@/components/variant-editor'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Criação de produto. Seções numa página só (não abas): num produto novo o
 * lojista preenche tudo de uma vez, e rolar é menos atrito que trocar de aba.
 * A edição (com abas) é o próximo passo.
 */
export default function NewProductPage() {
  const router = useRouter()
  const create = useCreateProduct()
  const { data: tree } = useCategoryTree()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [categoryIds, setCategoryIds] = useState<string[]>([])
  const [images, setImages] = useState<Upload[]>([])
  const [variants, setVariants] = useState<CreateProductInput['variants']>([
    { sku: '', price: 0, weight: 0, length: 0, width: 0, height: 0, position: 0, isActive: true, options: [] },
  ])
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = (status: 'DRAFT' | 'ACTIVE') => {
    setError(null)
    const input: CreateProductInput = {
      name,
      status,
      description: description || undefined,
      categoryIds,
      images: images.map((img, i) => ({ uploadId: img.id, position: i })),
      variants,
      tags: [],
      seoTitle: seoTitle || undefined,
      seoDescription: seoDescription || undefined,
    }

    create.mutate(input, {
      onSuccess: (p) => router.replace(`/produtos/${p.id}`),
      // A API é a barreira real: publicar sem imagem/peso volta 422 com o motivo,
      // e a gente mostra a mensagem exata em vez de reimplementar a regra aqui.
      onError: (e) => setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.'),
    })
  }

  const field = 'h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const section = 'flex flex-col gap-4 rounded-lg border border-border bg-card p-6'

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="font-semibold tracking-tight">Novo produto</span>
          <a href="/produtos" className="text-sm text-muted-foreground hover:text-foreground">
            ← Produtos
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
        <section className={section}>
          <h2 className="font-medium">Informações</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className={field} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Categorias</label>
            <select
              multiple
              value={categoryIds}
              onChange={(e) =>
                setCategoryIds(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
              className="min-h-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {flattenForSelect(tree ?? []).map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-muted-foreground">
              Ctrl/Cmd + clique para selecionar várias.
            </span>
          </div>
        </section>

        <section className={section}>
          <h2 className="font-medium">Imagens</h2>
          <ImageUploader folder="products" onUploaded={(u) => setImages([...images, u])} />
          {images.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                <li key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="" className="size-20 rounded-md border border-border object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages(images.filter((_, j) => j !== i))}
                    className="absolute -right-1 -top-1 size-5 rounded-full bg-destructive text-xs text-destructive-foreground"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={section}>
          <h2 className="font-medium">Variações e preço</h2>
          <VariantEditor value={variants} onChange={setVariants} />
        </section>

        <section className={section}>
          <h2 className="font-medium">SEO</h2>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Título</label>
            <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium">Descrição</label>
            <textarea
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              rows={2}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="sticky bottom-4 flex gap-2 rounded-lg border border-border bg-card p-3 shadow-sm">
          <button
            onClick={() => submit('DRAFT')}
            disabled={create.isPending || !name}
            className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Salvar rascunho
          </button>
          <button
            onClick={() => submit('ACTIVE')}
            disabled={create.isPending || !name}
            className={cn(
              'h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground',
              'hover:opacity-90 disabled:opacity-50',
            )}
          >
            {create.isPending ? 'Salvando…' : 'Publicar'}
          </button>
        </div>
      </main>
    </div>
  )
}
