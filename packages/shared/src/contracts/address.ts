import { z } from 'zod'
import { zipCodeSchema, brStateSchema } from '../constants/brazil.js'

/**
 * Contratos de endereço. O CEP entra pelo zipCodeSchema (normaliza para 8
 * dígitos, sem hífen — a máscara é da UI, o dado é limpo). A UF valida contra as
 * 27 do Brasil.
 */

export const createAddressSchema = z.object({
  label: z.string().max(40).optional(),
  recipient: z.string().min(1, 'Informe quem recebe').max(120).trim(),
  zipCode: zipCodeSchema,
  street: z.string().min(1, 'Informe a rua').max(200).trim(),
  number: z.string().min(1, 'Informe o número').max(20).trim(),
  complement: z.string().max(100).optional(),
  district: z.string().min(1, 'Informe o bairro').max(120).trim(),
  city: z.string().min(1, 'Informe a cidade').max(120).trim(),
  state: brStateSchema,
  isDefault: z.boolean().optional(),
})

export type CreateAddressInput = z.infer<typeof createAddressSchema>

export const updateAddressSchema = createAddressSchema.partial()
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>

export const addressSchema = z.object({
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
  country: z.string(),
  isDefault: z.boolean(),
})

export type Address = z.infer<typeof addressSchema>

/** Resposta da consulta de CEP (autopreenchimento). */
export const cepLookupSchema = z.object({
  zipCode: z.string(),
  street: z.string(),
  district: z.string(),
  city: z.string(),
  state: z.string(),
})

export type CepLookup = z.infer<typeof cepLookupSchema>
