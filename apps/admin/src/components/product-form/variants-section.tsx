'use client'

import { useMemo, useState } from 'react'
import { Copy, Plus } from 'lucide-react'
import type { InventoryLevel, Product } from '@ecommerce/shared/contracts'
import type { StockPolicy } from '@ecommerce/shared/constants'
import { MoneyInput } from '@/components/money-input'
import { DecimalInput } from '@/components/decimal-input'
import { Switch } from '@/components/ui/switch'
import { useDialogs } from '@/components/confirm-dialog'
import { useAddVariant, useRemoveVariant } from '@/lib/products'
import { toStock } from '@/lib/inventory'
import {
  cmToMm,
  describeApiError,
  suggestSku,
  toGrams,
  variantLabel,
  type FieldErrors,
  type OptionDraft,
  type VariantDraft,
} from '@/lib/product-draft'
import { cn } from '@/lib/utils'
import { OptionsBuilder } from './options-builder'
import { Section, inputCls } from './section'
import { ROW_GRID, VariantFields, VariantRow } from './variant-row'

const POLICY_NOTE: Record<StockPolicy, string | null> = {
  STOCK_ONLY: null,
  MADE_TO_ORDER: 'Produto sob encomenda: o estoque não limita a venda.',
  STOCK_THEN_MADE_TO_ORDER: 'O estoque é a pronta entrega; o que faltar é produzido sob encomenda.',
}

const reservedHint = (level: InventoryLevel | undefined): string | null =>
  level && level.reserved > 0 ? `${level.reserved} reservado${level.reserved > 1 ? 's' : ''}` : null

// ── Criação ──────────────────────────────────────────────────────────────────

type CreateProps = {
  name: string
  stockPolicy: StockPolicy
  hasOptions: boolean
  onToggleOptions: (on: boolean) => void
  base: VariantDraft
  onBaseChange: (patch: Partial<VariantDraft>) => void
  options: OptionDraft[]
  onOptionsChange: (options: OptionDraft[]) => void
  variants: VariantDraft[]
  onVariantChange: (key: string, patch: Partial<VariantDraft>) => void
  onApplyAll: (patch: Partial<VariantDraft>) => void
  errors: FieldErrors
}

export function CreateVariantsSection(props: CreateProps) {
  const { name, hasOptions, base, variants, errors } = props
  return (
    <Section
      title="Preço, estoque e envio"
      description={POLICY_NOTE[props.stockPolicy] ?? undefined}
      action={
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch checked={hasOptions} onCheckedChange={props.onToggleOptions} />
          Tem variações (cor, tamanho, aroma…)
        </label>
      }
    >
      {errors.variants && (
        <p data-invalid="true" className="text-sm text-destructive">
          {errors.variants}
        </p>
      )}

      {!hasOptions ? (
        <VariantFields
          draft={base}
          onChange={props.onBaseChange}
          errors={errors}
          stock={{ label: 'Estoque inicial', value: base.stock ?? '' }}
          skuPlaceholder={suggestSku(name, [])}
        />
      ) : (
        <>
          <OptionsBuilder options={props.options} onChange={props.onOptionsChange} errors={errors} />
          {variants.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {variants.length} variaç{variants.length === 1 ? 'ão' : 'ões'}. Combinação que você não vende? Desligue a
              chave dela: fica fora da loja.
            </p>
          )}
          {variants.length > 0 && (
            <VariantList count={variants.length} onApplyAll={props.onApplyAll}>
              {variants.map((v) => (
                <VariantRow
                  key={v.key}
                  draft={v}
                  onChange={(patch) => props.onVariantChange(v.key, patch)}
                  errors={errors}
                  stock={{ label: 'Estoque inicial', value: v.stock ?? '' }}
                  skuPlaceholder={suggestSku(name, v.options)}
                />
              ))}
            </VariantList>
          )}
        </>
      )}
    </Section>
  )
}

// ── Edição ───────────────────────────────────────────────────────────────────

type EditProps = {
  product: Product
  stockPolicy: StockPolicy
  drafts: VariantDraft[]
  levels: Record<string, InventoryLevel | undefined>
  onVariantChange: (id: string, patch: Partial<VariantDraft>) => void
  onApplyAll: (patch: Partial<VariantDraft>) => void
  errors: FieldErrors
  variantErrors: Record<string, string>
  hasOptions: boolean
  onDuplicate: () => void
}

const stockOf = (d: VariantDraft, level: InventoryLevel | undefined) => ({
  label: 'Estoque',
  // null = não mexido: mostra o saldo do servidor, que pode chegar depois do
  // primeiro render (e mudar quando uma venda sai).
  value: d.stock ?? (level ? String(level.onHand) : ''),
  disabled: !level,
  hint: reservedHint(level),
})

