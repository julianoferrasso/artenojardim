import { meRequest } from './client.js'

/**
 * Cotação de frete: POST /api/v2/me/shipment/calculate.
 *
 * Recebe os produtos JÁ nas unidades do Melhor Envio (cm, kg, reais) — a
 * conversão a partir das nossas (mm, g, centavos) é feita no domain/packing, puro
 * e testável. Aqui só transporta e devolve a resposta crua, tipada.
 */

export type MeProduct = {
  id: string
  width: number
  height: number
  length: number
  weight: number
  insurance_value: number
  quantity: number
}

export type MeCalculateOption = {
  id: number
  name: string
  price?: string
  delivery_time?: number
  company?: { id: number; name: string }
  /** Preenchido quando o serviço não atende (ex.: dimensão fora do limite). */
  error?: string | null
}

export const calculateShipping = (args: {
  fromZip: string
  toZip: string
  products: MeProduct[]
}): Promise<MeCalculateOption[]> =>
  meRequest<MeCalculateOption[]>('/api/v2/me/shipment/calculate', {
    method: 'POST',
    body: JSON.stringify({
      from: { postal_code: args.fromZip },
      to: { postal_code: args.toZip },
      products: args.products,
    }),
  })
