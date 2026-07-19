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

export const useVariantLedger = (variantId: string | undefined) =>
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
