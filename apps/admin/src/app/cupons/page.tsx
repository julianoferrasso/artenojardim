'use client'

import { useState } from 'react'
import { Plus, Truck } from 'lucide-react'
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
import { InlineEditItem, NewItemShell, useDirtyGuard } from '@/components/inline-edit'
import { useDialogs } from '@/components/confirm-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Aberto: um cupom existente, um novo, ou nada. */
type Editing = { kind: 'edit'; id: string } | { kind: 'new' } | null

const STATUS_VARIANT: Record<CouponStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default',
  scheduled: 'secondary',
  expired: 'outline',
  exhausted: 'outline',
  inactive: 'outline',
}

/** Cupons de desconto. Mesmo desenho dos banners: o formulário abre dentro do card. */
export default function CouponsPage() {
  const { data: coupons, isLoading, error } = useCoupons()
  const del = useDeleteCoupon()
  const [editing, setEditing] = useState<Editing>(null)
  const { confirm, notify } = useDialogs()
  const { onDirtyChange, guard, reset } = useDirtyGuard('Descartar as alterações deste cupom?')

  const changeEditing = (next: Editing) => guard(() => setEditing(next))

  const close = () => {
    reset()
    setEditing(null)
  }

  const onDelete = async (coupon: Coupon) => {
    const ok = await confirm({
      title: `Excluir o cupom ${coupon.code}?`,
      description: (
        <>
          <p>O código para de funcionar no checkout na hora. Não dá para desfazer.</p>
          <p>Cupom que já foi usado em pedido não pode ser excluído, só desativado.</p>
        </>
      ),
      confirmLabel: 'Excluir cupom',
      tone: 'danger',
    })
    if (!ok) return
    del.mutate(coupon.id, {
      // Excluir o cupom aberto fecha o formulário: salvar depois daria 404.
      onSuccess: () => {
        if (editing?.kind === 'edit' && editing.id === coupon.id) close()
      },
      onError: (e) => {
        // Reagimos ao CODE, nunca ao texto.
        if (e instanceof ApiError && e.code === ERROR_CODES.COUPON_IN_USE) {
          void notify({
            title: `O cupom ${coupon.code} já foi usado`,
            description: 'Ele aparece em pedidos e não pode ser excluído. Para ele parar de funcionar, edite o cupom e desligue "Ativo".',
          })
          return
        }
        void notify({
          title: 'Não foi possível excluir o cupom',
          description: e instanceof ApiError ? e.message : 'Tente de novo em instantes.',
        })
      },
    })
  }

  const creating = editing?.kind === 'new'

  const form = (initial?: Coupon) => (
    <CouponForm
      key={initial?.id ?? 'new'}
      initial={initial}
      onDirtyChange={onDirtyChange}
      onDone={close}
      onCancel={() => changeEditing(null)}
    />
  )

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-xl font-semibold tracking-tight">Cupons</h1>
          <p className="text-sm text-muted-foreground">
            Códigos de desconto que o cliente digita no checkout. Um cupom por pedido. Clique num cupom para editar.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => changeEditing({ kind: 'new' })}
          disabled={creating}
          className="shrink-0"
        >
          <Plus />
          Novo cupom
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar cupons.</p>}

      <ul className="flex flex-col gap-2">
        {creating && (
          <NewItemShell title="Novo cupom" hint="Preencha os campos e clique em Criar cupom." onClose={() => changeEditing(null)}>
            {form()}
          </NewItemShell>
        )}

        {coupons?.map((coupon) => {
          const isOpen = editing?.kind === 'edit' && editing.id === coupon.id
          return (
            <InlineEditItem
              key={coupon.id}
              open={isOpen}
              label={`o cupom ${coupon.code}`}
              summary={<CouponSummaryRow coupon={coupon} />}
              onToggle={() => changeEditing(isOpen ? null : { kind: 'edit', id: coupon.id })}
              onDelete={() => onDelete(coupon)}
              deleting={del.isPending}
            >
              {isOpen && form(coupon)}
            </InlineEditItem>
          )
        })}
      </ul>

      {coupons && coupons.length === 0 && !creating && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhum cupom ainda. Crie o primeiro.
        </p>
      )}
    </div>
  )
}

/** O valor em destaque no lugar da miniatura: é o que diferencia um cupom do outro. */
const ValueTile = ({ coupon, muted }: { coupon: Coupon; muted: boolean }) => (
  <span
    className={cn(
      'flex size-12 shrink-0 items-center justify-center rounded bg-muted text-center text-xs font-semibold leading-tight',
      muted ? 'text-muted-foreground' : 'text-foreground',
    )}
  >
    {coupon.type === 'FREE_SHIPPING' ? <Truck aria-label="Frete grátis" className="size-5" /> : formatCouponValue(coupon)}
  </span>
)

const CouponSummaryRow = ({ coupon }: { coupon: Coupon }) => {
  const status = couponStatus(coupon)
  return (
    <>
      <ValueTile coupon={coupon} muted={status !== 'active'} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-sm">
          <span className={cn('font-mono font-medium', status !== 'active' && 'text-muted-foreground')}>
            {coupon.code}
          </span>
          <span className="text-muted-foreground">{formatCouponValue(coupon)}</span>
          <Badge variant={STATUS_VARIANT[status]}>{COUPON_STATUS_LABEL[status]}</Badge>
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {coupon.usageCount} / {coupon.usageLimit ?? '∞'} usos · {formatCouponPeriod(coupon)}
          {coupon.usageLimitPerCustomer !== null && ` · ${coupon.usageLimitPerCustomer} por cliente`}
        </span>
      </span>
    </>
  )
}
