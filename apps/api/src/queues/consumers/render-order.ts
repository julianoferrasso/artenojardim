import type { EmailContent } from '../../integrations/email/index.js'
import { renderOrderConfirmation } from '../../integrations/email/index.js'
import { getEmailBranding } from '../../shared/email-branding.js'

/**
 * O pedido chega pronto na mensagem, resolvido pelo orquestrador `order.paid`.
 * O consumidor de e-mail não consulta o banco: se o pedido fosse relido aqui, um
 * cancelamento entre a publicação e o envio mudaria o conteúdo do e-mail de
 * confirmação — que é o registro do que aconteceu naquele instante.
 */
export type OrderEmailData = {
  orderNumber: number
  customerName: string
  orderUrl: string
  items: Array<{ label: string; qty: number; price: string }>
  totals: Array<{ label: string; value: string; strong?: boolean }>
  shippingAddress: string
  estimatedDelivery: string | null
}

export const renderOrderEmail = async (data: OrderEmailData): Promise<EmailContent> => {
  const branding = await getEmailBranding()

  return renderOrderConfirmation({
    branding,
    orderNumber: data.orderNumber,
    customerName: data.customerName,
    orderUrl: data.orderUrl,
    items: data.items,
    totals: data.totals,
    shippingAddress: data.shippingAddress,
    estimatedDelivery: data.estimatedDelivery,
  })
}
