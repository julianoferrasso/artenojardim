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
    /**
     * Não é um FulfillmentStatus: a transportadora sai para entregar e volta
     * várias vezes, e criar um estado para isso poluiria a máquina de expedição.
     * Existe só como marco da timeline, postado pelo staff.
     */
    outForDelivery: 'order.out_for_delivery',
    delivered: 'order.delivered',
    returned: 'order.returned',
    refunded: 'order.refunded',
    refundRequested: 'order.refund_requested',
    /** Pedido de cancelamento feito PELO CLIENTE. Não muda estado — o staff decide. */
    cancelRequested: 'order.cancel_requested',
    /** Mensagem que o cliente escreveu na área da conta. */
    supportMessage: 'order.support_message',
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
    emailVerified: 'customer.email_verified',
    /** Senha trocada PELO CLIENTE via link de e-mail. Derruba todas as sessões. */
    passwordReset: 'customer.password_reset',
    /** Senha trocada na área da conta, PROVANDO a senha atual. Separado de
     *  `passwordReset`: quem investiga um incidente precisa distinguir "trocou
     *  sabendo a senha" de "trocou por link de e-mail". */
    passwordChanged: 'customer.password_changed',
    /** Troca de e-mail SOLICITADA. Fica na auditoria mesmo que nunca se conclua:
     *  o pedido que não virou troca é o rastro de uma tentativa de tomada. */
    emailChangeRequested: 'customer.email_change_requested',
    /** Link clicado: o e-mail mudou de fato. As sessões caíram junto. */
    emailChanged: 'customer.email_changed',
    /** O cliente encerrou as outras sessões da própria conta. */
    sessionsRevoked: 'customer.sessions_revoked',
    /** LGPD pela porta do cliente. Mesmo efeito de `anonymized`, origem outra. */
    selfDeleted: 'customer.self_deleted',
    /** Staff corrigiu dado cadastral (telefone errado, e-mail com typo). */
    updated: 'customer.updated',
    /** LGPD: dado pessoal destruído, pedidos preservados. Irreversível. */
    anonymized: 'customer.anonymized',
  },
  inventory: {
    adjusted: 'inventory.adjusted',
    counted: 'inventory.counted',
  },
  user: {
    created: 'user.created',
    updated: 'user.updated',
    /**
     * Separado de `updated` de propósito: é O evento de segurança da tela. Quem
     * audita um incidente procura "quem virou ADMIN e quando", e essa pergunta
     * não pode depender de abrir o changesJson de cada update.
     */
    roleChanged: 'user.role_changed',
    deactivated: 'user.deactivated',
    reactivated: 'user.reactivated',
    passwordReset: 'user.password_reset',
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
    /** UM destinatário de campanha. O fan-out publica uma destas por pessoa. */
    marketingProduct: 'email.marketing_product',
  },
  campaign: {
    /** Campanha criada; o orquestrador resolve o fan-out. */
    dispatchRequested: 'campaign.dispatch_requested',
    /** Só auditoria: quem disparou, para qual produto, para quantos. */
    sent: 'campaign.sent',
  },
  shipping: {
    labelRequested: 'shipping.label.requested',
    trackingSync: 'shipping.tracking.sync',
  },
  store: {
    /** Cores, raio ou logo da loja mudaram. Vai para auditoria, não para fila. */
    themeUpdated: 'store.theme_updated',
  },
} as const

/**
 * Os únicos eventos que realmente vão para o RabbitMQ na v1.
 * Publicar fora desta lista é bug: mensagem sem consumidor. `shared/publish.ts`
 * verifica isto em runtime, então a regra falha alto em vez de silenciosamente.
 */
export const QUEUED_EVENTS = [
  EVENTS.order.paid,
  EVENTS.campaign.dispatchRequested,
  EVENTS.email.orderConfirmation,
  EVENTS.email.orderShipped,
  EVENTS.email.orderDelivered,
  EVENTS.email.paymentFailed,
  EVENTS.email.boletoIssued,
  EVENTS.email.passwordReset,
  EVENTS.email.marketingProduct,
  EVENTS.shipping.labelRequested,
  EVENTS.shipping.trackingSync,
] as const

export type QueuedEvent = (typeof QUEUED_EVENTS)[number]
