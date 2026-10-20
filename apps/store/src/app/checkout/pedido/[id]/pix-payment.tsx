'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, CircleAlert, Clock, Copy, QrCode } from 'lucide-react'
import type { PixCharge } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { createPixPayment, getOrderStatus } from '@/lib/checkout'
import { Button } from '@/components/ui/button'
import { formatBRL } from '@/lib/utils'

/**
 * Pix: gera o QR sob demanda (abrir a tela não cria cobrança), mostra o
 * copia-e-cola e espera o pagamento por polling — quem confirma é o webhook do
 * Mercado Pago no servidor; a tela só observa o status do pedido.
 *
 * 5 s e só com a aba visível: o limite global da API é 300 req/15 min por IP, e
 * um Pix aberto em segundo plano não pode consumir a cota da casa inteira.
 */
const POLL_MS = 5000

/** "Já paguei" consulta na hora; o intervalo impede que vire metralhadora na API. */
const CHECK_COOLDOWN_MS = 5000

const remaining = (expiresAt: string, now: number): number =>
  Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))

const mmss = (seconds: number): string =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`

/** Navegadores embutidos (o do Instagram) negam o clipboard assíncrono. */
const copyBySelection = (input: HTMLInputElement | null): boolean => {
  if (!input) return false
  input.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  }
}

const ErrorNote = ({ children }: { children: React.ReactNode }) => (
  <p role="alert" className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
    <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
    {children}
  </p>
)

export function PixPayment({
  orderId,
  amount,
  initial,
  onPaid,
}: {
  orderId: string
  /** Total do pedido em centavos — o valor que o app do banco vai mostrar. */
  amount: number
  initial: PixCharge | null
  onPaid: () => void
}) {
  const [pix, setPix] = useState<PixCharge | null>(initial)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [checking, setChecking] = useState(false)
  const [coolingDown, setCoolingDown] = useState(false)
  const [checkNotice, setCheckNotice] = useState<string | null>(null)
  const codeRef = useRef<HTMLInputElement>(null)

  const seconds = pix ? remaining(pix.expiresAt, now) : 0
  const expired = !!pix && seconds === 0
  const waiting = !!pix && !expired

  // Relógio da contagem regressiva.
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [waiting])

  // Espera o pagamento enquanto o Pix vale.
  useEffect(() => {
    if (!waiting) return
    let cancelled = false
    const check = () => {
      void getOrderStatus(orderId)
        .then((s) => {
          if (!cancelled && s.paymentStatus === 'PAID') onPaid()
        })
        .catch(() => {
          /* tenta de novo no próximo ciclo */
        })
    }
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, POLL_MS)
    // Quem pagou no celular volta para esta aba: confere na hora, sem esperar o ciclo.
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      clearInterval(t)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [waiting, orderId, onPaid])

  const generate = async () => {
    setGenerating(true)
    setError(null)
    setCheckNotice(null)
    try {
      setPix(await createPixPayment(orderId))
      setNow(Date.now())
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ORDER_NOT_PAYABLE') {
        // O mesmo código diz "já pago" e "cancelado": só o status do pedido separa.
        const current = await getOrderStatus(orderId).catch(() => null)
        if (current?.paymentStatus === 'PAID') onPaid()
        else setError(err.message)
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
    let ok: boolean
    try {
      await navigator.clipboard.writeText(pix.qrCode)
      ok = true
    } catch {
      ok = copyBySelection(codeRef.current)
    }
    if (!ok) {
      setError('Não foi possível copiar. Selecione o código e copie manualmente.')
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const checkNow = async () => {
    setChecking(true)
    setCheckNotice(null)
    try {
      const current = await getOrderStatus(orderId)
      if (current.paymentStatus === 'PAID') {
        onPaid()
        return
      }
      setCheckNotice(
        'Ainda não recebemos a confirmação. Ela costuma chegar em segundos — esta tela atualiza sozinha.',
      )
    } catch {
      setCheckNotice('Não foi possível verificar agora. Tente de novo em instantes.')
    } finally {
      setChecking(false)
      setCoolingDown(true)
      setTimeout(() => setCoolingDown(false), CHECK_COOLDOWN_MS)
    }
  }

  if (!pix || expired) {
    return (
      <div className="flex flex-col gap-4 text-sm">
        {expired && (
          <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-muted-foreground">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />O código Pix expirou sem pagamento. Gere
            um novo para continuar.
          </p>
        )}
        <div>
          <p className="text-muted-foreground">Total a pagar</p>
          <p className="text-2xl font-semibold tracking-tight">{formatBRL(amount)}</p>
        </div>
        <ul className="flex flex-col gap-2 text-muted-foreground">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Aprovação em segundos: seu pedido é confirmado automaticamente.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
            Pague no app do seu banco, com QR Code ou Pix copia e cola.
          </li>
        </ul>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button size="lg" onClick={generate} disabled={generating} className="w-full sm:w-auto sm:self-start">
          <QrCode aria-hidden />
          {generating ? 'Gerando…' : expired ? 'Gerar novo código Pix' : 'Gerar código Pix'}
        </Button>
      </div>
    )
  }

  const steps = [
    'Abra o app do seu banco e escolha pagar com Pix.',
    'Escaneie o QR Code ou cole o código copiado.',
    `Confira o valor de ${formatBRL(amount)} e confirme.`,
  ]

  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p
          role="status"
          className="inline-flex items-center gap-2 rounded-full border border-warning/30 bg-warning/15 px-3 py-1 text-xs font-medium text-warning-foreground"
        >
          <span className="size-2 animate-pulse rounded-full bg-warning motion-reduce:animate-none" aria-hidden />
          Aguardando pagamento
        </p>
        <p role="timer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          Expira em <span className="font-mono font-medium tabular-nums text-foreground">{mmss(seconds)}</span>
        </p>
      </div>

      {/* O copia e cola vem primeiro no DOM: no celular ninguém escaneia a própria
          tela. No desktop o QR sobe (sm:order-*); só conteúdo sem foco muda de
          lugar, então a ordem do Tab continua certa. */}
      <div className="flex flex-col gap-2 sm:order-2">
        <label htmlFor="pix-code" className="text-xs font-medium text-muted-foreground">
          Pix copia e cola
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            ref={codeRef}
            id="pix-code"
            readOnly
            value={pix.qrCode}
            onFocus={(e) => e.currentTarget.select()}
            className="h-11 min-w-0 truncate rounded-lg border border-input bg-muted/60 px-3 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 sm:flex-1"
          />
          <Button onClick={copy} className="h-11 shrink-0">
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? 'Copiado!' : 'Copiar código Pix'}
          </Button>
        </div>
        <p className="sr-only" aria-live="polite">
          {copied ? 'Código Pix copiado.' : ''}
        </p>
      </div>

      <div className="flex flex-col items-center gap-5 sm:order-1 sm:flex-row">
        {/* Data URI do próprio MP: next/image não otimiza nem cacheia isto.
            Fundo branco em qualquer tema: o leitor do banco precisa de margem clara. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${pix.qrCodeBase64}`}
          alt="QR Code do Pix"
          width={192}
          height={192}
          className="size-48 shrink-0 rounded-xl border border-border bg-white p-2"
        />
        <ol className="flex flex-col gap-3 self-stretch sm:self-center">
          {steps.map((text, i) => (
            <li key={text} className="flex items-start gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {i + 1}
              </span>
              <span className="pt-0.5 text-muted-foreground">{text}</span>
            </li>
          ))}
        </ol>
      </div>

      {error && (
        <div className="sm:order-3">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <div className="flex flex-col items-center gap-2 border-t border-border pt-4 text-center sm:order-4">
        <p className="text-xs text-muted-foreground">A confirmação aparece aqui automaticamente.</p>
        <Button
          variant="neutral"
          emphasis="quiet"
          size="sm"
          onClick={checkNow}
          disabled={checking || coolingDown}
        >
          {checking ? 'Verificando…' : 'Já paguei'}
        </Button>
        {checkNotice && (
          <p role="status" className="text-xs text-muted-foreground">
            {checkNotice}
          </p>
        )}
      </div>
    </div>
  )
}
