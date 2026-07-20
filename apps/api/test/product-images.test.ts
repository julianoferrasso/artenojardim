import { describe, it, expect } from 'vitest'
import { imagesForVariant, pickVariantImage } from '@ecommerce/shared/contracts'

/**
 * A ordem de resolução de imagem é compartilhada entre a API (que congela a foto
 * do item de carrinho/pedido) e a loja (que monta a galeria). Divergir aqui é
 * exatamente o que fazia o carrinho aparecer sem foto enquanto o produto tinha.
 */

const img = (id: string, position: number, variantId: string | null = null) => ({
  id,
  position,
  variantId,
})

describe('imagesForVariant', () => {
  it('sem imagens → lista vazia', () => {
    expect(imagesForVariant([], 'v1')).toEqual([])
  })

  it('imagens do produto (sem variação) servem qualquer variação', () => {
    const images = [img('b', 1), img('a', 0)]
    expect(imagesForVariant(images, 'v1').map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('imagens da variação vêm antes das do produto', () => {
    const images = [img('prod', 0), img('var', 5, 'v1')]
    expect(imagesForVariant(images, 'v1').map((i) => i.id)).toEqual(['var', 'prod'])
  })

  it('imagens de OUTRA variação ficam de fora', () => {
    const images = [img('prod', 1), img('daOutra', 0, 'v2')]
    expect(imagesForVariant(images, 'v1').map((i) => i.id)).toEqual(['prod'])
  })

  it('mas não a ponto de esvaziar a galeria: produto com foto nunca renderiza vazio', () => {
    const images = [img('daOutra', 0, 'v2')]
    expect(imagesForVariant(images, 'v1').map((i) => i.id)).toEqual(['daOutra'])
  })

  it('sem variação selecionada → só as do produto', () => {
    const images = [img('prod', 0), img('var', 1, 'v1')]
    expect(imagesForVariant(images, null).map((i) => i.id)).toEqual(['prod'])
  })

  it('ordena por position, não pela ordem de chegada', () => {
    const images = [img('c', 2), img('a', 0), img('b', 1)]
    expect(imagesForVariant(images, null).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })

  it('não muta o array recebido', () => {
    const images = [img('c', 2), img('a', 0)]
    imagesForVariant(images, null)
    expect(images.map((i) => i.id)).toEqual(['c', 'a'])
  })
})

describe('pickVariantImage', () => {
  it('sem imagens → undefined (a UI cai no placeholder)', () => {
    expect(pickVariantImage([], 'v1')).toBeUndefined()
  })

  it('prefere a foto da variação à do produto', () => {
    const images = [img('prod', 0), img('var', 9, 'v1')]
    expect(pickVariantImage(images, 'v1')?.id).toBe('var')
  })

  it('cai na foto do produto quando a variação não tem a sua', () => {
    const images = [img('prod', 0)]
    expect(pickVariantImage(images, 'v1')?.id).toBe('prod')
  })
})
