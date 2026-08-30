import { Gift, Heart, HeartHandshake, Leaf } from 'lucide-react'
import type { ThemeBadgeStyle } from '@ecommerce/shared/contracts'
import { IconBadge } from '@/components/icon-badge'

/**
 * Os quatro pilares da marca, logo abaixo do hero. Desktop: colunas com
 * divisores finos; mobile: lista vertical num card, ícone à esquerda.
 */
const BENEFITS = [
  {
    icon: HeartHandshake,
    title: 'Feito à mão',
    text: 'Produzido artesanalmente com cuidado e dedicação.',
  },
  {
    icon: Leaf,
    title: 'Ingredientes naturais',
    text: 'Matérias-primas selecionadas com responsabilidade.',
  },
  {
    icon: Gift,
    title: 'Embalagem para presente',
    text: 'Cada pedido é preparado com carinho para você.',
  },
  {
    icon: Heart,
    title: 'Afeto em cada detalhe',
    text: 'Mais que produtos, criamos conexões.',
  },
]

export const BenefitsStrip = ({ badgeStyle }: { badgeStyle: ThemeBadgeStyle }) => (
  <section aria-label="Nossos diferenciais" className="mx-auto max-w-6xl px-4 py-8 sm:py-10">
    <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card md:grid md:grid-cols-4 md:divide-x md:divide-y-0 md:rounded-none md:border-0 md:bg-transparent">
      {BENEFITS.map(({ icon: Icon, title, text }) => (
        <li
          key={title}
          className="flex items-center gap-4 px-5 py-4 md:flex-col md:gap-3 md:px-6 md:py-2 md:text-center"
        >
          {/* Sem hover: o selo não é clicável, e reagir ao mouse prometeria
              uma ação que não existe. */}
          <IconBadge style={badgeStyle} className="size-12 shrink-0 shadow-soft">
            <Icon className="size-5" strokeWidth={1.8} />
          </IconBadge>
          <div>
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
          </div>
        </li>
      ))}
    </ul>
  </section>
)
