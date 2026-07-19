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

  // Trunca no dia em UTC — a coluna é @db.Date. Sem isto, cada milissegundo viraria
  // uma linha distinta e o rollup deixaria de agregar.
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  await prisma.productView.upsert({
    where: { storeId_productId_date: { storeId, productId: product.id, date: today } },
    create: { storeId, productId: product.id, date: today, count: 1 },
    update: { count: { increment: 1 } },
  })
}
