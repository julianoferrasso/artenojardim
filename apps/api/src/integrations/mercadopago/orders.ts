import { mpRequest, mpFailure } from './client.js'
import { centsToMp, mpToCents } from './money.js'

/**
 * Orders API (`/v1/orders`) do Checkout Transparente. Fala o vocabulário do MP
 * para fora e devolve um retrato NEUTRO, em centavos — quem decide o que o
 * status significa para o pedido é o módulo de pagamentos, não esta camada.
 */

// ── O que lemos da order do MP (o resto é ignorado; tudo opcional: o MP omite vazio)

type MpApiPayment = {
  id?: string
  status?: string
  status_detail?: string
  paid_amount?: string
  refunded_amount?: string
  date_of_expiration?: string
  payment_method?: {
    id?: string
    type?: string
    installments?: number
    qr_code?: string
    qr_code_base64?: string
    ticket_url?: string
  }
}

type MpApiOrder = {
  id?: string
  status?: string
  status_detail?: string
  external_reference?: string
  total_amount?: string
  total_paid_amount?: string
  transactions?: {
    payments?: MpApiPayment[]
    refunds?: Array<{ amount?: string; status?: string }>
  }
}

// ── Retrato neutro ───────────────────────────────────────────────────────────

export type MpPixData = { qrCode: string; qrCodeBase64: string; ticketUrl: string | null }

export type MpOrderSnapshot = {
  id: string
  externalReference: string | null
  /** Status cru da order: created, processing, action_required, processed, failed… */
  status: string
  statusDetail: string | null
  totalCents: number
  paidCents: number
  refundedCents: number
  /** A transação de pagamento (uma por order neste fluxo). */
  payment: {
    id: string | null
    status: string | null
    /** O motivo específico mora aqui (insufficient_amount…); o da order costuma ser genérico. */
    statusDetail: string | null
    /** Bandeira ou "pix". */
    methodId: string | null
    /** credit_card, debit_card, bank_transfer… */
    methodType: string | null
    installments: number | null
    pix: MpPixData | null
    expiresAt: Date | null
  } | null
}

const REFUND_NOT_DONE = new Set(['failed', 'rejected', 'canceled', 'cancelled'])

const toSnapshot = (order: MpApiOrder): MpOrderSnapshot => {
  if (!order.id) throw new Error('order do Mercado Pago sem id')
  const payment = order.transactions?.payments?.[0]
  const method = payment?.payment_method

  // O MP expõe o reembolsado em dois lugares conforme o fluxo; o maior é o fato.
  const refundedByPayments = (order.transactions?.payments ?? []).reduce(
    (sum, p) => sum + mpToCents(p.refunded_amount),
    0,
  )
  const refundedByRefunds = (order.transactions?.refunds ?? [])
    .filter((r) => !REFUND_NOT_DONE.has(r.status ?? ''))
    .reduce((sum, r) => sum + mpToCents(r.amount), 0)

  return {
    id: order.id,
    externalReference: order.external_reference ?? null,
    status: order.status ?? 'unknown',
    statusDetail: order.status_detail ?? null,
    totalCents: mpToCents(order.total_amount),
    paidCents: mpToCents(order.total_paid_amount ?? payment?.paid_amount),
    refundedCents: Math.max(refundedByPayments, refundedByRefunds),
    payment: payment
      ? {
          id: payment.id ?? null,
          status: payment.status ?? null,
          statusDetail: payment.status_detail ?? null,
          methodId: method?.id ?? null,
          methodType: method?.type ?? null,
          installments: method?.installments ?? null,
          pix:
            method?.qr_code && method.qr_code_base64
              ? {
                  qrCode: method.qr_code,
                  qrCodeBase64: method.qr_code_base64,
                  ticketUrl: method.ticket_url ?? null,
                }
              : null,
          expiresAt: payment.date_of_expiration ? new Date(payment.date_of_expiration) : null,
        }
      : null,
  }
}

