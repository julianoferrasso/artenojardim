'use client'

import { useState } from 'react'
import { ChevronDown, Trash2, TriangleAlert, Truck } from 'lucide-react'
import { MoneyInput } from '@/components/money-input'
import { DecimalInput } from '@/components/decimal-input'
import { Switch } from '@/components/ui/switch'
import {
  cmToMm,
  toGrams,
  variantField,
  variantLabel,
  type FieldErrors,
  type VariantDraft,
} from '@/lib/product-draft'
import { formatBRL, cn } from '@/lib/utils'
import { Field, inputCls } from './section'

/** O que muda entre criação e edição numa linha de variação. */
export type StockProps = {
  label: string
  value: string
  disabled?: boolean
  hint?: string | null
}

type CommonProps = {
  draft: VariantDraft
  onChange: (patch: Partial<VariantDraft>) => void
  errors: FieldErrors
  stock: StockProps
  /** Criação: o SKU sugerido, usado quando o campo fica vazio. */
  skuPlaceholder?: string | undefined
}

const SHIPPING_FIELDS = ['weight', 'length', 'width', 'height'] as const
const DIMENSIONS = [
  { key: 'length', label: 'Comprimento' },
  { key: 'width', label: 'Largura' },
  { key: 'height', label: 'Altura' },
] as const

const compareHint = (d: VariantDraft): string | null =>
  d.compareAtPrice > 0 && d.compareAtPrice <= d.price
    ? 'Menor ou igual ao preço: a loja não mostra o "de".'
    : null

const invalid = (error: string | undefined) => (error ? { 'aria-invalid': true as const } : {})

/**
 * Variação única, com todos os campos à vista — o produto simples. Sem tabela:
 * dois grupos que quebram em colunas conforme a largura do card.
 */
export function VariantFields({ draft, onChange, errors, stock, skuPlaceholder }: CommonProps) {
  const err = (field: string) => errors[variantField(draft.key, field)]
  const id = (field: string) => `variant-${draft.key}-${field}`

  return (
    <div className="@container flex flex-col gap-5">
      <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
        <Field label="Preço" htmlFor={id('price')} required error={err('price')}>
          <MoneyInput
            id={id('price')}
            value={draft.price}
            onChange={(price) => onChange({ price })}
            className={inputCls}
            {...invalid(err('price'))}
          />
        </Field>
        <Field
          label='Preço "de"'
          htmlFor={id('compare')}
          hint={compareHint(draft) ?? 'Opcional. Aparece riscado ao lado do preço.'}
        >
          <MoneyInput
            id={id('compare')}
            value={draft.compareAtPrice}
            onChange={(compareAtPrice) => onChange({ compareAtPrice })}
            placeholder="—"
            className={inputCls}
          />
        </Field>
        <Field label={stock.label} htmlFor={id('stock')} hint={stock.hint} error={err('stock')}>
          <DecimalInput
            id={id('stock')}
            integer
            value={stock.value}
            disabled={stock.disabled}
            placeholder={stock.disabled ? '…' : '0'}
            onChange={(text) => onChange({ stock: text })}
            className={inputCls}
          />
        </Field>
        <Field
          label="SKU"
          htmlFor={id('sku')}
          required={!skuPlaceholder}
          error={err('sku')}
          hint={skuPlaceholder ? 'Vazio usa o sugerido.' : undefined}
        >
          <input
            id={id('sku')}
            value={draft.sku}
            maxLength={80}
            placeholder={skuPlaceholder}
            onChange={(e) => onChange({ sku: e.target.value })}
            className={inputCls}
            {...invalid(err('sku'))}
          />
        </Field>
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-border p-4">
        <legend className="px-1 text-sm font-medium">Envio</legend>
        <p className="-mt-1 text-xs text-muted-foreground">
          Peso e medidas do produto embalado. O frete é calculado com eles — sem isso o cliente não consegue
          comprar.
        </p>
        <div className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-4">
          <Field label="Peso (g)" htmlFor={id('weight')} required error={err('weight')}>
            <DecimalInput
              id={id('weight')}
              integer
              value={draft.weight}
              onChange={(weight) => onChange({ weight })}
              placeholder="Ex.: 350"
              className={inputCls}
              {...invalid(err('weight'))}
            />
          </Field>
          {DIMENSIONS.map(({ key, label }) => (
            <Field key={key} label={`${label} (cm)`} htmlFor={id(key)} required error={err(key)}>
              <DecimalInput
                id={id(key)}
                value={draft[key]}
                onChange={(text) => onChange({ [key]: text })}
                placeholder="Ex.: 10,5"
                className={inputCls}
                {...invalid(err(key))}
              />
            </Field>
          ))}
        </div>
      </fieldset>
    </div>
  )
}

