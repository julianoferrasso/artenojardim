'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { Address, ShippingOption } from '@ecommerce/shared/contracts'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { listAddresses } from '@/lib/addresses'
import { quoteShipping } from '@/lib/shipping'
import { confirmCheckout } from '@/lib/checkout'
import { formatBRL } from '@/lib/utils'
import { ApiError } from '@/lib/api'

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
  const total = subtotal + (selectedShipping?.priceCents ?? 0)

  const place = async () => {
    if (!addressId || !serviceId) return
    setPlacing(true)
    setError(null)
    try {
      const order = await confirmCheckout({
        addressId,
        shippingServiceId: serviceId,
        ...(note.trim() ? { customerNote: note.trim() } : {}),
      })
      router.replace(`/checkout/pedido/${order.id}`)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível finalizar o pedido.')
      setPlacing(false)
    }
  }

  if (authLoading || cartLoading) {
    return <main className="mx-auto max-w-2xl px-4 py-12 text-center text-muted-foreground">Carregando…</main>
  }
  if (!customer || items.length === 0) return null

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Finalizar compra</h1>

      {/* Endereço */}
      <section className="mb-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-medium">Endereço de entrega</h2>
        {addresses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Você ainda não tem endereços.{' '}
            <Link href="/conta/enderecos" className="text-primary hover:underline">
              Cadastrar endereço
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {addresses.map((a) => (
              <li key={a.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
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
      <section className="mb-6 rounded-lg border border-border bg-card p-5">
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
                <label className="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
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
      <section className="mb-6 rounded-lg border border-border bg-card p-5">
        <h2 className="mb-3 font-medium">Resumo</h2>
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {items.map((i) => (
            <li key={i.id} className="flex justify-between gap-4">
              <span className="text-muted-foreground">
                {i.quantity}× {i.productName}
              </span>
              <span>{formatBRL(i.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <div className="flex justify-between border-t border-border pt-2 text-sm">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatBRL(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Frete</span>
          <span>{selectedShipping ? formatBRL(selectedShipping.priceCents) : '—'}</span>
        </div>
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
          className="mt-4 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </section>

      {error && (
        <p role="alert" className="mb-4 rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        onClick={() => void place()}
        disabled={!addressId || !serviceId || placing}
        className="h-12 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {placing ? 'Finalizando…' : `Confirmar pedido · ${formatBRL(total)}`}
      </button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        O pagamento entra na próxima etapa.
      </p>
    </main>
  )
}
