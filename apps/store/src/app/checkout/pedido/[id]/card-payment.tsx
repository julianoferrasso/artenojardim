'use client'

import { useCallback, useEffect, useState, type ComponentProps } from 'react'
import { CardPayment } from '@mercadopago/sdk-react'
import { CircleAlert, ShieldCheck } from 'lucide-react'
import { ApiError } from '@/lib/api'
import { createCardPayment, getOrderStatus } from '@/lib/checkout'
import { ensureMercadoPago, readCardBrickStyle, readMpDeviceId } from '@/lib/mercadopago'
import { declineMessage } from '@/lib/payment-messages'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Cartão via Card Payment Brick: os dados do cartão nunca passam por nós — o
 * Brick (MercadoPago.js) os transforma num token de uso único, e é o token que
 * vai à API. Valor e e-mail que o Brick também manda são ignorados pela API: ela
 * cobra o total do pedido no banco.
 *
 * A resposta é síncrona: aprovado já volta PAID; em análise, a tela espera o
 * webhook; recusado volta 402 e o Brick fica para outra tentativa (rejeitar a
 * promise do onSubmit é o que o reabilita).
 */

type BrickProps = ComponentProps<typeof CardPayment>
type LoadStatus = 'loading' | 'ready' | 'failed'

/** O onBinChange padrão do SDK faz console.log do BIN a cada dígito digitado. */
const ignoreBin = (): void => {}

/**
 * Sem o MercadoPago.js (bloqueador, rede instável) o SDK não chama onError: a
 * criação do Brick rejeita em silêncio e a tela ficaria "carregando" para sempre.
 */
const LOAD_TIMEOUT_MS = 15_000

const buildCustomization = (): NonNullable<BrickProps['customization']> => {
  const style = readCardBrickStyle()
  return {
    // Só crédito: débito online no Brasil exige 3DS, que a integração ainda não
    // pede (docs/arquitetura.md §10).
    paymentMethods: { maxInstallments: 12, types: { excluded: ['debit_card', 'prepaid_card'] } },
    // Sem o título: ele repetia a opção escolhida e trazia logos coloridos de
    // bandeira, que a loja não usa (payment-icons.tsx).
    visual: { hideFormTitle: true, ...(style ? { style } : {}) },
  }
}

/** Mesma silhueta do formulário: a página não pula quando o Brick chega. */
const BrickSkeleton = () => (
  <div className="flex flex-col gap-4" aria-hidden>
    <Skeleton className="h-16" />
    <div className="grid grid-cols-2 gap-4">
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
    </div>
    <Skeleton className="h-16" />
    <Skeleton className="h-16" />
    <Skeleton className="h-11 w-36" />
  </div>
)

export function CardPaymentForm({
  orderId,
  amount,
  payerEmail,
  publicKey,
  onPaid,
  onProcessing,
}: {
  orderId: string
  amount: number
  payerEmail: string
  publicKey: string
  onPaid: () => void
  onProcessing: () => void
}) {
  ensureMercadoPago(publicKey)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<LoadStatus>('loading')

  // O SDK destrói e recria o Brick quando initialization, customization ou um
  // callback muda de IDENTIDADE — e recriar apaga o que o cliente digitou, até
  // depois de um cartão recusado. useState e não useMemo: o React pode descartar
  // um useMemo, e aqui a identidade é correção, não otimização.
  const [initialization] = useState(() => ({ amount: amount / 100, payer: { email: payerEmail } }))
  const [customization] = useState(buildCustomization)

  useEffect(() => {
    if (status !== 'loading') return
    const timer = setTimeout(() => setStatus('failed'), LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [status])

  const onReady = useCallback(() => setStatus('ready'), [])

  // Só o erro crítico impede o formulário (fields_setup_failed); os demais o
  // próprio Brick mostra junto do campo.
  const onError = useCallback<NonNullable<BrickProps['onError']>>((brickError) => {
    if (brickError.type === 'critical') setStatus('failed')
  }, [])

  const onSubmit = useCallback<BrickProps['onSubmit']>(
    async (formData, additional) => {
      setError(null)
      const doc = formData.payer.identification
      const deviceId = readMpDeviceId()
      try {
        const result = await createCardPayment(orderId, {
          token: formData.token,
          paymentMethodId: formData.payment_method_id,
          paymentType: additional?.paymentTypeId === 'debit_card' ? 'debit_card' : 'credit_card',
          installments: formData.installments,
          identification: {
            type: doc?.type === 'CNPJ' ? 'CNPJ' : 'CPF',
            number: (doc?.number ?? '').replace(/\D/g, ''),
          },
          ...(deviceId ? { deviceId } : {}),
        })
        if (result.status === 'PAID') onPaid()
        else onProcessing()
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ORDER_NOT_PAYABLE') {
          // O mesmo código diz "cancelado", "já pago", "cartão em análise" e "acabou
          // de ser pago via Pix": só o status do pedido separa o pago dos outros.
          const current = await getOrderStatus(orderId).catch(() => null)
          if (current?.paymentStatus === 'PAID') {
            onPaid()
            return
          }
          setError(err.message)
        } else if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED') {
          setError(declineMessage(err.details?.find((d) => d.field === 'reason')?.message))
        } else if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
          setError(err.message)
        } else if (err instanceof ApiError && err.code === 'VALIDATION_ERROR') {
          setError('Confira o CPF/CNPJ do titular e os dados do cartão.')
        } else {
          setError('Não foi possível processar o pagamento agora. Tente novamente em instantes.')
        }
        throw err
      }
    },
    [orderId, onPaid, onProcessing],
  )

  return (
    <div className="flex flex-col gap-5">
      {/* Só número, validade e código: nome do titular e CPF passam pela nossa
          API, porque o MP exige o documento do pagador. */}
      <div className="flex gap-3 rounded-lg bg-muted/60 p-3.5 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary-ink" strokeWidth={1.8} aria-hidden />
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">Seus dados estão protegidos.</span> O número do
          cartão, a validade e o código de segurança são digitados em campos do próprio Mercado Pago e
          vão criptografados direto para ele, que segue o padrão internacional de segurança PCI DSS.
          Nós não temos acesso a esses dados e não os armazenamos.
        </p>
      </div>

      {status === 'loading' && (
        <>
          <BrickSkeleton />
          <p role="status" className="sr-only">
            Carregando o formulário seguro do cartão…
          </p>
        </>
      )}
      {status === 'failed' && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          Não foi possível carregar o formulário do cartão. Recarregue a página ou pague com Pix.
        </p>
      )}

      {/* -m-4 desfaz o formPadding de 16px (lib/mercadopago.ts): os campos alinham
          com a nota acima e as seções internas continuam espaçadas. */}
      <div className="-m-4">
        <CardPayment
          locale="pt-BR"
          initialization={initialization}
          customization={customization}
          onSubmit={onSubmit}
          onReady={onReady}
          onError={onError}
          onBinChange={ignoreBin}
        />
      </div>

      {/* Abaixo do botão do Brick: é para onde o cliente está olhando depois de pagar. */}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}
