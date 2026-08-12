import type { AuthCustomer, UpdateCustomerProfileInput } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { unauthorized } from '../../shared/errors.js'
import { toAuthCustomer } from '../customer-auth/service.js'

/**
 * Perfil do próprio cliente. Módulo separado do `customer-auth` de propósito:
 * aquele cuida de SESSÃO e credencial; aqui é o dado cadastral que o cliente
 * edita sozinho.
 *
 * Sem auditoria: a regra do projeto audita ação de STAFF que muda estado. Cliente
 * mexendo no próprio cadastro não é isso.
 */

const SELECT = {
  id: true,
  name: true,
  email: true,
  emailVerifiedAt: true,
  acceptsMarketing: true,
} as const

export const updateCustomerProfile = async (
  customerId: string,
  input: UpdateCustomerProfileInput,
): Promise<AuthCustomer> => {
  // updateMany e não update: o `where` composto com storeId + deletedAt é a
  // verificação de posse. Um `update({ where: { id } })` alteraria o cliente
  // mesmo que ele fosse de outra loja ou já estivesse apagado.
  const { count } = await prisma.customer.updateMany({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.acceptsMarketing !== undefined
        ? { acceptsMarketing: input.acceptsMarketing }
        : {}),
    },
  })

  if (count === 0) throw unauthorized('Sessão inválida')

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: SELECT,
  })

  return toAuthCustomer(customer)
}
