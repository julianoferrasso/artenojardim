import { z } from 'zod'

/**
 * O que o CLIENTE pode alterar de si mesmo, pela área da conta.
 *
 * Note o que NÃO está aqui, e por quê:
 *   - `email`     — trocar exige reverificar a caixa nova; é outro fluxo.
 *   - `document`  — o CPF vai para o pedido e não pode ser reescrito depois.
 *   - `emailVerified` — estado, não preferência.
 */
export const updateCustomerProfileSchema = z
  .object({
    name: z.string().min(2, 'Informe seu nome').max(120).trim().optional(),
    /// Aceita máscara: quem digita "(51) 99999-9999" não deve ver erro. A
    /// normalização, se um dia importar, é do lado de quem consome.
    phone: z.string().max(20).nullable().optional(),
    acceptsMarketing: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  })

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>
