import { describe, it, expect } from 'vitest'
import { splitPage } from '../src/modules/products/domain/list-order.js'

/**
 * Disponíveis primeiro, esgotados no fim, paginados como uma lista só. Errar a
 * conta repete ou pula produto na fronteira entre as páginas.
 */

describe('splitPage', () => {
  it('nenhum com estoque → paginação comum dos esgotados', () => {
    expect(splitPage({ page: 1, perPage: 24, inCount: 0 })).toEqual({
      in: { skip: 0, take: 0 },
      out: { skip: 0, take: 24 },
    })
    expect(splitPage({ page: 2, perPage: 24, inCount: 0 })).toEqual({
      in: { skip: 0, take: 0 },
      out: { skip: 24, take: 24 },
    })
  })

  it('página cheia de disponíveis → não lê esgotados', () => {
    expect(splitPage({ page: 1, perPage: 24, inCount: 30 })).toEqual({
      in: { skip: 0, take: 24 },
      out: { skip: 0, take: 0 },
    })
  })

  it('fronteira no meio da página → o resto dos disponíveis, depois os primeiros esgotados', () => {
    expect(splitPage({ page: 2, perPage: 24, inCount: 30 })).toEqual({
      in: { skip: 24, take: 6 },
      out: { skip: 0, take: 18 },
    })
  })

  it('página seguinte continua os esgotados de onde parou', () => {
    expect(splitPage({ page: 3, perPage: 24, inCount: 30 })).toEqual({
      in: { skip: 30, take: 0 },
      out: { skip: 18, take: 24 },
    })
  })

  it('fronteira exata no fim da página', () => {
    expect(splitPage({ page: 1, perPage: 24, inCount: 24 }).out.take).toBe(0)
    expect(splitPage({ page: 2, perPage: 24, inCount: 24 })).toEqual({
      in: { skip: 24, take: 0 },
      out: { skip: 0, take: 24 },
    })
  })

  it('as páginas cobrem a lista inteira sem repetir nem pular', () => {
    const inCount = 5
    const outCount = 7
    const seen: string[] = []
    for (let page = 1; page <= 4; page++) {
      const p = splitPage({ page, perPage: 3, inCount })
      for (let i = 0; i < p.in.take; i++) seen.push(`in${p.in.skip + i}`)
      for (let i = 0; i < p.out.take && p.out.skip + i < outCount; i++) seen.push(`out${p.out.skip + i}`)
    }
    expect(seen).toEqual([
      'in0', 'in1', 'in2', 'in3', 'in4',
      'out0', 'out1', 'out2', 'out3', 'out4', 'out5', 'out6',
    ])
  })
})
