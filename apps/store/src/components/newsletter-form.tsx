'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import {
  subscribeNewsletterSchema,
  type SubscribeNewsletterInput,
} from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { clientFetch } from '@/lib/client'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

/**
 * Formulário de inscrição na newsletter (footer e home). O endpoint é
 * idempotente e responde 204 sempre — o sucesso local é a única confirmação.
 */
export const NewsletterForm = ({ className }: { className?: string }) => {
  const [status, setStatus] = useState<'idle' | 'success'>('idle')
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SubscribeNewsletterInput>({
    resolver: zodResolver(subscribeNewsletterSchema),
  })

  const onSubmit = handleSubmit(async (data) => {
    setServerError(null)
    try {
      await clientFetch<void>(ROUTES.newsletter.subscribe, {
        method: 'POST',
        body: JSON.stringify(data),
      })
      setStatus('success')
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.code === 'RATE_LIMITED'
          ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
          : 'Não foi possível concluir a inscrição. Tente novamente.',
      )
    }
  })

  if (status === 'success') {
    return (
      <p
        role="status"
        className={cn('flex items-center gap-2 text-sm font-medium text-success', className)}
      >
        <CheckCircle2 className="size-5 shrink-0" />
        Inscrição confirmada! Você vai receber as novidades por e-mail.
      </p>
    )
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className={cn('w-full', className)}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          autoComplete="email"
          placeholder="Seu melhor e-mail"
          aria-label="E-mail para a newsletter"
          aria-invalid={Boolean(errors.email)}
          className="h-11 w-full rounded-full border border-input bg-card px-5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          {...register('email')}
        />
        <Button type="submit" disabled={isSubmitting} className="h-11 shrink-0 rounded-full px-6">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Quero receber
        </Button>
      </div>
      {errors.email && (
        <p className="mt-2 text-xs text-destructive">Informe um e-mail válido.</p>
      )}
      {serverError && <p className="mt-2 text-xs text-destructive">{serverError}</p>}
    </form>
  )
}
