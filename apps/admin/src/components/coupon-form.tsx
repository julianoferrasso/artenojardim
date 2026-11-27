'use client'

import { useEffect, useId, useState } from 'react'
import { Controller, useController, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Lock } from 'lucide-react'
import {
  createCouponSchema,
  ERROR_CODES,
  type Coupon,
  type CreateCouponInput,
} from '@ecommerce/shared/contracts'
import { COUPON_TYPES, type CouponType } from '@ecommerce/shared/constants'
import { spDayKey } from '@ecommerce/shared/utils'
import { useCreateCoupon, useUpdateCoupon, COUPON_TYPE_LABEL } from '@/lib/coupons'
import { MoneyInput } from '@/components/money-input'
import { FormFooter, FormTopBar, Group, Notice, Segmented, groupTitleClass } from '@/components/form-parts'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { ApiError } from '@/lib/api'
import { cn, formatBRL } from '@/lib/utils'

type Props = {
  initial?: Coupon
  onDone: () => void
  onCancel: () => void
  /** Avisa a página quando há alteração não salva (para confirmar antes de fechar). */
  onDirtyChange?: (dirty: boolean) => void
}

/** Campo vazio = sem limite. `null` e não 0: zero usos seria um cupom morto. */
const optionalInt = (v: unknown): number | null =>
  v === '' || v === null || v === undefined ? null : Number(v)

const optionalDay = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const toDay = (iso: string | null): string | null => (iso ? spDayKey(new Date(iso)) : null)

/** "2026-12-01" → "01/12/2026", sem passar por Date (o dia já está no fuso da loja). */
const formatDay = (day: string): string => day.split('-').reverse().join('/')

const TYPE_OPTIONS = COUPON_TYPES.map((t) => ({ value: t, label: COUPON_TYPE_LABEL[t] }))

/**
 * Criar/editar cupom, aberto dentro do card do cupom. O MESMO createCouponSchema
 * que a API usa valida aqui. Na edição o código fica travado: o cupom pode já
 * estar num post ou num e-mail.
 */
