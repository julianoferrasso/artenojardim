import { z } from 'zod'

/**
 * "Avise-me quando chegar": pública, sem login — exigir conta para deixar um
 * e-mail é o que faz a maioria desistir. A resposta é sempre 204: não confirmar
 * nada (e-mail já inscrito, variação inexistente, estoque) evita que o
 * formulário vire oráculo.
 */
export const createStockNotificationSchema = z.object({
  variantId: z.string().min(1).max(64),
  email: z.string().trim().toLowerCase().email().max(254),
})

export type CreateStockNotificationInput = z.infer<typeof createStockNotificationSchema>
