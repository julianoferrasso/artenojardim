import type { MeAppSettingsInput, MeAppSettingsView, MeEnvironment } from '@ecommerce/shared/contracts'

/**
 * Credenciais do aplicativo do Melhor Envio: o que gravar, o que mostrar e
 * quando a conexão atual deixa de valer. PURO — o service carrega e persiste.
 */

export type MeAppSettings = {
  environment: MeEnvironment
  clientId: string | null
  clientSecret: string | null
  contactEmail: string | null
}

export const secretHint = (secret: string | null): string | null =>
  secret ? `••••${secret.slice(-4)}` : null

export const toAppSettingsView = (s: MeAppSettings, redirectUri: string): MeAppSettingsView => ({
  environment: s.environment,
  clientId: s.clientId,
  clientSecretHint: secretHint(s.clientSecret),
  contactEmail: s.contactEmail,
  redirectUri,
})

export type AppSettingsUpdate =
  | { ok: false; reason: 'SECRET_REQUIRED' }
  | {
      ok: true
      next: MeAppSettings
      /** Campos alterados, para a auditoria (o segredo é redigido por ela). */
      changes: Record<string, { from: unknown; to: unknown }>
      /**
       * Os tokens são do aplicativo que os emitiu: outro app ou outro ambiente os
       * torna inválidos. Trocar SÓ o segredo do mesmo app não derruba a conexão
       * (o refresh passa a usar o novo). Primeiro preenchimento também não: é a
       * migração do .env, com o mesmo app que emitiu os tokens atuais.
       */
      resetConnection: boolean
    }

export const planAppSettingsUpdate = (current: MeAppSettings, input: MeAppSettingsInput): AppSettingsUpdate => {
  const clientSecret = input.clientSecret?.trim() || current.clientSecret
  if (!clientSecret) return { ok: false, reason: 'SECRET_REQUIRED' }

  const next: MeAppSettings = {
    environment: input.environment,
    clientId: input.clientId.trim(),
    clientSecret,
    contactEmail: input.contactEmail.trim(),
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of ['environment', 'clientId', 'clientSecret', 'contactEmail'] as const) {
    if (current[key] !== next[key]) changes[key] = { from: current[key], to: next[key] }
  }

  const wasConfigured = current.clientId !== null
  const resetConnection =
    wasConfigured && (current.clientId !== next.clientId || current.environment !== next.environment)

  return { ok: true, next, changes, resetConnection }
}
