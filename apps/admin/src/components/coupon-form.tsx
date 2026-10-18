'use client'

import { useState } from 'react'
import { useController, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createCouponSchema,
  ERROR_CODES,
  type Coupon,
  type CreateCouponInput,
} from '@ecommerce/shared/contracts'
import { COUPON_TYPES } from '@ecommerce/shared/constants'
import { spDayKey } from '@ecommerce/shared/utils'
import { useCreateCoupon, useUpdateCoupon, COUPON_TYPE_LABEL } from '@/lib/coupons'
import { MoneyInput } from '@/components/money-input'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  initial?: Coupon
  onDone: () => void
  onCancel: () => void
}

/** Campo vazio = sem limite. `null` e não 0: zero usos seria um cupom morto. */
const optionalInt = (v: unknown): number | null =>
  v === '' || v === null || v === undefined ? null : Number(v)

const optionalDay = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

const toDay = (iso: string | null): string | null => (iso ? spDayKey(new Date(iso)) : null)

/**
 * Criar/editar cupom. O MESMO createCouponSchema que a API usa valida aqui. Na
 * edição o código fica travado: o cupom pode já estar num post ou num e-mail.
 */
export const CouponForm = ({ initial, onDone, onCancel }: Props) => {
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
    formState: { errors },
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

  const type = watch('type')
  const { field: valueField } = useController({ name: 'value', control })
  const { field: minField } = useController({ name: 'minOrderValue', control })

  const busy = create.isPending || update.isPending

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

  const field =
    'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      noValidate
    >
      <h2 className="font-medium">{initial ? 'Editar cupom' : 'Novo cupom'}</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="code" className="text-sm font-medium">Código</label>
        <input
          id="code"
          autoFocus={!initial}
          readOnly={!!initial}
          placeholder="Ex.: BEMVINDO10"
          autoComplete="off"
          {...register('code')}
          className={cn(
            field,
            'font-mono uppercase',
            initial && 'bg-muted text-muted-foreground',
            errors.code && 'border-destructive',
          )}
        />
        {errors.code ? (
          <p className="text-xs text-destructive">{errors.code.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {initial
              ? `Não muda depois de criado. Usado em ${initial.usageCount} pedido(s).`
              : 'Letras, números, - ou _. O cliente pode digitar em minúsculas.'}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type" className="text-sm font-medium">Tipo de desconto</label>
        <select
          id="type"
          {...register('type', {
            // Trocar o tipo muda a unidade do valor (10% ≠ R$ 0,10): recomeça do zero.
            onChange: () => setValue('value', 0),
          })}
          className={field}
        >
          {COUPON_TYPES.map((t) => (
            <option key={t} value={t}>
              {COUPON_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      {type === 'PERCENTAGE' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="value" className="text-sm font-medium">Porcentagem</label>
          <div className="flex items-center gap-2">
            <input
              id="value"
              type="number"
              min={1}
              max={100}
              value={valueField.value || ''}
              // Campo vazio vira 0, e o schema responde "de 1 a 100" — NaN daria
              // a mensagem crua do Zod, em inglês.
              onChange={(e) => valueField.onChange(e.target.valueAsNumber || 0)}
              onBlur={valueField.onBlur}
              className={cn(field, 'w-24', errors.value && 'border-destructive')}
            />
            <span className="text-sm text-muted-foreground">% sobre os produtos</span>
          </div>
          {errors.value && <p className="text-xs text-destructive">{errors.value.message}</p>}
        </div>
      )}

      {type === 'FIXED_AMOUNT' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="value" className="text-sm font-medium">Valor do desconto</label>
          <MoneyInput
            id="value"
            value={valueField.value}
            onChange={valueField.onChange}
            onBlur={valueField.onBlur}
            className={cn(field, errors.value && 'border-destructive')}
          />
          {errors.value ? (
            <p className="text-xs text-destructive">{errors.value.message}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Abatido dos produtos; nunca passa do subtotal.
            </p>
          )}
        </div>
      )}

      {type === 'FREE_SHIPPING' && (
        <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Zera o frete que o cliente escolher. Se o frete já for grátis (pela regra de valor
          mínimo da loja), o cupom não é aplicado e não gasta uso.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="minOrderValue" className="text-sm font-medium">Pedido mínimo</label>
        <MoneyInput
          id="minOrderValue"
          value={minField.value ?? 0}
          onChange={(cents) => minField.onChange(cents || null)}
          onBlur={minField.onBlur}
          placeholder="Sem mínimo"
          className={field}
        />
        <p className="text-xs text-muted-foreground">Comparado com o subtotal dos produtos.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="usageLimit" className="text-sm font-medium">Limite total</label>
          <input
            id="usageLimit"
            type="number"
            min={1}
            placeholder="Ilimitado"
            {...register('usageLimit', { setValueAs: optionalInt })}
            className={cn(field, errors.usageLimit && 'border-destructive')}
          />
          {errors.usageLimit && (
            <p className="text-xs text-destructive">{errors.usageLimit.message}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="usageLimitPerCustomer" className="text-sm font-medium">Por cliente</label>
          <input
            id="usageLimitPerCustomer"
            type="number"
            min={1}
            placeholder="Ilimitado"
            {...register('usageLimitPerCustomer', { setValueAs: optionalInt })}
            className={cn(field, errors.usageLimitPerCustomer && 'border-destructive')}
          />
          {errors.usageLimitPerCustomer && (
            <p className="text-xs text-destructive">{errors.usageLimitPerCustomer.message}</p>
          )}
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Conta pedidos não cancelados. Cancelar um pedido devolve o uso.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="startsAt" className="text-sm font-medium">Início</label>
          <input
            id="startsAt"
            type="date"
            {...register('startsAt', { setValueAs: optionalDay })}
            className={field}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="endsAt" className="text-sm font-medium">Fim</label>
          <input
            id="endsAt"
            type="date"
            {...register('endsAt', { setValueAs: optionalDay })}
            className={cn(field, errors.endsAt && 'border-destructive')}
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

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} className="size-4" />
        Ativo (aceito no checkout)
      </label>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-border px-4 text-sm hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
