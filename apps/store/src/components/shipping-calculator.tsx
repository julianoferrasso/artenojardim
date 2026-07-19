'use client'

import { useState, type FormEvent } from 'react'
import type { ShippingOption } from '@ecommerce/shared/contracts'
import { quoteShipping } from '@/lib/shipping'
import { formatBRL } from '@/lib/utils'
import { ApiError } from '@/lib/api'

/**
 * Calculadora de frete por CEP. Reutilizável: recebe os itens (variante +
 * quantidade) — no produto é uma variante, no carrinho são todos. Reduz o
 * abandono pela surpresa do frete, usando a mesma cotação do checkout.
 */

const maskCep = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 8)
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d
}

type Props = {
  items: Array<{ variantId: string; quantity: number }>
  /** Desabilita quando não há variante válida selecionada. */
  disabled?: boolean
}

export const ShippingCalculator = ({ items, disabled = false }: Props) => {
  const [cep, setCep] = useState('')
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) {
      setError('Informe um CEP válido (8 dígitos).')
      return
    }
    setLoading(true)
    setError(null)
    setOptions(null)
    try {
      setOptions(await quoteShipping({ zipCode: digits, items }))
    } catch (err) {
      // O backend traduz "sem dimensões", "frete não configurado" etc. em code;
      // aqui mostramos uma mensagem amigável sem reimplementar a regra.
      setError(
        err instanceof ApiError && err.code === 'SHIPPING_UNAVAILABLE'
          ? 'Frete indisponível para este item no momento.'
          : 'Não foi possível calcular o frete. Tente novamente.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <span className="text-sm font-medium">Calcular frete e prazo</span>

      <form onSubmit={onSubmit} className="flex gap-2">
        <input
          value={cep}
          onChange={(e) => setCep(maskCep(e.target.value))}
          inputMode="numeric"
          placeholder="00000-000"
          disabled={disabled || loading}
          className="h-10 w-40 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || loading}
          className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          {loading ? 'Calculando…' : 'Calcular'}
        </button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {options && options.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma opção de frete para este CEP.</p>
      )}

      {options && options.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {options.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-4">
              <span>
                {o.carrier} · {o.service}
              </span>
              <span className="whitespace-nowrap text-muted-foreground">
                {formatBRL(o.priceCents)} · {o.deliveryDays} dias
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
