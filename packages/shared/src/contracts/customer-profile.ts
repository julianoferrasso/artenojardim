import { z } from 'zod'

/**
 * O que o CLIENTE pode alterar de si mesmo, pela área da conta.
 *
 * Note o que NÃO está aqui, e por quê:
 *   - `email`     — trocar exige reverificar a caixa nova; vive em
 *                   `customer-account.ts`, junto das outras trocas de credencial.
 *   - `emailVerified` — estado, não preferência.
 */
export const updateCustomerProfileSchema = z
  .object({
    name: z.string().min(2, 'Informe seu nome').max(120).trim().optional(),
    /// Aceita máscara: quem digita "(51) 99999-9999" não deve ver erro. A
    /// normalização, se um dia importar, é do lado de quem consome.
    phone: z.string().max(20).nullable().optional(),
    /// CPF/CNPJ, corrigível SÓ enquanto não houver pedido — depois vira dado
    /// fiscal e o service recusa com DOCUMENT_LOCKED. Quem digitou errado no
    /// checkout não tinha, até aqui, nenhum caminho de correção.
    document: z.string().min(11).max(18).nullable().optional(),
    acceptsMarketing: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  })

export type UpdateCustomerProfileInput = z.infer<typeof updateCustomerProfileSchema>