export function EditVariantsSection(props: EditProps) {
  const { product, drafts, levels, errors, variantErrors } = props
  const remove = useRemoveVariant(product.id)
  const { confirm } = useDialogs()
  const [removeError, setRemoveError] = useState<string | null>(null)

  const onRemove = async (d: VariantDraft) => {
    const ok = await confirm({
      title: `Remover a variação ${variantLabel(d.options) || d.sku}?`,
      description:
        'Se ela já teve movimento de estoque ou entrou em algum pedido, é apenas desativada — o histórico fica.',
      confirmLabel: 'Remover variação',
      tone: 'danger',
    })
    if (!ok) return
    setRemoveError(null)
    remove.mutate(d.key, { onError: (e) => setRemoveError(describeApiError(e, 'Falha ao remover.')) })
  }

  const single = !props.hasOptions ? drafts[0] : undefined

  return (
    <Section
      title="Preço, estoque e envio"
      description={POLICY_NOTE[props.stockPolicy] ?? undefined}
    >
      {errors.variants && (
        <p data-invalid="true" className="text-sm text-destructive">
          {errors.variants}
        </p>
      )}

      {single ? (
        <>
          <VariantFields
            draft={single}
            onChange={(patch) => props.onVariantChange(single.key, patch)}
            errors={errors}
            stock={stockOf(single, levels[single.key])}
          />
          {variantErrors[single.key] && (
            <p role="alert" className="text-sm text-destructive">
              {variantErrors[single.key]}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            <span>Este produto não tem opções. Para vender em cores ou tamanhos, duplique-o e ative as variações.</span>
            <button
              type="button"
              onClick={props.onDuplicate}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 font-medium text-foreground hover:bg-accent"
            >
              <Copy className="size-3.5" />
              Duplicar
            </button>
          </div>
        </>
      ) : (
        <>
          <VariantList count={drafts.length} onApplyAll={props.onApplyAll}>
            {drafts.map((d) => (
              <VariantRow
                key={d.key}
                draft={d}
                onChange={(patch) => props.onVariantChange(d.key, patch)}
                errors={errors}
                stock={stockOf(d, levels[d.key])}
                rowError={variantErrors[d.key]}
                onRemove={() => void onRemove(d)}
                removeDisabledReason={
                  drafts.length <= 1
                    ? 'O produto precisa de ao menos uma variação'
                    : remove.isPending
                      ? 'Removendo…'
                      : undefined
                }
              />
            ))}
          </VariantList>
          {removeError && (
            <p role="alert" className="text-sm text-destructive">
              {removeError}
            </p>
          )}
          <AddVariant product={product} />
        </>
      )}
    </Section>
  )
}

// ── Lista + "Preencher todas" ────────────────────────────────────────────────

function VariantList({
  count,
  onApplyAll,
  children,
}: {
  count: number
  onApplyAll: (patch: Partial<VariantDraft>) => void
  children: React.ReactNode
}) {
  return (
    <div className="@container flex flex-col gap-2">
      <BulkFill count={count} onApply={onApplyAll} />
      <div
        aria-hidden
        className={cn('hidden gap-x-3 px-3 text-xs text-muted-foreground @2xl:grid', ROW_GRID)}
      >
        <span>Variação</span>
        <span>Preço</span>
        <span>Estoque</span>
        <span>SKU</span>
        <span className="text-right">Envio · ativa</span>
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  )
}

/** Preço, estoque, peso e medidas para todas de uma vez — campo vazio não mexe. */
function BulkFill({ count, onApply }: { count: number; onApply: (patch: Partial<VariantDraft>) => void }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState(0)
  const [stock, setStock] = useState('')
  const [weight, setWeight] = useState('')
  const [dims, setDims] = useState({ length: '', width: '', height: '' })

  const patch = useMemo(() => {
    const p: Partial<VariantDraft> = {}
    if (price > 0) p.price = price
    if (stock.trim()) p.stock = String(toStock(stock))
    if (toGrams(weight) > 0) p.weight = weight
    for (const k of ['length', 'width', 'height'] as const) if (cmToMm(dims[k]) > 0) p[k] = dims[k]
    return p
  }, [price, stock, weight, dims])

  if (count < 2) return null

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent"
      >
        Preencher todas de uma vez
      </button>
    )
  }

  const cell = 'h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'
  const field = (label: string, input: React.ReactNode) => (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      {input}
    </label>
  )

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">Preencha só o que for igual para todas. Campo vazio não muda nada.</p>
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-6">
        {field('Preço', <MoneyInput value={price} onChange={setPrice} className={cell} />)}
        {field('Estoque', <DecimalInput integer value={stock} onChange={setStock} className={cell} />)}
        {field('Peso (g)', <DecimalInput integer value={weight} onChange={setWeight} className={cell} />)}
        {field('Compr. (cm)', <DecimalInput value={dims.length} onChange={(length) => setDims({ ...dims, length })} className={cell} />)}
        {field('Larg. (cm)', <DecimalInput value={dims.width} onChange={(width) => setDims({ ...dims, width })} className={cell} />)}
        {field('Alt. (cm)', <DecimalInput value={dims.height} onChange={(height) => setDims({ ...dims, height })} className={cell} />)}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={Object.keys(patch).length === 0}
          onClick={() => {
            onApply(patch)
            setOpen(false)
          }}
          className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          Aplicar às {count} variações
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 rounded-md border border-border px-3 text-xs hover:bg-accent"
        >
          Fechar
        </button>
      </div>
    </div>
  )
}

