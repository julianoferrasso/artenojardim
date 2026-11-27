import { describe, it, expect } from 'vitest'
import {
  planAppSettingsUpdate,
  toAppSettingsView,
  type MeAppSettings,
} from '../src/modules/shipping/domain/provider-app.js'

const configured: MeAppSettings = {
  environment: 'production',
  clientId: '26048',
  clientSecret: 'segredo-antigo-abcd',
  contactEmail: 'contato@loja.test',
}

const empty: MeAppSettings = { environment: 'production', clientId: null, clientSecret: null, contactEmail: null }

const input = {
  environment: 'production' as const,
  clientId: '26048',
  contactEmail: 'contato@loja.test',
}

describe('planAppSettingsUpdate', () => {
  it('primeiro preenchimento (migração do .env) não derruba a conexão', () => {
    const plan = planAppSettingsUpdate(empty, { ...input, clientSecret: 'novo' })
    expect(plan.ok && plan.resetConnection).toBe(false)
  })

  it('sem segredo no banco nem no corpo: recusa', () => {
    expect(planAppSettingsUpdate(empty, input)).toEqual({ ok: false, reason: 'SECRET_REQUIRED' })
  })

  it('segredo vazio mantém o atual', () => {
    const plan = planAppSettingsUpdate(configured, { ...input, clientSecret: '  ' })
    expect(plan.ok && plan.next.clientSecret).toBe('segredo-antigo-abcd')
    expect(plan.ok && plan.changes).toEqual({})
  })

  it('trocar só o segredo do mesmo app mantém a conexão', () => {
    const plan = planAppSettingsUpdate(configured, { ...input, clientSecret: 'segredo-novo' })
    expect(plan.ok && plan.resetConnection).toBe(false)
    expect(plan.ok && Object.keys(plan.changes)).toEqual(['clientSecret'])
  })

  it('outro app ou outro ambiente derruba a conexão', () => {
    const otherApp = planAppSettingsUpdate(configured, { ...input, clientId: '99999' })
    const otherEnv = planAppSettingsUpdate(configured, { ...input, environment: 'sandbox' })
    expect(otherApp.ok && otherApp.resetConnection).toBe(true)
    expect(otherEnv.ok && otherEnv.resetConnection).toBe(true)
  })
})

describe('toAppSettingsView', () => {
  it('nunca devolve o segredo, só o final', () => {
    const view = toAppSettingsView(configured, 'https://loja.test/melhorenvio')
    expect(JSON.stringify(view)).not.toContain('segredo-antigo')
    expect(view.clientSecretHint).toBe('••••abcd')
  })

  it('sem segredo, sem dica', () => {
    expect(toAppSettingsView(empty, 'x').clientSecretHint).toBeNull()
  })
})
