import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'

/**
 * Upsert idempotente por (loja, e-mail): inscrever de novo não duplica, e quem
 * havia saído volta a receber (zera `unsubscribedAt`). O e-mail já chega
 * normalizado (trim + lowercase) pelo schema do contrato.
 */
export const subscribe = async (email: string): Promise<void> => {
  const storeId = getActiveStoreId()

  await prisma.newsletterSubscriber.upsert({
    where: { storeId_email: { storeId, email } },
    create: { storeId, email },
    update: { unsubscribedAt: null },
  })
}

/**
 * Descadastro pelo link do rodapé. Desliga os DOIS consentimentos, porque o
 * mesmo endereço pode ter conta na loja E inscrição no rodapé — e quem clicou em
 * "não quero mais" não está distinguindo origem nenhuma. Desligar só um lado
 * faria o cliente continuar recebendo depois de pedir para parar.
 *
 * `updateMany` e não `update`: quando o endereço não existe num dos lados, o
 * resultado é `count: 0` em vez de exceção. Isso torna a operação idempotente,
 * que é exatamente o que um link clicado duas vezes exige.
 *
 * Sem auditoria: a regra audita ação de STAFF. Esta é do cliente sobre si mesmo.
 */
export const unsubscribeByEmail = async (email: string): Promise<void> => {
  const storeId = getActiveStoreId()
  const now = new Date()

  await prisma.$transaction([
    prisma.newsletterSubscriber.updateMany({
      where: { storeId, email, unsubscribedAt: null },
      data: { unsubscribedAt: now },
    }),
    prisma.customer.updateMany({
      where: { storeId, email, acceptsMarketing: true },
      data: { acceptsMarketing: false },
    }),
  ])
}
