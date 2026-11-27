'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { cartesian } from '@ecommerce/shared/contracts'
import { AvailabilityFields } from '@/components/availability-editor'
import { useCreateProduct } from '@/lib/products'
import { useSendCampaign } from '@/lib/campaigns'
import {
  MAX_VARIANTS,
  apiFieldErrors,
  describeApiError,
  emptyFields,
  emptyVariant,
  optionSpecs,
  publishChecklist,
  regenerateVariants,
  scrollToFirstError,
  toCreateInput,
  validateOptions,
  validateProduct,
  variantField,
  type DraftImage,
  type FieldErrors,
  type OptionDraft,
  type ProductFields,
  type VariantDraft,
} from '@/lib/product-draft'
import { InfoSection } from './info-section'
import { MediaSection } from './media-section'
import { CreateVariantsSection } from './variants-section'
import { SeoSection } from './seo-section'
import { OrganizationCard } from './organization-card'
import { PublishCard } from './publish-card'
import { SaveBar, primaryBtn, secondaryBtn } from './save-bar'
import { Section } from './section'
import { newOption } from './options-builder'

export type CreateInitial = {
  fields: ProductFields
  images: DraftImage[]
  hasOptions: boolean
  options: OptionDraft[]
  variants: VariantDraft[]
  base: VariantDraft
}

/** Tira do mapa de erros as chaves que a mudança resolveu — o vermelho some ao corrigir. */
const without = (errors: FieldErrors, keys: string[]): FieldErrors => {
  if (!keys.some((k) => k in errors)) return errors
  const next = { ...errors }
  for (const k of keys) delete next[k]
  return next
}

/**
 * Criação de produto. Tudo numa tela e um envio só: o produto nasce com
 * variações, fotos e estoque numa transação da API.
 */
