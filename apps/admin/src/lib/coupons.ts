import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES, DEFAULT_LOCALE, DEFAULT_TIMEZONE, type CouponType } from '@ecommerce/shared/constants'
import type { Coupon, CreateCouponInput, UpdateCouponInput } from '@ecommerce/shared/contracts'
import { apiFetch } from './api'
import { formatBRL } from './utils'

const KEY = ['coupons']

export const useCoupons = () =>
  useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch<Coupon[]>(ROUTES.admin.coupons.list),
  })

export const useCreateCoupon = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateCouponInput) =>
      apiFetch<Coupon>(ROUTES.admin.coupons.list, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useUpdateCoupon = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCouponInput }) =>
      apiFetch<Coupon>(ROUTES.admin.coupons.detail(id), {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const useDeleteCoupon = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(ROUTES.admin.coupons.detail(id), { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

export const COUPON_TYPE_LABEL: Record<CouponType, string> = {
  PERCENTAGE: 'Porcentagem',
  FIXED_AMOUNT: 'Valor fixo',
  FREE_SHIPPING: 'Frete grátis',
}

export const formatCouponValue = (coupon: Pick<Coupon, 'type' | 'value'>): string => {
  switch (coupon.type) {
    case 'PERCENTAGE':
      return `${coupon.value}%`
    case 'FIXED_AMOUNT':
      return formatBRL(coupon.value)
    case 'FREE_SHIPPING':
      return 'Frete grátis'
  }
}

export type CouponStatus = 'active' | 'scheduled' | 'expired' | 'exhausted' | 'inactive'

export const COUPON_STATUS_LABEL: Record<CouponStatus, string> = {
  active: 'Ativo',
  scheduled: 'Agendado',
  expired: 'Expirado',
  exhausted: 'Esgotado',
  inactive: 'Inativo',
}

/** Só para a tela: quem decide se o cupom vale é a API, no checkout. */
export const couponStatus = (coupon: Coupon, now = new Date()): CouponStatus => {
  if (!coupon.isActive) return 'inactive'
  if (coupon.startsAt && now < new Date(coupon.startsAt)) return 'scheduled'
  if (coupon.endsAt && now > new Date(coupon.endsAt)) return 'expired'
  if (coupon.usageLimit !== null && coupon.usageCount >= coupon.usageLimit) return 'exhausted'
  return 'active'
}

/** Data no fuso da loja, não no do navegador: "até 30/11" é 30/11 em Brasília. */
const DAY_FORMATTER = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  dateStyle: 'short',
  timeZone: DEFAULT_TIMEZONE,
})

export const formatCouponPeriod = (coupon: Pick<Coupon, 'startsAt' | 'endsAt'>): string => {
  const start = coupon.startsAt ? DAY_FORMATTER.format(new Date(coupon.startsAt)) : null
  const end = coupon.endsAt ? DAY_FORMATTER.format(new Date(coupon.endsAt)) : null
  if (start && end) return `${start} a ${end}`
  if (end) return `até ${end}`
  if (start) return `a partir de ${start}`
  return 'Sem prazo'
}
