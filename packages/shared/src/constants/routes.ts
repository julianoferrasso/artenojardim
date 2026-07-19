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

  products: {
    list: `${base}/products`,
    create: `${base}/products`,
    detail: (idOrSlug: string) => `${base}/products/${idOrSlug}`,
    update: (id: string) => `${base}/products/${id}`,
    remove: (id: string) => `${base}/products/${id}`,
    variants: (productId: string) => `${base}/products/${productId}/variants`,
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
    events: (id: string) => `${base}/orders/${id}/events`,
    fulfillment: (id: string) => `${base}/orders/${id}/fulfillment`,
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

  webhooks: {
    stripe: `${base}/webhooks/stripe`,
  },
} as const
