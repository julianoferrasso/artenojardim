import type { ShippingOption } from '@ecommerce/shared/contracts'

/**
 * Contrato de transportadora — a porta aberta do frete.
 *
 * Existe porque há evidência concreta de um segundo caso (Correios direto,
 * Jadlog, Kangu): sem a interface, "adicionar transportadora" viraria caçar
 * chamadas ao Melhor Envio espalhadas por checkout, orders e workers. Com ela,
 * criar um provider e registrá-lo basta — o resto do sistema não muda.
 *
 * Tipos NEUTROS de propósito (kg/cm/reais, não os nomes snake_case do Melhor
 * Envio): o módulo não conhece como o provider fala. Quem traduz é o provider.
 */

export type ShippingPackage = {
  id: string
  weightKg: number
  lengthCm: number
  widthCm: number
  heightCm: number
  /** valor declarado por unidade, em reais (para o seguro) */
  valueReais: number
  quantity: number
}

export type ShippingQuoteRequest = {
  fromZip: string
  toZip: string
  packages: ShippingPackage[]
}

/**
 * O que a transportadora responde: serviço, preço e o prazo DELA. Produção e a
 * data estimada são da loja — o service acrescenta, porque dependem do carrinho
 * e do relógio, não do provider.
 */
export type CarrierOption = Omit<ShippingOption, 'productionDays' | 'estimatedDeliveryAt'>

export type ShippingProvider = {
  id: string
  quote: (req: ShippingQuoteRequest) => Promise<CarrierOption[]>
  // createLabel / track entram na Fase 1.16, quando as etiquetas forem compradas.
}
