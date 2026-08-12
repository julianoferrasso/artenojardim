import { ERROR_CODES, type AuthCustomer, type UpdateCustomerProfileInput } from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { conflict, unauthorized } from '../../shared/errors.js'
import { AUTH_SELECT, toAuthCustomer } from '../customer-auth/service.js'

/**
 * Perfil do próprio cliente. Módulo separado do `customer-auth` de propósito:
 * aquele cuida de SESSÃO e credencial; aqui é o dado cadastral que o cliente
 * edita sozinho.
 *
 * Sem auditoria: a regra do projeto audita ação de STAFF que muda estado. Cliente
 * mexendo no próprio cadastro não é isso. As trocas de CREDENCIAL (senha, e-mail)
 * são a exceção e vivem em `credentials.ts`, auditadas — por isso não estão aqui.
 */

export const updateCustomerProfile = async (
  customerId: string,
  input: UpdateCustomerProfileInput,
): Promise<AuthCustomer> => {
  // O CPF congela no primeiro pedido: dali em diante ele é dado fiscal de uma
  // venda emitida, não cadastro. Só consultamos quando o campo veio no corpo —
  // um COUNT em toda troca de telefone seria desperdício.
  if (input.document !== undefined) {
    const orders = await prisma.order.count({ where: { customerId } })
    if (orders > 0) {
      throw conflict(
        'O CPF não pode mais ser alterado porque já existem pedidos emitidos com ele. Fale conosco se estiver errado.',
        ERROR_CODES.DOCUMENT_LOCKED,
      )
    }
  }

  // updateMany e não update: o `where` composto com storeId + deletedAt é a
  // verificação de posse. Um `update({ where: { id } })` alteraria o cliente
  // mesmo que ele fosse de outra loja ou já estivesse apagado.
  const { count } = await prisma.customer.updateMany({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.document !== undefined ? { document: input.document } : {}),
      ...(input.acceptsMarketing !== undefined
        ? { acceptsMarketing: input.acceptsMarketing }
        : {}),
    },
  })

  if (count === 0) throw unauthorized('Sessão inválida')

  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: AUTH_SELECT,
  })

  return toAuthCustomer(customer)
}
