import { z } from 'zod'
import { publicFlagsSchema, type PublicFlags } from '@ecommerce/shared/contracts'
import { prisma } from '../config/prisma.js'
import { getActiveStoreId } from './store-context.js'

/**
 * Settings tipados por chave. Cada chave declara seu schema e seu default —
 * ler uma chave nunca devolve `unknown`, e nunca devolve `undefined`.
 *
 * Cache em memória: uma instância, um Map. Redis resolveria cache compartilhado
 * entre instâncias — e há uma instância. Quando houver uma segunda VPS, este
 * arquivo muda por dentro e nada mais muda.
 */

export const SETTING_SCHEMAS = {
  feature_flags: {
    schema: publicFlagsSchema,
    default: { reviews: false, wishlist: false, giftCards: false } satisfies PublicFlags,
  },
  /** TTL da reserva de estoque por método. Boleto compensa em até 3 dias úteis. */
  reservation_ttl_minutes: {
    schema: z.object({ CARD: z.number().int(), PIX: z.number().int(), BOLETO: z.number().int() }),
    default: { CARD: 30, PIX: 60, BOLETO: 4320 },
  },
  shipping: {
    schema: z.object({
      freeShippingAboveCents: z.number().int().nonnegative().nullable(),
      additionalDays: z.number().int().nonnegative(),
      enabledServices: z.array(z.string()),
    }),
    default: { freeShippingAboveCents: null, additionalDays: 2, enabledServices: [] },
  },
  /**
   * Estado do OAuth do Melhor Envio. `state` é o anti-CSRF do fluxo (existe só
   * entre o connect e o callback). Os tokens ficam aqui — no banco, nunca em log
   * nem no código. O access token é curto; o refresh renova sozinho.
   */
  melhor_envio_oauth: {
    schema: z.object({
      state: z.string().nullable(),
      accessToken: z.string().nullable(),
      refreshToken: z.string().nullable(),
      /** epoch em ms de expiração do access token. */
      expiresAt: z.number().int().nullable(),
    }),
    default: { state: null, accessToken: null, refreshToken: null, expiresAt: null },
  },
} as const

type SettingKey = keyof typeof SETTING_SCHEMAS
type SettingValue<K extends SettingKey> = z.infer<(typeof SETTING_SCHEMAS)[K]['schema']>

const cache = new Map<string, unknown>()

export const getSetting = async <K extends SettingKey>(key: K): Promise<SettingValue<K>> => {
  const cached = cache.get(key)
  if (cached !== undefined) return cached as SettingValue<K>

  const row = await prisma.setting.findUnique({
    where: { storeId_key: { storeId: getActiveStoreId(), key } },
    select: { valueJson: true },
  })

  const spec = SETTING_SCHEMAS[key]
  const parsed = row ? spec.schema.safeParse(row.valueJson) : undefined

  // Valor corrompido no banco cai no default em vez de derrubar a requisição.
  const value = (parsed?.success ? parsed.data : spec.default) as SettingValue<K>

  cache.set(key, value)
  return value
}

export const setSetting = async <K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
): Promise<void> => {
  const parsed = SETTING_SCHEMAS[key].schema.parse(value)

  await prisma.setting.upsert({
    where: { storeId_key: { storeId: getActiveStoreId(), key } },
    create: { storeId: getActiveStoreId(), key, valueJson: parsed as object },
    update: { valueJson: parsed as object },
  })

  cache.set(key, parsed)
}

export const invalidateSettingsCache = (): void => cache.clear()
