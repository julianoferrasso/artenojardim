'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, Lock, MessageSquare, Plus, TicketPercent } from 'lucide-react'
import { ERROR_CODES, type Address, type AppliedCoupon, type ShippingOption } from '@ecommerce/shared/contracts'
import { businessDaysLabel } from '@ecommerce/shared/constants'
import { formatSpDeliveryDay } from '@ecommerce/shared/utils'
import { useAuth } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { useShippingCep } from '@/lib/shipping-cep'
import { listAddresses } from '@/lib/addresses'
import { deliveryLabel, quoteShipping } from '@/lib/shipping'
import { confirmCheckout } from '@/lib/checkout'
import { validateCoupon, couponErrorMessage, isCouponError } from '@/lib/coupons'
import { formatBRL, cn, maskCep } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RadioCard } from '@/components/ui/radio-card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckoutSteps } from '@/components/checkout-steps'
import { ProductImage } from '@/components/product-image'
import { AddressForm } from '@/components/address-form'
import { MadeToOrderNotice } from '@/components/stock-status'

/**
 * Checkout em página única com seções (não wizard): cada navegação é um ponto de
 * abandono. O cliente escolhe endereço e frete; o total mostrado é uma prévia — o
 * backend recalcula tudo do banco ao confirmar, e o pedido criado é a verdade.
 *
 * O CEP que o cliente já informou no simulador escolhe o endereço salvo de mesmo
 * CEP, ou abre o cadastro aqui mesmo já preenchido. Mandar o cliente para a conta
 * cadastrar endereço era sair do checkout e digitar o CEP de novo.
 */

/** Quem simulou o frete para um CEP quer receber nele; senão, o padrão. */
const pickAddress = (list: Address[], cep: string | null): Address | undefined =>
  list.find((a) => a.zipCode === cep) ?? list.find((a) => a.isDefault) ?? list[0]

const GRID = 'grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-10'

const SectionTitle = ({ id, step, children }: { id: string; step: number; children: React.ReactNode }) => (
  <h2 id={id} className="mb-4 flex items-center gap-2.5 text-lg font-medium">
    <span
      className="grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground"
      aria-hidden
    >
      {step}
    </span>
    {children}
  </h2>
)

const EmptyNote = ({ children }: { children: React.ReactNode }) => (
  <p className="rounded-lg border border-dashed border-border px-4 py-5 text-center text-sm text-muted-foreground">
    {children}
  </p>
)

