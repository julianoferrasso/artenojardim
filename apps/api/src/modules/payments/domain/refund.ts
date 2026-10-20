import type { PaymentMethod, PaymentStatus } from '@ecommerce/shared/constants'

/**
 * Regras puras do reembolso. Sem Prisma e sem provedor: o service decide QUANDO
 * reembolsar; aqui fica o que tem de ser igual em todo caminho que reembolsa
 * (admin, cancelamento do cliente, pagamento que chegou com o pedido cancelado).
 */

/** Tentativas que ainda seguram dinheiro do cliente. */
const STILL_CAPTURED: readonly PaymentStatus[] = ['PAID', 'PARTIALLY_REFUNDED']

/**
 * O estorno de UMA tentativa só leva o pedido junto quando nenhuma outra
 * tentativa do mesmo pedido ainda segura dinheiro. No pagamento em duplicidade,
 * estornar a cópia não é reembolsar o pedido: o pagamento original continua
 * capturado, e marcar o pedido como reembolsado o tiraria das vendas.
 */
export const refundMovesOrder = (otherPaymentStatuses: readonly PaymentStatus[]): boolean =>
  !otherPaymentStatuses.some((status) => STILL_CAPTURED.includes(status))

/** O reembolsável é do PAGAMENTO que pagou, não do total do pedido. */
export const refundableOf = (payment: { amount: number; refundedAmount: number }): number =>
  Math.max(0, payment.amount - payment.refundedAmount)

/**
 * Chave de idempotência do pedido de reembolso ao provedor.
 *
 * Inclui o já reembolsado e o valor: dois parciais iguais e legítimos são dois
 * reembolsos, mas um clique duplo no mesmo estado é um só — e é por isso que o
 * cliente cancelando e o webhook do pagamento atrasado, se se cruzarem, pedem o
 * MESMO estorno e o provedor o executa uma vez.
 *
 * `priorFailures` renova a chave depois de uma recusa: o provedor guarda a
 * resposta da chave, e repetir a mesma devolveria a mesma recusa mesmo com o
 * saldo já disponível. Zero mantém o formato antigo das chaves.
 */
export const refundIdempotencyKey = (
  orderId: string,
  refundedAmount: number,
  amount: number,
  priorFailures: number,
): string => {
  const base = `refund_${orderId}_${refundedAmount}_${amount}`
  return priorFailures > 0 ? `${base}_r${priorFailures}` : base
}

/** Quem pediu o reembolso. `system` = a própria API, sem ninguém clicando. */
export type RefundActor =
  | { kind: 'staff'; userId?: string | undefined }
  | { kind: 'customer' }
  | { kind: 'system' }

/**
 * O que aconteceu com o estorno automático. `requested` = o provedor aceitou o
 * pedido (o status final ainda vem dele, regra 6). `failed` = recusou; o pedido
 * segue cancelado e o staff reembolsa pelo admin.
 */
export type AutoRefundOutcome =
  | { status: 'none' }
  | { status: 'requested'; amount: number; method: PaymentMethod | null }
  | { status: 'failed'; amount: number; method: PaymentMethod | null }
