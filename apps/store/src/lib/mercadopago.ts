'use client'

import { initMercadoPago } from '@mercadopago/sdk-react'
import { oklchToHex } from '@ecommerce/shared/utils'

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

/**
 * Cores do Card Payment Brick a partir do tema APLICADO na página.
 *
 * O Brick só aceita cor literal: os campos do cartão são iframes do MP, que não
 * enxergam nossas variáveis CSS, e ele calcula variações a partir da cor. Então
 * lemos os tokens que o ThemeStyle injetou — sempre no formato de oklchToCss — e
 * convertemos para hex. Tudo ou nada: se um token não vier nesse formato (o
 * getStore caiu no SSR), o Brick fica com as cores dele, nunca meio tematizado.
 *
 * Vermelho e verde de erro/sucesso ficam com os do MP: --destructive e --success
 * não passam pelo tema e chegam do CSS compilado em lab().
 */
const BRICK_COLORS = {
  formBackgroundColor: '--card',
  inputBackgroundColor: '--card',
  textPrimaryColor: '--foreground',
  textSecondaryColor: '--muted-foreground',
  baseColor: '--btn-primary',
  baseColorFirstVariant: '--btn-primary-ink',
  baseColorSecondVariant: '--accent',
  buttonTextColor: '--btn-primary-foreground',
  outlinePrimaryColor: '--input',
  outlineSecondaryColor: '--border',
} as const

/**
 * Valores da API do Brick, não classes: os campos espelham o fieldClass (h-10,
 * px-3.5). O formPadding é o recuo do formulário E o espaço entre as seções dele —
 * zerado, o documento colava no nome do titular. O recuo é compensado com -m-4 no
 * wrapper do card-payment.tsx.
 */
const BRICK_SIZES = {
  formPadding: '16px',
  inputVerticalPadding: '10px',
  inputHorizontalPadding: '14px',
  fontWeightSemiBold: '500',
}

const OKLCH = /^oklch\(\s*(\S+)\s+(\S+)\s+(\S+)\s*\)$/

const tokenHex = (css: CSSStyleDeclaration, token: string): string | null => {
  const match = OKLCH.exec(css.getPropertyValue(token).trim())
  if (!match) return null
  const [l, c, h] = [Number(match[1]), Number(match[2]), Number(match[3])]
  return [l, c, h].every(Number.isFinite) ? oklchToHex({ l, c, h }) : null
}

const themeColors = (css: CSSStyleDeclaration): Record<string, string> | null => {
  const colors: Record<string, string> = {}
  for (const [variable, token] of Object.entries(BRICK_COLORS)) {
    const hex = tokenHex(css, token)
    if (!hex) return null
    colors[variable] = hex
  }
  const ring = tokenHex(css, '--ring')
  if (!ring) return null
  // O mesmo anel do fieldClass (ring-2 ring-ring/40): 66 é 40% de opacidade.
  colors.inputFocusedBoxShadow = `0 0 0 2px ${ring}66`
  return colors
}

/** O --radius é sempre rem (THEME_RADIUS_REM); ±0.25rem são os 4px do Tailwind. */
const themeRadius = (css: CSSStyleDeclaration): Record<string, string> => {
  const radius = Number.parseFloat(css.getPropertyValue('--radius'))
  if (!Number.isFinite(radius)) return {}
  return {
    borderRadiusSmall: `${Math.max(0, radius - 0.25)}rem`,
    borderRadiusMedium: `${radius}rem`,
    borderRadiusLarge: `${radius + 0.25}rem`,
  }
}

export const readCardBrickStyle = ():
  | { theme: 'default'; customVariables: Record<string, string> }
  | undefined => {
  if (typeof document === 'undefined') return undefined
  const css = getComputedStyle(document.documentElement)
  return {
    theme: 'default',
    customVariables: { ...BRICK_SIZES, ...themeRadius(css), ...themeColors(css) },
  }
}
