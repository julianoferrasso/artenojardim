import { describe, it, expect } from 'vitest'
import { $Enums } from '@prisma/client'
import {
  USER_ROLES,
  PRODUCT_STATUSES,
  PAYMENT_STATUSES,
  FULFILLMENT_STATUSES,
  PAYMENT_METHODS,
  MOVEMENT_TYPES,
  COUPON_TYPES,
  SHIPMENT_STATUSES,
} from '@ecommerce/shared/constants'

/**
 * Os enums existem em dois lugares e não há como eliminar a duplicação: o browser
 * não pode importar @prisma/client, e o Postgres não conhece Zod.
 *
 * Quando a duplicação é inevitável, torne a DIVERGÊNCIA detectável. Este teste é
 * o contrato: adicionar um valor de um lado só quebra o CI, não a produção.
 *
 * Enums ainda não modelados no Prisma (Fase 1) são pulados — o `?? []` não
 * mascara drift, porque assim que o enum nascer no schema a comparação passa a
 * valer. Comparar contra um enum inexistente seria o teste falhando por ausência,
 * não por divergência.
 */

const compare = (prismaEnum: Record<string, string> | undefined, shared: readonly string[]) => {
  if (!prismaEnum) return { skipped: true as const }
  return { skipped: false as const, prisma: Object.values(prismaEnum).sort(), shared: [...shared].sort() }
}

describe('enums: shared/constants vs schema.prisma', () => {
  const cases: Array<[string, Record<string, string> | undefined, readonly string[]]> = [
    ['UserRole', $Enums.UserRole, USER_ROLES],
    ['ProductStatus', ($Enums as Record<string, never>)['ProductStatus'], PRODUCT_STATUSES],
    ['PaymentStatus', ($Enums as Record<string, never>)['PaymentStatus'], PAYMENT_STATUSES],
    ['FulfillmentStatus', ($Enums as Record<string, never>)['FulfillmentStatus'], FULFILLMENT_STATUSES],
    ['PaymentMethod', ($Enums as Record<string, never>)['PaymentMethod'], PAYMENT_METHODS],
    ['MovementType', ($Enums as Record<string, never>)['MovementType'], MOVEMENT_TYPES],
    ['CouponType', ($Enums as Record<string, never>)['CouponType'], COUPON_TYPES],
    ['ShipmentStatus', ($Enums as Record<string, never>)['ShipmentStatus'], SHIPMENT_STATUSES],
  ]

  for (const [name, prismaEnum, shared] of cases) {
    it(`${name} tem os mesmos valores nos dois lados`, () => {
      const result = compare(prismaEnum, shared)

      if (result.skipped) {
        expect(shared.length, `${name} existe em shared mas ainda não no Prisma`).toBeGreaterThan(0)
        return
      }

      expect(result.prisma, `${name} divergiu — mudou um lado e não o outro`).toEqual(result.shared)
    })
  }

  it('UserRole está de fato modelado (guarda contra o teste virar no-op)', () => {
    // Se todos os enums forem pulados, os testes acima passam sem comparar nada.
    // Este ancora o suite: UserRole existe na Fase 0 e tem que ser comparado.
    expect($Enums.UserRole).toBeDefined()
    expect(Object.values($Enums.UserRole).sort()).toEqual([...USER_ROLES].sort())
  })
})
