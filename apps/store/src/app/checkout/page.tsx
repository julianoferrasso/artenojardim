'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Address, AppliedCoupon, ShippingOption } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { listAddresses } from '@/lib/addresses'
import { quoteShipping } from '@/lib/shipping'
import { confirmCheckout } from '@/lib/checkout'
import { validateCoupon, couponErrorMessage, isCouponError } from '@/lib/coupons'
import { formatBRL, cn } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { buttonVariants } from '@/components/ui/button'
import { ProductImage } from '@/components/product-image'

/**
 * Checkout em página única com seções (não wizard): cada navegação é um ponto de
 * abandono. O cliente escolhe endereço e frete; o total mostrado é uma prévia — o
 * backend recalcula tudo do banco ao confirmar, e o pedido criado é a verdade.
 */
export default function CheckoutPage() {
  const { customer, loading: authLoading } = useAuth()
  const { cart, loading: cartLoading } = useCart()
  const router = useRouter()

  const [addresses, setAddresses] = useState<Address[]>([])
  const [addressId, setAddressId] = useState<string | null>(null)
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [quoting, setQuoting] = useState(false)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [applyingCoupon, setApplyingCoupon] = useState(false)

  const items = (cart?.items ?? []).filter((i) => i.purchasable)

  // Guards: sem sessão vai para login; carrinho vazio volta ao carrinho.
  useEffect(() => {
    if (!authLoading && !customer) router.replace('/entrar')
  }, [authLoading, customer, router])
  useEffect(() => {
    if (!cartLoading && cart && items.length === 0) router.replace('/carrinho')
  }, [cartLoading, cart, items.length, router])

  useEffect(() => {
    if (!customer) return
    void listAddresses().then((list) => {
      setAddresses(list)
      const def = list.find((a) => a.isDefault) ?? list[0]
      if (def) setAddressId(def.id)
    })
  }, [customer])

  // Recota o frete sempre que muda o endereço (o CEP de destino muda).
  const quote = useCallback(async () => {
    const address = addresses.find((a) => a.id === addressId)
    if (!address || items.length === 0) return
    setQuoting(true)
    setError(null)
    setOptions(null)
    setServiceId(null)
    try {
      const opts = await quoteShipping({
        zipCode: address.zipCode,
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
      })
      setOptions(opts)
      if (opts[0]) setServiceId(opts[0].id)
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'SHIPPING_UNAVAILABLE'
          ? 'Frete indisponível para este endereço/itens.'
          : 'Não foi possível calcular o frete.',
      )
    } finally {
      setQuoting(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addressId, addresses])

  useEffect(() => {
    void quote()
  }, [quote])

  const selectedShipping = options?.find((o) => o.id === serviceId) ?? null
  const subtotal = cart?.subtotal ?? 0
  const shippingPrice = selectedShipping?.priceCents ?? 0
  // Prévia: o confirm recalcula o desconto do banco. Frete grátis desconta o
  // frete escolhido, que a API ainda não conhecia quando validou o código.
  const couponDiscount = !coupon
    ? 0
    : coupon.type === 'FREE_SHIPPING'
      ? shippingPrice
      : coupon.discountCents
  const total = subtotal + shippingPrice - couponDiscount
  const freeShippingAlready = coupon?.type === 'FREE_SHIPPING' && !!selectedShipping && shippingPrice === 0

  const applyCoupon = async () => {
    const code = couponInput.trim()
    if (!code) return
    setApplyingCoupon(true)
    setCouponError(null)
    try {
      setCoupon(await validateCoupon(code))
      setCouponInput('')
    } catch (err) {
      setCouponError(couponErrorMessage(err))
    } finally {
      setApplyingCoupon(false)
    }
  }

  const place = async () => {
    if (!addressId || !serviceId) return
    setPlacing(true)
    setError(null)
    try {
      const order = await confirmCheckout({
        addressId,
        shippingServiceId: serviceId,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(note.trim() ? { customerNote: note.trim() } : {}),
      })
      router.replace(`/checkout/pedido/${order.id}`)
    } catch (err) {
      // O cupom pode ter expirado ou esgotado desde que foi aplicado: sai do
      // resumo para o cliente ver o total novo antes de confirmar de novo.
      if (isCouponError(err)) {
        setCoupon(null)
        setCouponError(couponErrorMessage(err))
        setError('O cupom não pôde ser usado e foi removido. Confira o novo total.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível finalizar o pedido.')
      }
      setPlacing(false)
    }
  }

  if (authLoading || cartLoading) {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }
  if (!customer || items.length === 0) return null

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Finalizar compra</h1>

      {/* Endereço */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-medium">Endereço de entrega</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não tem endereços.{' '}
            <Link href="/conta/enderecos" className="text-primary-ink hover:underline">
              Cadastrar endereço
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/40">
                  <input
                    type="radio"
                    name="address"
                    checked={addressId === a.id}
                    onChange={() => setAddressId(a.id)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{a.label || a.recipient}</span>
                    <span className="block text-muted-foreground">
                      {a.street}, {a.number}
                      {a.complement ? ` — ${a.complement}` : ''} · {a.district} · {a.city}/{a.state}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Frete */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-medium">Frete</h2>
        {quoting ? (
          <p className="text-sm text-muted-foreground">Calculando frete…</p>
        ) : !options ? (
          <p className="text-sm text-muted-foreground">Escolha um endereço para ver o frete.</p>
        ) : options.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma opção de frete para este endereço.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {options.map((o) => (
              <li key={o.id}>
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm transition-colors has-checked:border-primary has-checked:bg-secondary/40">
                  <span className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="shipping"
                      checked={serviceId === o.id}
                      onChange={() => setServiceId(o.id)}
                    />
                    {o.carrier} · {o.service}
                  </span>
                  <span className="whitespace-nowrap text-muted-foreground">
                    {formatBRL(o.priceCents)} · {o.deliveryDays} dias
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Resumo */}
      <section className="mb-6 rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="mb-3 font-medium">Resumo</h2>
        <ul className="mb-3 flex flex-col gap-3 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-3">
              <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                <ProductImage src={i.imageUrl} alt={i.productName} fit="cover" sizes="48px" />
              </div>
              <span className="min-w-0 flex-1 text-muted-foreground">
                {i.quantity}× {i.productName}
              </span>
              <span>{formatBRL(i.lineTotal)}</span>
            </li>
          ))}
        </ul>

        <div className="mb-3 border-t border-border pt-3">
          {coupon ? (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
              <span>
                Cupom <span className="font-medium">{coupon.code}</span> aplicado
              </span>
              <button
                type="button"
                onClick={() => {
                  setCoupon(null)
                  setCouponError(null)
                }}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                void applyCoupon()
              }}
              className="flex gap-2"
            >
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value)}
                placeholder="Cupom de desconto"
                aria-label="Cupom de desconto"
                autoComplete="off"
                maxLength={30}
                className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-card px-3 text-sm uppercase outline-none transition-colors placeholder:normal-case focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <button
                type="submit"
                disabled={!couponInput.trim() || applyingCoupon}
                className={buttonVariants({ variant: 'neutral', emphasis: 'quiet' })}
              >
                {applyingCoupon ? 'Aplicando…' : 'Aplicar'}
              </button>
            </form>
          )}
          {couponError && (
            <p role="alert" className="mt-1.5 text-xs text-destructive">
              {couponError}
            </p>
          )}
          {freeShippingAlready && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              O frete deste pedido já é grátis, então o cupom não muda o total.
            </p>
          )}
        </div>

        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Frete</span>
          <span>{selectedShipping ? formatBRL(selectedShipping.priceCents) : '—'}</span>
        </div>
        {coupon && couponDiscount > 0 && (
          <div className="flex justify-between text-sm text-success">
            <span>Desconto ({coupon.code})</span>
            <span>−{formatBRL(couponDiscount)}</span>
          </div>
        )}
        <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>Total</span>
          <span>{formatBRL(total)}</span>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Observação para a loja (opcional)"
          className="mt-4 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      </section>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        onClick={() => void place()}
        disabled={!addressId || !serviceId || placing}
        className={cn(buttonVariants({ size: 'lg' }), 'w-full')}
      >
        {placing ? 'Finalizando…' : `Confirmar pedido · ${formatBRL(total)}`}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        O pagamento entra na próxima etapa.
      </p>
    </main>
  )
}