// ── Entrada ──────────────────────────────────────────────────────────────────

export type MpPayer = {
  email: string
  firstName?: string
  lastName?: string
  identification?: { type: 'CPF' | 'CNPJ'; number: string }
  address?: {
    zipCode: string
    streetName: string
    streetNumber: string
    neighborhood: string
    city: string
    state: string
    complement?: string
  }
}

export type MpItem = {
  title: string
  quantity: number
  unitPriceCents: number
  externalCode?: string
  description?: string
  pictureUrl?: string
  /** Categoria do catálogo do MP (GET /item_categories): "home", "services"… */
  categoryId?: string
}

type CreateBase = {
  /** Id do NOSSO pedido: é por ele que uma order órfã volta a casar. */
  externalReference: string
  amountCents: number
  description: string
  payer: MpPayer
  /** Itens melhoram a análise antifraude; a soma tem de bater com o total. */
  items?: MpItem[]
  idempotencyKey: string
  /** Vai no header X-meli-session-id; ausente, a cobrança segue sem ele. */
  deviceId?: string | undefined
}

/** Texto da fatura do cartão. Curto de propósito: algumas bandeiras cortam. */
const STATEMENT_DESCRIPTOR = 'ARTENOJARDIM'

const toMpPayer = (p: MpPayer) => ({
  email: p.email,
  ...(p.firstName ? { first_name: p.firstName } : {}),
  ...(p.lastName ? { last_name: p.lastName } : {}),
  ...(p.identification ? { identification: p.identification } : {}),
  ...(p.address
    ? {
        address: {
          zip_code: p.address.zipCode,
          street_name: p.address.streetName,
          street_number: p.address.streetNumber,
          neighborhood: p.address.neighborhood,
          city: p.address.city,
          state: p.address.state,
          ...(p.address.complement ? { complement: p.address.complement } : {}),
        },
      }
    : {}),
})

const toMpItems = (items: MpItem[]) =>
  items.map((i) => ({
    title: i.title,
    quantity: i.quantity,
    unit_price: centsToMp(i.unitPriceCents),
    ...(i.externalCode ? { external_code: i.externalCode } : {}),
    ...(i.description ? { description: i.description } : {}),
    ...(i.pictureUrl ? { picture_url: i.pictureUrl } : {}),
    ...(i.categoryId ? { category_id: i.categoryId } : {}),
  }))

const baseBody = (input: CreateBase) => ({
  type: 'online',
  processing_mode: 'automatic',
  external_reference: input.externalReference,
  description: input.description,
  total_amount: centsToMp(input.amountCents),
  payer: toMpPayer(input.payer),
  ...(input.items?.length ? { items: toMpItems(input.items) } : {}),
})

const ORDERS = '/v1/orders'

// ── Operações ────────────────────────────────────────────────────────────────

/**
 * Cria a cobrança Pix. `expiresInMinutes` vira `expiration_time` (ISO 8601); o MP
 * aceita de 30 min a 30 dias. A resposta já traz o QR e o copia-e-cola.
 */
export const createPixOrder = async (
  input: CreateBase & { expiresInMinutes: number },
): Promise<MpOrderSnapshot> => {
  const res = await mpRequest(ORDERS, {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId,
    body: {
      ...baseBody(input),
      transactions: {
        payments: [
          {
            amount: centsToMp(input.amountCents),
            payment_method: { id: 'pix', type: 'bank_transfer' },
            expiration_time: `PT${input.expiresInMinutes}M`,
          },
        ],
      },
    },
  })
  if (res.status !== 200 && res.status !== 201) throw mpFailure(ORDERS, res)
  return toSnapshot(res.body as MpApiOrder)
}

export type CreateCardInput = CreateBase & {
  token: string
  paymentMethodId: string
  paymentType: 'credit_card' | 'debit_card'
  installments: number
}

