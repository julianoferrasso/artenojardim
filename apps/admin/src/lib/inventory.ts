import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type {
  StockItem,
  VariantLedger,
  InventoryLevel,
  RecordMovementInput,
} from '@ecommerce/shared/contracts'
import { apiFetch, apiFetchPaginated } from './api'

export const useStock = (lowStock: boolean) =>
  useQuery({
    queryKey: ['inventory', { lowStock }],
    queryFn: () =>
      apiFetchPaginated<StockItem>(`${ROUTES.inventory.list}?perPage=100${lowStock ? '&lowStock=true' : ''}`),
  })

/**
 * Quantas variações estão com estoque baixo — a mesma régua da tela de Estoque
 * (`lowStock`), para o número do painel bater com a lista que ele abre.
 */
export const useLowStockCount = () =>
  useQuery({
    queryKey: ['inventory', 'low-stock-count'],
    queryFn: () => apiFetchPaginated<StockItem>(`${ROUTES.inventory.list}?perPage=1&lowStock=true`),
    select: (result) => result.meta.total,
  })

/** Estoque é contagem de peças: inteiro, nunca negativo. */
export const toStock = (raw: string): number => Math.max(0, Math.trunc(Number(raw) || 0))

export const useVariantLevel = (variantId: string) =>
  useQuery({
    queryKey: ['inventory', 'level', variantId],
    queryFn: () => apiFetch<InventoryLevel>(ROUTES.inventory.level(variantId)),
  })

export const useVariantLedger =(variantId: string | undefined) =>
  useQuery({
    queryKey: ['inventory', 'ledger', variantId],
    enabled: !!variantId,
    queryFn: () => apiFetch<VariantLedger>(ROUTES.inventory.ledger(variantId!)),
  })

export const useRecordMovement = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: RecordMovementInput) =>
      apiFetch<InventoryLevel>(ROUTES.inventory.movements, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_d, input) => {
      qc.invalidateQueries({ queryKey: ['inventory'] })
      qc.invalidateQueries({ queryKey: ['inventory', 'ledger', input.variantId] })
    },
  })
}
