import type { NextConfig } from 'next'

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
      // R2 em produção. Preenchido a partir de R2_PUBLIC_URL.
      ...(process.env.NEXT_PUBLIC_CDN_HOST
        ? [{ protocol: 'https' as const, hostname: process.env.NEXT_PUBLIC_CDN_HOST }]
        : []),
      // Driver local em desenvolvimento: a API serve /uploads.
      ...(process.env.NODE_ENV !== 'production'
        ? [{ protocol: 'http' as const, hostname: 'localhost', port: '4000' }]
        : []),
    ],
  },

  // Stack trace de produção não vaza para o browser.
  productionBrowserSourceMaps: false,
}

export default nextConfig
