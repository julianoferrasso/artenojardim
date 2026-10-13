'use client'

import { initMercadoPago } from '@mercadopago/sdk-react'

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
