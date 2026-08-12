import type { NextConfig } from 'next'
import type { RemotePattern } from 'next/dist/shared/lib/image-config'

/**
 * Mesmo raciocínio de apps/store/next.config.ts: com o driver de storage LOCAL as
 * imagens vêm de `${NEXT_PUBLIC_API_URL}/uploads/...`, e sem este host em
 * remotePatterns o next/image responde 400. Derivar da própria env cobre dev e
 * prod sem hardcode — o `localhost:4000` que ficava aqui só valia em dev e
 * deixava o admin de produção sem padrão nenhum para o host da API.
 *
 * Em produção o driver é s3 e as imagens vêm do bucket, via NEXT_PUBLIC_CDN_HOST.
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
  transpilePackages: ['@ecommerce/shared'],

  images: {
    remotePatterns: [
      // Host da API (onde o /uploads é servido com o driver local). Cobre dev e prod.
      ...(apiImagePattern() ? [apiImagePattern()!] : []),
      // Host do bucket S3 (ou do CDN, quando houver um na frente).
      ...(process.env.NEXT_PUBLIC_CDN_HOST
        ? [{ protocol: 'https' as const, hostname: process.env.NEXT_PUBLIC_CDN_HOST }]
        : []),
    ],
  },

  productionBrowserSourceMaps: false,
}

export default nextConfig
