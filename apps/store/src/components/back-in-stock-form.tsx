'use client'

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { createStockNotificationSchema } from '@ecommerce/shared/contracts'
import { ROUTES } from '@ecommerce/shared/constants'
import { clientFetch } from '@/lib/client'
import { ApiError } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Button } from '@/components/ui/button'

const formSchema = createStockNotificationSchema.pick({ email: true })

/**
 * "Avise-me quando chegar", no painel do produto esgotado. Sem login — exigir
 * conta para deixar um e-mail é o que faz a maioria desistir —, e quem está
 * logado já encontra o próprio e-mail preenchido. A API responde 204 sempre:
 * o sucesso local é a única confirmação.
 *
 * Quem usa troca o `key` pela variação: outra opção esgotada é outro pedido.
 */
export const BackInStockForm = ({ variantId }: { variantId: string }) => {
  const { customer } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(formSchema), defaultValues: { email: '' } })

  // A sessão chega depois do primeiro render (o /refresh do boot): preenche
  // quando ela aparece, sem apagar o que o cliente já começou a digitar.
  useEffect(() => {
    if (customer?.email && !getValues('email')) setValue('email', customer.email)
  }, [customer?.email, getValues, setValue])

  const onSubmit = handleSubmit(async ({ email }) => {
    setServerError(null)
    try {
      await clientFetch<void>(ROUTES.stockNotifications, {
        method: 'POST',
        body: JSON.stringify({ variantId, email }),
      })
      setSentTo(email)
    } catch (err) {
      setServerError(
        err instanceof ApiError && err.code === 'RATE_LIMITED'
          ? 'Muitas tentativas. Aguarde um pouco e tente de novo.'
          : 'Não foi possível registrar o aviso. Tente novamente.',
      )
    }
  })

  if (sentTo) {
    return (
      <p role="status" className="flex items-start gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
        Pronto! Vamos avisar {sentTo} quando voltar.
      </p>
    )
  }

  return (
    // @container: lado a lado só quando o PRÓPRIO painel tem espaço, como no
    // formulário do newsletter.
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="@container w-full">
      <div className="flex flex-col gap-2 @sm:flex-row">
        <input
          type="email"
          autoComplete="email"
          placeholder="Seu e-mail"
          aria-label="E-mail para o aviso de reposição"
          aria-invalid={Boolean(errors.email)}
          className="h-12 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40"
          {...register('email')}
        />
        <Button type="submit" size="lg" disabled={isSubmitting} className="shrink-0">
          {isSubmitting && <Loader2 className="animate-spin" />}
          Avise-me
        </Button>
      </div>
      {errors.email && <p className="mt-2 text-xs text-destructive">Informe um e-mail válido.</p>}
      {serverError && <p className="mt-2 text-xs text-destructive">{serverError}</p>}
      <p className="mt-2 text-xs text-muted-foreground">
        Usaremos seu e-mail só para este aviso: uma mensagem, quando a peça voltar.
      </p>
    </form>
  )
}
