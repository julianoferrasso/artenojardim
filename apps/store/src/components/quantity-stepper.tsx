'use client'

/**
 * Stepper de quantidade — extraído da página do carrinho porque o minicarrinho
 * precisa exatamente do mesmo controle. O limite é do servidor (`maxQuantity`:
 * o disponível na pronta entrega, o teto da linha na encomenda): o componente
 * só desabilita o "+" quando já bateu nele.
 */
export const QuantityStepper = ({
  quantity,
  max,
  onChange,
}: {
  quantity: number
  max: number
  onChange: (quantity: number) => void
}) => (
  <div className="flex items-center overflow-hidden rounded-full border border-border bg-card">
    <button
      type="button"
      onClick={() => onChange(quantity - 1)}
      className="px-3 py-1 text-sm transition-colors hover:bg-accent"
      aria-label="Diminuir"
    >
      −
    </button>
    <span className="min-w-8 text-center text-sm font-medium">{quantity}</span>
    <button
      type="button"
      onClick={() => onChange(quantity + 1)}
      disabled={quantity >= max}
      className="px-3 py-1 text-sm transition-colors hover:bg-accent disabled:opacity-40"
      aria-label="Aumentar"
    >
      +
    </button>
  </div>
)