/** "350 g · 10 × 10 × 12 cm", ou null se falta algo. */
const shippingSummary = (d: VariantDraft): string | null => {
  const w = toGrams(d.weight)
  const dims = [d.length, d.width, d.height]
  if (w <= 0 || dims.some((x) => cmToMm(x) <= 0)) return null
  return `${w} g · ${dims.map((x) => x.replace('.', ',')).join(' × ')} cm`
}

/** As colunas da linha compacta — o cabeçalho da lista usa as mesmas. */
export const ROW_GRID = '@2xl:grid-cols-[minmax(7rem,1fr)_7.5rem_4.5rem_minmax(7rem,1.5fr)_auto]'

type RowProps = CommonProps & {
  onRemove?: (() => void) | undefined
  removeDisabledReason?: string | undefined
  rowError?: string | undefined
}

/**
 * Uma variação de produto com opções, numa linha: rótulo, preço, estoque, SKU.
 * O envio (peso e medidas) e o preço "de" abrem embaixo — em geral são iguais
 * entre variações e vêm do "Preencher todas", então ficam fora do caminho.
 * Abre sozinho quando há erro lá dentro.
 */
export function VariantRow({
  draft,
  onChange,
  errors,
  stock,
  skuPlaceholder,
  onRemove,
  removeDisabledReason,
  rowError,
}: RowProps) {
  const [open, setOpen] = useState(false)
  const err = (field: string) => errors[variantField(draft.key, field)]
  const shippingError = SHIPPING_FIELDS.some((f) => err(f))
  const expanded = open || shippingError
  const summary = shippingSummary(draft)
  const label = variantLabel(draft.options) || draft.sku || 'Variação'
  const cellLabel = 'text-xs text-muted-foreground @2xl:sr-only'
  const cellInput = 'h-8 w-full rounded border border-input bg-background px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive'
  const cellError = (field: string) =>
    err(field) ? (
      <p data-invalid="true" className="text-xs text-destructive">
        {err(field)}
      </p>
    ) : null

  return (
    <li className={cn('rounded-md border bg-background', draft.isActive ? 'border-border' : 'border-dashed border-border opacity-70')}>
      <div className={cn('grid grid-cols-2 items-start gap-x-3 gap-y-2 p-3', ROW_GRID)}>
        <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 @2xl:col-span-1 @2xl:h-8">
          <span className="truncate text-sm font-medium" title={label}>
            {label}
          </span>
          {!draft.isActive && <span className="shrink-0 text-xs text-muted-foreground @2xl:hidden">Inativa</span>}
        </div>

        <div className="flex flex-col gap-1">
          <label className={cellLabel} htmlFor={`row-${draft.key}-price`}>
            Preço
          </label>
          <MoneyInput
            id={`row-${draft.key}-price`}
            value={draft.price}
            onChange={(price) => onChange({ price })}
            className={cellInput}
            {...invalid(err('price'))}
          />
          {cellError('price')}
        </div>

        <div className="flex flex-col gap-1">
          <label className={cellLabel} htmlFor={`row-${draft.key}-stock`}>
            {stock.label}
          </label>
          <DecimalInput
            id={`row-${draft.key}-stock`}
            integer
            value={stock.value}
            disabled={stock.disabled}
            placeholder={stock.disabled ? '…' : '0'}
            onChange={(text) => onChange({ stock: text })}
            className={cellInput}
          />
          {stock.hint && <p className="text-xs leading-tight text-muted-foreground">{stock.hint}</p>}
        </div>

        <div className="col-span-2 flex min-w-0 flex-col gap-1 @2xl:col-span-1">
          <label className={cellLabel} htmlFor={`row-${draft.key}-sku`}>
            SKU
          </label>
          <input
            id={`row-${draft.key}-sku`}
            value={draft.sku}
            maxLength={80}
            placeholder={skuPlaceholder}
            title={draft.sku || skuPlaceholder}
            onChange={(e) => onChange({ sku: e.target.value })}
            className={cellInput}
            {...invalid(err('sku'))}
          />
          {cellError('sku')}
        </div>

        <div className="col-span-2 flex flex-wrap items-center justify-between gap-2 @2xl:col-span-1 @2xl:h-8 @2xl:flex-nowrap @2xl:justify-end">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={expanded}
            title={summary ?? 'Falta peso ou medida'}
            className={cn(
              'flex h-8 items-center gap-1.5 rounded border px-2 text-xs hover:bg-accent',
              summary ? 'border-border text-muted-foreground' : 'border-warning bg-warning/10 text-warning-foreground',
            )}
          >
            {summary ? <Truck className="size-3.5" /> : <TriangleAlert className="size-3.5" />}
            {/* Na linha larga só "Envio": o resumo inteiro não cabe ao lado de preço, estoque e SKU. */}
            <span className="max-w-40 truncate @2xl:hidden">{summary ?? 'Peso e medidas'}</span>
            <span className="hidden @2xl:inline">Envio</span>
            <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
          </button>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.isActive}
              onCheckedChange={(isActive: boolean) => onChange({ isActive })}
              aria-label={draft.isActive ? 'Variação ativa — desativar' : 'Variação inativa — ativar'}
              title={draft.isActive ? 'À venda' : 'Fora da venda'}
            />
            {onRemove && (
              <button
                type="button"
                onClick={onRemove}
                disabled={!!removeDisabledReason}
                title={removeDisabledReason ?? 'Remover variação'}
                aria-label="Remover variação"
                className="rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-30"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="grid grid-cols-2 gap-3 border-t border-border bg-muted/40 p-3 @xl:grid-cols-5">
          <div className="col-span-2 flex flex-col gap-1 @xl:col-span-1">
            <label className="text-xs text-muted-foreground" htmlFor={`row-${draft.key}-compare`}>
              Preço &quot;de&quot;
            </label>
            <MoneyInput
              id={`row-${draft.key}-compare`}
              value={draft.compareAtPrice}
              onChange={(compareAtPrice) => onChange({ compareAtPrice })}
              placeholder="—"
              className={cellInput}
            />
            {compareHint(draft) && <p className="text-xs leading-tight text-warning-foreground">{compareHint(draft)}</p>}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor={`row-${draft.key}-weight`}>
              Peso (g) <span className="text-destructive">*</span>
            </label>
            <DecimalInput
              id={`row-${draft.key}-weight`}
              integer
              value={draft.weight}
              onChange={(weight) => onChange({ weight })}
              className={cellInput}
              {...invalid(err('weight'))}
            />
            {cellError('weight')}
          </div>
          {DIMENSIONS.map(({ key, label: dimLabel }) => (
            <div key={key} className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor={`row-${draft.key}-${key}`}>
                {dimLabel} (cm) <span className="text-destructive">*</span>
              </label>
              <DecimalInput
                id={`row-${draft.key}-${key}`}
                value={draft[key]}
                onChange={(text) => onChange({ [key]: text })}
                className={cellInput}
                {...invalid(err(key))}
              />
              {cellError(key)}
            </div>
          ))}
        </div>
      )}

      {rowError && (
        <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">
          {rowError}
        </p>
      )}
    </li>
  )
}

/** O preço como texto curto, para resumos. */
export const priceText = (cents: number): string => (cents ? formatBRL(cents) : '—')
