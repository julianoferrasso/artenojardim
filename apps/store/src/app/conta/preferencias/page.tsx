'use client'

import { useState } from 'react'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { updateProfile } from '@/lib/account'

/**
 * Preferências de comunicação. Hoje só o e-mail de novidades — a tela existe
 * como lugar para as próximas sem virar mais um item de menu depois.
 */
export default function PreferenciasPage() {
  const { customer, applyProfile } = useAuth()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!customer) return null

  const toggle = async (acceptsMarketing: boolean) => {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      const result = await updateProfile({ acceptsMarketing })
      // Aplica o perfil devolvido pela API: sem isto o checkbox volta ao estado
      // anterior no próximo render, porque quem manda é o contexto.
      applyProfile(result.customer)
      setSaved(true)
    } catch (e) {
      setError(authErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <h1 className="mb-6 font-display text-3xl font-semibold tracking-tight">Preferências</h1>

      <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
        <h2 className="text-lg font-semibold tracking-tight">Comunicação</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o que você quer receber de nós. Isso não afeta os e-mails sobre os seus pedidos,
          que continuam sendo enviados.
        </p>

        {/* Checkbox nativo dentro do <label>: acessível de graça, sem depender de
            um componente de switch que o projeto não tem. */}
        <label className="mt-5 flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={customer.acceptsMarketing}
            disabled={saving}
            onChange={(e) => void toggle(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-primary disabled:opacity-50"
          />
          <span className="text-sm">
            <span className="font-medium">Quero receber novidades e ofertas por e-mail</span>
            <span className="mt-0.5 block text-muted-foreground">
              Novidades do ateliê, lançamentos e promoções. Você pode desmarcar quando quiser.
            </span>
          </span>
        </label>

        <div className="mt-4 min-h-5 text-sm" aria-live="polite">
          {saving && <span className="text-muted-foreground">Salvando…</span>}
          {saved && !saving && <span className="text-muted-foreground">Preferência salva ✓</span>}
          {error && (
            <span role="alert" className="text-destructive">
              {error}
            </span>
          )}
        </div>
      </section>
    </>
  )
}
