'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ShippingOption } from '@ecommerce/shared/contracts'
import { quoteShippingCached } from '@/lib/shipping'
import { useShippingCep } from '@/lib/shipping-cep'
import { formatBRL, maskCep } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { Button } from './ui/button'
import { Input } from './ui/input'

/**
 * Calculadora de frete por CEP. Reutilizável: recebe os itens (variante +
 * quantidade) — no produto é uma variante, no carrinho são todos. Reduz o
 * abandono pela surpresa do frete, usando a mesma cotação do checkout.
 *
 * O CEP digitado fica lembrado (useShippingCep): nas próximas telas o frete já
 * aparece, e recota quando a variante ou a quantidade mudam.
 */

type Items = Array<{ variantId: string; quantity: number }>

type Props = {
  items: Items
  /** Desabilita quando não há variante válida selecionada. */
  disabled?: boolean
}

const itemsKeyOf = (items: Items): string => items.map((i) => `${i.variantId}:${i.quantity}`).join(',')

export const ShippingCalculator = ({ items, disabled = false }: Props) => {
  const { cep: savedCep, ready, setCep: saveCep } = useShippingCep()
  const [cep, setCep] = useState('')
  const [quotedCep, setQuotedCep] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Trocar de variante rápido dispara cotações em sequência: só a última vale.
  const seq = useRef(0)
  const lastQuery = useRef<string | null>(null)

  const itemsKey = itemsKeyOf(items)

  const run = async (digits: string, list: Items) => {
    const id = ++seq.current
    lastQuery.current = `${digits}|${itemsKeyOf(list)}`
    setLoading(true)
    setError(null)
    setOptions(null)
    try {
      const opts = await quoteShippingCached({ zipCode: digits, items: list })
      if (id !== seq.current) return
      setOptions(opts)
      setQuotedCep(digits)
      // Lista vazia também grava: o CEP é válido, só não tem serviço.
      saveCep(digits)
    } catch (err) {
      if (id !== seq.current) return
      // O backend traduz "sem dimensões", "frete não configurado" etc. em code;
      // aqui mostramos uma mensagem amigável sem reimplementar a regra.
      setError(
        err instanceof ApiError && err.code === 'SHIPPING_UNAVAILABLE'
          ? 'Frete indisponível para este item no momento.'
          : 'Não foi possível calcular o frete. Tente novamente.',
      )
    } finally {
      if (id === seq.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (ready && savedCep) setCep(maskCep(savedCep))
  }, [ready, savedCep])

  // Cota sozinho com o CEP lembrado. `itemsKey` representa `items`: o array é
  // recriado a cada render do pai e, como dependência, cotaria em loop.
  useEffect(() => {
    if (!ready || !savedCep || disabled || items.length === 0) return
    if (lastQuery.current === `${savedCep}|${itemsKey}`) return
    void run(savedCep, items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, savedCep, itemsKey, disabled])

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    const digits = cep.replace(/\D/g, '')
    if (digits.length !== 8) {
      setError('Informe um CEP válido (8 dígitos).')
      return
    }
    void run(digits, items)
  }

  const showOptions = !disabled && !loading && options !== null

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-soft">
      <span className="text-sm font-medium">Calcular frete e prazo</span>

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          value={cep}
          onChange={(e) => setCep(maskCep(e.target.value))}
          inputMode="numeric"
          autoComplete="postal-code"
          placeholder="00000-000"
          aria-label="CEP"
          disabled={disabled || loading}
          className="w-40"
        />
        <Button type="submit" variant="neutral" emphasis="quiet" disabled={disabled || loading}>
          {loading ? 'Calculando…' : 'Calcular'}
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {showOptions && quotedCep && (
        <p className="text-xs text-muted-foreground">Entrega para {maskCep(quotedCep)}</p>
      )}

      {showOptions && options.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma opção de frete para este CEP.</p>
      )}

      {showOptions && options.length > 0 && (
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
