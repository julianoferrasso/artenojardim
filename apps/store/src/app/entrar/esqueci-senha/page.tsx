'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { forgotPasswordSchema, type ForgotPasswordInput } from '@ecommerce/shared/contracts'
import { forgotPassword } from '@/lib/account'
import { authErrorMessage } from '@/lib/auth'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'
import { fieldClass, submitButtonClass } from '@/lib/utils'

export default function EsqueciSenhaPage() {
  const logoUrl = useBrandLogo()
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema) })

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <StoreLogo src={logoUrl} alt="" size={64} className="size-16" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {sent ? 'Confira o seu e-mail' : 'Recuperar a senha'}
        </h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">
        {sent ? (
          <>
            {/* Nunca "e-mail não encontrado": a mensagem é a mesma para endereço
                cadastrado e desconhecido, senão esta tela vira uma consulta de
                quem é cliente da loja. */}
            <p className="mb-6 text-sm text-muted-foreground">
              Se existir uma conta com esse e-mail, enviamos um link para você criar uma senha
              nova. Ele vale por 30 minutos — confira também a caixa de spam.
            </p>
            <Link href="/entrar" className="text-sm text-muted-foreground hover:text-foreground">
              ← Voltar para o login
            </Link>
          </>
        ) : (
          <form
            onSubmit={handleSubmit(async (v) => {
              setError(null)
              try {
                await forgotPassword(v)
                setSent(true)
              } catch (e) {
                setError(authErrorMessage(e))
              }
            })}
            className="flex flex-col gap-4"
            noValidate
          >
            <p className="text-sm text-muted-foreground">
              Informe o e-mail da sua conta e enviaremos um link para escolher uma senha nova.
            </p>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-email" className="text-sm font-medium">
                E-mail
              </label>
              <input
                id="f-email"
                type="email"
                autoComplete="username"
                autoFocus
                {...register('email')}
                className={fieldClass}
              />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>

            {error && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}

            <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
              {isSubmitting ? 'Enviando…' : 'Enviar link'}
            </button>

            <Link
              href="/entrar"
              className="text-center text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </main>
  )
}
