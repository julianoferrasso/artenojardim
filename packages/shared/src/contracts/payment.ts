import { z } from 'zod'

/**
 * Pagamento de um pedido, do ponto de vista do front. O backend cria (ou reusa)
 * um PaymentIntent no Stripe e devolve o `clientSecret` que o Payment Element
 * consome. O front NÃO decide valor: o amount saiu do total do pedido, no banco.
 *
 * `status` é o status cru do PaymentIntent do Stripe (requires_payment_method,
 * processing, succeeded, ...): a tela decide por ele se renderiza o Element,
 * mostra o QR do Pix ou já confirma o sucesso. A VERDADE do pagamento continua
 * sendo o webhook — este status é só para guiar a UI.
 */
export const orderPaymentSchema = z.object({
  paymentIntentId: z.string(),
  clientSecret: z.string(),
  publishableKey: z.string(),
  status: z.string(),
})

export type OrderPayment = z.infer<typeof orderPaymentSchema>
