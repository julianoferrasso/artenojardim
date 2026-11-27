'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ChevronDown, IdCard, Lock, Mail, MessageSquare, Plus, TicketPercent } from 'lucide-react'
import {
  ERROR_CODES,
  customerNameSchema,
  emailSchema,
  type Address,
  type AppliedCoupon,
  type AuthCustomer,
  type CreateAddressInput,
  type ShippingOption,
} from '@ecommerce/shared/contracts'
import { businessDaysLabel, isValidCpf } from '@ecommerce/shared/constants'
import { formatSpDeliveryDay, suggestEmailDomain } from '@ecommerce/shared/utils'
import { useAuth, authErrorMessage, type SessionResp } from '@/lib/auth'
import { useCart } from '@/lib/cart'
import { useShippingCep } from '@/lib/shipping-cep'
import { createAddress, listAddresses } from '@/lib/addresses'
import { requestEmailCode } from '@/lib/account'
import { deliveryLabel, quoteShipping } from '@/lib/shipping'
import { confirmCheckout } from '@/lib/checkout'
import { validateCoupon, couponErrorMessage, isCouponError } from '@/lib/coupons'
import { formatBRL, cn, fieldClass, maskCep, maskCpf } from '@/lib/utils'
import { ApiError } from '@/lib/api'
import { buttonVariants } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { RadioCard } from '@/components/ui/radio-card'
import { Skeleton } from '@/components/ui/skeleton'
import { CheckoutSteps } from '@/components/checkout-steps'
import { ProductImage } from '@/components/product-image'
import { AddressForm } from '@/components/address-form'
import { EmailCodeStep, resendWaitSeconds } from '@/components/email-code-step'
import { MadeToOrderNotice } from '@/components/stock-status'

/**
 * Checkout em página única com seções (não wizard): cada navegação é um ponto de
 * abandono. O cliente escolhe endereço e frete; o total mostrado é uma prévia — o
 * backend recalcula tudo do banco ao confirmar, e o pedido criado é a verdade.
 *
 * O CEP que o cliente já informou no simulador escolhe o endereço salvo de mesmo
 * CEP, ou abre o cadastro aqui mesmo já preenchido. Mandar o cliente para a conta
 * cadastrar endereço era sair do checkout e digitar o CEP de novo.
 *
 * SEM CONTA o checkout abre igual: e-mail, nome, endereço (rascunho, só na tela),
 * frete e CPF. O e-mail só é confirmado no "Ir para o pagamento", por um código
 * de 6 dígitos digitado ali mesmo — mandar para o cadastro e para um link no
 * e-mail era o salto que perdia a compra. O código certo cria a conta (ou entra
 * na que existia), e daí em diante é o fluxo de quem está logado.
 */

/** Quem simulou o frete para um CEP quer receber nele; senão, o padrão. */
const pickAddress = (list: Address[], cep: string | null): Address | undefined =>
  list.find((a) => a.zipCode === cep) ?? list.find((a) => a.isDefault) ?? list[0]

const norm = (v: string | null | undefined): string => (v ?? '').trim().toLowerCase()

/** O rascunho é um endereço que a conta já tem? Então reaproveita, sem duplicar. */
const sameAddress = (a: Address, d: CreateAddressInput): boolean =>
  a.zipCode === d.zipCode &&
  norm(a.street) === norm(d.street) &&
  norm(a.number) === norm(d.number) &&
  norm(a.complement) === norm(d.complement) &&
  norm(a.recipient) === norm(d.recipient)

/** Ordenado: o carrinho mesclado no login pode voltar com as linhas em outra ordem, e isso não é mudança. */
const itemsKeyOf = (items: Array<{ variantId: string; quantity: number }>): string =>
  items
    .map((i) => `${i.variantId}:${i.quantity}`)
    .sort()
    .join(',')

/**
 * O que o visitante já preencheu fica na ABA (sessionStorage): no celular, a aba
 * costuma ser descarregada enquanto ele vai buscar o código no e-mail, e voltar
 * para um formulário vazio é o abandono que isto evita. O CPF fica de fora de
 * propósito — dado fiscal não fica guardado no navegador.
 */
const GUEST_KEY = 'anj:checkout-guest:v1'
/** Os da API (código vale 10 min, reenvio a cada 60 s). Aqui só decidem se vale reabrir o passo do código. */
const CODE_TTL_MS = 10 * 60_000
const RESEND_MS = 60_000