export function CreateProductForm({ initial, duplicateOf }: { initial?: CreateInitial; duplicateOf?: string }) {
  const router = useRouter()
  const create = useCreateProduct()
  const { mutateAsync: sendCampaign, isPending: sending } = useSendCampaign()

  const [fields, setFields] = useState<ProductFields>(() => initial?.fields ?? emptyFields())
  const [images, setImages] = useState<DraftImage[]>(() => initial?.images ?? [])
  const [hasOptions, setHasOptions] = useState(() => initial?.hasOptions ?? false)
  const [options, setOptions] = useState<OptionDraft[]>(() =>
    initial?.options.length ? initial.options : [newOption()],
  )
  const [variants, setVariants] = useState<VariantDraft[]>(() => initial?.variants ?? [])
  // A variante do produto simples fica guardada mesmo com as variações ligadas:
  // alternar o modo não apaga o que foi digitado (era o bug do editor antigo).
  const [base, setBase] = useState<VariantDraft>(() => initial?.base ?? emptyVariant())
  const [announce, setAnnounce] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [banner, setBanner] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const [snapshot] = useState(() => JSON.stringify({ fields, images, base, variants, options }))
  const dirty = !done && JSON.stringify({ fields, images, base, variants, options }) !== snapshot

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const list = hasOptions ? variants : [base]
  const comboCount = cartesian(optionSpecs(options)).length
  const liveErrors: FieldErrors =
    hasOptions && comboCount > MAX_VARIANTS
      ? { ...errors, options: `São ${comboCount} combinações; o limite é ${MAX_VARIANTS}.` }
      : errors

  const patchFields = (patch: Partial<ProductFields>) => {
    setFields((f) => ({ ...f, ...patch }))
    setErrors((e) => without(e, [...Object.keys(patch), ...('availability' in patch ? ['productionDays'] : [])]))
  }

  const patchVariant = (key: string, patch: Partial<VariantDraft>) => {
    const keys = Object.keys(patch).map((f) => variantField(key, f))
    setErrors((e) => without(e, keys))
    if (key === base.key && !hasOptions) setBase((b) => ({ ...b, ...patch }))
    else setVariants((prev) => prev.map((v) => (v.key === key ? { ...v, ...patch } : v)))
  }

  const applyAll = (patch: Partial<VariantDraft>) => {
    setVariants((prev) => prev.map((v) => ({ ...v, ...patch })))
    setErrors((e) =>
      without(
        e,
        variants.flatMap((v) => Object.keys(patch).map((f) => variantField(v.key, f))),
      ),
    )
  }

  const changeOptions = (next: OptionDraft[]) => {
    setOptions(next)
    setErrors((e) => without(e, ['options', 'variants', ...options.map((o) => `option:${o.id}`)]))
    const specs = optionSpecs(next)
    // Acima do limite o grid não é gerado: centenas de linhas travariam a tela.
    if (cartesian(specs).length > MAX_VARIANTS) return
    setVariants((prev) => regenerateVariants(specs, prev, prev[0] ?? base))
  }

  const toggleOptions = (on: boolean) => {
    setHasOptions(on)
    setErrors({})
    if (on && variants.length === 0) setVariants(regenerateVariants(optionSpecs(options), [], base))
  }

  const fail = (message: string, fieldErrors: FieldErrors) => {
    setErrors(fieldErrors)
    setBanner(message)
    scrollToFirstError()
  }

  const submit = (status: 'DRAFT' | 'ACTIVE') => {
    setBanner(null)
    const found: FieldErrors = {
      ...(hasOptions ? validateOptions(options) : {}),
      ...validateProduct({ fields, images, variants: list, publishing: status === 'ACTIVE', skuFallback: true }),
    }
    if (hasOptions && list.length === 0 && !found.options) found.options = 'Adicione valores às opções para gerar as variações.'
    const count = Object.keys(found).length
    if (count > 0) {
      return fail(count === 1 ? 'Corrija o campo destacado.' : `Corrija os ${count} campos destacados.`, found)
    }

    create.mutate(toCreateInput(fields, images, list, status), {
      onSuccess: async (p) => {
        setDone(true)
        // Duas chamadas e não um campo no createProductSchema: criar produto é
        // operação de catálogo, e a rota não publica evento nenhum.
        if (status === 'ACTIVE' && announce) {
          try {
            await sendCampaign({ productId: p.id, input: { kind: 'NEW_PRODUCT', excludedEmails: [] } })
          } catch {
            // O produto FOI publicado. Desfazê-lo porque o e-mail falhou seria
            // trocar um problema pequeno por um grande — a tela do produto tem o
            // envio manual para tentar de novo.
            router.replace(`/produtos/${p.id}?criado=publicado&email=falhou`)
            return
          }
        }
        router.replace(`/produtos/${p.id}?criado=${status === 'ACTIVE' ? 'publicado' : 'rascunho'}`)
      },
      onError: (e) => fail(describeApiError(e), apiFieldErrors(e, list, fields.name)),
    })
  }

  const busy = create.isPending || sending

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <header className="flex flex-col gap-1">
        <Link href="/produtos" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          Produtos
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">{duplicateOf ? 'Novo produto (cópia)' : 'Novo produto'}</h1>
        {duplicateOf && (
          <p className="text-sm text-muted-foreground">
            Copiado de <strong className="font-medium text-foreground">{duplicateOf}</strong>. Revise o nome, os SKUs e o
            estoque antes de salvar — as fotos são as mesmas.
          </p>
        )}
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <InfoSection fields={fields} onChange={patchFields} errors={liveErrors} editorKey="create" />
          <MediaSection
            images={images}
            onChange={(update) => {
              setImages(update)
              setErrors((e) => without(e, ['images']))
            }}
            error={liveErrors.images}
          />
          <CreateVariantsSection
            name={fields.name}
            stockPolicy={fields.availability.stockPolicy}
            hasOptions={hasOptions}
            onToggleOptions={toggleOptions}
            base={base}
            onBaseChange={(patch) => patchVariant(base.key, patch)}
            options={options}
            onOptionsChange={changeOptions}
            variants={variants}
            onVariantChange={patchVariant}
            onApplyAll={applyAll}
            errors={liveErrors}
          />
          <Section title="Disponibilidade" description="Como este produto é vendido.">
            <AvailabilityFields
              value={fields.availability}
              onChange={(availability) => patchFields({ availability })}
              error={liveErrors.productionDays}
            />
          </Section>
          <SeoSection fields={fields} onChange={patchFields} />
        </div>

        <aside className="flex min-w-0 flex-col gap-6">
          <PublishCard
            status={null}
            checklist={publishChecklist(fields, images.length, list)}
            isFeatured={fields.isFeatured}
            onFeaturedChange={(isFeatured) => patchFields({ isFeatured })}
          >
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={announce}
                onChange={(e) => setAnnounce(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span>
                Avisar os clientes por e-mail ao publicar
                <span className="block text-xs text-muted-foreground">
                  Vai para quem aceita novidades, só ao clicar em Publicar. Depois, use o envio manual na tela do produto.
                </span>
              </span>
            </label>
          </PublishCard>
          <OrganizationCard fields={fields} onChange={patchFields} />
        </aside>
      </div>

      <SaveBar
        tone={banner ? 'error' : 'muted'}
        message={banner ?? 'Campos com * são obrigatórios, até no rascunho: sem peso e medidas o frete não cota.'}
      >
        <button type="button" onClick={() => submit('DRAFT')} disabled={busy} className={secondaryBtn}>
          Salvar rascunho
        </button>
        <button type="button" onClick={() => submit('ACTIVE')} disabled={busy} className={primaryBtn}>
          {create.isPending ? 'Salvando…' : sending ? 'Enviando e-mail…' : 'Publicar'}
        </button>
      </SaveBar>
    </div>
  )
}
