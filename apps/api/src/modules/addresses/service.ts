import {
  type CreateAddressInput,
  type UpdateAddressInput,
  type Address,
  type CepLookup,
} from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { notFound } from '../../shared/errors.js'
import { lookupCep } from '../../integrations/viacep/client.js'

/**
 * Endereços do cliente. TODA operação filtra por customerId — a posse é aqui, no
 * service, nunca só na rota. `requireAuth` diz "quem é você", não "isto é seu";
 * sem o filtro, trocar o id na URL leria o endereço de outro cliente (IDOR).
 */

const toDTO = (a: {
  id: string
  label: string | null
  recipient: string
  zipCode: string
  street: string
  number: string
  complement: string | null
  district: string
  city: string
  state: string
  country: string
  isDefault: boolean
}): Address => ({
  id: a.id,
  label: a.label,
  recipient: a.recipient,
  zipCode: a.zipCode,
  street: a.street,
  number: a.number,
  complement: a.complement,
  district: a.district,
  city: a.city,
  state: a.state,
  country: a.country,
  isDefault: a.isDefault,
})

const SELECT = {
  id: true,
  label: true,
  recipient: true,
  zipCode: true,
  street: true,
  number: true,
  complement: true,
  district: true,
  city: true,
  state: true,
  country: true,
  isDefault: true,
}

export const listAddresses = async (customerId: string): Promise<Address[]> => {
  const rows = await prisma.address.findMany({
    where: { customerId },
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    select: SELECT,
  })
  return rows.map(toDTO)
}

/** Um endereço do cliente, com posse pelo customerId (o checkout usa no snapshot). */
export const getAddress = async (customerId: string, id: string): Promise<Address> => {
  const row = await prisma.address.findFirst({ where: { id, customerId }, select: SELECT })
  if (!row) throw notFound('Endereço')
  return toDTO(row)
}

export const createAddress = async (
  customerId: string,
  input: CreateAddressInput,
): Promise<Address> => {
  // Primeiro endereço vira default automaticamente; sem isso o cliente teria um
  // endereço e nenhum padrão, e o checkout não teria o que pré-selecionar.
  const count = await prisma.address.count({ where: { customerId } })
  const makeDefault = input.isDefault || count === 0

  const created = await prisma.$transaction(async (tx) => {
    if (makeDefault) {
      // Só um default por cliente: zera os outros antes.
      await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } })
    }
    return tx.address.create({
      data: {
        customerId,
        label: input.label ?? null,
        recipient: input.recipient,
        zipCode: input.zipCode,
        street: input.street,
        number: input.number,
        complement: input.complement ?? null,
        district: input.district,
        city: input.city,
        state: input.state,
        isDefault: makeDefault,
      },
      select: SELECT,
    })
  })

  return toDTO(created)
}

export const updateAddress = async (
  customerId: string,
  id: string,
  input: UpdateAddressInput,
): Promise<Address> => {
  // Confirma a posse ANTES de qualquer escrita — o where inclui customerId.
  const current = await prisma.address.findFirst({
    where: { id, customerId },
    select: { id: true },
  })
  if (!current) throw notFound('Endereço')

  const updated = await prisma.$transaction(async (tx) => {
    if (input.isDefault === true) {
      await tx.address.updateMany({ where: { customerId }, data: { isDefault: false } })
    }

    const data: Record<string, unknown> = {}
    for (const key of [
      'label',
      'recipient',
      'zipCode',
      'street',
      'number',
      'complement',
      'district',
      'city',
      'state',
      'isDefault',
    ] as const) {
      if (input[key] !== undefined) data[key] = input[key]
    }

    return tx.address.update({ where: { id }, data, select: SELECT })
  })

  return toDTO(updated)
}

export const deleteAddress = async (customerId: string, id: string): Promise<void> => {
  // deleteMany com customerId no where: um id de outro cliente simplesmente não
  // casa (0 linhas), em vez de apagar o endereço alheio.
  const { count } = await prisma.address.deleteMany({ where: { id, customerId } })
  if (count === 0) throw notFound('Endereço')

  // Se o apagado era o default e sobrou algum, promove o mais antigo — o cliente
  // nunca fica sem padrão tendo endereços.
  const remaining = await prisma.address.findFirst({
    where: { customerId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, isDefault: true },
  })
  if (remaining && !(await prisma.address.count({ where: { customerId, isDefault: true } }))) {
    await prisma.address.update({ where: { id: remaining.id }, data: { isDefault: true } })
  }
}

/** Consulta de CEP para autopreenchimento. Delega à integração; não é do cliente. */
export const lookupAddressByCep = (zipCode: string): Promise<CepLookup> => lookupCep(zipCode)
