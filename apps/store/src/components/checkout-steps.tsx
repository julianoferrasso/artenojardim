import Link from 'next/link'
import { Check, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const STEPS = [
  { key: 'cart', label: 'Carrinho' },
  { key: 'delivery', label: 'Entrega' },
  { key: 'payment', label: 'Pagamento' },
] as const

/**
 * Onde o cliente está no funil. "Carrinho" só é link antes do pedido: depois de
 * confirmar, o carrinho já foi esvaziado e voltar a ele não leva a nada.
 */
export const CheckoutSteps = ({ current }: { current: 'delivery' | 'payment' }) => {
  const currentIndex = STEPS.findIndex((s) => s.key === current)

  return (
    <nav aria-label="Etapas da compra">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm">
        {STEPS.map((step, i) => {
          const done = i < currentIndex
          const active = i === currentIndex
          const content = (
            <>
              <span
                className={cn(
                  'grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  done && 'bg-secondary text-secondary-foreground',
                  active && 'bg-btn-primary text-btn-primary-foreground',
                  !done && !active && 'border border-border text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : i + 1}
              </span>
              <span className={active ? 'font-medium text-foreground' : 'text-muted-foreground'}>
                {step.label}
              </span>
              {done && <span className="sr-only">(concluída)</span>}
            </>
          )

          return (
            <li key={step.key} className="flex items-center gap-2" aria-current={active ? 'step' : undefined}>
              {step.key === 'cart' && current === 'delivery' ? (
                <Link href="/carrinho" className="flex items-center gap-2 hover:underline">
                  {content}
                </Link>
              ) : (
                <span className="flex items-center gap-2">{content}</span>
              )}
              {i < STEPS.length - 1 && <ChevronRight className="size-4 text-muted-foreground" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
