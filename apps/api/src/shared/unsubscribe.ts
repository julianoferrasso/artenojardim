import { createHmac } from 'node:crypto'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { env } from '../config/env.js'
import { businessError } from './errors.js'
import { safeCompare } from '../utils/crypto.js'
import { getActiveStoreId } from './store-context.js'

/**
 * Link de descadastro do rodapé dos e-mails de marketing.
 *
 * ── Por que HMAC e não uma tabela de tokens ──────────────────────────────────
 * Uma tabela custaria uma escrita por destinatário por campanha — 2.000
 * inscritos, 2.000 linhas — para um link que quase ninguém clica. E o token tem
 * de valer PARA SEMPRE: um e-mail de dois anos atrás ainda precisa descadastrar,
 * então não haveria nem expiração para limpar a tabela depois.
 *
 * ── Por que o e-mail viaja dentro do token ───────────────────────────────────
 * A rota precisa saber QUEM descadastrar sem consultar nada. A assinatura é o
 * que impede trocar o endereço e descadastrar o vizinho.
 *
 * Mora em `shared/` e não em `integrations/`: o storeId entra na assinatura, e
 * `integrations/` não conhece o nosso negócio.
 */

/** 32 chars de base64url ≈ 192 bits — sobra para o que a assinatura precisa. */
const SIGNATURE_LENGTH = 32

const secretOrThrow = (): string => {
  const secret = env.EMAIL_UNSUBSCRIBE_SECRET
  if (!secret) {
    // Em produção o env.ts já barra no boot; aqui é o caminho de dev, onde a
    // ausência tem de falhar alto em vez de gerar link que não funciona.
    throw new Error('EMAIL_UNSUBSCRIBE_SECRET ausente — não é possível assinar o descadastro')
  }
  return secret
}

const sign = (storeId: string, email: string): string =>
  createHmac('sha256', secretOrThrow())
    .update(`${storeId}:${email}`)
    .digest('base64url')
    .slice(0, SIGNATURE_LENGTH)

export const buildUnsubscribeToken = (email: string): string => {
  const storeId = getActiveStoreId()
  const normalized = email.trim().toLowerCase()
  return `${Buffer.from(normalized).toString('base64url')}.${sign(storeId, normalized)}`
}

/** Devolve o e-mail assinado. Lança se o token foi adulterado ou é de outra loja. */
export const parseUnsubscribeToken = (token: string): string => {
  const invalid = (): never => {
    throw businessError(
      ERROR_CODES.UNSUBSCRIBE_TOKEN_INVALID,
      'Este link de descadastro não é válido.',
      400,
    )
  }

  const parts = token.split('.')
  if (parts.length !== 2) return invalid()

  const [encoded, signature] = parts as [string, string]

  let email: string
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return invalid()
  }

  if (!email.includes('@')) return invalid()

  // A assinatura cobre o storeId: um token da loja A não descadastra na loja B,
  // que é o que mantém a promessa multi-tenant quando a Fase 4 chegar.
  if (!safeCompare(sign(getActiveStoreId(), email), signature)) return invalid()

  return email
}

export const buildUnsubscribeUrl = (email: string): string =>
  `${env.STORE_URL.replace(/\/$/, '')}/descadastrar?token=${encodeURIComponent(buildUnsubscribeToken(email))}`
