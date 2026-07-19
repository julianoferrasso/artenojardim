'use client'

import { use, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Product, ProductImage, Variant } from '@ecommerce/shared/contracts'
import {
  useProduct,
  useUpdateProduct,
  useUpdateProductImages,
  useUpdateVariant,
  useAddVariant,
  useRemoveVariant,
  useDeleteProduct,
} from '@/lib/products'
import { useCategoryTree, flattenForSelect } from '@/lib/categories'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Edição do produto. Edita os campos do produto (nome, descrição, SEO) e cada
 * variação em lugar (preço, peso, dimensões, SKU, ativa). A API é a barreira:
 * dimensão/peso obrigatórios e SKU único voltam com o motivo, e a gente mostra.
 */
export default function ProductEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { data: product, isLoading } = useProduct(id)
  const update = useUpdateProduct()
  const del = useDeleteProduct()
  const [error, setError] = useState<string | null>(null)

  if (isLoading) return <Centered>Carregando…</Centered>
  if (!product) return <Centered>Produto não encontrado.</Centered>

  const setStatus = (status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED') => {
    setError(null)
    update.mutate(
      { id, input: { status } },
      { onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar.') },
    )
  }

  const onDelete = () => {
    if (!confirm(`Arquivar "${product.name}"? Ele sai da loja mas o histórico é preservado.`)) return
    del.mutate(id, { onSuccess: () => router.replace('/produtos') })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between">
        <h1 className="truncate text-xl font-semibold tracking-tight">{product.name}</h1>
        <a href="/produtos" className="text-sm text-muted-foreground hover:text-foreground">
          ← Produtos
        </a>
      </div>

        <section className="flex items-center justify-between rounded-lg border border-border bg-card p-6">
          <div>
            <p className="text-sm text-muted-foreground">Status</p>
            <p className="font-medium">{product.status}</p>
          </div>
          <div className="flex gap-2">
            {product.status !== 'ACTIVE' && (
              <button
                onClick={() => setStatus('ACTIVE')}
                disabled={update.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Publicar
              </button>
            )}
            {product.status === 'ACTIVE' && (
              <button
                onClick={() => setStatus('DRAFT')}
                disabled={update.isPending}
                className="rounded-md border border-border px-4 py-2 text-sm hover:bg-accent"
              >
                Despublicar
              </button>
            )}
          </div>
        </section>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <InfoEditor product={product} />

        <ImagesEditor product={product} />

        <section className="rounded-lg border border-border bg-card p-6">
          <h2 className="mb-3 font-medium">Variações ({product.variants.length})</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Peso e dimensões são obrigatórios para o cálculo do frete.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3">Variação</th>
                  <th className="py-2 pr-3">SKU</th>
                  <th className="py-2 pr-3">Preço (R$)</th>
                  <th className="py-2 pr-3">Peso (g)</th>
                  <th className="py-2 pr-3">C (cm)</th>
                  <th className="py-2 pr-3">L (cm)</th>
                  <th className="py-2 pr-3">A (cm)</th>
                  <th className="py-2 pr-3">Ativa</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {product.variants.map((v) => (
                  <VariantRow
                    key={v.id}
                    productId={id}
                    variant={v}
                    canRemove={product.variants.length > 1}
                  />
                ))}
              </tbody>
            </table>
          </div>

          <AddVariant product={product} />
        </section>

        <button
          onClick={onDelete}
          disabled={del.isPending}
          className="self-start rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Arquivar produto
        </button>
    </div>
  )
}

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Igualdade de conjuntos de ids, independente da ordem — para o dirty-check. */
const sameIds = (a: string[], b: string[]): boolean =>
  a.length === b.length && [...a].sort().join(',') === [...b].sort().join(',')

const parseTags = (raw: string): string[] =>
  raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)

