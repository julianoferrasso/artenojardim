import { describe, it, expect } from 'vitest'
import {
  readOrderAttachments,
  addBusinessDays,
  estimateDelivery,
  periodStart,
} from '@ecommerce/shared/contracts'

/**
 * Rastreio, nota fiscal e prazo vivem fora do schema (metadataJson + derivação).
 * O risco de ler Json livre é explodir a tela do pedido por causa de um campo
 * decorativo — metade destes testes é sobre não lançar.
 */

const evt = (metadataJson: unknown, createdAt: string) => ({ metadataJson, createdAt })

describe('readOrderAttachments', () => {
  it('lê os campos de um evento', () => {
    const a = readOrderAttachments([
      evt({ trackingCode: 'BR123', invoiceUrl: 'https://nf.exemplo/1' }, '2026-01-02T10:00:00Z'),
    ])

    expect(a.trackingCode).toBe('BR123')
    expect(a.invoiceUrl).toBe('https://nf.exemplo/1')
    expect(a.trackingUrl).toBeNull()
  })

  it('o evento mais NOVO vence — correção postada depois substitui o código errado', () => {
    const a = readOrderAttachments([
      evt({ trackingCode: 'ERRADO' }, '2026-01-02T10:00:00Z'),
      evt({ trackingCode: 'CERTO' }, '2026-01-05T10:00:00Z'),
    ])

    expect(a.trackingCode).toBe('CERTO')
  })

  it('completa campos ausentes com eventos mais antigos', () => {
    const a = readOrderAttachments([
      evt({ invoiceUrl: 'https://nf.exemplo/1' }, '2026-01-01T10:00:00Z'),
      evt({ trackingCode: 'BR999' }, '2026-01-09T10:00:00Z'),
    ])

    expect(a.trackingCode).toBe('BR999')
    expect(a.invoiceUrl).toBe('https://nf.exemplo/1')
  })

  it('ignora string vazia e espaço em branco', () => {
    const a = readOrderAttachments([evt({ trackingCode: '   ' }, '2026-01-02T10:00:00Z')])
    expect(a.trackingCode).toBeNull()
  })

  it('não lança com metadata null, string, array, número ou chave desconhecida', () => {
    expect(() =>
      readOrderAttachments([
        evt(null, '2026-01-01T10:00:00Z'),
        evt('não sou objeto', '2026-01-02T10:00:00Z'),
        evt(['também não'], '2026-01-03T10:00:00Z'),
        evt(42, '2026-01-04T10:00:00Z'),
        evt({ trackingCode: 12345 }, '2026-01-05T10:00:00Z'),
        evt({ campoInventado: 'x' }, '2026-01-06T10:00:00Z'),
        evt(undefined, '2026-01-07T10:00:00Z'),
      ]),
    ).not.toThrow()
  })

  it('lista vazia devolve tudo null', () => {
    expect(readOrderAttachments([])).toEqual({
      trackingCode: null,
      trackingUrl: null,
      invoiceUrl: null,
      invoiceNumber: null,
    })
  })
})

describe('addBusinessDays', () => {
  it('pula o fim de semana', () => {
    // 2026-07-16 é uma quinta. +2 dias úteis = segunda 2026-07-20.
    const result = addBusinessDays(new Date('2026-07-16T12:00:00Z'), 2)
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-20')
  })

  it('sexta + 1 dia útil cai na segunda', () => {
    const result = addBusinessDays(new Date('2026-07-17T12:00:00Z'), 1)
    expect(result.toISOString().slice(0, 10)).toBe('2026-07-20')
  })

  it('zero dias não move a data', () => {
    const from = new Date('2026-07-16T12:00:00Z')
    expect(addBusinessDays(from, 0).toISOString()).toBe(from.toISOString())
  })
})

describe('estimateDelivery', () => {
  it('ancora no pagamento quando ainda não houve envio', () => {
    const iso = estimateDelivery({
      shippedAt: null,
      paidAt: '2026-07-16T12:00:00Z',
      deliveryDays: 2,
    })
    expect(iso?.slice(0, 10)).toBe('2026-07-20')
  })

  it('o envio reancora o prazo — é quando o pacote entra na rede da transportadora', () => {
    const iso = estimateDelivery({
      shippedAt: '2026-07-20T12:00:00Z',
      paidAt: '2026-07-01T12:00:00Z',
      deliveryDays: 2,
    })
    expect(iso?.slice(0, 10)).toBe('2026-07-22')
  })

  it('sem pagamento e sem envio não há previsão', () => {
    expect(estimateDelivery({ shippedAt: null, paidAt: null, deliveryDays: 5 })).toBeNull()
  })

  it('prazo zerado ou inválido não vira uma data qualquer', () => {
    expect(estimateDelivery({ shippedAt: null, paidAt: '2026-07-16T12:00:00Z', deliveryDays: 0 })).toBeNull()
    expect(
      estimateDelivery({ shippedAt: null, paidAt: '2026-07-16T12:00:00Z', deliveryDays: NaN }),
    ).toBeNull()
  })

  it('data corrompida não lança', () => {
    expect(() =>
      estimateDelivery({ shippedAt: 'não é data', paidAt: null, deliveryDays: 3 }),
    ).not.toThrow()
    expect(estimateDelivery({ shippedAt: 'não é data', paidAt: null, deliveryDays: 3 })).toBeNull()
  })
})

describe('periodStart', () => {
  const now = new Date('2026-07-19T12:00:00Z')

  it('"all" não filtra nada', () => {
    expect(periodStart('all', now)).toBeNull()
  })

  it('30d volta trinta dias', () => {
    expect(periodStart('30d', now)?.toISOString().slice(0, 10)).toBe('2026-06-19')
  })

  it('6m volta seis meses', () => {
    expect(periodStart('6m', now)?.toISOString().slice(0, 10)).toBe('2026-01-19')
  })

  it('1y volta um ano', () => {
    expect(periodStart('1y', now)?.toISOString().slice(0, 10)).toBe('2025-07-19')
  })

  it('não muta o `now` recebido', () => {
    const before = now.toISOString()
    periodStart('90d', now)
    expect(now.toISOString()).toBe(before)
  })
})
