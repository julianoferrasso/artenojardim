'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Address } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { listAddresses, updateAddress, deleteAddress } from '@/lib/addresses'
import { maskCep } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { AddressForm } from '@/components/address-form'

/**
 * Endereços do cliente. Toda a validação e a posse são da API — aqui é só CRUD de
 * UI; o formulário (com o autopreenchimento por CEP) é o mesmo do checkout.
 */

export default function EnderecosPage() {
  // Sem guard aqui: conta/layout.tsx já barra quem não tem sessão.
  const { customer } = useAuth()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Address | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const openForm = (a: Address | null) => {
    setEditing(a)
    setError(null)
    setShowForm(true)
  }

  const onSaved = async () => {
    setShowForm(false)
    await refresh()
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
            onClick={() => openForm(null)}
            className={buttonVariants({ size: 'sm' })}
          >
            Novo endereço
          </button>
        )}
      </div>

      {error && !showForm && (
        <p className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">{error}</p>
      )}

      {showForm ? (
        <AddressForm
          key={editing?.id ?? 'new'}
          address={editing ?? undefined}
          onSaved={() => void onSaved()}
          onCancel={() => setShowForm(false)}
          className="rounded-xl border border-border bg-card p-6 shadow-soft"
        />
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
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary-ink">
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
                  <button onClick={() => void makeDefault(a)} className="text-primary-ink hover:underline">
                    Tornar padrão
                  </button>
                )}
                <button onClick={() => openForm(a)} className="text-muted-foreground hover:underline">
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
