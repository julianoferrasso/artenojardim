import { z } from 'zod'

/**
 * Inscrição na newsletter — pública, anônima. A resposta é sempre 204: não
 * confirmar se o e-mail já existia evita enumeração de inscritos.
 */
export const subscribeNewsletterSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
})

export type SubscribeNewsletterInput = z.infer<typeof subscribeNewsletterSchema>
