'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { SUPPORT_TOPICS, type CustomerSupportThread, type SupportTopic } from '@ecommerce/shared/contracts'
import { SUPPORT_TOPIC_LABEL } from '@ecommerce/shared/constants'
import { ApiError } from '@/lib/api'
import { useSendSupport } from '@/lib/orders'
import { cn, formatDateTime } from '@/lib/utils'
import { buttonVariants } from './ui/button'

/**
 * A conversa com a loja sobre este pedido. A mensagem cai no menu Atendimento do
 * admin e avisa a equipe por e-mail; a resposta aparece aqui e chega por e-mail.
 *
 * `compose` deixa outro ponto da página abrir o formulário já com o assunto
 * certo (ex.: "Pedir devolução" abre em RETURN). O `nonce` existe porque pedir o
 * mesmo assunto duas vezes precisa reabrir o formulário as duas vezes.
 */
export type ComposeRequest = { topic: SupportTopic; nonce: number }

const MIN_LENGTH = 10
const MAX_LENGTH = 1000

export const OrderConversation = ({
  orderId,
  thread,
  compose,
}: {
  orderId: string
  thread: CustomerSupportThread | null
  compose?: ComposeRequest | null
}) => {
  const [open, setOpen] = useState(false)
  const [topic, setTopic] = useState<SupportTopic>('OTHER')
  const [message, setMessage] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = useSendSupport(orderId)
  const sectionRef = useRef<HTMLElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // O link do e-mail aponta para #conversa, mas a seção só existe depois que o
  // pedido carrega — o salto nativo do navegador já passou quando ela monta.
  useEffect(() => {
    if (window.location.hash === '#conversa') sectionRef.current?.scrollIntoView({ block: 'start' })
  }, [])

  useEffect(() => {
    if (!compose) return
    setTopic(compose.topic)
    setOpen(true)
    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    // Depois do scroll: focar antes faria o navegador pular sem animação.
    const t = setTimeout(() => textareaRef.current?.focus({ preventScroll: true }), 400)
    return () => clearTimeout(t)
  }, [compose])

  const messages = thread?.messages ?? []
  const last = messages[messages.length - 1]
  const waitingForStore = thread?.status === 'OPEN' && last?.author === 'CUSTOMER'

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await send.mutateAsync({ topic, message: message.trim() })
      setMessage('')
      setOpen(false)
    } catch (err) {
      if (err instanceof ApiError && err.code === 'RATE_LIMITED') {
        setError('Você enviou muitas mensagens sobre este pedido. Tente novamente mais tarde.')
        return
      }
      setError(err instanceof ApiError ? err.message : 'Não foi possível enviar. Tente de novo.')
    }
  }

  return (
    <section
      id="conversa"
      ref={sectionRef}
      className="scroll-mt-24 rounded-xl border border-border bg-card p-5 shadow-soft"
    >
      <h2 className="font-medium">Conversa com a loja</h2>

      {messages.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          Alguma dúvida sobre este pedido? Escreva para a gente — respondemos em até 1 dia útil, aqui e por
          e-mail.
        </p>
      ) : (
        <ol className="mt-4 flex flex-col gap-3">
          {messages.map((m) =>
            m.author === 'SYSTEM' ? (
              <li key={m.id} className="mx-auto max-w-[90%] rounded-lg bg-muted px-3 py-2 text-center text-xs text-muted-foreground">
                <p className="whitespace-pre-wrap">{m.body}</p>
                <p className="mt-1">{formatDateTime(m.createdAt)}</p>
              </li>
            ) : (
              <li
                key={m.id}
                className={cn(
                  'flex max-w-[85%] flex-col gap-1 rounded-xl px-3 py-2 text-sm',
                  m.author === 'CUSTOMER'
                    ? 'self-end rounded-br-sm bg-primary/10'
                    : 'self-start rounded-bl-sm border border-border bg-background',
                )}
              >
                <span className="text-xs font-medium text-muted-foreground">
                  {m.author === 'CUSTOMER' ? 'Você' : 'Equipe da loja'}
                  {m.topic && ` · ${SUPPORT_TOPIC_LABEL[m.topic]}`}
                </span>
                <p className="whitespace-pre-wrap wrap-break-word">{m.body}</p>
                <span className="text-right text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span>
              </li>
            ),
          )}
        </ol>
      )}

      {waitingForStore && !open && (
        <p className="mt-3 rounded-lg bg-success/10 p-3 text-sm text-success">
          Recebemos sua mensagem. Respondemos em até 1 dia útil, aqui e por e-mail.
        </p>
      )}

      {open ? (
        <form onSubmit={(e) => void submit(e)} className="mt-4 border-t border-border pt-4">
          <label htmlFor="support-topic" className="block text-xs font-medium">
            Assunto
          </label>
          <select
            id="support-topic"
            value={topic}
            onChange={(e) => setTopic(e.target.value as SupportTopic)}
            className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SUPPORT_TOPICS.map((t) => (
              <option key={t} value={t}>
                {SUPPORT_TOPIC_LABEL[t]}
              </option>
            ))}
          </select>

          <label htmlFor="support-message" className="mt-3 block text-xs font-medium">
            Mensagem
          </label>
          <textarea
            id="support-message"
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            maxLength={MAX_LENGTH}
            required
            placeholder={
              topic === 'RETURN'
                ? 'Conte o que você quer devolver e por quê. Vamos te orientar sobre o envio.'
                : 'Conte o que aconteceu'
            }
            className="mt-1 w-full rounded-lg border border-input bg-card p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <p className="mt-1 text-right text-xs text-muted-foreground">
            {message.length}/{MAX_LENGTH}
          </p>

          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}

          <div className="mt-3 flex gap-2">
            <button
              type="submit"
              disabled={message.trim().length < MIN_LENGTH || send.isPending}
              className={cn(buttonVariants({ size: 'sm' }), 'flex-1')}
            >
              {send.isPending ? 'Enviando…' : 'Enviar mensagem'}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false)
                setError(null)
              }}
              className={buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' })}
            >
              Cancelar
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' }), 'mt-4 w-full')}
        >
          {messages.length === 0 ? 'Escrever para a loja' : 'Enviar nova mensagem'}
        </button>
      )}
    </section>
  )
}
