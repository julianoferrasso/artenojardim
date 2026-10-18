'use client'

import { useState } from 'react'
import { ERROR_CODES, type Coupon } from '@ecommerce/shared/contracts'
import {
  useCoupons,
  useDeleteCoupon,
  couponStatus,
  formatCouponValue,
  formatCouponPeriod,
  COUPON_STATUS_LABEL,
  type CouponStatus,
} from '@/lib/coupons'
import { CouponForm } from '@/components/coupon-form'
import { Badge } from '@/components/ui/badge'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Editing = { mode: 'create' } | { mode: 'edit'; coupon: Coupon } | null

const STATUS_VARIANT: Record<CouponStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  scheduled: 'secondary',
  expired: 'outline',
  exhausted: 'outline',
  inactive: 'outline',
}

/** Cupons de desconto. Mesmo desenho da tela de banners: lista + formulário ao lado. */
export default function CouponsPage() {
  const { data: coupons, isLoading, error } = useCoupons()
  const del = useDeleteCoupon()
  const [editing, setEditing] = useState<Editing>(null)

  const onDelete = (coupon: Coupon) => {
    if (!confirm(`Excluir o cupom ${coupon.code}?`)) return
    del.mutate(coupon.id, {
      onSuccess: () => {
        if (editing?.mode === 'edit' && editing.coupon.id === coupon.id) setEditing(null)
      },
      onError: (e) => {
        // Reagimos ao CODE, nunca ao texto.
        if (e instanceof ApiError && e.code === ERROR_CODES.COUPON_IN_USE) {
          alert('Este cupom já foi usado em pedidos e não pode ser excluído. Edite-o e desmarque "Ativo".')
          return
        }
        alert(e instanceof ApiError ? e.message : 'Não foi possível excluir o cupom.')
      },
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Cupons</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Códigos de desconto que o cliente digita no checkout. Um cupom por pedido.
      </p>

      <div className="grid gap-8 md:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Todos os cupons</h2>
            <button
              onClick={() => setEditing({ mode: 'create' })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Novo cupom
            </button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && <p className="text-sm text-destructive">Falha ao carregar cupons.</p>}
          {coupons && coupons.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum cupom ainda.</p>
          )}

          {coupons && coupons.length > 0 && (
            <ul className="flex flex-col gap-2">
              {coupons.map((coupon) => {
                const status = couponStatus(coupon)
                const selected = editing?.mode === 'edit' && editing.coupon.id === coupon.id
                return (
                  <li
                    key={coupon.id}
                    className={cn(
                      'group flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2',
                      selected && 'border-primary',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-sm">
                        <span
                          className={cn(
                            'font-mono font-medium',
                            status !== 'active' && 'text-muted-foreground',
                          )}
                        >
                          {coupon.code}
                        </span>
                        <span>{formatCouponValue(coupon)}</span>
                        <Badge variant={STATUS_VARIANT[status]}>{COUPON_STATUS_LABEL[status]}</Badge>
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {coupon.usageCount} / {coupon.usageLimit ?? '∞'} usos ·{' '}
                        {formatCouponPeriod(coupon)}
                        {coupon.usageLimitPerCustomer !== null &&
                          ` · ${coupon.usageLimitPerCustomer} por cliente`}
                      </span>
                    </span>

                    <span className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
                      <button
                        onClick={() => setEditing({ mode: 'edit', coupon })}
                        className="rounded px-2 py-1 text-xs hover:bg-accent"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => onDelete(coupon)}
                        disabled={del.isPending}
                        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
                      >
                        Excluir
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <aside>
          {editing ? (
            <CouponForm
              key={editing.mode === 'edit' ? editing.coupon.id : 'new'}
              initial={editing.mode === 'edit' ? editing.coupon : undefined}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Selecione um cupom para editar, ou crie um novo.
            </p>
          )}
        </aside>
      </div>
    </div>
  )
}
