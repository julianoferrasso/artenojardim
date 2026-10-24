import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { ShippingProviderStatus, ShippingSettings } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'

const KEY = ['shipping', 'provider-status']

export const useShippingProviderStatus = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<ShippingProviderStatus>(ROUTES.shipping.status),
    // A autorização acontece em outra aba: ao voltar para esta, o status tem que
    // refletir a conexão nova sem esperar o staleTime padrão.
    staleTime: 0,
  })

export const useConnectShippingProvider = () =>
  useMutation({
    mutationFn: () => apiFetch<{ authorizeUrl: string }>(ROUTES.shipping.connect),
  })

const SETTINGS_KEY = ['shipping', 'settings']

/** Prazo de postagem da loja — somado a toda entrega que o cliente vê. */
export const useShippingSettings = () =>
  useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: () => apiFetch<ShippingSettings>(ROUTES.shipping.settings),
  })

export const useUpdateShippingSettings = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ShippingSettings) =>
      apiFetch<ShippingSettings>(ROUTES.shipping.settings, { method: 'PUT', body: JSON.stringify(input) }),
    onSuccess: (settings) => qc.setQueryData(SETTINGS_KEY, settings),
  })
}
