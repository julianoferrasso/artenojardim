import { useQuery, useMutation } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { ShippingProviderStatus } from '@ecommerce/shared/contracts'
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
