import { Check } from 'lucide-react'
import type { CustomerOrderEvent, CustomerTimelineStep } from '@ecommerce/shared/contracts'
import { cn, formatDateTime } from '@/lib/utils'

/**
 * O andamento do pedido, em duas leituras: a escada ("onde estou?") e o
 * histórico ("o que aconteceu e quando?").
 *
 * Nenhum `type` de evento é interpretado aqui — a API já manda `label` pronto,
 * filtrado por whitelist. É o que garante que uma nota interna nova no admin não
 * apareça nesta tela por descuido.
 */

export const OrderTimeline = ({
  steps,
  events,
}: {
  steps: readonly CustomerTimelineStep[]
  events: readonly CustomerOrderEvent[]
}) => {
  // Pedido cancelado chega sem escada: mostrar "Entregue" apagado num pedido
  // morto sugere que ainda há algo por vir.
  const lastReached = steps.reduce((acc, s, i) => (s.reachedAt ? i : acc), -1)

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 font-medium">Acompanhamento</h2>

      {steps.length > 0 && (
        <ol className="mb-6 flex flex-col gap-0">
          {steps.map((step, index) => {
            const reached = !!step.reachedAt
            const isLast = index === steps.length - 1
            return (
              <li key={step.key} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                      reached
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-background',
                    )}
                  >
                    {reached && <Check className="size-3.5" aria-hidden />}
                  </span>
                  {!isLast && (
                    <span
                      className={cn(
                        'w-0.5 flex-1',
                        index < lastReached ? 'bg-primary' : 'bg-border',
                      )}
                    />
                  )}
                </div>

                <div className={cn('pb-5', isLast && 'pb-0')}>
                  <p className={cn('text-sm', reached ? 'font-medium' : 'text-muted-foreground')}>
                    {step.label}
                  </p>
                  {step.reachedAt && (
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(step.reachedAt)}
                    </p>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      <div className={cn(steps.length > 0 && 'border-t border-border pt-4')}>
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Histórico
        </h3>
        <ol className="flex flex-col gap-3">
          {events.map((event) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-muted-foreground/50" />
              <div className="min-w-0">
                <p>{event.label}</p>
                {/* Só texto que o próprio cliente escreveu chega até aqui. */}
                {event.detail && (
                  <p className="mt-0.5 text-xs text-muted-foreground">“{event.detail}”</p>
                )}
                <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
              </div>
            </li>
          ))}
          {events.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhum evento registrado ainda.</li>
          )}
        </ol>
      </div>
    </section>
  )
}