// ── Adicionar variação (edição) ──────────────────────────────────────────────

/**
 * Adiciona UMA variação a um produto que já tem opções — ação imediata, com
 * botão próprio. A grade do produto é a fonte da verdade: a nova variação
 * preenche cada opção (podendo trazer um valor inédito, ex.: uma cor nova).
 */
function AddVariant({ product }: { product: Product }) {
  const add = useAddVariant(product.id)
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sku, setSku] = useState('')
  const [price, setPrice] = useState(0)
  const [stock, setStock] = useState('')
  const [weight, setWeight] = useState('')
  const [dims, setDims] = useState({ length: '', width: '', height: '' })
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

  // Herda envio e preço da primeira variação: quase sempre são iguais.
  const openForm = () => {
    const first = product.variants[0]
    if (first) {
      setPrice(first.price)
      setWeight(first.weight ? String(first.weight) : '')
      setDims({
        length: first.length ? String(first.length / 10).replace('.', ',') : '',
        width: first.width ? String(first.width / 10).replace('.', ',') : '',
        height: first.height ? String(first.height / 10).replace('.', ',') : '',
      })
    }
    setOpen(true)
  }

  const options = optionNames.map((name) => ({ option: name, value: values[name]?.trim() ?? '' }))
  const skuSuggestion = suggestSku(product.name, options.filter((o) => o.value))

  const submit = () => {
    setError(null)
    if (options.some((o) => !o.value)) return setError('Preencha todas as opções.')
    if (toGrams(weight) <= 0 || [dims.length, dims.width, dims.height].some((d) => cmToMm(d) <= 0)) {
      return setError('Informe peso e medidas: sem eles o frete não cota.')
    }
    add.mutate(
      {
        sku: sku.trim() || skuSuggestion,
        price,
        weight: toGrams(weight),
        length: cmToMm(dims.length),
        width: cmToMm(dims.width),
        height: cmToMm(dims.height),
        position: 0,
        isActive: true,
        initialStock: toStock(stock),
        options,
      },
      {
        onSuccess: () => {
          setValues({})
          setSku('')
          setStock('')
          setOpen(false)
        },
        onError: (e) => setError(describeApiError(e, 'Falha ao adicionar variação.')),
      },
    )
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={openForm}
        className="flex w-fit items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent"
      >
        <Plus className="size-4" />
        Adicionar variação
      </button>
    )
  }

  return (
    <div className="@container flex flex-col gap-3 rounded-md border border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">Nova variação</p>
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-4">
        {optionNames.map((name) => (
          <label key={name} className="flex flex-col gap-1 text-xs">
            <span className="font-medium">{name}</span>
            <input
              list={`opt-${name}`}
              value={values[name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [name]: e.target.value }))}
              className={inputCls}
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
          <input value={sku} placeholder={skuSuggestion} onChange={(e) => setSku(e.target.value)} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Preço</span>
          <MoneyInput value={price} onChange={setPrice} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Estoque inicial</span>
          <DecimalInput integer placeholder="0" value={stock} onChange={setStock} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Peso (g)</span>
          <DecimalInput integer value={weight} onChange={setWeight} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Comprimento (cm)</span>
          <DecimalInput value={dims.length} onChange={(length) => setDims({ ...dims, length })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Largura (cm)</span>
          <DecimalInput value={dims.width} onChange={(width) => setDims({ ...dims, width })} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          <span className="font-medium">Altura (cm)</span>
          <DecimalInput value={dims.height} onChange={(height) => setDims({ ...dims, height })} className={inputCls} />
        </label>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={add.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {add.isPending ? 'Adicionando…' : 'Adicionar'}
        </button>
        <button
          type="button"
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
