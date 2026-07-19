import type { CreateVariantInput } from '@ecommerce/shared/contracts'

/**
 * Regras de publicação. Puras: recebem o estado do produto, devolvem o que falta.
 *
 * Um produto DRAFT pode estar incompleto — é rascunho. Publicar (virar ACTIVE)
 * exige que ele esteja vendável de verdade, senão a loja mostra card sem preço,
 * sem foto, ou uma variante que o frete não consegue cotar.
 */

export type ProductForPublish = {
  imageCount: number
  variants: Array<
    Pick<CreateVariantInput, 'isActive' | 'price' | 'weight' | 'length' | 'width' | 'height'>
  >
}

export type PublishBlocker =
  | 'NO_IMAGE'
  | 'NO_ACTIVE_VARIANT'
  | 'VARIANT_WITHOUT_PRICE'
  | 'VARIANT_WITHOUT_WEIGHT'
  | 'VARIANT_WITHOUT_DIMENSIONS'

/**
 * O que impede publicar. Lista vazia = pode publicar.
 *
 * - ≥1 imagem: card sem foto não vende.
 * - ≥1 variante ativa: sem isso não há o que comprar.
 * - toda variante ativa com preço: preço 0 no checkout é fraude ou bug.
 * - toda variante ativa com peso: sem peso o Melhor Envio não cota, e o cliente
 *   trava no frete. É o erro mais comum de quem esquece de preencher o envio.
 */
export const publishBlockers = (product: ProductForPublish): PublishBlocker[] => {
  const blockers: PublishBlocker[] = []

  if (product.imageCount < 1) blockers.push('NO_IMAGE')

  const active = product.variants.filter((v) => v.isActive)
  if (active.length === 0) {
    blockers.push('NO_ACTIVE_VARIANT')
    return blockers // sem variante ativa, checar preço/peso não faz sentido
  }

  if (active.some((v) => v.price <= 0)) blockers.push('VARIANT_WITHOUT_PRICE')
  if (active.some((v) => v.weight <= 0)) blockers.push('VARIANT_WITHOUT_WEIGHT')
  if (active.some((v) => v.length <= 0 || v.width <= 0 || v.height <= 0)) {
    blockers.push('VARIANT_WITHOUT_DIMENSIONS')
  }

  return blockers
}

export const BLOCKER_MESSAGES: Record<PublishBlocker, string> = {
  NO_IMAGE: 'Adicione ao menos uma imagem.',
  NO_ACTIVE_VARIANT: 'O produto precisa de ao menos uma variação ativa.',
  VARIANT_WITHOUT_PRICE: 'Toda variação ativa precisa de preço.',
  VARIANT_WITHOUT_WEIGHT: 'Toda variação ativa precisa de peso (para calcular o frete).',
  VARIANT_WITHOUT_DIMENSIONS: 'Toda variação ativa precisa de dimensões (para calcular o frete).',
}