export default function CheckoutPage() {
  const { customer, loading: authLoading } = useAuth()
  const { cart, loading: cartLoading, refresh: refreshCart } = useCart()
  const { cep: savedCep, ready: cepReady, setCep: saveCep } = useShippingCep()
  const router = useRouter()

  const [addresses, setAddresses] = useState<Address[] | null>(null)
  const [addressId, setAddressId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [formDefaults, setFormDefaults] = useState<{ zipCode?: string | undefined; recipient?: string | undefined }>({})
  /** CEP digitado no form ainda não salvo: o frete já cota por ele. */
  const [formZip, setFormZip] = useState<string | null>(null)
  const [options, setOptions] = useState<ShippingOption[] | null>(null)
  const [serviceId, setServiceId] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [noteOpen, setNoteOpen] = useState(false)
  const [quoting, setQuoting] = useState(false)
  const [quoteError, setQuoteError] = useState<string | null>(null)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [couponOpen, setCouponOpen] = useState(false)
  const [couponInput, setCouponInput] = useState('')
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [couponError, setCouponError] = useState<string | null>(null)
  const [applyingCoupon, setApplyingCoupon] = useState(false)
  /** Força a recotação: os itens não mudam quando só a pronta entrega acabou. */
  const [quoteNonce, setQuoteNonce] = useState(0)
  /** A pronta entrega acabou entre a tela e o confirmar: o prazo cresceu. */
  const [timeChanged, setTimeChanged] = useState(false)

  const items = (cart?.items ?? []).filter((i) => i.purchasable)
  const itemsKey = items.map((i) => `${i.variantId}:${i.quantity}`).join(',')

  // Guards: sem sessão vai para login (e volta para cá); carrinho vazio volta ao carrinho.
  useEffect(() => {
    if (!authLoading && !customer) router.replace('/entrar?next=/checkout')
  }, [authLoading, customer, router])
  useEffect(() => {
    if (!cartLoading && cart && items.length === 0) router.replace('/carrinho')
  }, [cartLoading, cart, items.length, router])

  const openForm = (zip: string | null) => {
    setFormDefaults({ zipCode: zip ?? undefined, recipient: customer?.name })
    setFormZip(zip)
    setFormKey((k) => k + 1)
    setFormOpen(true)
    setAddressId(null)
  }

  // Espera o CEP lembrado sair do localStorage: é ele que escolhe o endereço.
  // Pelo id e não pelo objeto: a renovação da sessão troca o objeto e reabriria
  // o formulário que o cliente está preenchendo.
  const customerId = customer?.id
  useEffect(() => {
    if (!customerId || !cepReady) return
    listAddresses()
      .then((list) => {
        setAddresses(list)
        const picked = pickAddress(list, savedCep)
        if (picked) setAddressId(picked.id)
        else openForm(savedCep)
      })
      .catch(() => setError('Não foi possível carregar seus endereços. Recarregue a página.'))
    // Só na chegada: depois, o CEP lembrado muda porque o cliente escolheu um endereço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, cepReady])

  const selectAddress = (a: Address) => {
    setAddressId(a.id)
    saveCep(a.zipCode)
  }

  const onAddressSaved = (a: Address) => {
    setAddresses((prev) => [...(prev ?? []), a])
    setFormOpen(false)
    setFormZip(null)
    selectAddress(a)
  }

  const cancelForm = () => {
    setFormOpen(false)
    setFormZip(null)
    setAddressId(pickAddress(addresses ?? [], savedCep)?.id ?? null)
  }

  const selectedAddress = addresses?.find((a) => a.id === addressId) ?? null
  const destinationZip = formOpen ? formZip : (selectedAddress?.zipCode ?? null)
  // CEP simulado que não é de nenhum endereço salvo: vira atalho para cadastrá-lo.
  const unmatchedCep =
    savedCep && addresses && !addresses.some((a) => a.zipCode === savedCep) ? savedCep : null

  // Recota quando muda o CEP de destino ou os itens (o minicarrinho abre por cima).
  // Sem cache: aqui o valor precisa estar fresco — o confirm recota de qualquer jeito.
  useEffect(() => {
    setOptions(null)
    setServiceId(null)
    setQuoteError(null)
    if (!destinationZip || items.length === 0) {
      setQuoting(false)
      return
    }
    let stale = false
    setQuoting(true)
    quoteShipping({
      zipCode: destinationZip,
      items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    })
      .then((opts) => {
        if (stale) return
        setOptions(opts)
        setServiceId(opts[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (stale) return
        setQuoteError(
          err instanceof ApiError && err.code === 'SHIPPING_UNAVAILABLE'
            ? 'Frete indisponível para este endereço/itens.'
            : 'Não foi possível calcular o frete.',
        )
      })
      .finally(() => {
        if (!stale) setQuoting(false)
      })
    return () => {
      stale = true
    }
    // `itemsKey` representa `items`, recriado a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [destinationZip, itemsKey, quoteNonce])

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
  const itemCount = items.reduce((n, i) => n + i.quantity, 0)

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
    setTimeChanged(false)
    try {
      const order = await confirmCheckout({
        addressId,
        shippingServiceId: serviceId,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(note.trim() ? { customerNote: note.trim() } : {}),
        // O prazo que o cliente viu. Se crescer no confirm, a API recusa em vez
        // de mudar a promessa calada.
        ...(selectedShipping ? { expectedProductionDays: selectedShipping.productionDays } : {}),
      })
      router.replace(`/checkout/pedido/${order.id}`)
    } catch (err) {
      // A pronta entrega acabou no meio do caminho: relê o carrinho (as linhas
      // mostram o que passa a ser produzido) e recota (a data nova aparece).
      if (err instanceof ApiError && err.code === ERROR_CODES.PRODUCTION_TIME_CHANGED) {
        setTimeChanged(true)
        await refreshCart()
        setQuoteNonce((n) => n + 1)
        setPlacing(false)
        return
      }
      // O cupom pode ter expirado ou esgotado desde que foi aplicado: sai do
      // resumo para o cliente ver o total novo antes de confirmar de novo.
      if (isCouponError(err)) {
        setCoupon(null)
        setCouponOpen(true)
        setCouponError(couponErrorMessage(err))
        setError('O cupom não pôde ser usado e foi removido. Confira o novo total.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível finalizar o pedido.')
      }
      setPlacing(false)
    }
  }

  if (authLoading || cartLoading) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-8 lg:py-10" aria-busy="true">
        <Skeleton className="h-6 w-64" />
        <div className={cn(GRID, 'mt-6')}>
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-60" />
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
          <Skeleton className="h-96" />
        </div>
        <span className="sr-only">Carregando…</span>
      </main>
    )
  }
  if (!customer || items.length === 0) return null

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <CheckoutSteps current="delivery" />
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight md:text-4xl">Finalizar compra</h1>

      <div className={cn(GRID, 'mt-6')}>
        <div className="flex min-w-0 flex-col gap-8">
          {/* Endereço */}
          <section aria-labelledby="address-title">
            <SectionTitle id="address-title" step={1}>
              Endereço de entrega
            </SectionTitle>
            {!addresses ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-20" />
                <Skeleton className="h-20" />
              </div>
            ) : formOpen ? (
              <Card className="p-5">
                <AddressForm
                  key={formKey}
                  defaults={formDefaults}
                  minimal
                  submitLabel="Usar este endereço"
                  onSaved={onAddressSaved}
                  onZipCodeChange={setFormZip}
                  onCancel={addresses.length > 0 ? cancelForm : undefined}
                />
              </Card>
            ) : (
              <>
                <fieldset className="flex min-w-0 flex-col gap-3">
                  <legend className="sr-only">Endereço de entrega</legend>
                  {addresses.map((a) => (
                    <RadioCard
                      key={a.id}
                      name="address"
                      checked={addressId === a.id}
                      onSelect={() => selectAddress(a)}
                      title={a.label || a.recipient}
                      description={
                        <>
                          {a.street}, {a.number}
                          {a.complement ? ` — ${a.complement}` : ''} · {a.district}
                          <br />
                          {a.city}/{a.state} · CEP {maskCep(a.zipCode)}
                        </>
                      }
                    />
                  ))}
                </fieldset>
                <button
                  type="button"
                  onClick={() => openForm(unmatchedCep)}
                  className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
                >
                  <Plus className="size-4" aria-hidden />
                  {unmatchedCep ? `Entregar no CEP ${maskCep(unmatchedCep)}` : 'Entregar em outro endereço'}
                </button>
              </>
            )}
          </section>

          {/* Frete */}
          <section aria-labelledby="shipping-title">
            <SectionTitle id="shipping-title" step={2}>
              Forma de entrega
            </SectionTitle>
            {quoting ? (
              <div className="flex flex-col gap-3">
                <Skeleton className="h-16" />
                <Skeleton className="h-16" />
                <span className="sr-only" role="status">
                  Calculando frete…
                </span>
              </div>
            ) : quoteError ? (
              <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {quoteError}
              </p>
            ) : !options ? (
              <EmptyNote>
                {formOpen ? 'Informe o CEP para ver o frete.' : 'Escolha um endereço para ver o frete.'}
              </EmptyNote>
            ) : options.length === 0 ? (
              <EmptyNote>Nenhuma opção de frete para este endereço.</EmptyNote>
            ) : (
              <fieldset className="flex min-w-0 flex-col gap-3">
                <legend className="sr-only">Forma de entrega</legend>
                {options.map((o) => (
                  <RadioCard
                    key={o.id}
                    name="shipping"
                    checked={serviceId === o.id}
                    onSelect={() => setServiceId(o.id)}
                    title={`${o.carrier} · ${o.service}`}
                    description={deliveryLabel(o)}
                    aside={
                      o.priceCents === 0 ? (
                        <span className="font-medium text-success">Grátis</span>
                      ) : (
                        <span className="font-medium">{formatBRL(o.priceCents)}</span>
                      )
                    }
                  />
                ))}
                <p className="text-xs text-muted-foreground">
                  {options[0] && options[0].productionDays > 0
                    ? `As datas incluem até ${businessDaysLabel(options[0].productionDays)} de produção do item sob encomenda e valem para pagamento aprovado hoje.`
                    : 'As datas valem para pagamento aprovado hoje.'}
                </p>
              </fieldset>
            )}
          </section>

          {/* Observação */}
          <div className="rounded-lg border border-border bg-card">
            <button
              type="button"
              onClick={() => setNoteOpen((v) => !v)}
              aria-expanded={noteOpen}
              aria-controls="order-note"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium"
            >
              <MessageSquare className="size-4 shrink-0 text-primary-ink" aria-hidden />
              Adicionar observação para a loja
              <span className="font-normal text-muted-foreground">(opcional)</span>
              <ChevronDown
                className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', noteOpen && 'rotate-180')}
                aria-hidden
              />
            </button>
            <div id="order-note" hidden={!noteOpen} className="border-t border-border p-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                maxLength={500}
                aria-label="Observação para a loja"
                placeholder="Ex.: é para presente, embalar com cuidado."
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
              />
            </div>
          </div>
        </div>

        {/* Resumo */}
        <aside aria-labelledby="summary-title" className="lg:sticky lg:top-8">
          <Card className="p-5">
            <h2 id="summary-title" className="text-lg font-medium">
              Resumo do pedido
            </h2>

            {/* pt-2/pr-2: o selo de quantidade sai da miniatura e a rolagem o cortaria. */}
            <ul className="mt-2 flex max-h-64 flex-col gap-3 overflow-y-auto pr-2 pt-2 text-sm">
              {items.map((i) => (
                <li key={i.id} className="flex items-center gap-3">
                  <div className="relative shrink-0">
                    <div className="relative size-14 overflow-hidden rounded-lg bg-muted">
                      <ProductImage src={i.imageUrl} alt={i.productName} fit="cover" sizes="56px" />
                    </div>
                    <span className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-btn-primary text-xs font-semibold text-btn-primary-foreground">
                      {i.quantity}
                    </span>
                  </div>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="line-clamp-2">{i.productName}</span>
                    {i.madeToOrderQuantity > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {i.madeToOrderQuantity >= i.quantity
                          ? 'Sob encomenda'
                          : `${i.madeToOrderQuantity} sob encomenda`}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 font-medium">{formatBRL(i.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <MadeToOrderNotice items={items} className="mt-4" />

            <div className="mt-4 border-t border-border pt-4">
              {coupon ? (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm">
                  <span className="flex items-center gap-1.5">
                    <TicketPercent className="size-4 shrink-0 text-success" aria-hidden />
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
              ) : couponOpen ? (
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
                    placeholder="Código do cupom"
                    aria-label="Cupom de desconto"
                    autoComplete="off"
                    autoFocus
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
              ) : (
                <button
                  type="button"
                  onClick={() => setCouponOpen(true)}
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-ink hover:underline"
                >
                  <TicketPercent className="size-4" aria-hidden />
                  Tem um cupom de desconto?
                </button>
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

            <dl className="mt-4 flex flex-col gap-1.5 border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">
                  Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})
                </dt>
                <dd>{formatBRL(subtotal)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">Frete</dt>
                <dd>
                  {!selectedShipping ? (
                    '—'
                  ) : shippingPrice === 0 ? (
                    <span className="text-success">Grátis</span>
                  ) : (
                    formatBRL(shippingPrice)
                  )}
                </dd>
              </div>
              {coupon && couponDiscount > 0 && (
                <div className="flex justify-between gap-3 text-success">
                  <dt>Desconto ({coupon.code})</dt>
                  <dd>−{formatBRL(couponDiscount)}</dd>
                </div>
              )}
              {selectedShipping?.estimatedDeliveryAt && (
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Entrega prevista</dt>
                  <dd>até {formatSpDeliveryDay(selectedShipping.estimatedDeliveryAt)}</dd>
                </div>
              )}
              <div className="mt-2 flex items-baseline justify-between gap-3 border-t border-border pt-3">
                <dt className="font-medium">Total</dt>
                <dd className="text-xl font-semibold tracking-tight">{formatBRL(total)}</dd>
              </div>
            </dl>

            {timeChanged && (
              <p role="alert" className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                A pronta entrega de um item acabou agora há pouco, e o que faltava passa a ser produzido sob
                encomenda. Confira a nova data de entrega e confirme de novo.
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button
              onClick={() => void place()}
              disabled={!addressId || !serviceId || placing || formOpen}
              className={cn(buttonVariants({ size: 'lg' }), 'mt-5 w-full')}
            >
              {placing ? 'Finalizando…' : 'Ir para o pagamento'}
            </button>
            <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
              {formOpen ? (
                'Salve o endereço de entrega para continuar.'
              ) : (
                <>
                  <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                  Na próxima etapa: Pix ou cartão de crédito, em ambiente seguro.
                </>
              )}
            </p>
          </Card>
        </aside>
      </div>
    </main>
  )
}