/** Edita os campos textuais do produto. Salva só quando há mudança. */
function InfoEditor({ product }: { product: Product }) {
  const update = useUpdateProduct()
  const { data: tree } = useCategoryTree()
  const [name, setName] = useState(product.name)
  const [shortDescription, setShort] = useState(product.shortDescription ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  const [brand, setBrand] = useState(product.brand ?? '')
  const [tags, setTags] = useState(product.tags.join(', '))
  const [categoryIds, setCategoryIds] = useState<string[]>(product.categoryIds)
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const categoryOptions = flattenForSelect(tree ?? [])

  const dirty =
    name !== product.name ||
    shortDescription !== (product.shortDescription ?? '') ||
    description !== (product.description ?? '') ||
    brand !== (product.brand ?? '') ||
    !sameIds(parseTags(tags), product.tags) ||
    !sameIds(categoryIds, product.categoryIds) ||
    seoTitle !== (product.seoTitle ?? '') ||
    seoDescription !== (product.seoDescription ?? '')

  const toggleCategory = (id: string) => {
    setCategoryIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setSaved(false)
  }

  const save = () => {
    setError(null)
    setSaved(false)
    update.mutate(
      {
        id: product.id,
        input: {
          name,
          shortDescription: shortDescription || undefined,
          description: description || undefined,
          brand: brand || undefined,
          tags: parseTags(tags),
          categoryIds,
          seoTitle: seoTitle || undefined,
          seoDescription: seoDescription || undefined,
        },
      },
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar.'),
      },
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <h2 className="font-medium">Informações</h2>

      <Field label="Nome">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Descrição curta">
        <input value={shortDescription} onChange={(e) => setShort(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Descrição">
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      <Field label="Marca">
        <input value={brand} onChange={(e) => setBrand(e.target.value)} className={inputCls} />
      </Field>
      <Field label="Tags (separadas por vírgula)">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="vaso, cerâmica, presente"
          className={inputCls}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Categorias</span>
        {categoryOptions.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma categoria cadastrada ainda.</p>
        ) : (
          <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border border-border p-2">
            {categoryOptions.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={categoryIds.includes(opt.id)}
                  onChange={() => toggleCategory(opt.id)}
                  className="size-4"
                />
                <span className="whitespace-pre">{opt.label}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <Field label="SEO — título">
        <input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} className={inputCls} />
      </Field>
      <Field label="SEO — descrição">
        <textarea
          value={seoDescription}
          onChange={(e) => setSeoDescription(e.target.value)}
          rows={2}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Field>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || !name || update.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {update.isPending ? 'Salvando…' : 'Salvar informações'}
        </button>
        {saved && !dirty && <span className="text-sm text-muted-foreground">Salvo ✓</span>}
      </div>
    </section>
  )
}

type DraftImage = { uploadId: string; url: string; alt: string }

const toDraft = (img: ProductImage): DraftImage => ({
  uploadId: img.uploadId,
  url: img.url,
  alt: img.alt ?? '',
})

/**
 * Editor da galeria: adiciona (uploader), remove e reordena. A ordem visual é a
 * `position` gravada — o backend reconcilia por uploadId, então reordenar não
 * recria as imagens. Salva a lista inteira de uma vez (PUT).
 */
function ImagesEditor({ product }: { product: Product }) {
  const update = useUpdateProductImages(product.id)
  const [images, setImages] = useState<DraftImage[]>(product.images.map(toDraft))
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty =
    images.length !== product.images.length ||
    images.some(
      (img, i) =>
        img.uploadId !== product.images[i]?.uploadId || img.alt !== (product.images[i]?.alt ?? ''),
    )

  const touch = () => setSaved(false)

  const move = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return
    const next = [...images]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item!)
    setImages(next)
    touch()
  }

  const save = () => {
    setError(null)
    setSaved(false)
    update.mutate(
      images.map((img, i) => ({ uploadId: img.uploadId, alt: img.alt || undefined, position: i })),
      {
        onSuccess: () => setSaved(true),
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar imagens.'),
      },
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <h2 className="font-medium">Imagens</h2>

      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma imagem. Adicione ao menos uma para publicar.</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {images.map((img, i) => (
            <li key={img.uploadId} className="flex flex-col gap-2 rounded-md border border-border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt={img.alt} className="aspect-square w-full rounded object-cover" />
              <input
                value={img.alt}
                onChange={(e) => {
                  setImages(images.map((im, idx) => (idx === i ? { ...im, alt: e.target.value } : im)))
                  touch()
                }}
                placeholder="Texto alternativo"
                className="h-8 w-full rounded border border-input bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label="Mover para trás"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-30"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === images.length - 1}
                    aria-label="Mover para frente"
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-30"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setImages(images.filter((_, idx) => idx !== i))
                    touch()
                  }}
                  className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                >
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="max-w-sm">
        <ImageUploader
          folder="products"
          onUploaded={(upload) => {
            setImages((prev) =>
              prev.some((im) => im.uploadId === upload.id)
                ? prev
                : [...prev, { uploadId: upload.id, url: upload.url, alt: '' }],
            )
            touch()
          }}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {update.isPending ? 'Salvando…' : 'Salvar imagens'}
        </button>
        {saved && !dirty && <span className="text-sm text-muted-foreground">Salvo ✓</span>}
      </div>
    </section>
  )
}

/** Uma linha editável de variação. Converte reais↔centavos e cm↔mm na borda. */
function VariantRow({
  productId,
  variant,
  canRemove,
}: {
  productId: string
  variant: Variant
  canRemove: boolean
}) {
  const update = useUpdateVariant(productId)
  const remove = useRemoveVariant(productId)
  const [sku, setSku] = useState(variant.sku)
  const [priceReais, setPriceReais] = useState(String(variant.price / 100))
  const [weight, setWeight] = useState(String(variant.weight))
  const [lengthCm, setLengthCm] = useState(variant.length ? String(variant.length / 10) : '')
  const [widthCm, setWidthCm] = useState(variant.width ? String(variant.width / 10) : '')
  const [heightCm, setHeightCm] = useState(variant.height ? String(variant.height / 10) : '')
  const [isActive, setIsActive] = useState(variant.isActive)
  const [error, setError] = useState<string | null>(null)

  const dirty =
    sku !== variant.sku ||
    Math.round(Number(priceReais) * 100) !== variant.price ||
    Number(weight) !== variant.weight ||
    Math.round(Number(lengthCm) * 10) !== variant.length ||
    Math.round(Number(widthCm) * 10) !== variant.width ||
    Math.round(Number(heightCm) * 10) !== variant.height ||
    isActive !== variant.isActive

  const save = () => {
    setError(null)
    update.mutate(
      {
        variantId: variant.id,
        input: {
          sku,
          price: Math.round(Number(priceReais) * 100),
          weight: Number(weight),
          length: Math.round(Number(lengthCm) * 10),
          width: Math.round(Number(widthCm) * 10),
          height: Math.round(Number(heightCm) * 10),
          isActive,
        },
      },
      { onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar.') },
    )
  }

  const cell = 'h-8 w-full rounded border border-input bg-background px-2'
  const dimWarn = (v: string) => cn(cell, isActive && !Number(v) && 'border-warning')

  return (
    <>
      <tr className="border-b border-border/50 align-top">
        <td className="py-2 pr-3 text-xs text-muted-foreground">
          {variant.options.map((o) => o.value).join(' / ') || '—'}
        </td>
        <td className="py-2 pr-3">
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={cn(cell, 'w-28')} />
        </td>
        <td className="py-2 pr-3">
          <input
            type="number"
            step="0.01"
            min="0"
            value={priceReais}
            onChange={(e) => setPriceReais(e.target.value)}
            className={cn(cell, 'w-24')}
          />
        </td>
        <td className="py-2 pr-3">
          <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className={cn(dimWarn(weight), 'w-20')} />
        </td>
        <td className="py-2 pr-3">
          <input type="number" step="0.1" min="0" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} className={cn(dimWarn(lengthCm), 'w-16')} />
        </td>
        <td className="py-2 pr-3">
          <input type="number" step="0.1" min="0" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} className={cn(dimWarn(widthCm), 'w-16')} />
        </td>
        <td className="py-2 pr-3">
          <input type="number" step="0.1" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={cn(dimWarn(heightCm), 'w-16')} />
        </td>
        <td className="py-2 pr-3">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="size-4" />
        </td>
        <td className="py-2">
          <div className="flex gap-1">
            <button
              onClick={save}
              disabled={!dirty || update.isPending}
              className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Salvar
            </button>
            <button
              onClick={() => {
                if (!confirm('Remover esta variação? Se houver vendas, ela é apenas desativada.')) return
                setError(null)
                remove.mutate(variant.id, {
                  onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao remover.'),
                })
              }}
              disabled={!canRemove || remove.isPending}
              title={canRemove ? 'Remover variação' : 'O produto precisa de ao menos uma variação'}
              className="h-8 rounded-md border border-destructive/40 px-2 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-40"
            >
              Remover
            </button>
          </div>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={9} className="pb-2 text-xs text-destructive">
            {error}
          </td>
        </tr>
      )}
    </>
  )
}

