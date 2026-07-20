'use client'

import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { OrderSituation, OrderPeriod } from '@ecommerce/shared/contracts'
import { ORDER_PERIODS } from '@ecommerce/shared/contracts'
import { SITUATION_ORDER, SITUATION_LABEL, PERIOD_LABEL } from '@ecommerce/shared/constants'

/**
 * Filtros da lista de pedidos.
 *
 * O estado vive na URL (quem controla é a página): o botão voltar funciona e o
 * link é compartilhável — importante quando o cliente manda o endereço para o
 * suporte dizendo "é este aqui".
 */

const selectCls =
  'h-10 rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'

export type OrderFiltersValue = {
  situation?: OrderSituation | undefined
  period: OrderPeriod
  q: string
}

export const OrderFilters = ({
  value,
  onChange,
  onClear,
}: {
  value: OrderFiltersValue
  onChange: (next: Partial<OrderFiltersValue>) => void
  onClear: () => void
}) => {
  const [search, setSearch] = useState(value.q)

  // Debounce: sem ele, cada tecla digitada no número do pedido vira uma
  // requisição e uma entrada no histórico do navegador.
  useEffect(() => {
    if (search === value.q) return
    const timer = setTimeout(() => onChange({ q: search }), 350)
    return () => clearTimeout(timer)
  }, [search, value.q, onChange])

  // Filtro limpo pela página (botão "limpar") precisa refletir no input.
  useEffect(() => {
    setSearch(value.q)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.q])

  const hasFilters = !!value.situation || value.period !== 'all' || !!value.q

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-56">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nº do pedido ou produto"
          aria-label="Buscar pedidos"
          className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </div>

      <select
        value={value.situation ?? ''}
        onChange={(e) =>
          onChange({ situation: (e.target.value || undefined) as OrderSituation | undefined })
        }
        aria-label="Filtrar por situação"
        className={selectCls}
      >
        <option value="">Todas as situações</option>
        {SITUATION_ORDER.map((s) => (
          <option key={s} value={s}>
            {SITUATION_LABEL[s]}
          </option>
        ))}
      </select>

      <select
        value={value.period}
        onChange={(e) => onChange({ period: e.target.value as OrderPeriod })}
        aria-label="Filtrar por período"
        className={selectCls}
      >
        {ORDER_PERIODS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABEL[p]}
          </option>
        ))}
      </select>

      {hasFilters && (
        <button
          type="button"
          onClick={onClear}
          className="inline-flex h-10 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <X className="size-4" aria-hidden />
          Limpar
        </button>
      )}
    </div>
  )
}
