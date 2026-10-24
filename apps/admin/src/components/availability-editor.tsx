'use client'

import { useState } from 'react'
import { PRODUCTION_DAYS_MAX, PRODUCTION_DAYS_MIN, type Product } from '@ecommerce/shared/contracts'
import {
  STOCK_POLICIES,
  STOCK_POLICY_HINT,
  STOCK_POLICY_LABEL,
  availabilityCopy,
  businessDaysLabel,
  type StockPolicy,
} from '@ecommerce/shared/constants'
import { useUpdateProduct } from '@/lib/products'
import { useShippingSettings } from '@/lib/shipping'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Como o produto é vendido: pronta entrega, pronta entrega + sob encomenda, ou
 * sob encomenda — e o prazo de produção. A prévia usa a MESMA função de texto
 * da loja (`availabilityCopy`): o que o lojista lê aqui é o que o cliente lê lá.
 */

export type AvailabilityValue = {
  stockPolicy: StockPolicy
  /** Texto do campo: vazio enquanto o lojista apaga e digita de novo. */
  productionDays: string
}

export const toAvailabilityValue = (p: Pick<Product, 'stockPolicy' | 'productionDays'>): AvailabilityValue => ({
  stockPolicy: p.stockPolicy,
  productionDays: p.productionDays === null ? '' : String(p.productionDays),
})

/** O prazo digitado, ou o motivo de não valer. Só é exigido fora da pronta entrega. */
export const parseProductionDays = (
  value: AvailabilityValue,
): { ok: true; days: number | null } | { ok: false; message: string } => {
  const raw = value.productionDays.trim()
  if (value.stockPolicy === 'STOCK_ONLY' && raw === '') return { ok: true, days: null }
  const days = Number(raw)
  if (raw === '' || !Number.isInteger(days) || days < PRODUCTION_DAYS_MIN || days > PRODUCTION_DAYS_MAX) {
    return {
      ok: false,
      message: `Informe o prazo de produção: de ${PRODUCTION_DAYS_MIN} a ${PRODUCTION_DAYS_MAX} dias úteis.`,
    }
  }
  return { ok: true, days }
}

const PreviewLine = ({ label, title, detail }: { label: string; title: string; detail: string | null }) => (
  <div>
    <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{title}</p>
    {detail && <p className="text-sm text-muted-foreground">{detail}</p>}
  </div>
)

/** O que a página do produto vai mostrar, nos dois estados do estoque que importam. */
const Preview = ({ value, handlingDays }: { value: AvailabilityValue; handlingDays: number | null }) => {
  const parsed = parseProductionDays(value)
  const productionDays = parsed.ok ? parsed.days : null
  const copy = (stockStatus: 'IN_STOCK' | 'OUT_OF_STOCK' | 'MADE_TO_ORDER') =>
    availabilityCopy({ stockStatus, stockPolicy: value.stockPolicy, lowStockRemaining: null, productionDays, handlingDays })

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border bg-muted/40 p-4">
      <p className="text-sm font-medium">Na loja vai aparecer</p>
      {value.stockPolicy === 'MADE_TO_ORDER' ? (
        <PreviewLine label="Sempre" {...copy('MADE_TO_ORDER')} />
      ) : (
        <>
          <PreviewLine label="Com estoque" {...copy('IN_STOCK')} />
          {value.stockPolicy === 'STOCK_ONLY' ? (
            <PreviewLine label="Sem estoque" title="Esgotado" detail='Com o formulário "Avise-me quando chegar".' />
          ) : (
            <PreviewLine label="Sem estoque" {...copy('MADE_TO_ORDER')} />
          )}
        </>
      )}
    </div>
  )
}

/** Os campos, controlados: a criação guarda no formulário dela; a edição salva sozinha. */
export const AvailabilityFields = ({
  value,
  onChange,
}: {
  value: AvailabilityValue
  onChange: (value: AvailabilityValue) => void
}) => {
  const { data: shipping } = useShippingSettings()
  const handlingDays = shipping?.handlingDays ?? null
  const madeToOrder = value.stockPolicy !== 'STOCK_ONLY'

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Como este produto é vendido" className="grid gap-2 sm:grid-cols-3">
        {STOCK_POLICIES.map((policy) => {
          const active = value.stockPolicy === policy
          return (
            <button
              key={policy}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange({ ...value, stockPolicy: policy })}
              className={cn(
                'flex flex-col gap-1 rounded-md border p-3 text-left transition-colors',
                active ? 'border-primary bg-accent' : 'border-border hover:border-primary/50',
              )}
            >
              <span className="text-sm font-medium">{STOCK_POLICY_LABEL[policy]}</span>
              <span className="text-xs text-muted-foreground">{STOCK_POLICY_HINT[policy]}</span>
            </button>
          )
        })}
      </div>

      {madeToOrder && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="production-days" className="text-sm font-medium">
            Prazo de produção
          </label>
          <div className="flex items-center gap-2">
            <input
              id="production-days"
              type="number"
              inputMode="numeric"
              min={PRODUCTION_DAYS_MIN}
              max={PRODUCTION_DAYS_MAX}
              value={value.productionDays}
              onChange={(e) => onChange({ ...value, productionDays: e.target.value })}
              className="h-9 w-24 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span className="text-sm text-muted-foreground">dias úteis</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Contados da confirmação do pagamento até a peça ficar pronta. Depois a loja soma o prazo de postagem
            {handlingDays !== null ? ` (${businessDaysLabel(handlingDays)}, em Frete)` : ' (em Frete)'} e o do
            transporte para mostrar a data de entrega ao cliente.
          </p>
        </div>
      )}

      <Preview value={value} handlingDays={handlingDays} />
    </div>
  )
}

/** A seção da tela de edição: salva só a política e o prazo, quando há mudança. */
export const AvailabilityEditor = ({ product }: { product: Product }) => {
  const update = useUpdateProduct()
  const initial = toAvailabilityValue(product)
  const [value, setValue] = useState<AvailabilityValue>(initial)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const dirty = value.stockPolicy !== initial.stockPolicy || value.productionDays.trim() !== initial.productionDays

  const save = () => {
    const parsed = parseProductionDays(value)
    if (!parsed.ok) {
      setError(parsed.message)
      return
    }
    setError(null)
    setSaved(false)
    update.mutate(
      {
        id: product.id,
        input: {
          stockPolicy: value.stockPolicy,
          // Em pronta entrega o prazo guardado fica: voltando à encomenda, ele já vem preenchido.
          ...(value.stockPolicy === 'STOCK_ONLY' ? {} : { productionDays: parsed.days }),
        },
      },
      {
        onSuccess: (p) => {
          setValue(toAvailabilityValue(p))
          setSaved(true)
        },
        onError: (e) => setError(e instanceof ApiError ? e.message : 'Falha ao salvar.'),
      },
    )
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6">
      <div>
        <h2 className="font-medium">Disponibilidade</h2>
        <p className="text-sm text-muted-foreground">Como este produto é vendido.</p>
      </div>

      <AvailabilityFields
        value={value}
        onChange={(next) => {
          setValue(next)
          setSaved(false)
          setError(null)
        }}
      />

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={!dirty || update.isPending}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {update.isPending ? 'Salvando…' : 'Salvar disponibilidade'}
        </button>
        {saved && !dirty && <span className="text-sm text-muted-foreground">Salvo ✓</span>}
      </div>
    </section>
  )
}
