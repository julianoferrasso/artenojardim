import { cn } from '@/lib/utils'

/**
 * Opção de escolha única em cartão: endereço, frete, meio de pagamento.
 *
 * O destaque vem da prop `checked`, não de `has-checked:` — esse seletor pegaria
 * qualquer input marcado dentro do painel. O painel fica montado e só se
 * esconde: trocar de opção não pode apagar o que o cliente já digitou nele.
 */
export const RadioCard = ({
  id,
  name,
  checked,
  onSelect,
  title,
  description,
  icon,
  aside,
  panel,
}: {
  id?: string
  name: string
  checked: boolean
  onSelect: () => void
  title: React.ReactNode
  description?: React.ReactNode
  icon?: React.ReactNode
  aside?: React.ReactNode
  panel?: React.ReactNode
}) => (
  <div
    id={id}
    className={cn(
      'rounded-lg border bg-card transition-colors',
      checked ? 'border-primary-ink ring-1 ring-primary-ink' : 'border-border hover:border-primary-ink/40',
    )}
  >
    <label className="flex cursor-pointer items-center gap-3 p-4 text-sm">
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onSelect}
        className="size-4 shrink-0 accent-primary"
      />
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        {description && <span className="mt-0.5 block text-muted-foreground">{description}</span>}
      </span>
      {aside && <span className="shrink-0 text-right">{aside}</span>}
    </label>
    {panel != null && (
      <div hidden={!checked} className="border-t border-border p-4 sm:p-5">
        {panel}
      </div>
    )}
  </div>
)
