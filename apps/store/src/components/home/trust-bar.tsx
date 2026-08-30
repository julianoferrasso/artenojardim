import { CreditCard, Headphones, ShieldCheck, Truck } from 'lucide-react'

/**
 * Selos de confiança — o argumento racional depois do emocional do banner.
 * Ícones de traço fino, sem bolinha: no layout eles são discretos de propósito.
 */
const ITEMS = [
  {
    icon: ShieldCheck,
    title: 'Compra segura',
    text: 'Seus dados protegidos em todas as etapas.',
  },
  {
    icon: Truck,
    title: 'Entrega para todo o Brasil',
    text: 'Enviamos com carinho para você.',
  },
  {
    icon: Headphones,
    title: 'Atendimento acolhedor',
    text: 'Fale conosco sempre que precisar.',
  },
  {
    icon: CreditCard,
    title: 'Pagamento facilitado',
    text: 'Cartão, Pix e mais opções.',
  },
]

export const TrustBar = () => (
  <section aria-label="Compre com confiança" className="mx-auto max-w-6xl px-4 py-6">
    <ul className="grid gap-6 rounded-2xl border border-border bg-card px-6 py-6 sm:grid-cols-2 lg:grid-cols-4">
      {ITEMS.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex items-start gap-3">
          <Icon className="mt-0.5 size-6 shrink-0 text-primary-ink" strokeWidth={1.5} />
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
)
