import { prisma } from '../../config/prisma.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { availableOf } from '../inventory/domain/availability.js'

/**
 * Registra o pedido de "Avise-me quando chegar". Silencioso por desenho — o
 * controller responde 204 de qualquer jeito:
 *  - variação de outra loja, aposentada ou de produto fora do ar: ignora;
 *  - variação com estoque: ignora (a página que mostrou o formulário estava
 *    velha, e o cliente pode comprar agora);
 *  - já inscrito: o unique (variação, e-mail) absorve o clique repetido.
 *
 * Quem envia o aviso é `notifyBackInStock`, chamado por `afterStockChange`
 * quando a variação sai do zero.
 */
export const requestStockNotification = async (variantId: string, email: string): Promise<void> => {
  const storeId = getActiveStoreId()

  const variant = await prisma.productVariant.findFirst({
    where: { id: variantId, storeId, isActive: true, product: { status: 'ACTIVE', deletedAt: null } },
    select: { level: { select: { onHand: true, reserved: true } } },
  })
  if (!variant || availableOf(variant.level) > 0) return

  await prisma.stockNotification.upsert({
    where: { variantId_email: { variantId, email } },
    create: { storeId, variantId, email },
    update: {},
  })
}
