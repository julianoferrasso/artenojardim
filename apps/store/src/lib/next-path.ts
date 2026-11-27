import { internalPathSchema } from '@ecommerce/shared/contracts'

/**
 * Para onde voltar depois de entrar (`?next=`, posto pelo checkout, pela conta e
 * pelo link do e-mail de cadastro). Só caminho interno — a mesma regra que a API
 * aplica ao `next` do cadastro: "//x.com" e "/\x.com" o navegador trata como
 * outro domínio, e o link de login viraria um redirecionador aberto.
 */
export const safeNextPath = (raw: string | null | undefined, fallback = '/conta'): string =>
  raw && internalPathSchema.safeParse(raw).success ? raw : fallback

/** Lido no clique e não com useSearchParams, que exigiria um Suspense só para isto. */
export const nextFromLocation = (fallback?: string): string =>
  safeNextPath(new URLSearchParams(window.location.search).get('next'), fallback)
