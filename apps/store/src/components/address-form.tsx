'use client'

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { BR_STATES } from '@ecommerce/shared/constants'
import type { Address, CreateAddressInput } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { createAddress, updateAddress, lookupCep } from '@/lib/addresses'
import { buttonVariants } from '@/components/ui/button'
import { cn, fieldClass, maskCep } from '@/lib/utils'

/**
 * Formulário de endereço da conta e do checkout. Toda a validação e a posse são
 * da API — aqui é só UI. O CEP autopreenche rua/bairro/cidade/UF (ViaCEP), mas
 * o cliente pode corrigir: a máscara é da UI, a fonte da verdade é o que ele
 * confirma.
 *
 * Aberto com um CEP já conhecido (o do simulador), consulta na hora e põe o foco
 * no número: o cliente não digita de novo o que já informou.
 */

type FormState = {
  label: string
  recipient: string
  zipCode: string
  street: string
  number: string
  complement: string
  district: string
  city: string
  state: string
  isDefault: boolean
}

const EMPTY: FormState = {
  label: '',
  recipient: '',
  zipCode: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  state: '',
  isDefault: false,
}

const toForm = (a: Address): FormState => ({
  label: a.label ?? '',
  recipient: a.recipient,
  zipCode: maskCep(a.zipCode),
  street: a.street,
  number: a.number,
  complement: a.complement ?? '',
  district: a.district,
  city: a.city,
  state: a.state,
  isDefault: a.isDefault,
})

/** Monta o payload omitindo os opcionais vazios (a API não quer string vazia). */
const toPayload = (f: FormState): CreateAddressInput => ({
  recipient: f.recipient,
  zipCode: f.zipCode.replace(/\D/g, ''),
  street: f.street,
  number: f.number,
  district: f.district,
  city: f.city,
  state: f.state,
  isDefault: f.isDefault,
  ...(f.label.trim() ? { label: f.label.trim() } : {}),
  ...(f.complement.trim() ? { complement: f.complement.trim() } : {}),
})

type Props = {
  /** Endereço em edição; sem ele, o form cria um novo. */
  address?: Address | undefined
  /** Pré-preenchimento de um endereço novo. */
  defaults?: { zipCode?: string | undefined; recipient?: string | undefined } | undefined
  onSaved: (address: Address) => void
  onCancel?: (() => void) | undefined
  /** CEP completo (8 dígitos) ou null a cada mudança — o checkout cota por ele. */
  onZipCodeChange?: ((digits: string | null) => void) | undefined
  submitLabel?: string | undefined
  /** Esconde identificação e "padrão": no checkout é atrito sem ganho. */
  minimal?: boolean | undefined
  className?: string | undefined
}

export const AddressForm = ({
  address,
  defaults,
  onSaved,
  onCancel,
  onZipCodeChange,
  submitLabel = 'Salvar',
  minimal = false,
  className,
}: Props) => {
  const [form, setForm] = useState<FormState>(() =>
    address
      ? toForm(address)
      : { ...EMPTY, zipCode: maskCep(defaults?.zipCode ?? ''), recipient: defaults?.recipient ?? '' },
  )
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const numberRef = useRef<HTMLInputElement>(null)
  // Sem isto, sair do campo CEP sem mudá-lo consultaria de novo e apagaria a
  // correção que o cliente fez na rua.
  const lastLookup = useRef<string | null>(address ? address.zipCode : null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const fillFromCep = async (digits: string): Promise<boolean> => {
    if (digits.length !== 8 || digits === lastLookup.current) return false
    lastLookup.current = digits
    setCepLoading(true)
    setError(null)
    try {
      const found = await lookupCep(digits)
      setForm((f) => ({
        ...f,
        street: found.street || f.street,
        district: found.district || f.district,
        city: found.city,
        state: found.state,
      }))
      return true
    } catch (err) {
      lastLookup.current = null
      setError(err instanceof ApiError && err.status === 404 ? 'CEP não encontrado.' : 'Não foi possível consultar o CEP.')
      return false
    } finally {
      setCepLoading(false)
    }
  }

  useEffect(() => {
    if (address) return
    void fillFromCep(form.zipCode.replace(/\D/g, '')).then((ok) => {
      if (ok) numberRef.current?.focus()
    })
    // Só na abertura: depois, quem dispara a consulta é o blur do campo CEP.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onZipChange = (value: string) => {
    const masked = maskCep(value)
    set('zipCode', masked)
    const digits = masked.replace(/\D/g, '')
    onZipCodeChange?.(digits.length === 8 ? digits : null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = toPayload(form)
      onSaved(address ? await updateAddress(address.id, payload) : await createAddress(payload))
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError('Confira os campos: algum dado está inválido.')
      } else {
        setError('Não foi possível salvar o endereço. Tente novamente.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className={cn('flex flex-col gap-4', className)}>
      {!minimal && (
        <Field label="Identificação (opcional)" hint="Ex.: Casa, Trabalho">
          <input
            value={form.label}
            onChange={(e) => set('label', e.target.value)}
            maxLength={40}
            className={fieldClass}
          />
        </Field>
      )}

      <Field label="CEP" hint={cepLoading ? 'Consultando…' : undefined}>
        <input
          value={form.zipCode}
          onChange={(e) => onZipChange(e.target.value)}
          onBlur={() => void fillFromCep(form.zipCode.replace(/\D/g, ''))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          required
          className={fieldClass}
        />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Field label="Rua">
            <input
              value={form.street}
              onChange={(e) => set('street', e.target.value)}
              autoComplete="address-line1"
              required
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="Número">
          <input
            ref={numberRef}
            value={form.number}
            onChange={(e) => set('number', e.target.value)}
            required
            className={fieldClass}
          />
        </Field>
      </div>

      <Field label="Complemento (opcional)">
        <input
          value={form.complement}
          onChange={(e) => set('complement', e.target.value)}
          autoComplete="address-line2"
          className={fieldClass}
        />
      </Field>

      <Field label="Bairro">
        <input value={form.district} onChange={(e) => set('district', e.target.value)} required className={fieldClass} />
      </Field>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <Field label="Cidade">
            <input
              value={form.city}
              onChange={(e) => set('city', e.target.value)}
              autoComplete="address-level2"
              required
              className={fieldClass}
            />
          </Field>
        </div>
        <Field label="UF">
          <select
            value={form.state}
            onChange={(e) => set('state', e.target.value)}
            autoComplete="address-level1"
            required
            className={fieldClass}
          >
            <option value="" disabled>
              —
            </option>
            {BR_STATES.map((s) => (
              <option key={s.code} value={s.code}>
                {s.code}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Quem recebe">
        <input
          value={form.recipient}
          onChange={(e) => set('recipient', e.target.value)}
          autoComplete="name"
          required
          className={fieldClass}
        />
      </Field>

      {!minimal && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => set('isDefault', e.target.checked)}
            className="size-4 rounded border-border"
          />
          Usar como endereço padrão
        </label>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <button type="submit" disabled={saving} className={buttonVariants({ size: 'sm' })}>
          {saving ? 'Salvando…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className={buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' })}
          >
            Cancelar
          </button>
        )}
      </div>
    </form>
  )
}

const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: ReactNode
}) => (
  <label className="flex flex-col gap-1">
    <span className="flex items-center justify-between text-sm font-medium">
      {label}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </span>
    {children}
  </label>
)