type GuestDraft = {
  email: string
  name: string
  address: CreateAddressInput | null
  code: { email: string; sentAt: number } | null
}

const readGuest = (): GuestDraft | null => {
  try {
    const raw = sessionStorage.getItem(GUEST_KEY)
    if (!raw) return null
    const g = JSON.parse(raw) as Partial<GuestDraft>
    return {
      email: typeof g.email === 'string' ? g.email : '',
      name: typeof g.name === 'string' ? g.name : '',
      address: g.address && typeof g.address.zipCode === 'string' ? g.address : null,
      code: g.code && typeof g.code.email === 'string' && typeof g.code.sentAt === 'number' ? g.code : null,
    }
  } catch {
    return null
  }
}

const writeGuest = (g: GuestDraft | null): void => {
  try {
    if (g) sessionStorage.setItem(GUEST_KEY, JSON.stringify(g))
    else sessionStorage.removeItem(GUEST_KEY)
  } catch {
    // Aba privada ou armazenamento cheio: o checkout segue, só não sobrevive a recarregar.
  }
}

type CodeStep = { email: string; resendInSeconds: number; sentAt: number }

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
  const { customer, loading: authLoading, applyProfile, applySession } = useAuth()
  const { cart, loading: cartLoading, refresh: refreshCart } = useCart()
  const { cep: savedCep, ready: cepReady, setCep: saveCep } = useShippingCep()
  const router = useRouter()

  const [addresses, setAddresses] = useState<Address[] | null>(null)
  const [addressId, setAddressId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [formKey, setFormKey] = useState(0)
  const [formDefaults, setFormDefaults] = useState<Partial<CreateAddressInput>>({})
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
  /** Só para quem não tem CPF no cadastro: a transportadora exige na declaração de conteúdo. */
  const [cpf, setCpf] = useState('')
  const [cpfTouched, setCpfTouched] = useState(false)

  // ── Visitante sem conta ──
  const [contactEmail, setContactEmail] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactTouched, setContactTouched] = useState(false)
  const [emailSuggestion, setEmailSuggestion] = useState<string | null>(null)
  /** O endereço do visitante: só na tela até o código confirmar o e-mail. */
  const [draft, setDraft] = useState<CreateAddressInput | null>(null)
  const [codeStep, setCodeStep] = useState<CodeStep | null>(null)
  const [requestingCode, setRequestingCode] = useState(false)
  /** A conta já tinha itens no carrinho e eles foram somados ao entrar: o cliente vê antes de pagar. */
  const [cartNotice, setCartNotice] = useState(false)
  /** O sessionStorage já foi lido: antes disso, gravar apagaria o que ele guardava. */
  const [guestLoaded, setGuestLoaded] = useState(false)
  /**
   * Entre o código e o pedido a página troca de visitante para logado. Enquanto
   * isso o efeito de endereços não pode agir sozinho: abriria o formulário (a
   * conta nova ainda não tem endereço) por cima do rascunho que está sendo salvo.
   */
  const transitioning = useRef(false)

  const items = (cart?.items ?? []).filter((i) => i.purchasable)
  const itemsKey = itemsKeyOf(items)
  const isGuest = !authLoading && !customer

  // Carrinho vazio volta ao carrinho.
  useEffect(() => {
    if (!cartLoading && cart && items.length === 0) router.replace('/carrinho')
  }, [cartLoading, cart, items.length, router])

  const openForm = (zip: string | null, prefill?: Partial<CreateAddressInput>) => {
    setFormDefaults(
      prefill ?? { zipCode: zip ?? undefined, recipient: customer?.name ?? (contactName.trim() || undefined) },
    )
    setFormZip(prefill?.zipCode ?? zip)
    setFormKey((k) => k + 1)
    setFormOpen(true)
    setAddressId(null)
  }

  /** `prefill`: o rascunho do visitante, se a conta não tiver endereço nenhum para escolher. */
  const loadAddresses = (prefill?: CreateAddressInput | null) =>
    listAddresses()
      .then((list) => {
        setAddresses(list)
        const picked = pickAddress(list, savedCep)
        if (picked) setAddressId(picked.id)
        else openForm(savedCep, prefill ?? undefined)
      })
      .catch(() => setError('Não foi possível carregar seus endereços. Recarregue a página.'))

  // Espera o CEP lembrado sair do localStorage: é ele que escolhe o endereço.
  // Pelo id e não pelo objeto: a renovação da sessão troca o objeto e reabriria
  // o formulário que o cliente está preenchendo.
  const customerId = customer?.id
  useEffect(() => {
    if (!customerId || !cepReady || transitioning.current) return
    // Quem digitou o endereço como visitante e entrou pelo "Já tem conta?" não o perde.
    void loadAddresses(readGuest()?.address)
    // Só na chegada: depois, o CEP lembrado muda porque o cliente escolheu um endereço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, cepReady])

  // Visitante: devolve o que a aba já tinha (descarregada no celular) ou abre o
  // endereço com o CEP do simulador.
  useEffect(() => {
    if (!isGuest || !cepReady || guestLoaded) return
    const stored = readGuest()
    if (stored) {
      setContactEmail(stored.email)
      setContactName(stored.name)
      if (stored.code && Date.now() - stored.code.sentAt < CODE_TTL_MS) {
        setCodeStep({
          email: stored.code.email,
          sentAt: stored.code.sentAt,
          resendInSeconds: Math.max(0, Math.ceil((stored.code.sentAt + RESEND_MS - Date.now()) / 1000)),
        })
      }
    }
    if (stored?.address) setDraft(stored.address)
    else openForm(savedCep)
    setGuestLoaded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest, cepReady, guestLoaded])

  useEffect(() => {
    if (!isGuest || !guestLoaded) return
    writeGuest({
      email: contactEmail,
      name: contactName,
      address: draft,
      code: codeStep ? { email: codeStep.email, sentAt: codeStep.sentAt } : null,
    })
  }, [isGuest, guestLoaded, contactEmail, contactName, draft, codeStep])

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

  const onDraftSaved = (payload: CreateAddressInput) => {
    setDraft(payload)
    setFormOpen(false)
    setFormZip(null)
    saveCep(payload.zipCode)
  }

  const cancelForm = () => {
    setFormOpen(false)
    setFormZip(null)
    // O visitante volta para o rascunho que já tinha; o logado, para um endereço salvo.
    if (!isGuest) setAddressId(pickAddress(addresses ?? [], savedCep)?.id ?? null)
  }

  const selectedAddress = addresses?.find((a) => a.id === addressId) ?? null
  // O `draft` entra mesmo depois do login: na troca para logado, o endereço
  // salvo ainda não chegou, e um CEP nulo por um render zeraria o frete escolhido.
  const destinationZip = formOpen ? formZip : (selectedAddress?.zipCode ?? draft?.zipCode ?? null)
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
  // Visitante sempre informa: o CPF da conta (se ela existir) só aparece depois do código.
  const needsCpf = !customer || !customer.document
  const cpfValid = isValidCpf(cpf)
  const cpfError = needsCpf && cpfTouched && !cpfValid ? 'CPF inválido. Confira os números.' : null

  // `trim` aqui: o teclado do celular deixa um espaço no fim do e-mail sugerido,
  // e o schema confere o formato antes de aparar.
  const emailParsed = emailSchema.safeParse(contactEmail.trim())
  const nameParsed = customerNameSchema.safeParse(contactName)
  const emailError = isGuest && contactTouched && !emailParsed.success ? 'Informe um e-mail válido.' : null
  const nameError =
    isGuest && contactTouched && !nameParsed.success
      ? (nameParsed.error.issues[0]?.message ?? 'Informe seu nome')
      : null

  const onEmailChange = (value: string) => {
    setContactEmail(value)
    setEmailSuggestion(null)
    // O código pedido vale para o e-mail de antes: outro endereço pede outro código.
    if (codeStep && value.trim().toLowerCase() !== codeStep.email) setCodeStep(null)
  }

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

  /**
   * Cria o pedido. Endereço, frete e cliente chegam EXPLÍCITOS: logo depois do
   * código, o estado da página ainda é o do visitante até o próximo render.
   * Devolve se o pedido nasceu (e a página já está indo para o pagamento).
   */
  const placeOrder = async (target: {
    addressId: string
    serviceId: string
    customer: AuthCustomer
  }): Promise<boolean> => {
    const sendCpf = !target.customer.document
    if (sendCpf && !cpfValid) {
      setCpfTouched(true)
      document.getElementById('checkout-cpf')?.focus()
      return false
    }
    const chosenShipping = options?.find((o) => o.id === target.serviceId) ?? null
    setPlacing(true)
    setError(null)
    setTimeChanged(false)
    try {
      const order = await confirmCheckout({
        addressId: target.addressId,
        shippingServiceId: target.serviceId,
        ...(coupon ? { couponCode: coupon.code } : {}),
        ...(note.trim() ? { customerNote: note.trim() } : {}),
        // O prazo que o cliente viu. Se crescer no confirm, a API recusa em vez
        // de mudar a promessa calada.
        ...(chosenShipping ? { expectedProductionDays: chosenShipping.productionDays } : {}),
        ...(sendCpf ? { document: cpf } : {}),
      })
      // O CPF foi gravado junto com o pedido (e já congelou): a sessão em memória
      // ainda não sabe.
      if (sendCpf) applyProfile({ ...target.customer, document: cpf.replace(/\D/g, ''), documentLocked: true })
      writeGuest(null)
      router.replace(`/checkout/pedido/${order.id}`)
      return true
    } catch (err) {
      // A pronta entrega acabou no meio do caminho: relê o carrinho (as linhas
      // mostram o que passa a ser produzido) e recota (a data nova aparece).
      if (err instanceof ApiError && err.code === ERROR_CODES.PRODUCTION_TIME_CHANGED) {
        setTimeChanged(true)
        await refreshCart()
        setQuoteNonce((n) => n + 1)
        setPlacing(false)
        return false
      }
      if (err instanceof ApiError && err.code === ERROR_CODES.DOCUMENT_REQUIRED) {
        setCpfTouched(true)
        setError('Informe o seu CPF para continuar.')
        setPlacing(false)
        return false
      }
      // O cupom pode ter expirado ou esgotado desde que foi aplicado (ou, para
      // quem acabou de confirmar o e-mail, já ter sido usado por esta conta): sai
      // do resumo para o cliente ver o total novo antes de confirmar de novo.
      if (isCouponError(err)) {
        setCoupon(null)
        setCouponOpen(true)
        setCouponError(couponErrorMessage(err))
        setError('O cupom não pôde ser usado e foi removido. Confira o novo total.')
      } else {
        setError(err instanceof ApiError ? err.message : 'Não foi possível finalizar o pedido.')
      }
      setPlacing(false)
      return false
    }
  }

  const place = () => {
    if (!addressId || !serviceId || !customer) return
    setCartNotice(false)
    void placeOrder({ addressId, serviceId, customer })
  }

  /** Visitante: valida o que a tela tem e manda o código. O pedido só nasce com ele. */
  const startGuestPayment = async () => {
    setContactTouched(true)
    if (!emailParsed.success) {
      document.getElementById('checkout-email')?.focus()
      return
    }
    if (!nameParsed.success) {
      document.getElementById('checkout-name')?.focus()
      return
    }
    if (!draft || !serviceId) return
    if (!cpfValid) {
      setCpfTouched(true)
      document.getElementById('checkout-cpf')?.focus()
      return
    }
    setRequestingCode(true)
    setError(null)
    try {
      const sent = await requestEmailCode(emailParsed.data)
      setCodeStep({ email: emailParsed.data, resendInSeconds: sent.resendInSeconds, sentAt: Date.now() })
    } catch (err) {
      // Um código acabou de sair para este e-mail (clique duplo, aba recarregada): é só digitá-lo.
      const wait = resendWaitSeconds(err)
      if (wait !== null) {
        setCodeStep({ email: emailParsed.data, resendInSeconds: wait, sentAt: Date.now() - (RESEND_MS - wait * 1000) })
      } else {
        setError(authErrorMessage(err))
      }
    } finally {
      setRequestingCode(false)
    }
  }

  /**
   * Depois do código a página vira a de quem está logado, nesta ordem: o
   * carrinho já foi mesclado pela API na própria resposta do código — relê para
   * ver se a conta somou itens (aí para e mostra); salva o rascunho como
   * endereço da conta, reaproveitando um igual; e só então cria o pedido.
   *
   * O painel do código fica na tela ("Criando o pedido…") até a navegação; só
   * fecha quando algo pede a atenção do cliente.
   */
  const completeAfterCode = async (session: SessionResp) => {
    const seenKey = itemsKey
    const chosenService = serviceId
    const chosenDraft = draft
    transitioning.current = true
    applySession(session)

    if (!chosenDraft || !chosenService) {
      transitioning.current = false
      setCodeStep(null)
      void loadAddresses(chosenDraft)
      return
    }

    let saved: Address
    try {
      const fresh = await refreshCart()
      const list = await listAddresses()
      const existing = list.find((a) => sameAddress(a, chosenDraft))
      saved = existing ?? (await createAddress(chosenDraft))
      setAddresses(existing ? list : [...list, saved])
      setAddressId(saved.id)
      setDraft(null)
      setFormOpen(false)
      saveCep(saved.zipCode)
      writeGuest(null)
      transitioning.current = false
      if (!fresh || itemsKeyOf(fresh.items.filter((i) => i.purchasable)) !== seenKey) {
        setCodeStep(null)
        setCartNotice(true)
        return
      }
    } catch {
      transitioning.current = false
      setCodeStep(null)
      setError('Seu e-mail foi confirmado, mas não conseguimos salvar o endereço. Confira e tente de novo.')
      void loadAddresses(chosenDraft)
      return
    }

    const placed = await placeOrder({ addressId: saved.id, serviceId: chosenService, customer: session.customer })
    // O erro (cupom, prazo, CPF) já está no resumo; o código foi gasto, então o painel sai.
    if (!placed) setCodeStep(null)
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
  if (items.length === 0) return null

  // O visitante ganha o passo "Seus dados" na frente; os outros andam uma casa.
  const stepOffset = isGuest ? 1 : 0
  const canPay = isGuest ? !!draft && !!serviceId : !!addressId && !!serviceId

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 lg:py-10">
      <CheckoutSteps current="delivery" />
      <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight md:text-4xl">Finalizar compra</h1>

      <div className={cn(GRID, 'mt-6')}>
        <div className="flex min-w-0 flex-col gap-8">
          {/* Seus dados — só para quem ainda não entrou */}
          {isGuest && (
            <section aria-labelledby="contact-title">
              <SectionTitle id="contact-title" step={1}>
                Seus dados
              </SectionTitle>
              <Card className="p-5">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="checkout-email" className="text-sm font-medium">
                      E-mail
                    </label>
                    <input
                      id="checkout-email"
                      type="email"
                      inputMode="email"
                      autoComplete="email"
                      value={contactEmail}
                      onChange={(e) => onEmailChange(e.target.value)}
                      onBlur={() => setEmailSuggestion(suggestEmailDomain(contactEmail.trim()))}
                      aria-invalid={!!emailError}
                      aria-describedby="checkout-email-help"
                      className={cn(fieldClass, 'aria-invalid:border-destructive')}
                    />
                    {emailError ? (
                      <p role="alert" className="text-xs text-destructive">
                        {emailError}
                      </p>
                    ) : emailSuggestion ? (
                      <p className="text-xs text-muted-foreground">
                        Você quis dizer{' '}
                        <button
                          type="button"
                          onClick={() => {
                            onEmailChange(emailSuggestion)
                            setEmailSuggestion(null)
                          }}
                          className="font-medium text-primary-ink hover:underline"
                        >
                          {emailSuggestion}
                        </button>
                        ?
                      </p>
                    ) : (
                      <p id="checkout-email-help" className="text-xs text-muted-foreground">
                        É por ele que confirmamos o pedido e mandamos as novidades da entrega.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="checkout-name" className="text-sm font-medium">
                      Nome completo
                    </label>
                    <input
                      id="checkout-name"
                      autoComplete="name"
                      value={contactName}
                      onChange={(e) => setContactName(e.target.value)}
                      aria-invalid={!!nameError}
                      className={cn(fieldClass, 'aria-invalid:border-destructive')}
                    />
                    {nameError && (
                      <p role="alert" className="text-xs text-destructive">
                        {nameError}
                      </p>
                    )}
                  </div>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  Já comprou aqui?{' '}
                  <Link href="/entrar?next=/checkout" className="font-medium text-primary-ink hover:underline">
                    Entre
                  </Link>{' '}
                  para usar seus endereços salvos.
                </p>
              </Card>
            </section>
          )}

          {/* Endereço */}
          <section aria-labelledby="address-title">
            <SectionTitle id="address-title" step={1 + stepOffset}>
              Endereço de entrega
            </SectionTitle>
            {isGuest ? (
              formOpen ? (
                <Card className="p-5">
                  <AddressForm
                    key={formKey}
                    defaults={formDefaults}
                    minimal
                    submitLabel="Usar este endereço"
                    onDraft={onDraftSaved}
                    onZipCodeChange={setFormZip}
                    onCancel={draft ? cancelForm : undefined}
                  />
                </Card>
              ) : draft ? (
                <Card className="flex items-start justify-between gap-4 p-5">
                  <p className="text-sm">
                    <span className="font-medium">{draft.recipient}</span>
                    <br />
                    <span className="text-muted-foreground">
                      {draft.street}, {draft.number}
                      {draft.complement ? ` — ${draft.complement}` : ''} · {draft.district}
                      <br />
                      {draft.city}/{draft.state} · CEP {maskCep(draft.zipCode)}
                    </span>
                  </p>
                  <button
                    type="button"
                    onClick={() => openForm(draft.zipCode, draft)}
                    className="shrink-0 text-sm font-medium text-primary-ink hover:underline"
                  >
                    Alterar
                  </button>
                </Card>
              ) : (
                <Skeleton className="h-20" />
              )
            ) : !addresses ? (
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
            <SectionTitle id="shipping-title" step={2 + stepOffset}>
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

          {needsCpf && (
            <section aria-labelledby="cpf-title">
              <SectionTitle id="cpf-title" step={3 + stepOffset}>
                CPF do destinatário
              </SectionTitle>
              <Card className="p-5">
                <label htmlFor="checkout-cpf" className="flex items-center gap-1.5 text-sm font-medium">
                  <IdCard className="size-4 text-primary-ink" aria-hidden />
                  CPF
                </label>
                <input
                  id="checkout-cpf"
                  value={cpf}
                  onChange={(e) => setCpf(maskCpf(e.target.value))}
                  onBlur={() => setCpfTouched(true)}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  aria-invalid={!!cpfError}
                  aria-describedby="checkout-cpf-help"
                  className="mt-1.5 h-10 w-full max-w-60 rounded-lg border border-input bg-card px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 aria-invalid:border-destructive"
                />
                {cpfError ? (
                  <p role="alert" className="mt-1.5 text-xs text-destructive">
                    {cpfError}
                  </p>
                ) : (
                  <p id="checkout-cpf-help" className="mt-1.5 text-xs text-muted-foreground">
                    Exigido pela transportadora na declaração de envio. Pedimos uma vez só.
                  </p>
                )}
              </Card>
            </section>
          )}

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
                placeholder="Fique à vontade para escrever aqui. Vamos ler seu recado com carinho!"
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

            {cartNotice && (
              <p role="status" className="mt-4 rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
                Você já tinha itens no carrinho da sua conta, e eles foram somados a este pedido. Confira o
                resumo e toque em Ir para o pagamento.
              </p>
            )}

            {codeStep ? (
              <div className="mt-5 border-t border-border pt-4">
                <h3 className="mb-3 flex items-center gap-2 text-base font-medium">
                  <Mail className="size-4 text-primary-ink" aria-hidden />
                  Confirme o seu e-mail
                </h3>
                <EmailCodeStep
                  key={codeStep.sentAt}
                  email={codeStep.email}
                  resendInSeconds={codeStep.resendInSeconds}
                  name={nameParsed.success ? nameParsed.data : undefined}
                  onVerified={completeAfterCode}
                  onChangeEmail={() => {
                    setCodeStep(null)
                    document.getElementById('checkout-email')?.focus()
                  }}
                  submitLabel="Confirmar e ir para o pagamento"
                  busyLabel="Criando o pedido…"
                />
              </div>
            ) : (
              <>
                <button
                  onClick={() => (isGuest ? void startGuestPayment() : place())}
                  disabled={!canPay || placing || formOpen || requestingCode}
                  className={cn(buttonVariants({ size: 'lg' }), 'mt-5 w-full')}
                >
                  {placing ? 'Finalizando…' : requestingCode ? 'Enviando o código…' : 'Ir para o pagamento'}
                </button>
                <p className="mt-3 flex items-start justify-center gap-1.5 text-center text-xs text-muted-foreground">
                  {formOpen ? (
                    isGuest ? 'Confirme o endereço de entrega para continuar.' : 'Salve o endereço de entrega para continuar.'
                  ) : isGuest ? (
                    <>
                      <Mail className="mt-px size-3.5 shrink-0" aria-hidden />
                      Antes do pagamento, enviamos um código ao seu e-mail para confirmar o pedido. Depois: Pix ou
                      cartão, em ambiente seguro.
                    </>
                  ) : (
                    <>
                      <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
                      Na próxima etapa: Pix ou cartão de crédito, em ambiente seguro.
                    </>
                  )}
                </p>
              </>
            )}
          </Card>
        </aside>
      </div>
    </main>
  )
}
