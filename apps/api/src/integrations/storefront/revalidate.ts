import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'

/**
 * Pede para a loja (Next) descartar o cache ISR do catálogo. Sem isto, arquivar
 * ou despublicar um produto só some da vitrine depois do TTL de 60s — e o
 * stale-while-revalidate ainda entrega a página velha para a 1ª visita após ele.
 *
 * NUNCA lança: a mudança no banco já aconteceu, e a loja fora do ar não pode
 * transformar um "salvar" bem-sucedido em erro. Falhou → o TTL é a rede de segurança.
 */
export const revalidateStorefront = async (): Promise<void> => {
  const secret = env.STORE_REVALIDATE_SECRET
  if (!secret) return

  try {
    const res = await fetch(`${env.STORE_URL}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-secret': secret },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) logger.warn({ status: res.status }, 'Loja recusou a revalidação do catálogo')
  } catch (err) {
    logger.warn({ err }, 'Falha ao pedir revalidação do catálogo à loja')
  }
}
