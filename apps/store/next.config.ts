import type { NextConfig } from 'next'
import type { RemotePattern } from 'next/dist/shared/lib/image-config'

/**
 * Autoriza o next/image a otimizar imagens do host da API.
 *
 * Com o driver de storage LOCAL (o caso hoje, sem credenciais R2), as imagens
 * são servidas por `${NEXT_PUBLIC_API_URL}/uploads/...` — em produção,
 * `https://api.artenojardim.com.br`. Sem este host em remotePatterns, o
 * next/image responde 400 e a foto não carrega. Derivar do próprio
 * NEXT_PUBLIC_API_URL cobre dev (localhost:4000) e prod sem hardcode.
 */
const apiImagePattern = (): RemotePattern | null => {
  const url = process.env.NEXT_PUBLIC_API_URL
  if (!url) return null
  try {
    const { protocol, hostname, port } = new URL(url)
    return {
      protocol: protocol.replace(':', '') as 'http' | 'https',
      hostname,
      ...(port ? { port } : {}),
      pathname: '/uploads/**',
    }
  } catch {
    return null
  }
}

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // O pacote compartilhado é TypeScript cru — o Next precisa compilá-lo em vez
  // de tratá-lo como dependência já buildada.
  transpilePackages: ['@ecommerce/shared'],

  images: {
    // Guardamos o ORIGINAL no storage e deixamos o next/image redimensionar e
    // converter para WebP/AVIF sob demanda. Um worker com sharp gerando 4
    // tamanhos por imagem seria ~150 linhas, uma fila e uma tabela de variantes —
    // para resolver o que o framework já resolve.
    remotePatterns: [
      // Host da API (onde o /uploads é servido com o driver local). Cobre dev e prod.
      ...(apiImagePattern() ? [apiImagePattern()!] : []),
      // R2, quando houver credenciais (host de CDN dedicado).
      ...(process.env.NEXT_PUBLIC_CDN_HOST
        ? [{ protocol: 'https' as const, hostname: process.env.NEXT_PUBLIC_CDN_HOST }]
        : []),
    ],
  },

  // Stack trace de produção não vaza para o browser.
  productionBrowserSourceMaps: false,
}

export default nextConfig
