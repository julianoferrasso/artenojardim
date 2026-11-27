'use client'

import { useEffect, useRef, useState } from 'react'
import { EMAIL_CODE_LENGTH, ERROR_CODES, customerNameSchema } from '@ecommerce/shared/contracts'
import { ApiError } from '@/lib/api'
import { requestEmailCode, verifyEmailCode } from '@/lib/account'
import { authErrorMessage, type SessionResp } from '@/lib/auth'
import { cn, fieldClass, submitButtonClass } from '@/lib/utils'

/**
 * O passo do código de 6 dígitos, o mesmo em todo lugar: checkout, "entrar com
 * código", cadastro e login de conta não confirmada.
 *
 * Um input só, e não seis caixinhas: colar "123 456" do e-mail e o preenchimento
 * automático do iOS (`one-time-code`, que lê o código do app Mail) funcionam
 * sem truque nenhum. Envia sozinho no 6º dígito — e trava enquanto envia: um
 * segundo envio do mesmo código chegaria depois do consumo e diria "venceu".
 *
 * Não aplica a sessão: devolve para quem chamou, que decide o que fazer antes
 * (o checkout ainda salva o endereço e cria o pedido).
 */

type Props = {
  email: string
  /** Segundos até liberar o reenvio — da resposta que mandou o código. */
  resendInSeconds: number
  /** Nome já conhecido (checkout, cadastro). Vai junto: cria a conta se ela não existir. */
  name?: string | undefined
  onVerified: (session: SessionResp) => Promise<void> | void
  /** "Corrigir e-mail": volta para quem chamou digitar outro endereço. */
  onChangeEmail?: (() => void) | undefined
  /** O que acontece depois, para o botão dizer ("Confirmar e ir para o pagamento"). */
  submitLabel?: string | undefined
  /** Texto enquanto `onVerified` trabalha ("Criando o pedido…"). */
  busyLabel?: string | undefined
  className?: string | undefined
}

const digitsOf = (value: string): string => value.replace(/\D/g, '').slice(0, EMAIL_CODE_LENGTH)

const formatWait = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

/** Espera pedida pela API num reenvio cedo demais, ou null se o erro é outro. */
export const resendWaitSeconds = (err: unknown): number | null => {
  if (!(err instanceof ApiError) || err.code !== ERROR_CODES.EMAIL_CODE_RESEND_TOO_SOON) return null
  const raw = err.details?.find((d) => d.field === 'resendInSeconds')?.message
  return raw ? Number(raw) : 60
}

