import { z } from 'zod'
import { emailSchema, moneySchema, paginationQuerySchema, sortQuerySchema } from './common.js'

/**
 * Contratos da tela de clientes do admin.
 *
 * Tudo prefixado com `adminCustomer*` porque o barrel de contracts é `export *`
 * e nome repetido quebra o build do pacote inteiro.
 */

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

/**
 * Métricas de compra. Em CENTAVOS e restritas a pedidos PAGOS: contar pedido
 * pendente faria "gastou R$ 4.000" mentir para quem decide quem é cliente bom.
 * É o mesmo recorte do dashboard — dois números diferentes para a mesma pergunta
 * em duas telas seria pior que não ter o número.
 */
export const adminCustomerStatsSchema = z.object({
  ordersCount: z.number().int().nonnegative(),
  totalSpent: moneySchema,
  averageTicket: moneySchema,
  lastOrderAt: z.string().nullable(),
})

export type AdminCustomerStats = z.infer<typeof adminCustomerStatsSchema>

export const adminCustomerListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  emailVerified: z.boolean(),
  acceptsMarketing: z.boolean(),
  lastLoginAt: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  stats: adminCustomerStatsSchema,
})

export type AdminCustomerListItem = z.infer<typeof adminCustomerListItemSchema>

export const adminCustomerAddressSchema = z.object({
  id: z.string(),
  label: z.string().nullable(),
  recipient: z.string(),
  zipCode: z.string(),
  street: z.string(),
  number: z.string(),
  complement: z.string().nullable(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
  isDefault: z.boolean(),
})

export const adminCustomerProductViewSchema = z.object({
  productId: z.string(),
  name: z.string(),
  slug: z.string(),
  count: z.number().int().positive(),
  viewedAt: z.string(),
})

/**
 * Sinais de conta e sessão que o atendimento consulta ANTES de ligar para o
 * cliente. Responde "ela está conseguindo entrar?", que é a pergunta nº 1 do
 * suporte de e-commerce e hoje ninguém consegue ver.
 */
export const adminCustomerActivitySchema = z.object({
  activeSessions: z.number().int().nonnegative(),
  /// Só o user-agent: o IP é dado pessoal sem uso no atendimento.
  lastDevice: z.string().nullable(),
  hasPassword: z.boolean(),
  pendingEmailVerification: z.boolean(),
  openCartItems: z.number().int().nonnegative(),
  openCartUpdatedAt: z.string().nullable(),
})

export type AdminCustomerActivity = z.infer<typeof adminCustomerActivitySchema>

/**
 * `document` (CPF) só aqui, nunca na listagem: dado sensível não precisa
 * trafegar em lote para uma tela que mostra 24 linhas — e a busca por CPF
 * funciona sem devolvê-lo.
 */
export const adminCustomerSchema = adminCustomerListItemSchema.extend({
  document: z.string().nullable(),
  documentType: z.string().nullable(),
  birthDate: z.string().nullable(),
  updatedAt: z.string(),
  addresses: z.array(adminCustomerAddressSchema),
  recentViews: z.array(adminCustomerProductViewSchema),
  activity: adminCustomerActivitySchema,
  /// Inscrição na newsletter, cruzada por E-MAIL (as tabelas não têm relação).
  /// É informativo: são consentimentos distintos e não se sincronizam.
  newsletter: z
    .object({ subscribedAt: z.string(), unsubscribedAt: z.string().nullable() })
    .nullable(),
})

export type AdminCustomer = z.infer<typeof adminCustomerSchema>

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Sem `totalSpent`/`ordersCount` de propósito: são agregados, não colunas.
 * Ordenar por eles exigiria SQL cru ou carregar a base inteira em memória.
 */
export const ADMIN_CUSTOMER_SORTABLE = ['name', 'createdAt', 'lastLoginAt'] as const

export const ADMIN_CUSTOMER_STATUSES = ['active', 'deleted', 'all'] as const
export const adminCustomerStatusSchema = z.enum(ADMIN_CUSTOMER_STATUSES)
export type AdminCustomerStatus = z.infer<typeof adminCustomerStatusSchema>

/**
 * Filtro booleano como enum de TRÊS valores, nunca `z.coerce.boolean()`: em
 * query string tudo é texto e `Boolean('false') === true` — o filtro "não aceita
 * marketing" traria justamente quem aceita.
 */
export const ADMIN_CUSTOMER_TRISTATE = ['all', 'yes', 'no'] as const
export const adminCustomerTriStateSchema = z.enum(ADMIN_CUSTOMER_TRISTATE).default('all')
export type AdminCustomerTriState = z.infer<typeof adminCustomerTriStateSchema>

export const adminCustomerListQuerySchema = paginationQuerySchema.extend({
  /// Nome, e-mail, CPF ou telefone.
  q: z.string().max(120).optional(),
  status: adminCustomerStatusSchema.default('active'),
  verified: adminCustomerTriStateSchema,
  marketing: adminCustomerTriStateSchema,
  sort: sortQuerySchema(ADMIN_CUSTOMER_SORTABLE),
})

export type AdminCustomerListQuery = z.infer<typeof adminCustomerListQuerySchema>

/**
 * O que o STAFF pode corrigir. `email` está aqui porque o cliente que digitou
 * errado no guest checkout não consegue receber nada — mas trocar o e-mail NÃO
 * reverifica a conta: quem confirma a caixa é o dono dela.
 */
export const updateAdminCustomerSchema = z
  .object({
    name: z.string().min(2, 'Informe o nome').max(120).trim().optional(),
    email: emailSchema.optional(),
    phone: z.string().max(20).nullable().optional(),
    acceptsMarketing: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((field) => field !== undefined), {
    message: 'Informe ao menos um campo para alterar',
  })

export type UpdateAdminCustomerInput = z.infer<typeof updateAdminCustomerSchema>
