/**
 * Vocabulário de "o que aconteceu no sistema", no formato `recurso.ação-no-passado`.
 *
 * Usado em TRÊS superfícies, não só na fila:
 *   - AuditLog.action     → todos
 *   - OrderEvent.type     → os de pedido
 *   - Routing key RabbitMQ → SÓ os listados em QUEUED_EVENTS
 *
 * Um nome existir aqui não significa que ele vá para uma fila. `product.updated`
 * é registrado na auditoria e não é publicado, porque ninguém consome.
 */
export const EVENTS = {
  order: {
    created: 'order.created',
    paid: 'order.paid',
    canceled: 'order.canceled',
    picking: 'order.picking',
    readyToShip: 'order.ready_to_ship',
    shipped: 'order.shipped',
    delivered: 'order.delivered',
    returned: 'order.returned',
    refunded: 'order.refunded',
    refundRequested: 'order.refund_requested',
    noteAdded: 'order.note_added',
    paymentFailed: 'order.payment_failed',
  },
  product: {
    created: 'product.created',
    updated: 'product.updated',
    deleted: 'product.deleted',
    published: 'product.published',
  },
  category: {
    created: 'category.created',
    updated: 'category.updated',
    deleted: 'category.deleted',
  },
  customer: {
    registered: 'customer.registered',
  },
  inventory: {
    adjusted: 'inventory.adjusted',
    counted: 'inventory.counted',
  },
  auth: {
    loginSucceeded: 'auth.login_succeeded',
    loginFailed: 'auth.login_failed',
    refreshReused: 'auth.refresh_reused',
  },
  email: {
    orderConfirmation: 'email.order_confirmation',
    orderShipped: 'email.order_shipped',
    orderDelivered: 'email.order_delivered',
    paymentFailed: 'email.payment_failed',
    boletoIssued: 'email.boleto_issued',
    passwordReset: 'email.password_reset',
  },
  shipping: {
    labelRequested: 'shipping.label.requested',
    trackingSync: 'shipping.tracking.sync',
  },
} as const

/**
 * Os únicos eventos que realmente vão para o RabbitMQ na v1.
 * Publicar fora desta lista é bug: mensagem sem consumidor.
 */
export const QUEUED_EVENTS = [
  EVENTS.order.paid,
  EVENTS.email.orderConfirmation,
  EVENTS.email.orderShipped,
  EVENTS.email.orderDelivered,
  EVENTS.email.paymentFailed,
  EVENTS.email.boletoIssued,
  EVENTS.email.passwordReset,
  EVENTS.shipping.labelRequested,
  EVENTS.shipping.trackingSync,
] as const

export type QueuedEvent = (typeof QUEUED_EVENTS)[number]
