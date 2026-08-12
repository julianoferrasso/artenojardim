'use client'

import { ROUTES } from '@ecommerce/shared/constants'
import type {
  Address,
  CreateAddressInput,
  UpdateAddressInput,
  CepLookup,
} from '@ecommerce/shared/contracts'
import { clientFetch as call } from './client'

/**
 * Acesso client-side aos endereços do cliente. Usa o `clientFetch` compartilhado:
 * Bearer em memória, cookie de refresh e — o que este arquivo não tinha — a
 * RENOVAÇÃO SILENCIOSA no 401.
 *
 * Sem ela, uma aba aberta há mais de 15 minutos falhava ao salvar um endereço, e
 * o cliente perdia o formulário preenchido. A consulta de CEP é pública; mandar o
 * token junto é inofensivo e evita um segundo caminho de fetch.
 *
 * Não recalcula nem valida nada de negócio no cliente: a API é a dona. Aqui só
 * transporta.
 */

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
