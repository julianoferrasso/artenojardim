import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { appError } from '../../../shared/errors.js'
import type { ShippingPackage } from '../types.js'

/**
 * Cubagem: itens do carrinho → pacotes neutros para cotação.
 *
 * Função PURA — sem Prisma, sem fetch, sem Date. Recebe dados, devolve dados ou
 * lança erro de negócio. É o que torna a conversão de unidades e a regra "sem
 * peso não cota" testáveis em milissegundos, sem subir banco nem chamar a API.
 *
 * Conversão de unidades (nossa base → universal de frete):
 *   peso     gramas      → kg    (÷1000)
 *   dimensão milímetros  → cm    (÷10)
 *   valor    centavos    → reais (÷100)
 */

export type PackItem = {
  variantId: string
  quantity: number
  /** gramas */
  weightGrams: number
  /** milímetros */
  lengthMm: number
  widthMm: number
  heightMm: number
  /** centavos, por unidade */
  priceCents: number
}

const round = (value: number, decimals: number): number => {
  const f = 10 ** decimals
  return Math.round(value * f) / f
}

/**
 * Sem peso ou sem dimensão não há como cotar frete — o Correios/transportadora
 * exige as duas coisas. Bloqueia cedo, em vez de deixar o provider devolver uma
 * cotação vazia e confusa.
 */
export const toPackages = (items: PackItem[]): ShippingPackage[] => {
  if (items.length === 0) {
    throw appError(ERROR_CODES.CART_EMPTY, 'Nenhum item para cotar o frete.', 400)
  }

  return items.map((it) => {
    if (it.weightGrams <= 0 || it.lengthMm <= 0 || it.widthMm <= 0 || it.heightMm <= 0) {
      throw appError(
        ERROR_CODES.SHIPPING_UNAVAILABLE,
        'Um dos produtos está sem peso ou dimensões cadastrados e não pode ter o frete calculado.',
        400,
      )
    }

    return {
      id: it.variantId,
      weightKg: round(it.weightGrams / 1000, 3),
      lengthCm: round(it.lengthMm / 10, 1),
      widthCm: round(it.widthMm / 10, 1),
      heightCm: round(it.heightMm / 10, 1),
      valueReais: round(it.priceCents / 100, 2),
      quantity: it.quantity,
    }
  })
}
