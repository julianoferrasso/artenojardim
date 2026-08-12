'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateAdminCustomerSchema,
  type AdminCustomer,
  type UpdateAdminCustomerInput,
} from '@ecommerce/shared/contracts'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useUpdateCustomer } from '@/lib/customers'
import { ApiError } from '@/lib/api'

const field =
  'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Correção de cadastro pelo staff. O caso real é o cliente que digitou o e-mail
 * errado no checkout de convidado e não recebe nada.
 *
 * Trocar o e-mail NÃO reverifica a conta: quem confirma a caixa é o dono dela.
 */
export const CustomerEditDialog = ({ customer }: { customer: AdminCustomer }) => {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = useUpdateCustomer(customer.id)

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdateAdminCustomerInput>({
    resolver: zodResolver(updateAdminCustomerSchema),
    defaultValues: {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? '',
      acceptsMarketing: customer.acceptsMarketing,
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full">
          Editar dados
        </Button>
      </DialogTrigger>

      {/* key força remount ao reabrir: sem isso o react-hook-form segura os
          defaultValues da abertura anterior. */}
      <DialogContent key={open ? 'open' : 'closed'}>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
          <DialogDescription>
            Correção de cadastro. Trocar o e-mail derruba as sessões do cliente e volta a conta
            para &ldquo;pendente&rdquo;: ele precisará confirmar o endereço novo para entrar de novo.
          </DialogDescription>
        </DialogHeader>

        <form
          id="customer-edit"
          onSubmit={handleSubmit((values) => {
            setError(null)
            update.mutate(
              {
                ...values,
                // String vazia vira null: telefone em branco é ausência, não "".
                phone: values.phone?.trim() ? values.phone : null,
              },
              {
                onSuccess: () => setOpen(false),
                onError: (e) =>
                  setError(e instanceof ApiError ? e.message : 'Não foi possível salvar.'),
              },
            )
          })}
          className="flex flex-col gap-3"
        >
          <div className="flex flex-col gap-1.5">
            <label htmlFor="c-name" className="text-sm font-medium">Nome</label>
            <input id="c-name" {...register('name')} className={field} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="c-email" className="text-sm font-medium">E-mail</label>
            <input id="c-email" type="email" {...register('email')} className={field} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="c-phone" className="text-sm font-medium">Telefone</label>
            <input id="c-phone" {...register('phone')} className={field} placeholder="(51) 99999-9999" />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" {...register('acceptsMarketing')} className="size-4 accent-primary" />
            Aceita receber e-mails de marketing
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="submit" form="customer-edit" disabled={update.isPending}>
            {update.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
