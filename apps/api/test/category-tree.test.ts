import { describe, it, expect } from 'vitest'
import { buildTree, wouldCreateCycle } from '../src/modules/categories/domain/tree.js'
import type { Category } from '@ecommerce/shared/contracts'

const cat = (id: string, parentId: string | null, position = 0, name = id): Category => ({
  id,
  name,
  slug: id,
  description: null,
  parentId,
  imageId: null,
  imageUrl: null,
  position,
  isActive: true,
  seoTitle: null,
  seoDescription: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

describe('buildTree', () => {
  it('monta a hierarquia a partir da lista plana', () => {
    const tree = buildTree([
      cat('vasos', null),
      cat('ceramica', 'vasos'),
      cat('plastico', 'vasos'),
      cat('mudas', null),
    ])

    expect(tree.map((n) => n.id)).toEqual(['mudas', 'vasos'].sort())
    const vasos = tree.find((n) => n.id === 'vasos')!
    expect(vasos.children.map((c) => c.id).sort()).toEqual(['ceramica', 'plastico'])
  })

  it('ordena irmãos por position, depois por nome', () => {
    const tree = buildTree([
      cat('b', null, 2, 'B'),
      cat('a', null, 1, 'A'),
      cat('c', null, 1, 'C'),
    ])
    // position 1 vem antes de 2; entre as duas de position 1, ordem alfabética.
    expect(tree.map((n) => n.id)).toEqual(['a', 'c', 'b'])
  })

  it('trata pai inexistente como raiz, em vez de perder o nó', () => {
    // Um pai que foi apagado sem cascade não pode fazer a categoria sumir da UI.
    const tree = buildTree([cat('orfa', 'pai-que-nao-existe')])
    expect(tree.map((n) => n.id)).toEqual(['orfa'])
  })

  it('lista vazia devolve floresta vazia', () => {
    expect(buildTree([])).toEqual([])
  })

  it('não entra em loop com dados que já contêm um ciclo', () => {
    // a→b→a nos dados. buildTree não deve travar; ambos viram filhos e nenhum
    // aparece como raiz, mas a função retorna em vez de rodar para sempre.
    const tree = buildTree([cat('a', 'b'), cat('b', 'a')])
    expect(Array.isArray(tree)).toBe(true)
  })
})

describe('wouldCreateCycle', () => {
  const parentOf = new Map<string, string | null>([
    ['vasos', null],
    ['ceramica', 'vasos'],
    ['artesanal', 'ceramica'],
    ['mudas', null],
  ])

  it('mover para si mesma é ciclo', () => {
    expect(wouldCreateCycle('vasos', 'vasos', parentOf)).toBe(true)
  })

  it('mover para uma descendente é ciclo', () => {
    // vasos → artesanal (que é neta de vasos) fecharia o laço.
    expect(wouldCreateCycle('vasos', 'artesanal', parentOf)).toBe(true)
    expect(wouldCreateCycle('vasos', 'ceramica', parentOf)).toBe(true)
  })

  it('mover para um ramo não relacionado é permitido', () => {
    expect(wouldCreateCycle('mudas', 'artesanal', parentOf)).toBe(false)
    expect(wouldCreateCycle('artesanal', 'mudas', parentOf)).toBe(false)
  })

  it('mover para a raiz (candidato ancestral distante) é permitido', () => {
    expect(wouldCreateCycle('artesanal', 'vasos', parentOf)).toBe(false)
  })

  it('não trava se os dados já tiverem um ciclo', () => {
    const corrupt = new Map<string, string | null>([
      ['x', 'y'],
      ['y', 'x'],
    ])
    expect(wouldCreateCycle('z', 'x', corrupt)).toBe(false)
  })
})
