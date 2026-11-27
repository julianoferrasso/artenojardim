'use client'

import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { passwordSchema } from '@ecommerce/shared/contracts'
import { changePassword } from '@/lib/account'
import { useAuth, authErrorMessage } from '@/lib/auth'
import { cn, fieldClass, submitButtonClass } from '@/lib/utils'

/**
 * A PRIMEIRA senha de uma conta que nasceu pelo código do e-mail. Um campo só,
 * com "mostrar" no lugar do "repita a senha": é a conta depois da compra — tudo
 * o mais já foi preenchido no checkout, falta só isto.
 *
 * Aplica a sessão que volta: a API revoga as outras e reemite esta.
 */
export function CreatePasswordForm({
  onCreated,
  submitLabel = 'Criar senha',
  className,
}: {
  onCreated?: (() => void) | undefined
  submitLabel?: string | undefined
  className?: string | undefined
}) {
  const { applySession } = useAuth()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const parsed = passwordSchema.safeParse(password)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Senha inválida')
      return
    }
    setSaving(true)
    setError(null)
    try {
      applySession(await changePassword({ password: parsed.data }))
      setPassword('')
      onCreated?.()
    } catch (err) {
      setError(authErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
      className={cn('flex flex-col gap-3', className)}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="create-password" className="text-sm font-medium">
          Senha
        </label>
        <div className="relative">
          <input
            id="create-password"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={cn(fieldClass, 'pr-11')}
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
            className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        <span className="text-xs text-muted-foreground">Mínimo 6 caracteres.</span>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      <button type="submit" disabled={saving} className={cn(submitButtonClass, 'px-6')}>
        {saving ? 'Salvando…' : submitLabel}
      </button>
    </form>
  )
}
