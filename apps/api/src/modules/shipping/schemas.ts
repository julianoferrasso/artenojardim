import { z } from 'zod'

/**
 * Corpo do callback OAuth. Não é contrato de front público (o fluxo é
 * store→api, interno), por isso vive aqui e não em shared/contracts.
 */
export const oauthCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
})

export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>
