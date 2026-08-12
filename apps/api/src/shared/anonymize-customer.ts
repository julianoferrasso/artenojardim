import { prisma } from '../config/prisma.js'
import { revokeAllSessions } from './refresh-tokens.js'

/**
 * Destruição do dado pessoal de um cliente (LGPD), preservando os pedidos: o
 * histórico é obrigação fiscal, e o pedido já guarda nome e endereço em snapshot
 * próprio. Irreversível.
 *
 * Vive em `shared/` porque tem DUAS portas com autorizações diferentes: o staff
 * (`admin-customers`, exige ADMIN) e o próprio cliente (`customer-profile`,
 * exige a senha atual). O efeito é idêntico; o que muda é quem pode pedir e qual
 * evento vai para a auditoria — e isso fica em cada chamador.
 *
 * Sem auditoria aqui de propósito: o `action` correto depende da porta.
 */
export const anonymizeCustomerData = async (customerId: string): Promise<void> => {
  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        name: 'Cliente removido',
        // O e-mail continua sendo único por loja (@@unique([storeId, email])):
        // um literal fixo colidiria no segundo cliente anonimizado.
        email: `anonimizado+${customerId}@invalido.local`,
        phone: null,
        document: null,
        documentType: null,
        birthDate: null,
        passwordHash: null,
        // Um pedido de troca pendente não pode sobreviver à conta: o link viraria
        // um caminho para reanimar um e-mail que a anonimização acabou de apagar.
        pendingEmail: null,
        pendingName: null,
        acceptsMarketing: false,
        deletedAt: new Date(),
      },
    })

    await tx.address.deleteMany({ where: { customerId } })
    await tx.customerProductView.deleteMany({ where: { customerId } })
    await tx.customerToken.deleteMany({ where: { customerId } })
    // Na mesma transação: conta anonimizada com sessão viva ainda abre os
    // pedidos, porque o token carrega o id.
    await revokeAllSessions({ kind: 'customer', id: customerId }, tx)
  })
}
