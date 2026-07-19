'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Address,
  CreateAddressInput,
  UpdateAddressInput,
  CepLookup,
} from '@ecommerce/shared/contracts'
import { getAccessToken } from './auth'
import { ApiError } from './api'

/**
 * Acesso client-side aos endereços do cliente. Mesmo padrão do carrinho: bate no
 * domínio público da API com o Bearer em memória e credentials para o cookie. A
 * consulta de CEP é pública (não anexa token — serve o guest também).
 *
 * Não recalcula nem valida nada de negócio no cliente: a API é a dona. Aqui só
 * transporta.
 */

const apiBase = (): string => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) throw new Error('NEXT_PUBLIC_API_URL não configurada')
  return url
}

const call = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getAccessToken()
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(body?.error?.code ?? 'INTERNAL_ERROR', body?.error?.message ?? `Erro ${res.status}`, res.status)
  }
  if (res.status === 204) return undefined as T
  return ((await res.json()) as { data: T }).data
}

export const listAddresses = (): Promise<Address[]> => call<Address[]>(ROUTES.customers.addresses)

export const createAddress = (input: CreateAddressInput): Promise<Address> =>
  call<Address>(ROUTES.customers.addresses, { method: 'POST', body: JSON.stringify(input) })

export const updateAddress = (id: string, input: UpdateAddressInput): Promise<Address> =>
  call<Address>(ROUTES.customers.address(id), { method: 'PATCH', body: JSON.stringify(input) })

export const deleteAddress = (id: string): Promise<void> =>
  call<void>(ROUTES.customers.address(id), { method: 'DELETE' })

/** Consulta pública de CEP para autopreencher rua/bairro/cidade/UF. */
export const lookupCep = (cep: string): Promise<CepLookup> =>
  call<CepLookup>(ROUTES.cep(cep.replace(/\D/g, '')))
