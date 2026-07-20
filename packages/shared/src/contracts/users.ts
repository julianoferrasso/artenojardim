import { z } from 'zod'
import { userRoleSchema } from '../constants/enums.js'
import {
  emailSchema,
  passwordSchema,
  paginationQuerySchema,
  sortQuerySchema,
} from './common.js'

/**
 * Usuários de STAFF. Prefixo `staff` para não colidir com `authUserSchema`
 * (sessão) nem com o mundo de cliente — o barrel de contracts é `export *` e
 * nome repetido quebra o build.
 *
 * `passwordHash` não aparece em lugar nenhum deste arquivo, e é a regra que
 * importa: o DTO de saída é a única definição de "o que sai", e ele não tem
 * como vazar o que não declara.
 */
export const staffUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type StaffUser = z.infer<typeof staffUserSchema>

const staffNameSchema = z.string().min(2, 'Informe o nome').max(120).trim()

/**
 * Criação: o dono define a senha na hora. Sem convite por e-mail — não existe
 * fluxo de convite para staff, e inventar um agora seria uma feature a mais.
 */
export const createStaffUserSchema = z.object({
  name: staffNameSchema,
  email: emailSchema,
  password: passwordSchema,
  /** Sem `.default()`: escolher o cargo de um funcionário é decisão explícita. */
  role: userRoleSchema,
})

export type CreateStaffUserInput = z.infer<typeof createStaffUserSchema>

/**
 * Edição NÃO tem `password` (endpoint próprio, que derruba sessões) nem
 * `isActive` (transição própria, que também derruba sessões). Um campo opcional
 * aqui viraria, algum dia, um checkbox no formulário que desativa alguém sem
 * revogar nada — exatamente o bug que a separação evita.
 */
export const updateStaffUserSchema = z
  .object({
    name: staffNameSchema.optional(),
    email: emailSchema.optional(),
    role: userRoleSchema.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  })

export type UpdateStaffUserInput = z.infer<typeof updateStaffUserSchema>

export const resetStaffPasswordSchema = z.object({ password: passwordSchema })

export type ResetStaffPasswordInput = z.infer<typeof resetStaffPasswordSchema>

export const STAFF_USER_SORTABLE = ['name', 'email', 'createdAt', 'lastLoginAt'] as const

export const STAFF_USER_STATUS = ['active', 'inactive', 'all'] as const
export const staffUserStatusSchema = z.enum(STAFF_USER_STATUS)
export type StaffUserStatus = z.infer<typeof staffUserStatusSchema>

/**
 * `status` como enum e NÃO `isActive: z.coerce.boolean()`: em query string tudo
 * é texto, e `Boolean('false') === true` — o filtro "inativos" traria os ativos.
 * O default é `active`: a lista abre mostrando quem trabalha aqui hoje.
 */
export const staffUserListQuerySchema = paginationQuerySchema.extend({
  q: z.string().max(120).optional(),
  role: userRoleSchema.optional(),
  status: staffUserStatusSchema.default('active'),
  sort: sortQuerySchema(STAFF_USER_SORTABLE),
})

/**
 * Dois tipos: quem CHAMA omite os campos com default, quem RECEBE já passou pelo
 * validate() e tem tudo preenchido.
 */
export type StaffUserListQueryInput = z.input<typeof staffUserListQuerySchema>
export type StaffUserListQuery = z.output<typeof staffUserListQuerySchema>
