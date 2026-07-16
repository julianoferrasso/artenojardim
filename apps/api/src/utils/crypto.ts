import argon2 from 'argon2'
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto'

/**
 * Argon2id e não bcrypt/SHA.
 *
 * SHA de qualquer sabor está fora: ele é RÁPIDO, e rapidez é exatamente o que
 * não se quer aqui — uma GPU testa bilhões de SHA por segundo. Argon2id é o
 * vencedor da Password Hashing Competition e é caro em memória, o que anula a
 * vantagem de GPU/ASIC.
 *
 * Parâmetros: 64 MiB, 3 iterações, paralelismo 4 (recomendação OWASP).
 */
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
} as const

export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, ARGON2_OPTIONS)

export const verifyPassword = async (hash: string, plain: string): Promise<boolean> => {
  try {
    return await argon2.verify(hash, plain)
  } catch {
    // Hash corrompido/formato inválido não é motivo para 500 — é senha inválida.
    return false
  }
}

/**
 * Hash falso, usado quando o e-mail não existe.
 *
 * Sem isto, "usuário inexistente" responde em ~1ms e "senha errada" em ~100ms
 * (o custo do argon2). Essa diferença é mensurável pela rede e entrega ao
 * atacante a lista de quem tem conta. Gastar o mesmo tempo nos dois caminhos
 * fecha o canal.
 */
let dummyHashCache: string | undefined

export const dummyVerify = async (): Promise<false> => {
  dummyHashCache ??= await hashPassword(randomBytes(24).toString('hex'))
  await verifyPassword(dummyHashCache, 'senha-que-nunca-confere')
  return false
}

/**
 * Refresh token: string opaca aleatória, não JWT.
 *
 * Um JWT é válido até expirar e não há como revogá-lo. Um token opaco é uma
 * linha no banco: revogar é um UPDATE. O access token é curto (15min) justamente
 * porque não é revogável; o refresh é o ponto de controle.
 */
export const generateOpaqueToken = (): string => randomBytes(32).toString('base64url')

/**
 * SHA-256 e não argon2 aqui — de propósito.
 *
 * Argon2 protege segredo de BAIXA entropia (senha humana) contra força bruta.
 * Este token tem 256 bits de entropia real: não existe força bruta viável, e o
 * custo do argon2 seria pago a cada refresh, no caminho crítico, sem ganho.
 * O SHA-256 impede que um dump do banco vire sessões ativas, que é o objetivo.
 */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex')

/** Comparação sem vazar, pelo tempo, ONDE os valores divergem. */
export const safeCompare = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}
