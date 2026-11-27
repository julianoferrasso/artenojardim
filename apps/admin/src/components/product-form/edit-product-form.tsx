'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Copy, X } from 'lucide-react'
import { ERROR_CODES, type Product } from '@ecommerce/shared/contracts'
import type { ProductStatus } from '@ecommerce/shared/constants'
import { AvailabilityFields } from '@/components/availability-editor'
import { ProductCampaignDialog } from '@/components/product-campaign-dialog'
import { useDialogs } from '@/components/confirm-dialog'
import { useDeleteProduct, useSaveProductEdits } from '@/lib/products'
import { useVariantLevels } from '@/lib/inventory'
import { ApiError } from '@/lib/api'
import {
  fieldsFromProduct,
  hasRealOptions,
  imageFromProduct,
  imagesPatch,
  productPatch,
  publishChecklist,
  scrollToFirstError,
  stockCount,
  validateProduct,
  variantField,
  variantFromServer,
  variantLabel,
  variantPatch,
  type DraftImage,
  type FieldErrors,
  type ProductFields,
  type VariantDraft,
} from '@/lib/product-draft'
import { InfoSection } from './info-section'
import { MediaSection } from './media-section'
import { EditVariantsSection } from './variants-section'
import { SeoSection } from './seo-section'
import { OrganizationCard } from './organization-card'
import { PublishCard } from './publish-card'
import { SaveBar, primaryBtn, secondaryBtn } from './save-bar'
import { Section } from './section'

type Created = 'rascunho' | 'publicado' | 'publicado-sem-email'

const CREATED_NOTICE: Record<Created, string> = {
  rascunho: 'Rascunho salvo. Ele só aparece na loja depois de publicado.',
  publicado: 'Produto publicado: já está na loja.',
  'publicado-sem-email':
    'Produto publicado, mas o e-mail de divulgação não saiu. Tente de novo em "Enviar e-mail de divulgação".',
}

const STATUS_DONE: Record<ProductStatus, string> = {
  ACTIVE: 'Produto publicado ✓',
  DRAFT: 'Produto voltou a rascunho ✓',
  ARCHIVED: 'Produto arquivado ✓',
}

const STEP_LABEL = { product: 'Informações', images: 'Fotos', status: 'Publicação' } as const

/**
 * Edição do produto com UM "Salvar". O rascunho é comparado ao servidor (o
 * dirty sai da comparação, não de flags), e salvar manda só o que mudou —
 * produto, fotos, cada variação e, por último, o status.
 *
 * Variações ficam num mapa id → edição sobre o dado do servidor: adicionar ou
 * remover uma variação (ações imediatas) não apaga o que foi digitado nas outras.
 */
