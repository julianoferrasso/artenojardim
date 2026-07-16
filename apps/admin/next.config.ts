import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@ecommerce/shared'],

  images: {
    remotePatterns: [
      ...(process.env.NEXT_PUBLIC_CDN_HOST
        ? [{ protocol: 'https' as const, hostname: process.env.NEXT_PUBLIC_CDN_HOST }]
        : []),
      ...(process.env.NODE_ENV !== 'production'
        ? [{ protocol: 'http' as const, hostname: 'localhost', port: '4000' }]
        : []),
    ],
  },

  productionBrowserSourceMaps: false,
}

export default nextConfig
