'use client'

import { use, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Product, Variant } from '@ecommerce/shared/contracts'
import {
  useProduct,
  useUpdateProduct,
  useUpdateVariant,
  useDeleteProduct,
} from '@/lib/products'
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
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <span className="truncate font-semibold tracking-tight">{product.name}</span>
          <a href="/produtos" className="text-sm text-muted-foreground hover:text-foreground">
            ← Produtos
          </a>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-8">
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

        {product.images.length > 0 && (
          <section className="rounded-lg border border-border bg-card p-6">
            <h2 className="mb-3 font-medium">Imagens</h2>
            <ul className="flex flex-wrap gap-2">
              {product.images.map((img) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={img.id} src={img.url} alt={img.alt ?? ''} className="size-20 rounded-md border border-border object-cover" />
              ))}
            </ul>
          </section>
        )}

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
                  <VariantRow key={v.id} productId={id} variant={v} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <button
          onClick={onDelete}
          disabled={del.isPending}
          className="self-start rounded-md border border-destructive/40 px-4 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Arquivar produto
        </button>
      </main>
    </div>
  )
}

const inputCls = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/** Edita os campos textuais do produto. Salva só quando há mudança. */
function InfoEditor({ product }: { product: Product }) {
  const update = useUpdateProduct()
  const [name, setName] = useState(product.name)
  const [shortDescription, setShort] = useState(product.shortDescription ?? '')
  const [description, setDescription] = useState(product.description ?? '')
  const [seoTitle, setSeoTitle] = useState(product.seoTitle ?? '')
  const [seoDescription, setSeoDescription] = useState(product.seoDescription ?? '')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty =
    name !== product.name ||
    shortDescription !== (product.shortDescription ?? '') ||
    description !== (product.description ?? '') ||
    seoTitle !== (product.seoTitle ?? '') ||
    seoDescription !== (product.seoDescription ?? '')

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

/** Uma linha editável de variação. Converte reais↔centavos e cm↔mm na borda. */
function VariantRow({ productId, variant }: { productId: string; variant: Variant }) {
  const update = useUpdateVariant(productId)
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
          <button
            onClick={save}
            disabled={!dirty || update.isPending}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
          >
            Salvar
          </button>
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