const IMPLICIT_OPTION = 'Título'

/**
 * Adiciona uma variação a um produto que TEM opções. A grade do produto é a
 * fonte da verdade: a nova variação preenche cada opção (podendo introduzir um
 * valor inédito, ex.: uma cor nova). Produto simples (sem opções reais) não
 * mostra o formulário — variações aí só na criação.
 */
function AddVariant({ product }: { product: Product }) {
  const add = useAddVariant(product.id)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sku, setSku] = useState('')
  const [priceReais, setPriceReais] = useState('')
  const [weight, setWeight] = useState('')
  const [lengthCm, setLengthCm] = useState('')
  const [widthCm, setWidthCm] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [error, setError] = useState<string | null>(null)

  const optionNames = useMemo(
    () => [...new Set(product.variants.flatMap((v) => v.options.map((o) => o.option)))],
    [product.variants],
  )
  const valuesByOption = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const v of product.variants)
      for (const o of v.options) {
        const list = (map[o.option] ??= [])
        if (!list.includes(o.value)) list.push(o.value)
      }
    return map
  }, [product.variants])

  // Produto simples: só a opção implícita "Título=Default Title". Não faz sentido
  // adicionar variação sem opções para variar.
  const isSimple =
    optionNames.length === 1 &&
    optionNames[0] === IMPLICIT_OPTION &&
    product.variants.every((v) => v.options.every((o) => o.value === 'Default Title'))

  if (isSimple) {
    return (
      <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
        Este produto não tem opções (cor, tamanho…). Novas variações exigem opções, definidas na
        criação do produto.
      </p>
    )
  }

  const reset = () => {
    setValues({})
    setSku('')
    setPriceReais('')
    setWeight('')
    setLengthCm('')
    setWidthCm('')
    setHeightCm('')
  }

  const submit = () => {
    setError(null)
    if (optionNames.some((n) => !values[n]?.trim())) {
      setError('Preencha todas as opções.')
      return
    }
    add.mutate(
      {
        sku,
        price: Math.round(Number(priceReais) * 100),
        weight: Number(weight),
        length: Math.round(Number(lengthCm) * 10),
        width: Math.round(Number(widthCm) * 10),
        height: Math.round(Number(heightCm) * 10),
        position: 0,
        isActive: true,
        options: optionNames.map((name) => ({ option: name, value: values[name]!.trim() })),
      },
      {
        onSuccess: () => {
          reset()
          setOpen(false)
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao adicionar variação.'),
      },
    )
  }

  const cell = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-accent"
      >
        + Adicionar variação
      </button>
    )
  }

  return (
    <div className="mt-4 flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">Nova variação</p>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
        {optionNames.map((name) => (
          <label key={name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium">{name}</span>
            <input
              list={`opt-${name}`}
              value={values[name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              className={cell}
            />
            <datalist id={`opt-${name}`}>
              {(valuesByOption[name] ?? []).map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">SKU</span>
          <input value={sku} onChange={(e) => setSku(e.target.value)} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Preço (R$)</span>
          <input type="number" step="0.01" min="0" value={priceReais} onChange={(e) => setPriceReais(e.target.value)} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Peso (g)</span>
          <input type="number" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Comprimento (cm)</span>
          <input type="number" step="0.1" min="0" value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Largura (cm)</span>
          <input type="number" step="0.1" min="0" value={widthCm} onChange={(e) => setWidthCm(e.target.value)} className={cell} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Altura (cm)</span>
          <input type="number" step="0.1" min="0" value={heightCm} onChange={(e) => setHeightCm(e.target.value)} className={cell} />
        </label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={add.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {add.isPending ? 'Adicionando…' : 'Adicionar'}
        </button>
        <button
          onClick={() => {
            setOpen(false)
            setError(null)
          }}
          className="h-9 rounded-md border border-border px-4 text-sm hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}
