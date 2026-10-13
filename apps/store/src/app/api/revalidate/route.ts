import { createHash, timingSafeEqual } from 'node:crypto'
import { revalidatePath } from 'next/cache'

/**
 * Chamado pela API quando o lojista mexe num produto: descarta o cache ISR para
 * a mudança (arquivar, despublicar, preço) aparecer na hora, não 60s depois.
 * O TTL continua valendo como rede de segurança se este aviso se perder.
 *
 * Invalida a loja inteira, não tags por slug: o catálogo é pequeno, e um produto
 * aparece em home, categoria, busca e na própria página — acertar cada uma é
 * onde a invalidação fina sempre esquece um lugar.
 */

// Hash antes de comparar: timingSafeEqual exige o mesmo tamanho, e comparar
// tamanhos direto vazaria o comprimento do segredo.
const digest = (value: string) => createHash('sha256').update(value).digest()

export async function POST(request: Request) {
  const expected = process.env.REVALIDATE_SECRET
  const received = request.headers.get('x-revalidate-secret')

  if (!expected || !received || !timingSafeEqual(digest(received), digest(expected))) {
    return new Response(null, { status: 401 })
  }

  revalidatePath('/', 'layout')
  return new Response(null, { status: 204 })
}
