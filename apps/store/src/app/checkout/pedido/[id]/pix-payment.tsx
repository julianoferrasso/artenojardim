'use client'

import { useEffect, useState } from 'react'
import type { PixCharge } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { createPixPayment, getOrderStatus } from '@/lib/checkout'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Pix: gera o QR sob demanda (abrir a tela não cria cobrança), mostra o
 * copia-e-cola e espera o pagamento por polling — quem confirma é o webhook do
 * Mercado Pago no servidor; a tela só observa o status do pedido.
 *
 * 5 s e só com a aba visível: o limite global da API é 300 req/15 min por IP, e
 * um Pix aberto em segundo plano não pode consumir a cota da casa inteira.
 */
const POLL_MS = 5000

const remaining = (expiresAt: string, now: number): number =>
  Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))

const mmss = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

export function PixPayment({
  orderId,
  initial,
  onPaid,
}: {
  orderId: string
  initial: PixCharge | null
  onPaid: () => void
}) {
  const [pix, setPix] = useState<PixCharge | null>(initial)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const seconds = pix ? remaining(pix.expiresAt, now) : 0
  const expired = !!pix && seconds === 0

  // Relógio da contagem regressiva.
  useEffect(() => {
    if (!pix || expired) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pix, expired])

  // Espera o pagamento enquanto o Pix vale.
  useEffect(() => {
    if (!pix || expired) return
    let cancelled = false
    const t = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      void getOrderStatus(orderId)
        .then((s) => {
          if (!cancelled && s.paymentStatus === 'PAID') onPaid()
        })
        .catch(() => {
          /* tenta de novo no próximo ciclo */
        })
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [pix, expired, orderId, onPaid])

  const generate = async () => {
    setGenerating(true)
    setError(null)
    try {
      setPix(await createPixPayment(orderId))
      setNow(Date.now())
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_PAYABLE') {
        onPaid()
        return
      }
      setError(
        err instanceof ApiError && err.code === 'RATE_LIMITED'
          ? err.message
          : 'Não foi possível gerar o Pix agora. Tente novamente em instantes.',
      )
    } finally {
      setGenerating(false)
    }
  }

  const copy = async () => {
    if (!pix) return
    try {
      await navigator.clipboard.writeText(pix.qrCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setError('Não foi possível copiar. Selecione o código e copie manualmente.')
    }
  }

  if (!pix || expired) {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p className="text-muted-foreground">
          {expired
            ? 'Este Pix venceu sem pagamento. Gere um novo para continuar.'
            : 'Gere o QR Code e pague pelo app do seu banco. A confirmação chega em segundos.'}
        </p>
        {error && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
            {error}
          </p>
        )}
        <button onClick={generate} disabled={generating} className={buttonVariants({ size: 'lg' })}>
          {generating ? 'Gerando…' : expired ? 'Gerar novo Pix' : 'Gerar QR Code Pix'}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4 text-sm">
      <p className="text-center text-muted-foreground">
        Abra o app do seu banco, escolha <span className="font-medium text-foreground">Pix → Pagar com QR Code</span> e
        escaneie — ou use o copia e cola.
      </p>

      {/* Data URI do próprio MP: next/image não otimiza nem cacheia isto. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:image/png;base64,${pix.qrCodeBase64}`}
        alt="QR Code do Pix"
        width={224}
        height={224}
        className="rounded-lg border border-border bg-white p-2"
      />

      <div className="flex w-full flex-col gap-2">
        <label htmlFor="pix-code" className="text-xs font-medium text-muted-foreground">
          Pix copia e cola
        </label>
        <div className="flex gap-2">
          <input
            id="pix-code"
            readOnly
            value={pix.qrCode}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs"
          />
          <button onClick={copy} className={buttonVariants({ variant: 'neutral', size: 'default' })}>
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      <p className="text-muted-foreground" aria-live="polite">
        Vence em <span className="font-mono font-medium text-foreground">{mmss(seconds)}</span>
      </p>

      <p className={cn('flex items-center gap-2 text-muted-foreground')}>
        <span className="size-2 animate-pulse rounded-full bg-primary" aria-hidden />
        Aguardando o pagamento…
      </p>

      {error && (
        <p role="alert" className="w-full rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
