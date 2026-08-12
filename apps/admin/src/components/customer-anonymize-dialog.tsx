'use client'

import { useState } from 'react'
import type { AdminCustomer } from '@ecommerce/shared/contracts'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { useAnonymizeCustomer } from '@/lib/customers'
import { ApiError } from '@/lib/api'

/**
 * Anonimização (LGPD). Destrói o dado pessoal e preserva os pedidos — o histórico
 * é obrigação fiscal e o pedido já guarda seu próprio snapshot de endereço.
 *
 * Irreversível: por isso AlertDialog, e por isso a API exige ADMIN.
 *
 * ── NÃO ESTÁ MONTADO EM NENHUMA TELA ────────────────────────────────────────
 * Foi retirado da página do cliente por decisão do lojista: um botão que destrói
 * dado irreversivelmente não vale um gatilho permanente ao lado de "Editar",
 * para uma situação que acontece raramente.
 *
 * Fica aqui, pronto, porque o direito de eliminação da LGPD continua existindo e
 * o endpoint (`POST /admin/customers/:id/anonymize`) segue no ar. Quando um
 * cliente pedir, é só voltar a renderizar isto no ActionsCard — ou chamar o
 * endpoint direto.
 */
export const CustomerAnonymizeDialog = ({
  customer,
  disabled,
}: {
  customer: AdminCustomer
  disabled?: boolean
}) => {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const anonymize = useAnonymizeCustomer(customer.id)

  // Já anonimizado: repetir não faria nada além de confundir.
  if (customer.deletedAt) return null

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next: boolean) => {
        setOpen(next)
        if (!next) setError(null)
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" className="w-full text-destructive" disabled={disabled}>
          Anonimizar dados
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Anonimizar {customer.name}?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Apaga do <strong>cadastro</strong>: nome, e-mail, telefone, CPF, endereços e
                histórico de navegação. As sessões abertas caem e o cliente não consegue mais entrar.
              </p>
              <p>
                Os <strong>pedidos são preservados</strong> por obrigação fiscal — e cada um guarda
                a própria cópia do e-mail e do endereço de entrega, que continuam visíveis na tela
                do pedido.
              </p>
              <p className="font-medium text-foreground">Esta ação não pode ser desfeita.</p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={anonymize.isPending}
            onClick={(e: React.MouseEvent) => {
              // preventDefault obrigatório: sem ele o Radix fecha o diálogo e o
              // erro do servidor some junto, sem o operador ver o motivo.
              e.preventDefault()
              setError(null)
              anonymize.mutate(undefined, {
                onSuccess: () => setOpen(false),
                onError: (err) =>
                  setError(err instanceof ApiError ? err.message : 'Não foi possível anonimizar.'),
              })
            }}
          >
            {anonymize.isPending ? 'Anonimizando…' : 'Anonimizar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