export function EmailCodeStep({
  email,
  resendInSeconds,
  name,
  onVerified,
  onChangeEmail,
  submitLabel = 'Confirmar',
  busyLabel = 'Entrando…',
  className,
}: Props) {
  const [code, setCode] = useState('')
  const [phase, setPhase] = useState<'idle' | 'checking' | 'continuing'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [expired, setExpired] = useState(false)
  /** O e-mail ainda não tem conta e ninguém disse o nome: a API devolveu NAME_REQUIRED. */
  const [askName, setAskName] = useState(false)
  const [typedName, setTypedName] = useState('')
  const [nameError, setNameError] = useState<string | null>(null)
  const [wait, setWait] = useState(resendInSeconds)
  const [resending, setResending] = useState(false)
  const [resent, setResent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const id = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearTimeout(id)
  }, [wait])

  useEffect(() => {
    if (askName) nameRef.current?.focus()
  }, [askName])

  const submit = async (value: string, withName?: string) => {
    if (value.length !== EMAIL_CODE_LENGTH || phase !== 'idle') return
    setPhase('checking')
    setError(null)
    let session: SessionResp
    try {
      const chosenName = withName ?? name
      session = await verifyEmailCode({ email, code: value, ...(chosenName ? { name: chosenName } : {}) })
    } catch (err) {
      setPhase('idle')
      if (err instanceof ApiError && err.code === ERROR_CODES.NAME_REQUIRED) {
        setAskName(true)
        return
      }
      if (err instanceof ApiError && err.code === ERROR_CODES.EMAIL_CODE_EXPIRED) {
        setExpired(true)
        setCode('')
      } else if (err instanceof ApiError && err.code === ERROR_CODES.EMAIL_CODE_INVALID) {
        // Apaga para o próximo dígito digitado já ser o começo de outra tentativa.
        setCode('')
        inputRef.current?.focus()
      }
      setError(authErrorMessage(err))
      return
    }

    setPhase('continuing')
    try {
      await onVerified(session)
    } finally {
      setPhase('idle')
    }
  }

  const onCodeChange = (raw: string) => {
    const digits = digitsOf(raw)
    setCode(digits)
    setExpired(false)
    if (digits.length === EMAIL_CODE_LENGTH && !askName) void submit(digits)
  }

  const resend = async () => {
    setResending(true)
    setError(null)
    try {
      const sent = await requestEmailCode(email)
      setWait(sent.resendInSeconds)
      setResent(true)
      setExpired(false)
      setCode('')
      inputRef.current?.focus()
    } catch (err) {
      const seconds = resendWaitSeconds(err)
      if (seconds !== null) setWait(seconds)
      else setError(authErrorMessage(err))
    } finally {
      setResending(false)
    }
  }

  const submitName = () => {
    const parsed = customerNameSchema.safeParse(typedName)
    if (!parsed.success) {
      setNameError(parsed.error.issues[0]?.message ?? 'Informe seu nome')
      return
    }
    setNameError(null)
    void submit(code, parsed.data)
  }

  const busy = phase !== 'idle'

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <p className="text-sm text-muted-foreground">
        Enviamos um código de {EMAIL_CODE_LENGTH} dígitos para{' '}
        <strong className="font-medium text-foreground">{email}</strong>.
        {resent ? ' Um novo acabou de sair — o anterior não vale mais.' : ''}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="email-code" className="text-sm font-medium">
          Código
        </label>
        <input
          ref={inputRef}
          id="email-code"
          name="one-time-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          enterKeyHint="done"
          value={code}
          onChange={(e) => onCodeChange(e.target.value)}
          disabled={busy}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? 'email-code-error' : undefined}
          className={cn(fieldClass, 'h-12 text-center font-mono text-xl tracking-widest')}
        />
      </div>

      {askName && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email-code-name" className="text-sm font-medium">
            Como podemos te chamar?
          </label>
          <input
            ref={nameRef}
            id="email-code-name"
            autoComplete="name"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submitName()
              }
            }}
            className={fieldClass}
          />
          <span className="text-xs text-muted-foreground">É a primeira vez deste e-mail aqui: vamos criar a sua conta.</span>
          {nameError && <p className="text-xs text-destructive">{nameError}</p>}
        </div>
      )}

      {error && (
        <p id="email-code-error" role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={busy || code.length !== EMAIL_CODE_LENGTH}
        onClick={() => (askName ? submitName() : void submit(code))}
        className={submitButtonClass}
      >
        {phase === 'checking' ? 'Conferindo…' : phase === 'continuing' ? busyLabel : askName ? 'Criar conta e continuar' : submitLabel}
      </button>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <p>Não chegou? Pode levar um minuto. Confira também Spam e Promoções.</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {wait > 0 ? (
            <span aria-live="polite">Reenviar em {formatWait(wait)}</span>
          ) : (
            <button
              type="button"
              onClick={() => void resend()}
              disabled={resending || busy}
              className={cn('font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50', expired && 'text-primary')}
            >
              {resending ? 'Enviando…' : 'Enviar outro código'}
            </button>
          )}
          {onChangeEmail && (
            <button
              type="button"
              onClick={onChangeEmail}
              disabled={busy}
              className="font-medium text-foreground underline-offset-4 hover:underline disabled:opacity-50"
            >
              Corrigir e-mail
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
