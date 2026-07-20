import { spDayKey, spDayAsDateColumn } from '@ecommerce/shared/utils'
import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'

/**
 * Registra uma visita ao produto, agregada por DIA. Slug desconhecido é ignorado
 * em silêncio: a loja não deve descobrir se um produto existe pelo status HTTP, e
 * um beacon que falha não pode quebrar a página. Idempotente por (loja, produto,
 * dia) — o upsert incrementa o contador do dia corrente.
 */
export const trackProductView = async (slug: string): Promise<void> => {
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

  await prisma.productView.upsert({
    where: { storeId_productId_date: { storeId, productId: product.id, date: today } },
    create: { storeId, productId: product.id, date: today, count: 1 },
    update: { count: { increment: 1 } },
  })
}
