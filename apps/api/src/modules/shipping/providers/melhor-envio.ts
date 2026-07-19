import type { ShippingOption } from '@ecommerce/shared/contracts'
import { calculateShipping } from '../../../integrations/melhor-envio/index.js'
import type { ShippingProvider } from '../types.js'

/**
 * Adapta o Melhor Envio ao contrato ShippingProvider. É FINO de propósito: só
 * traduz (pacote neutro → produto do ME; opção do ME → ShippingOption). O HTTP,
 * o OAuth e o retry moram em integrations/. Aqui não há regra de negócio.
 */

const toCents = (reais: string): number => Math.round(Number.parseFloat(reais) * 100)

export const melhorEnvioProvider: ShippingProvider = {
  id: 'melhor-envio',

  quote: async (req) => {
    const raw = await calculateShipping({
      fromZip: req.fromZip,
      toZip: req.toZip,
      products: req.packages.map((p) => ({
        id: p.id,
        weight: p.weightKg,
        length: p.lengthCm,
        width: p.widthCm,
        height: p.heightCm,
        insurance_value: p.valueReais,
        quantity: p.quantity,
      })),
    })

    // O ME devolve TODOS os serviços; os indisponíveis vêm com `error` e sem
    // preço (dimensão fora do limite, transportadora sem cobertura). Descarta.
    return raw
      .filter((o): o is typeof o & { price: string } => !o.error && typeof o.price === 'string')
      .map(
        (o): ShippingOption => ({
          id: String(o.id),
          carrier: o.company?.name ?? '—',
          service: o.name,
          priceCents: toCents(o.price),
          deliveryDays: o.delivery_time ?? 0,
        }),
      )
  },
}
