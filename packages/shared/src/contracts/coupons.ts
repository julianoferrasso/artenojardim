import { z } from 'zod'
import { couponTypeSchema } from '../constants/enums.js'
import { moneySchema } from './common.js'

/**
 * Formato HTTP dos cupons. O admin valida o formulário com estes mesmos schemas.
 *
 * Um cupom por pedido, sem acumular. O desconto de PERCENTAGE e FIXED_AMOUNT
 * incide só sobre os produtos; FREE_SHIPPING zera só o frete. O valor que a
 * loja mostra é prévia — o checkout recalcula tudo do banco no confirm.
 */

/**
 * Normalizado para MAIÚSCULO: o cliente digita "bemvindo10" e acha o cupom.
 * Só letras sem acento, números, - e _, porque o código vai parar em post de
 * Instagram e em e-mail, onde acento e espaço viram dúvida de digitação.
 */
export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(3, 'O código precisa de ao menos 3 caracteres')
  .max(30, 'O código pode ter até 30 caracteres')
  .regex(/^[A-Z0-9_-]+$/, 'Use só letras, números, - ou _')

/** Dia de calendário (input type=date). Vira instante no fuso de São Paulo no service. */
const couponDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida')

/*
 * Sem .default() de propósito: no Zod 4, um default sobrevive ao partial() e
 * reescreve o campo em silêncio. O formulário manda o cupom inteiro sempre.
 * `null` = sem limite / sem data.
 */
const couponFieldsSchema = z.object({
  type: couponTypeSchema,
  /** PERCENTAGE: 1–100. FIXED_AMOUNT: centavos. FREE_SHIPPING: ignorado (vira 0). */
  value: z.number().int().nonnegative(),
  minOrderValue: moneySchema.nullable(),
  usageLimit: z.number().int().positive('Use um número maior que zero').nullable(),
  usageLimitPerCustomer: z.number().int().positive('Use um número maior que zero').nullable(),
  startsAt: couponDaySchema.nullable(),
  endsAt: couponDaySchema.nullable(),
  isActive: z.boolean(),
})

type CouponFields = z.infer<typeof couponFieldsSchema>

const checkCouponFields = (data: CouponFields, ctx: z.RefinementCtx): void => {
  if (data.type === 'PERCENTAGE' && (data.value < 1 || data.value > 100)) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'A porcentagem vai de 1 a 100' })
  }
  if (data.type === 'FIXED_AMOUNT' && data.value < 1) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Informe o valor do desconto' })
  }
  // YYYY-MM-DD compara certo como string.
  if (data.startsAt && data.endsAt && data.endsAt < data.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'O fim não pode ser antes do início' })
  }
}

export const createCouponSchema = couponFieldsSchema
  .extend({ code: couponCodeSchema })
  .superRefine(checkCouponFields)

export type CreateCouponInput = z.infer<typeof createCouponSchema>

/** O código não muda depois de criado: errou a digitação, exclui (se nunca usado) e cria outro. */
export const updateCouponSchema = couponFieldsSchema.superRefine(checkCouponFields)

export type UpdateCouponInput = z.infer<typeof updateCouponSchema>

/** A visão do STAFF. Datas como instantes ISO; o admin volta ao dia com spDayKey. */
export const couponSchema = z.object({
  id: z.string(),
  code: z.string(),
  type: couponTypeSchema,
  value: z.number().int(),
  minOrderValue: z.number().int().nullable(),
  usageLimit: z.number().int().nullable(),
  /** Pedidos não cancelados que usaram o cupom. */
  usageCount: z.number().int(),
  usageLimitPerCustomer: z.number().int().nullable(),
  startsAt: z.string().nullable(),
  endsAt: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type Coupon = z.infer<typeof couponSchema>

export const validateCouponSchema = z.object({ code: couponCodeSchema })

export type ValidateCouponInput = z.infer<typeof validateCouponSchema>

/**
 * Cupom aceito para o carrinho atual. `discountCents` é o desconto nos produtos;
 * em FREE_SHIPPING é 0 e a loja mostra como desconto o frete escolhido.
 */
export const appliedCouponSchema = z.object({
  code: z.string(),
  type: couponTypeSchema,
  discountCents: z.number().int(),
})

export type AppliedCoupon = z.infer<typeof appliedCouponSchema>
