import { describe, it, expect, vi } from 'vitest'

/**
 * O ME devolve LISTA quando há vários serviços e OBJETO SOLTO quando há um só.
 * Descoberto em produção (out/2026): a conta ficou só com a Total Express e
 * toda cotação quebrava em `raw.filter is not a function`.
 */

const meRequest = vi.fn()

vi.mock('../src/integrations/melhor-envio/client.js', () => ({
  meRequest: (path: string, init: RequestInit) => meRequest(path, init),
}))

const { calculateShipping } = await import('../src/integrations/melhor-envio/quote.js')

const args = { fromZip: '95059305', toZip: '01001000', products: [] }
const totalExpress = { id: 35, name: 'Standard', price: '19.55', delivery_time: 5 }

describe('calculateShipping', () => {
  it('um serviço só (objeto solto) vira lista de um', async () => {
    meRequest.mockResolvedValue(totalExpress)
    await expect(calculateShipping(args)).resolves.toEqual([totalExpress])
  })

  it('vários serviços (lista) passam como vieram', async () => {
    const list = [totalExpress, { id: 3, name: '.Package', price: '22.10' }]
    meRequest.mockResolvedValue(list)
    await expect(calculateShipping(args)).resolves.toEqual(list)
  })
})
