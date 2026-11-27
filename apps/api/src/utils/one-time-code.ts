/**
 * Regras do código de uso único que a pessoa digita — o dos Alertas da equipe e
 * o do e-mail do cliente. Puras: o relógio entra como parâmetro.
 *
 * Os 6 dígitos sozinhos não seguram força bruta (são 1 milhão de combinações);
 * quem segura é a soma: validade curta, 5 tentativas por código, espera entre
 * reenvios e o rate limit nas rotas.
 */

export const CODE_TTL_MS = 10 * 60_000
export const MAX_CODE_ATTEMPTS = 5
export const RESEND_COOLDOWN_MS = 60_000

/** Milissegundos até poder pedir outro código. 0 = já pode. */
export const resendWaitMs = (lastSentAt: Date | null, now: Date): number =>
  lastSentAt ? Math.max(0, lastSentAt.getTime() + RESEND_COOLDOWN_MS - now.getTime()) : 0

export const attemptsLeftMessage = (left: number): string =>
  left === 1 ? 'Resta 1 tentativa.' : `Restam ${left} tentativas.`
