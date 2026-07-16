import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import type { UserRole } from '@ecommerce/shared/constants'

/**
 * Emissão e verificação de access token.
 *
 * Fica em domain/ porque é lógica pura: recebe dados, devolve string, sem Prisma
 * e sem HTTP. Dá para testar todo o comportamento de expiração e assinatura em
 * milissegundos, sem subir banco.
 */

export type StaffClaims = {
  sub: string
  type: 'user'
  role: UserRole
  storeId: string
}

export type CustomerClaims = {
  sub: string
  type: 'customer'
  storeId: string
}

export type AccessClaims = StaffClaims | CustomerClaims

const encoder = new TextEncoder()

export const signAccessToken = async (
  claims: AccessClaims,
  secret: string,
  ttl: string,
): Promise<string> =>
  new SignJWT({ ...claims } as JWTPayload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .setSubject(claims.sub)
    .sign(encoder.encode(secret))

export type VerifyResult =
  | { ok: true; claims: AccessClaims }
  | { ok: false; reason: 'expired' | 'invalid' }

/**
 * Devolve resultado em vez de lançar: quem chama precisa distinguir "expirou"
 * (o cliente renova e repete, transparente) de "inválido" (alguém forjou).
 * Tratar os dois como o mesmo erro faria o usuário legítimo ser deslogado a
 * cada 15 minutos.
 */
export const verifyAccessToken = async (
  token: string,
  secret: string,
): Promise<VerifyResult> => {
  try {
    const { payload } = await jwtVerify(token, encoder.encode(secret), {
      algorithms: ['HS256'],
    })

    if (!payload.sub || (payload['type'] !== 'user' && payload['type'] !== 'customer')) {
      return { ok: false, reason: 'invalid' }
    }

    return { ok: true, claims: payload as unknown as AccessClaims }
  } catch (err) {
    const code = (err as { code?: string }).code
    if (code === 'ERR_JWT_EXPIRED') return { ok: false, reason: 'expired' }
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * `algorithms: ['HS256']` na verificação acima não é decoração: sem a allowlist,
 * a lib aceitaria o algoritmo declarado no header do PRÓPRIO token — inclusive
 * `alg: none` ou uma troca para RS256 usando a chave pública como segredo HMAC.
 * É a vulnerabilidade clássica de JWT.
 */

export const ttlToSeconds = (ttl: string): number => {
  const m = /^(\d+)([smhd])$/.exec(ttl)
  if (!m) throw new Error(`TTL inválido: ${ttl}`)
  const value = Number(m[1])
  const unit = m[2] as 's' | 'm' | 'h' | 'd'
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit]
}
