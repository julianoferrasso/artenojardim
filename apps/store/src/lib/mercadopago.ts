'use client'

import { initMercadoPago } from '@mercadopago/sdk-react'

declare global {
  interface Window {
    /** Escrito pelo security.js quando a coleta termina; pode nunca existir (bloqueador). */
    MP_DEVICE_SESSION_ID?: unknown
  }
}

/**
 * A public key NÃO vem de env do front: chega da API no retorno de
 * getOrderPayment (fonte única — trocar a credencial é mexer só no .env da API,
 * sem rebuild da loja). O SDK carrega o MercadoPago.js uma vez; reinicializar a
 * cada render recarregaria o script.
 */
let initializedKey: string | null = null

export const ensureMercadoPago = (publicKey: string): void => {
  if (initializedKey === publicKey) return
  initMercadoPago(publicKey, { locale: 'pt-BR' })
  initializedKey = publicKey
}

/**
 * Script de antifraude do MP. O MercadoPago.js põe um device ID dentro do token
 * do cartão, mas não expõe a global que o Orders API pede no header — quem a
 * cria é este script.
 */
export const MP_SECURITY_SCRIPT = 'https://www.mercadopago.com/v2/security.js'

/** Lido no envio, nunca no render: a global é preenchida de forma assíncrona. */
export const readMpDeviceId = (): string | undefined => {
  const id = window.MP_DEVICE_SESSION_ID
  return typeof id === 'string' && id ? id : undefined
}