export const CouponForm = ({ initial, onDone, onCancel, onDirtyChange }: Props) => {
  const uid = useId()
  const create = useCreateCoupon()
  const update = useUpdateCoupon()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isDirty },
  } = useForm<CreateCouponInput>({
    resolver: zodResolver(createCouponSchema),
    defaultValues: initial
      ? {
          code: initial.code,
          type: initial.type,
          value: initial.value,
          minOrderValue: initial.minOrderValue,
          usageLimit: initial.usageLimit,
          usageLimitPerCustomer: initial.usageLimitPerCustomer,
          startsAt: toDay(initial.startsAt),
          endsAt: toDay(initial.endsAt),
          isActive: initial.isActive,
        }
      : {
          code: '',
          type: 'PERCENTAGE',
          value: 10,
          minOrderValue: null,
          usageLimit: null,
          // Um uso por cliente é o padrão de mercado; vazio libera.
          usageLimitPerCustomer: 1,
          startsAt: null,
          endsAt: null,
          isActive: true,
        },
  })

  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange])

  const { field: valueField } = useController({ name: 'value', control })
  const { field: minField } = useController({ name: 'minOrderValue', control })

  const v = watch()
  const busy = create.isPending || update.isPending
  const saveLabel = busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Criar cupom'

  const onSubmit = (values: CreateCouponInput) => {
    setFormError(null)
    const onError = (e: unknown) => {
      if (e instanceof ApiError && e.code === ERROR_CODES.COUPON_CODE_TAKEN) {
        setError('code', { message: 'Já existe um cupom com este código.' })
        return
      }
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')
    }

    if (initial) {
      const { code: _code, ...input } = values
      update.mutate({ id: initial.id, input }, { onSuccess: onDone, onError })
    } else {
      create.mutate(values, { onSuccess: onDone, onError })
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="@container">
      <FormTopBar>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch id={`${uid}-active`} checked={field.value ?? true} onCheckedChange={field.onChange} />
            )}
          />
          <Label htmlFor={`${uid}-active`}>Ativo (aceito no checkout)</Label>
        </div>
      </FormTopBar>

      <div className="grid gap-8 p-5 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Group title="Código">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-code`}>Código que o cliente digita</Label>
              <div className="relative">
                <Input
                  id={`${uid}-code`}
                  autoFocus={!initial}
                  readOnly={!!initial}
                  placeholder="Ex.: BEMVINDO10"
                  autoComplete="off"
                  aria-invalid={Boolean(errors.code)}
                  {...register('code')}
                  className={cn('font-mono uppercase', initial && 'bg-muted pr-9 text-muted-foreground')}
                />
                {initial && (
                  <Lock
                    aria-hidden
                    className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                )}
              </div>
              {errors.code ? (
                <p className="text-xs text-destructive">{errors.code.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {initial
                    ? `Não muda depois de criado. Usado em ${initial.usageCount} pedido${initial.usageCount === 1 ? '' : 's'}.`
                    : 'Letras, números, - ou _. O cliente pode digitar em minúsculas.'}
                </p>
              )}
            </div>
          </Group>

          <Group title="Desconto">
            <Controller
              control={control}
              name="type"
              render={({ field }) => (
                <Segmented
                  ariaLabel="Tipo de desconto"
                  value={field.value as CouponType}
                  options={TYPE_OPTIONS}
                  onChange={(next) => {
                    if (next === field.value) return
                    field.onChange(next)
                    // Trocar o tipo muda a unidade do valor (10% ≠ R$ 0,10): recomeça do zero.
                    setValue('value', 0, { shouldDirty: true })
                  }}
                />
              )}
            />

            {v.type === 'PERCENTAGE' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-value`}>Porcentagem</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id={`${uid}-value`}
                    type="number"
                    min={1}
                    max={100}
                    value={valueField.value || ''}
                    // Campo vazio vira 0, e o schema responde "de 1 a 100" — NaN daria
                    // a mensagem crua do Zod, em inglês.
                    onChange={(e) => valueField.onChange(e.target.valueAsNumber || 0)}
                    onBlur={valueField.onBlur}
                    aria-invalid={Boolean(errors.value)}
                    className="w-24"
                  />
                  <span className="text-sm text-muted-foreground">% sobre os produtos</span>
                </div>
                {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
              </div>
            )}

            {v.type === 'FIXED_AMOUNT' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-value`}>Valor do desconto</Label>
                <MoneyInput
                  id={`${uid}-value`}
                  value={valueField.value}
                  onChange={valueField.onChange}
                  onBlur={valueField.onBlur}
                  className={cn(moneyClass, 'max-w-48', errors.value && 'border-destructive')}
                />
                {errors.value ? (
                  <p className="text-xs text-destructive">{errors.value.message}</p>
                ) : (
                  <p className="text-xs text-muted-foreground">Abatido dos produtos; nunca passa do subtotal.</p>
                )}
              </div>
            )}

            {v.type === 'FREE_SHIPPING' && (
              <Notice>
                Zera o frete que o cliente escolher. Se o frete já for grátis (pela regra de valor mínimo da loja),
                o cupom não é aplicado e não gasta uso.
              </Notice>
            )}
          </Group>

          <Group title="Regras">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${uid}-min`}>Pedido mínimo</Label>
              <MoneyInput
                id={`${uid}-min`}
                value={minField.value ?? 0}
                onChange={(cents) => minField.onChange(cents || null)}
                onBlur={minField.onBlur}
                placeholder="Sem mínimo"
                className={cn(moneyClass, 'max-w-48')}
              />
              <p className="text-xs text-muted-foreground">Comparado com o subtotal dos produtos.</p>
            </div>

            <div className="grid gap-4 @md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-limit`}>Limite total de usos</Label>
                <Input
                  id={`${uid}-limit`}
                  type="number"
                  min={1}
                  placeholder="Ilimitado"
                  aria-invalid={Boolean(errors.usageLimit)}
                  {...register('usageLimit', { setValueAs: optionalInt })}
                />
                {errors.usageLimit && <p className="text-xs text-destructive">{errors.usageLimit.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-per-customer`}>Usos por cliente</Label>
                <Input
                  id={`${uid}-per-customer`}
                  type="number"
                  min={1}
                  placeholder="Ilimitado"
                  aria-invalid={Boolean(errors.usageLimitPerCustomer)}
                  {...register('usageLimitPerCustomer', { setValueAs: optionalInt })}
                />
                {errors.usageLimitPerCustomer && (
                  <p className="text-xs text-destructive">{errors.usageLimitPerCustomer.message}</p>
                )}
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">
              Conta pedidos não cancelados. Cancelar um pedido devolve o uso.
            </p>
          </Group>

          <Group title="Validade">
            <div className="grid gap-4 @md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-starts`}>Início</Label>
                <Input id={`${uid}-starts`} type="date" {...register('startsAt', { setValueAs: optionalDay })} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-ends`}>Fim</Label>
                <Input
                  id={`${uid}-ends`}
                  type="date"
                  aria-invalid={Boolean(errors.endsAt)}
                  {...register('endsAt', { setValueAs: optionalDay })}
                />
              </div>
            </div>
            {errors.endsAt ? (
              <p className="-mt-2 text-xs text-destructive">{errors.endsAt.message}</p>
            ) : (
              <p className="-mt-2 text-xs text-muted-foreground">
                Opcional. Vale das 00:00 do início às 23:59 do fim, horário de Brasília.
              </p>
            )}
          </Group>
        </div>

        <aside className="flex min-w-0 flex-col gap-3 @3xl:sticky @3xl:top-4 @3xl:self-start">
          <h3 className={groupTitleClass}>Resumo</h3>
          <CouponSummary values={v} usageCount={initial?.usageCount ?? null} />
        </aside>
      </div>

      <FormFooter error={formError} dirty={isDirty} saveLabel={saveLabel} busy={busy} onCancel={onCancel} />
    </form>
  )
}

/** O MoneyInput é um <input> cru: mesma cara do Input do shadcn. */
const moneyClass =
  'h-9 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50'

const headline = (type: CouponType, value: number): string =>
  type === 'PERCENTAGE'
    ? `${value || 0}% de desconto`
    : type === 'FIXED_AMOUNT'
      ? `${formatBRL(value || 0)} de desconto`
      : 'Frete grátis'

/**
 * O cupom em linguagem de gente, ao vivo: é a "prévia" deste form. Conferir a
 * frase pega erro que campo a campo passa (ex.: 1 uso no total em vez de 1 por cliente).
 */
const CouponSummary = ({
  values,
  usageCount,
}: {
  values: Partial<CreateCouponInput>
  usageCount: number | null
}) => {
  const type = (values.type ?? 'PERCENTAGE') as CouponType
  const code = values.code?.trim().toUpperCase()
  const limit = values.usageLimit ?? null
  const rules = [
    type === 'FREE_SHIPPING' ? 'no frete escolhido pelo cliente' : 'sobre os produtos',
    values.minOrderValue ? `em pedidos a partir de ${formatBRL(values.minOrderValue)}` : 'em qualquer valor de pedido',
    values.usageLimitPerCustomer
      ? `${values.usageLimitPerCustomer} uso${values.usageLimitPerCustomer === 1 ? '' : 's'} por cliente`
      : 'sem limite por cliente',
    limit ? `até ${limit} uso${limit === 1 ? '' : 's'} no total` : 'sem limite de usos no total',
    values.startsAt && values.endsAt
      ? `válido de ${formatDay(values.startsAt)} a ${formatDay(values.endsAt)}`
      : values.endsAt
        ? `válido até ${formatDay(values.endsAt)}`
        : values.startsAt
          ? `válido a partir de ${formatDay(values.startsAt)}`
          : 'sem prazo',
  ]

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-4">
      <div>
        <span className="block font-mono text-sm text-muted-foreground">{code || 'CÓDIGO'}</span>
        <span className="block text-lg font-semibold">{headline(type, values.value ?? 0)}</span>
      </div>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm text-muted-foreground">
        {rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
      {values.isActive === false && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Desligado: o checkout recusa este código.
        </p>
      )}
      {usageCount !== null && (
        <div className="flex flex-col gap-1.5 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">
            Usado {usageCount}
            {limit ? ` de ${limit}` : ''} {usageCount === 1 ? 'vez' : 'vezes'}
          </span>
          {limit ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary"
                style={{ width: `${Math.min(100, (usageCount / limit) * 100)}%` }}
              />
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