/**
 * Cobra o cartão. Recusa NÃO é exceção aqui: o MP responde 402 com a order já
 * criada (status `failed` + motivo) e devolvemos o retrato como em qualquer outro
 * resultado — quem traduz em "recusado" para o cliente é o módulo de pagamentos.
 *
 * `null` = o MP recusou o PEDIDO em si (400/422: token inválido, dado do cartão
 * malformado) sem criar order; não há tentativa a registrar.
 */
export const createCardOrder = async (input: CreateCardInput): Promise<MpOrderSnapshot | null> => {
  const res = await mpRequest(ORDERS, {
    method: 'POST',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId,
    body: {
      ...baseBody(input),
      transactions: {
        payments: [
          {
            amount: centsToMp(input.amountCents),
            payment_method: {
              id: input.paymentMethodId,
              type: input.paymentType,
              token: input.token,
              installments: input.installments,
              statement_descriptor: STATEMENT_DESCRIPTOR,
            },
          },
        ],
      },
    },
  })

  if (res.status === 200 || res.status === 201) return toSnapshot(res.body as MpApiOrder)

  if (res.status === 402) {
    // O corpo do 402 traz a order; conforme a versão da API ela vem na raiz ou
    // embrulhada em `data`.
    const body = res.body as MpApiOrder & { data?: MpApiOrder }
    const order = body.data?.id ? body.data : body.id ? body : null
    if (order) return toSnapshot(order)
  }

  if (res.status === 400 || res.status === 402 || res.status === 422) {
    mpFailure(ORDERS, res) // só para o log: o chamador responde "recusado"
    return null
  }

  throw mpFailure(ORDERS, res)
}

/** `null` quando o MP não conhece a order (id de outra conta, de teste apagado…). */
export const getMpOrder = async (id: string): Promise<MpOrderSnapshot | null> => {
  const path = `${ORDERS}/${encodeURIComponent(id)}`
  const res = await mpRequest(path)
  if (res.status === 404) return null
  if (res.status !== 200) throw mpFailure(path, res)
  return toSnapshot(res.body as MpApiOrder)
}

/**
 * Cancela uma order ainda não paga (o Pix em aberto). Se ela já tiver sido paga
 * ou encerrada, o MP recusa — e aí relemos a order: o estado real é o que importa.
 */
export const cancelMpOrder = async (id: string, idempotencyKey: string): Promise<MpOrderSnapshot> => {
  const path = `${ORDERS}/${encodeURIComponent(id)}/cancel`
  const res = await mpRequest(path, { method: 'POST', idempotencyKey })
  if (res.status === 200 || res.status === 201) return toSnapshot(res.body as MpApiOrder)
  if (res.status >= 400 && res.status < 500) {
    const current = await getMpOrder(id)
    if (current) return current
  }
  throw mpFailure(path, res)
}

/**
 * Reembolso. Sem `amountCents` = todo o saldo ainda não reembolsado (corpo vazio,
 * como o MP pede); parcial exige o id da transação. A resposta do MP aqui é um
 * resumo sem totais nem transação, então devolvemos a order relida por inteiro.
 */
export const refundMpOrder = async (
  id: string,
  refund: { paymentId: string | null; amountCents?: number },
  idempotencyKey: string,
): Promise<MpOrderSnapshot> => {
  const path = `${ORDERS}/${encodeURIComponent(id)}/refund`
  const partial = refund.amountCents !== undefined && refund.paymentId
  const res = await mpRequest(path, {
    method: 'POST',
    idempotencyKey,
    ...(partial
      ? { body: { transactions: [{ id: refund.paymentId, amount: centsToMp(refund.amountCents!) }] } }
      : {}),
  })
  if (res.status !== 200 && res.status !== 201) throw mpFailure(path, res)

  const order = await getMpOrder(id)
  if (!order) throw mpFailure(path, { status: 404, body: {} })
  return order
}
