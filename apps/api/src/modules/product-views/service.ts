import { spDayKey, spDayAsDateColumn } from '@ecommerce/shared/utils'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { getActiveStoreId } from '../../shared/store-context.js'

/**
 * Registra uma visita ao produto. Slug desconhecido é ignorado em silêncio: a
 * loja não deve descobrir se um produto existe pelo status HTTP, e um beacon que
 * falha não pode quebrar a página.
 *
 * Grava em DOIS lugares com propósitos distintos:
 *   - `ProductView`  — rollup por dia, SEMPRE, inclusive anônimo. É o número de
 *     tráfego que o dashboard soma.
 *   - `CustomerProductView` — só quando há cliente identificado. É o "o que esta
 *     pessoa andou olhando" da tela de clientes.
 */
export const trackProductView = async (slug: string, customerId?: string): Promise<void> => {
  const storeId = getActiveStoreId()

  const product = await prisma.product.findFirst({
    where: { storeId, slug, status: 'ACTIVE', deletedAt: null },
    select: { id: true },
  })
  if (!product) return

  // Trunca no dia BRASILEIRO — a coluna é @db.Date. Sem truncar, cada milissegundo
  // viraria uma linha distinta e o rollup deixaria de agregar; truncando em UTC
  // (como era antes), toda visita entre 21h e meia-noite ia para o dia seguinte.
  const today = spDayAsDateColumn(spDayKey(new Date()))

  const rollup = prisma.productView.upsert({
    where: { storeId_productId_date: { storeId, productId: product.id, date: today } },
    create: { storeId, productId: product.id, date: today, count: 1 },
    update: { count: { increment: 1 } },
  })

  // Conta anonimizada NÃO volta a acumular histórico: a anonimização apaga as
  // linhas e revoga as sessões, mas o access token já emitido vive mais 15min e
  // continuaria gravando — desfazendo, aos poucos, uma exclusão irreversível.
  const activeCustomerId =
    customerId &&
    (await prisma.customer.count({ where: { id: customerId, storeId, deletedAt: null } })) > 0
      ? customerId
      : undefined

  const nominal = activeCustomerId
    ? prisma.customerProductView.upsert({
        where: {
          customerId_productId_date: { customerId: activeCustomerId, productId: product.id, date: today },
        },
        create: { storeId, customerId: activeCustomerId, productId: product.id, date: today },
        update: { count: { increment: 1 }, viewedAt: new Date() },
      })
    : null

  // allSettled e não transação: são duas métricas independentes, e uma não deve
  // desfazer a outra. O `customerId` vem do JWT e pode apontar para um cliente já
  // apagado — a violação de chave estrangeira que isso causaria viraria um 500
  // num beacon, que é justamente o que não pode acontecer.
  const results = await Promise.allSettled(nominal ? [rollup, nominal] : [rollup])

  for (const result of results) {
    if (result.status === 'rejected') {
      logger.warn({ err: result.reason, productId: product.id }, 'falha ao registrar visita')
    }
  }
}
