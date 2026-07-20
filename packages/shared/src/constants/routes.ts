export const API_VERSION = 'v1'
const base = `/api/${API_VERSION}`

/**
 * Caminhos da API. O front NUNCA concatena string de URL — importa daqui.
 * Renomear uma rota vira um erro de compilação no front, não um 404 em produção.
 */
export const ROUTES = {
  health: `${base}/health`,

  auth: {
    admin: {
      login: `${base}/auth/admin/login`,
      refresh: `${base}/auth/admin/refresh`,
      logout: `${base}/auth/admin/logout`,
      me: `${base}/auth/admin/me`,
    },
    register: `${base}/auth/register`,
    login: `${base}/auth/login`,
    refresh: `${base}/auth/refresh`,
    logout: `${base}/auth/logout`,
    me: `${base}/auth/me`,
    forgotPassword: `${base}/auth/forgot-password`,
    resetPassword: `${base}/auth/reset-password`,
  },

  store: `${base}/store`,

  /** Consulta de CEP (ViaCEP) — pública; usada no autopreenchimento e no guest checkout. */
  cep: (cep: string) => `${base}/cep/${cep}`,

  products: {
    list: `${base}/products`,
    create: `${base}/products`,
    detail: (idOrSlug: string) => `${base}/products/${idOrSlug}`,
    update: (id: string) => `${base}/products/${id}`,
    remove: (id: string) => `${base}/products/${id}`,
    images: (id: string) => `${base}/products/${id}/images`,
    variants: (productId: string) => `${base}/products/${productId}/variants`,
    variant: (productId: string, variantId: string) =>
      `${base}/products/${productId}/variants/${variantId}`,
  },

  categories: {
    list: `${base}/categories`,
    tree: `${base}/categories/tree`,
    create: `${base}/categories`,
    detail: (idOrSlug: string) => `${base}/categories/${idOrSlug}`,
    update: (id: string) => `${base}/categories/${id}`,
    remove: (id: string) => `${base}/categories/${id}`,
  },

  cart: {
    get: `${base}/cart`,
    items: `${base}/cart/items`,
    item: (itemId: string) => `${base}/cart/items/${itemId}`,
    merge: `${base}/cart/merge`,
  },

  shipping: {
    /** Cotação pública (produto/checkout). Corpo: { zipCode, items }. */
    quote: `${base}/shipping/quote`,
    /** OAuth do Melhor Envio (staff inicia, loja recebe o callback). */
    connect: `${base}/shipping/melhor-envio/connect`,
    callback: `${base}/shipping/melhor-envio/callback`,
    status: `${base}/shipping/melhor-envio/status`,
  },

  checkout: {
    address: `${base}/checkout/address`,
    shipping: `${base}/checkout/shipping`,
    summary: `${base}/checkout/summary`,
    confirm: `${base}/checkout/confirm`,
  },

  orders: {
    list: `${base}/orders`,
    detail: (id: string) => `${base}/orders/${id}`,
    status: (id: string) => `${base}/orders/${id}/status`,
    /** Cria/reusa o PaymentIntent e devolve o clientSecret (Payment Element). */
    payment: (id: string) => `${base}/orders/${id}/payment`,
    /** Cancela de verdade ou registra a solicitação — quem decide é o service. */
    cancel: (id: string) => `${base}/orders/${id}/cancel`,
    support: (id: string) => `${base}/orders/${id}/support`,
    reorder: (id: string) => `${base}/orders/${id}/reorder`,
  },

  /**
   * Superfície de STAFF. Separada de `orders` porque aquele router inteiro está
   * atrás de `authenticateCustomer` — misturar os dois exigiria auth por rota,
   * e uma rota esquecida vira vazamento de pedido alheio.
   */
  admin: {
    orders: {
      list: `${base}/admin/orders`,
      detail: (id: string) => `${base}/admin/orders/${id}`,
      fulfillment: (id: string) => `${base}/admin/orders/${id}/fulfillment`,
      cancel: (id: string) => `${base}/admin/orders/${id}/cancel`,
      refund: (id: string) => `${base}/admin/orders/${id}/refund`,
      note: (id: string) => `${base}/admin/orders/${id}/note`,
      events: (id: string) => `${base}/admin/orders/${id}/events`,
    },

    /** Gestão de usuários de staff. Router inteiro atrás de requireMinRole. */
    users: {
      list: `${base}/admin/users`,
      create: `${base}/admin/users`,
      detail: (id: string) => `${base}/admin/users/${id}`,
      update: (id: string) => `${base}/admin/users/${id}`,
      /** Transições com verbo próprio: desativar derruba as sessões do alvo. */
      deactivate: (id: string) => `${base}/admin/users/${id}/deactivate`,
      reactivate: (id: string) => `${base}/admin/users/${id}/reactivate`,
      password: (id: string) => `${base}/admin/users/${id}/password`,
    },
  },

  customers: {
    me: `${base}/customers/me`,
    addresses: `${base}/customers/me/addresses`,
    address: (id: string) => `${base}/customers/me/addresses/${id}`,
    list: `${base}/customers`,
    detail: (id: string) => `${base}/customers/${id}`,
  },

  coupons: {
    validate: `${base}/coupons/validate`,
    list: `${base}/coupons`,
  },

  inventory: {
    list: `${base}/inventory`,
    reconcile: `${base}/inventory/reconcile`,
    level: (variantId: string) => `${base}/inventory/${variantId}`,
    ledger: (variantId: string) => `${base}/inventory/${variantId}/ledger`,
    movements: `${base}/inventory/movements`,
  },

  uploads: {
    list: `${base}/uploads`,
    presign: `${base}/uploads/presign`,
    confirm: `${base}/uploads/confirm`,
    detail: (id: string) => `${base}/uploads/${id}`,
    /** Só existe com STORAGE_DRIVER=local. Em produção o PUT vai direto ao R2. */
    direct: `${base}/uploads/direct`,
  },

  cms: {
    pages: `${base}/cms/pages`,
    banners: `${base}/cms/banners`,
    menus: `${base}/cms/menus`,
    menu: (handle: string) => `${base}/cms/menus/${handle}`,
  },

  settings: `${base}/settings`,

  /** Registro de visita de produto (público, disparado pela loja). */
  productViews: {
    track: `${base}/product-views`,
  },

  /** Inscrição na newsletter (pública, footer/home da loja). */
  newsletter: {
    subscribe: `${base}/newsletter/subscribe`,
  },

  /** Métricas do painel (staff). */
  dashboard: {
    overview: `${base}/dashboard/overview`,
  },

  webhooks: {
    stripe: `${base}/webhooks/stripe`,
  },
} as const
