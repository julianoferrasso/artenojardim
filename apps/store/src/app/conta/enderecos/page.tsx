'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { BR_STATES } from '@ecommerce/shared/constants'
import type { Address, CreateAddressInput } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { ApiError } from '@/lib/api'
import {
  listAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  lookupCep,
} from '@/lib/addresses'

/**
 * Endereços do cliente. Toda a validação e a posse são da API — aqui é só CRUD de
 * UI. O CEP autopreenche rua/bairro/cidade/UF (ViaCEP), mas o cliente pode
 * corrigir: a máscara é da UI, a fonte da verdade é o que ele confirma.
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

const inputCls =
  'h-10 w-full rounded-lg border border-input bg-card px-3.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

const maskCep = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
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

export default function EnderecosPage() {
  // Sem guard aqui: conta/layout.tsx já barra quem não tem sessão.
  const { customer } = useAuth()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<FormState>(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [cepLoading, setCepLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const refresh = useCallback(async () => {
    try {
      setAddresses(await listAddresses())
    } catch {
      // Sem sessão ou falha transitória — a lista fica como está.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (customer) void refresh()
  }, [customer, refresh])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const openNew = () => {
    setForm(EMPTY)
    setEditingId(null)
    setError(null)
    setShowForm(true)
  }

  const openEdit = (a: Address) => {
    setForm(toForm(a))
    setEditingId(a.id)
    setError(null)
    setShowForm(true)
  }

  const onCepBlur = async () => {
    const digits = form.zipCode.replace(/\D/g, '')
    if (digits.length !== 8) return
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
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? 'CEP não encontrado.' : 'Não foi possível consultar o CEP.')
    } finally {
      setCepLoading(false)
    }
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const payload = toPayload(form)
      if (editingId) await updateAddress(editingId, payload)
      else await createAddress(payload)
      setShowForm(false)
      await refresh()
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

  const onDelete = async (id: string) => {
    if (!confirm('Remover este endereço?')) return
    try {
      await deleteAddress(id)
      await refresh()
    } catch {
      setError('Não foi possível remover o endereço.')
    }
  }

  const makeDefault = async (a: Address) => {
    try {
      await updateAddress(a.id, { isDefault: true })
      await refresh()
    } catch {
      setError('Não foi possível definir o endereço padrão.')
    }
  }

  // O guard de sessão e o "Carregando…" da conta vivem em conta/layout.tsx.
  if (customer && loading) {
    return <p className="py-12 text-center text-muted-foreground">Carregando…</p>
  }
  if (!customer) return null

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Endereços</h1>
        </div>
        {!showForm && (
          <button
            onClick={openNew}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90"
          >
            Novo endereço
          </button>
        )}
      </div>

      {error && !showForm && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {showForm ? (
        <form onSubmit={onSubmit} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 shadow-soft">
          <Field label="Identificação (opcional)" hint="Ex.: Casa, Trabalho">
            <input
              value={form.label}
              onChange={(e) => set('label', e.target.value)}
              maxLength={40}
              className={inputCls}
            />
          </Field>

          <Field label="Quem recebe">
            <input
              value={form.recipient}
              onChange={(e) => set('recipient', e.target.value)}
              required
              className={inputCls}
            />
          </Field>

          <Field label="CEP" hint={cepLoading ? 'Consultando…' : undefined}>
            <input
              value={form.zipCode}
              onChange={(e) => set('zipCode', maskCep(e.target.value))}
              onBlur={() => void onCepBlur()}
              inputMode="numeric"
              placeholder="00000-000"
              required
              className={inputCls}
            />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Rua">
                <input value={form.street} onChange={(e) => set('street', e.target.value)} required className={inputCls} />
              </Field>
            </div>
            <Field label="Número">
              <input value={form.number} onChange={(e) => set('number', e.target.value)} required className={inputCls} />
            </Field>
          </div>

          <Field label="Complemento (opcional)">
            <input value={form.complement} onChange={(e) => set('complement', e.target.value)} className={inputCls} />
          </Field>

          <Field label="Bairro">
            <input value={form.district} onChange={(e) => set('district', e.target.value)} required className={inputCls} />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <Field label="Cidade">
                <input value={form.city} onChange={(e) => set('city', e.target.value)} required className={inputCls} />
              </Field>
            </div>
            <Field label="UF">
              <select
                value={form.state}
                onChange={(e) => set('state', e.target.value)}
                required
                className={inputCls}
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

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => set('isDefault', e.target.checked)}
              className="size-4 rounded border-border"
            />
            Usar como endereço padrão
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-soft transition-all duration-200 hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : addresses.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Você ainda não cadastrou endereços.
        </section>
      ) : (
        <ul className="flex flex-col gap-3">
          {addresses.map((a) => (
            <li key={a.id} className="rounded-xl border border-border bg-card p-4 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div className="text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.label || a.recipient}</span>
                    {a.isDefault && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        Padrão
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    {a.street}, {a.number}
                    {a.complement ? ` — ${a.complement}` : ''}
                  </p>
                  <p className="text-muted-foreground">
                    {a.district} · {a.city}/{a.state} · {maskCep(a.zipCode)}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex gap-4 text-sm">
                {!a.isDefault && (
                  <button onClick={() => void makeDefault(a)} className="text-primary hover:underline">
                    Tornar padrão
                  </button>
                )}
                <button onClick={() => openEdit(a)} className="text-muted-foreground hover:underline">
                  Editar
                </button>
                <button onClick={() => void onDelete(a.id)} className="text-destructive hover:underline">
                  Remover
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const Field = ({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string | undefined
  children: React.ReactNode
}) => (
  <label className="flex flex-col gap-1">
    <span className="flex items-center justify-between text-sm font-medium">
      {label}
      {hint && <span className="text-xs font-normal text-muted-foreground">{hint}</span>}
    </span>
    {children}
  </label>
)