export function EditProductForm({ product, created }: { product: Product; created?: Created | undefined }) {
  const router = useRouter()
  const save = useSaveProductEdits(product.id)
  const del = useDeleteProduct()
  const { confirm } = useDialogs()

  const [fields, setFields] = useState<ProductFields>(() => fieldsFromProduct(product))
  const [images, setImages] = useState<DraftImage[]>(() => product.images.map(imageFromProduct))
  const [edits, setEdits] = useState<Record<string, VariantDraft>>({})
  const [editorKey, setEditorKey] = useState(0)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [stepErrors, setStepErrors] = useState<Partial<Record<keyof typeof STEP_LABEL, string>>>({})
  const [variantErrors, setVariantErrors] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [createdNotice, setCreatedNotice] = useState<string | null>(created ? CREATED_NOTICE[created] : null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const levels = useVariantLevels(product.variants.map((v) => v.id))
  const drafts = product.variants.map((v) => edits[v.id] ?? variantFromServer(v))
  const withOptions = hasRealOptions(product.variants)

  const changedVariants = product.variants.filter((v) => {
    const d = edits[v.id]
    return d && (variantPatch(v, d) !== null || stockCount(d, levels[v.id]?.onHand) !== null)
  })
  const fieldsChanged = productPatch(product, fields) !== null
  const imagesChanged = imagesPatch(product, images) !== null
  const dirty = fieldsChanged || imagesChanged || changedVariants.length > 0

  // Variação removida (ação imediata) solta as fotos vinculadas a ela no rascunho:
  // senão o próximo Salvar mandaria um variantId que não existe mais (422).
  const variantIds = product.variants.map((v) => v.id).join(',')
  useEffect(() => {
    const alive = new Set(variantIds.split(','))
    setImages((prev) =>
      prev.some((img) => img.variantId && !alive.has(img.variantId))
        ? prev.map((img) => (img.variantId && !alive.has(img.variantId) ? { ...img, variantId: null } : img))
        : prev,
    )
  }, [variantIds])

  // O ?criado= vale uma vez: recarregar a página não repete o aviso.
  useEffect(() => {
    if (created) window.history.replaceState(null, '', `/produtos/${product.id}`)
  }, [created, product.id])

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const patchFields = (patch: Partial<ProductFields>) => {
    setFields((f) => ({ ...f, ...patch }))
    setNotice(null)
    setErrors((e) => {
      const next = { ...e }
      for (const k of Object.keys(patch)) delete next[k]
      if ('availability' in patch) delete next.productionDays
      return next
    })
  }

  const patchVariant = (id: string, patch: Partial<VariantDraft>) => {
    const server = product.variants.find((v) => v.id === id)
    if (!server) return
    setNotice(null)
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] ?? variantFromServer(server)), ...patch } }))
    setErrors((e) => {
      const next = { ...e }
      for (const f of Object.keys(patch)) delete next[variantField(id, f)]
      return next
    })
  }

  const applyAll = (patch: Partial<VariantDraft>) => {
    for (const v of product.variants) patchVariant(v.id, patch)
  }

  const discard = () => {
    setFields(fieldsFromProduct(product))
    setImages(product.images.map(imageFromProduct))
    setEdits({})
    setErrors({})
    setStepErrors({})
    setVariantErrors({})
    setEditorKey((k) => k + 1)
  }

  const run = async (status?: ProductStatus) => {
    setNotice(null)
    setCreatedNotice(null)
    setStepErrors({})
    setVariantErrors({})
    const nextStatus = status ?? product.status
    // Produto à venda segue as regras de publicação: salvar não pode tirar a
    // última foto nem zerar o preço de quem está na loja.
    const publishing = nextStatus === 'ACTIVE'
    const changedDrafts = changedVariants.map((v) => edits[v.id]!)
    const toCheck = publishing
      ? drafts.filter((d) => d.isActive || changedDrafts.includes(d))
      : changedDrafts
    const found = validateProduct({
      fields,
      images,
      variants: toCheck,
      allVariants: drafts,
      publishing,
      skuFallback: false,
    })
    if (Object.keys(found).length > 0) {
      setErrors(found)
      setNotice(null)
      scrollToFirstError()
      return
    }
    setErrors({})

    const result = await save.mutateAsync({
      product: productPatch(product, fields),
      images: imagesPatch(product, images),
      variants: changedVariants.map((v) => ({
        id: v.id,
        input: variantPatch(v, edits[v.id]!),
        counted: stockCount(edits[v.id]!, levels[v.id]?.onHand),
      })),
      status: status && status !== product.status ? status : null,
    })

    const latest = result.product
    if (latest) {
      if (!result.errors.product) setFields(fieldsFromProduct(latest))
      if (!result.errors.images) setImages(latest.images.map(imageFromProduct))
    }
    setEdits((prev) => {
      const next = { ...prev }
      for (const id of result.savedVariantIds) delete next[id]
      return next
    })
    setStepErrors(result.errors)
    setVariantErrors(result.variantErrors)
    if (result.ok) setNotice(status && status !== product.status ? STATUS_DONE[status] : 'Alterações salvas ✓')
  }

  // Ctrl/Cmd+S salva — o atalho que todo mundo tenta numa tela de edição.
  const runRef = useRef(run)
  runRef.current = run
  const canSave = dirty && !save.isPending
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (canSave) void runRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [canSave])

  const onArchive = async () => {
    const ok = await confirm({
      title: `Arquivar "${product.name}"?`,
      description: 'Ele sai da loja, mas continua aqui no admin e pode ser restaurado quando quiser.',
      confirmLabel: 'Arquivar',
    })
    if (ok) await run('ARCHIVED')
  }

  const onDelete = async () => {
    const ok = await confirm({
      title: `Excluir "${product.name}" definitivamente?`,
      description: (
        <>
          <p>Some o produto, as variações, as fotos dele e o histórico de estoque. Não dá para desfazer.</p>
          <p>As imagens continuam na Biblioteca de mídia.</p>
        </>
      ),
      confirmLabel: 'Excluir produto',
      tone: 'danger',
    })
    if (!ok) return
    setDeleteError(null)
    del.mutate(product.id, {
      onSuccess: () => router.replace('/produtos'),
      onError: (e) =>
        setDeleteError(
          e instanceof ApiError && e.code === ERROR_CODES.PRODUCT_HAS_ORDERS
            ? 'Este produto já aparece em pedidos e não pode ser excluído. Use "Arquivar" para tirá-lo da loja.'
            : e instanceof ApiError
              ? e.message
              : 'Falha ao excluir.',
        ),
    })
  }

  const onDuplicate = async () => {
    if (dirty) {
      const ok = await confirm({
        title: 'Duplicar sem salvar?',
        description: 'A cópia sai do que está gravado. As alterações não salvas desta tela não vão junto.',
        confirmLabel: 'Duplicar mesmo assim',
      })
      if (!ok) return
    }
    router.push(`/produtos/novo?duplicar=${product.id}`)
  }

  const archived = product.status === 'ARCHIVED'
  const busy = save.isPending
  const failures = Object.entries(stepErrors) as Array<[keyof typeof STEP_LABEL, string]>
  const partial = failures.length > 0 || Object.keys(variantErrors).length > 0
  const errorCount = Object.keys(errors).length

  const statusButton = (label: string, status: ProductStatus, primary = false) => (
    <button
      type="button"
      onClick={() => void run(status)}
      disabled={busy}
      className={primary ? `${primaryBtn} w-full` : `${secondaryBtn} w-full`}
    >
      {busy ? 'Salvando…' : dirty ? `Salvar e ${label.toLowerCase()}` : label}
    </button>
  )

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <Link href="/produtos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
            Produtos
          </Link>
          <h1 className="truncate text-xl font-semibold tracking-tight">{product.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => void onDuplicate()}
          className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-background px-3 text-sm font-medium hover:bg-accent"
        >
          <Copy className="size-4" />
          Duplicar
        </button>
      </header>

      {createdNotice && (
        <div role="status" className="flex items-start justify-between gap-3 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <span>{createdNotice}</span>
          <button
            type="button"
            onClick={() => setCreatedNotice(null)}
            aria-label="Fechar aviso"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <InfoSection fields={fields} onChange={patchFields} errors={errors} editorKey={`edit-${editorKey}`} />
          <MediaSection
            images={images}
            onChange={(update) => {
              setImages(update)
              setNotice(null)
              setErrors((e) => {
                const next = { ...e }
                delete next.images
                return next
              })
            }}
            linkableVariants={
              withOptions
                ? product.variants.map((v) => ({ id: v.id, label: variantLabel(v.options) || v.sku }))
                : []
            }
            error={errors.images}
          />
          <EditVariantsSection
            product={product}
            stockPolicy={fields.availability.stockPolicy}
            drafts={drafts}
            levels={levels}
            onVariantChange={patchVariant}
            onApplyAll={applyAll}
            errors={errors}
            variantErrors={variantErrors}
            hasOptions={withOptions}
            onDuplicate={() => void onDuplicate()}
          />
          <Section title="Disponibilidade" description="Como este produto é vendido.">
            <AvailabilityFields
              value={fields.availability}
              onChange={(availability) => patchFields({ availability })}
              error={errors.productionDays}
            />
          </Section>
          <SeoSection fields={fields} onChange={patchFields} slug={product.slug} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <PublishCard
            status={product.status}
            checklist={publishChecklist(fields, images.length, drafts)}
            isFeatured={fields.isFeatured}
            onFeaturedChange={(isFeatured) => patchFields({ isFeatured })}
          >
            <div className="flex flex-col gap-2">
              {product.status === 'DRAFT' && statusButton('Publicar', 'ACTIVE', true)}
              {product.status === 'ACTIVE' && statusButton('Despublicar', 'DRAFT')}
              {archived && (
                <>
                  {statusButton('Restaurar como rascunho', 'DRAFT')}
                  {statusButton('Publicar', 'ACTIVE', true)}
                </>
              )}
              <ProductCampaignDialog product={product} />
            </div>
          </PublishCard>
          <OrganizationCard fields={fields} onChange={patchFields} />

          <section className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-card p-4">
            <h2 className="text-sm font-semibold">Tirar da loja</h2>
            {!archived && (
              <button
                type="button"
                onClick={() => void onArchive()}
                disabled={busy}
                className="h-9 rounded-md border border-border px-4 text-sm hover:bg-accent disabled:opacity-50"
              >
                Arquivar produto
              </button>
            )}
            <button
              type="button"
              onClick={() => void onDelete()}
              disabled={del.isPending}
              className="h-9 rounded-md border border-destructive/40 px-4 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              {del.isPending ? 'Excluindo…' : 'Excluir produto'}
            </button>
            {deleteError ? (
              <p role="alert" className="text-xs text-destructive">
                {deleteError}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Só é possível excluir um produto que nunca entrou em pedido. Com vendas, arquive.
              </p>
            )}
          </section>
        </aside>
      </div>

      {failures.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {failures.map(([step, message]) => (
            <li key={step}>
              <strong className="font-medium">{STEP_LABEL[step]}:</strong> {message}
            </li>
          ))}
        </ul>
      )}

      <SaveBar
        tone={errorCount > 0 || partial ? 'error' : dirty ? 'warning' : notice ? 'success' : 'muted'}
        message={
          errorCount > 0
            ? errorCount === 1
              ? 'Corrija o campo destacado.'
              : `Corrija os ${errorCount} campos destacados.`
            : partial
              ? 'Parte das alterações não foi salva — veja as mensagens em vermelho.'
              : dirty
                ? 'Alterações não salvas'
                : (notice ?? 'Tudo salvo')
        }
      >
        <button type="button" onClick={discard} disabled={!dirty || busy} className={secondaryBtn}>
          Descartar
        </button>
        <button type="button" onClick={() => void run()} disabled={!dirty || busy} className={primaryBtn}>
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
      </SaveBar>
    </div>
  )
}
