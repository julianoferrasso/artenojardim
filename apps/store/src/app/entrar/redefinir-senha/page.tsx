'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { resetPasswordSchema } from '@ecommerce/shared/contracts'
import { resetPassword } from '@/lib/account'
import { authErrorMessage } from '@/lib/auth'
import { useBrandLogo } from '@/components/brand-logo-provider'
import { StoreLogo } from '@/components/store-logo'
import { fieldClass, submitButtonClass } from '@/lib/utils'

/**
 * Escolha da nova senha. `useSearchParams` exige <Suspense> em volta, senão o
 * `next build` falha — e só falha no build, nunca no `next dev`.
 */
export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<Shell title="Carregando…" />}>
      <RedefinirSenha />
    </Suspense>
  )
}

/**
 * A confirmação de senha é validação de FORMULÁRIO, não de contrato: a API não
 * tem o que fazer com um segundo campo idêntico. Por isso o refine mora aqui, em
 * cima do schema compartilhado, em vez de mudar `resetPasswordSchema`.
 */
const formSchema = resetPasswordSchema
  .omit({ token: true })
  .extend({ confirm: z.string() })
  .refine((v) => v.password === v.confirm, {
    path: ['confirm'],
    message: 'As senhas não conferem',
  })

type FormInput = z.infer<typeof formSchema>

function RedefinirSenha() {
  const params = useSearchParams()
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput>({ resolver: zodResolver(formSchema) })

  // Lido direto de `params`, sem espelho em estado: um `useState` preenchido por
  // efeito renderiza uma vez com null, e essa primeira renderização mostraria
  // "link inválido" para um link que está perfeito.
  const token = params.get('token')

  if (!token) {
    return (
      <Shell title="Link inválido">
        <p className="mb-6 text-sm text-muted-foreground">
          Este endereço não tem um código de recuperação. Peça um link novo.
        </p>
        <Link
          href="/entrar/esqueci-senha"
          className={`${submitButtonClass} flex items-center justify-center`}
        >
          Pedir novo link
        </Link>
      </Shell>
    )
  }

  if (done) {
    return (
      <Shell title="Senha alterada">
        <p className="mb-6 text-sm text-muted-foreground">
          Pronto! Por segurança, encerramos as sessões abertas nesta conta. Entre com a senha nova.
        </p>
        <Link href="/entrar" className={`${submitButtonClass} flex items-center justify-center`}>
          Ir para o login
        </Link>
      </Shell>
    )
  }

  return (
    <Shell title="Criar uma nova senha">
      <form
        onSubmit={handleSubmit(async (v) => {
          setError(null)
          try {
            await resetPassword({ token, password: v.password })
            // Sem login automático: a API acabou de revogar todas as sessões, e
            // emitir uma nova aqui contradiria o próprio ato de segurança.
            setDone(true)
          } catch (e) {
            setError(authErrorMessage(e))
          }
        })}
        className="flex flex-col gap-4"
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-pass" className="text-sm font-medium">
            Nova senha
          </label>
          <input
            id="r-pass"
            type="password"
            autoComplete="new-password"
            autoFocus
            {...register('password')}
            className={fieldClass}
          />
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
          <span className="text-xs text-muted-foreground">Mínimo 6 caracteres.</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="r-confirm" className="text-sm font-medium">
            Repita a nova senha
          </label>
          <input
            id="r-confirm"
            type="password"
            autoComplete="new-password"
            {...register('confirm')}
            className={fieldClass}
          />
          {errors.confirm && <p className="text-xs text-destructive">{errors.confirm.message}</p>}
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button type="submit" disabled={isSubmitting} className={submitButtonClass}>
          {isSubmitting ? 'Salvando…' : 'Salvar nova senha'}
        </button>

        <Link
          href="/entrar/esqueci-senha"
          className="text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Pedir um link novo
        </Link>
      </form>
    </Shell>
  )
}

function Shell({ title, children }: { title: string; children?: React.ReactNode }) {
  const logoUrl = useBrandLogo()

  return (
    <main className="mx-auto max-w-sm px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2 text-center">
        <StoreLogo src={logoUrl} alt="" size={64} className="size-16" />
        <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <div className="rounded-xl border border-border bg-card p-6 shadow-soft">{children}</div>
    </main>
  )
}
