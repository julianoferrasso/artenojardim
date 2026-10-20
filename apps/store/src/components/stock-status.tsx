import type { CartItem, StockStatus } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'

/**
 * O único lugar que desenha estoque na loja. A situação chega pronta da API
 * (`stockStatus`): aqui só se escolhe a frase e a cor, nunca a regra.
 */

/**
 * Foto do produto esgotado: esmaecida e com menos cor, sem chegar ao preto e
 * branco — uma vela cinza parece defeito de imagem, não falta de estoque.
 */
export const SOLD_OUT_IMAGE_CLASS = 'opacity-70 saturate-50'

/** Selo sobre a foto do card: o mesmo vidro fosco do coração, no canto oposto. */
export const SoldOutBadge = ({ className }: { className?: string }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full bg-card/90 px-2.5 py-1 text-xs font-semibold uppercase tracking-wider text-foreground shadow-soft backdrop-blur-sm',
      className,
    )}
  >
    Esgotado
  </span>
)

const DOT_CLASS: Record<StockStatus, string> = {
  IN_STOCK: 'bg-success',
  LOW_STOCK: 'bg-warning',
  OUT_OF_STOCK: 'bg-muted-foreground',
}

export const stockLabel = (status: StockStatus, remaining: number | null): string => {
  if (status === 'OUT_OF_STOCK') return 'Esgotado'
  if (status === 'LOW_STOCK' && remaining) {
    return remaining === 1 ? 'Última unidade' : `Últimas ${remaining} unidades`
  }
  return 'Em estoque'
}

/**
 * A linha de situação da página do produto. A bolinha é estática (pulsar soa
 * como pressão de venda), e `role="status"` faz o leitor de tela anunciar a
 * troca quando o cliente muda de variação.
 */
export const StockStatusLine = ({
  status,
  remaining,
  className,
}: {
  status: StockStatus
  remaining: number | null
  className?: string
}) => (
  <p
    role="status"
    className={cn(
      'inline-flex items-center gap-2 text-sm',
      status === 'LOW_STOCK' && 'font-medium',
      status === 'OUT_OF_STOCK' && 'text-muted-foreground',
      className,
    )}
  >
    <span className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[status])} aria-hidden />
    {stockLabel(status, remaining)}
  </p>
)

const ISSUE_LABEL: Record<NonNullable<CartItem['unavailableReason']>, (available: number) => string> = {
  OUT_OF_STOCK: () => 'Esgotado',
  UNAVAILABLE: () => 'Indisponível',
  PARTIAL: (available) => (available === 1 ? 'Só resta 1' : `Só restam ${available}`),
}

/**
 * O que impede a linha do carrinho de virar pedido, e a saída: ajustar ao que
 * resta (parcial) ou remover. Tom de aviso, não de erro — pede uma ação. O
 * mesmo texto no carrinho e no minicarrinho.
 */
export const CartItemIssue = ({
  item,
  onAdjust,
}: {
  item: CartItem
  onAdjust: (quantity: number) => void
}) => {
  if (!item.unavailableReason) return null
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <span className="inline-flex items-center rounded-full border border-warning/30 bg-warning/15 px-2 py-0.5 font-medium text-warning-foreground">
        {ISSUE_LABEL[item.unavailableReason](item.available)}
      </span>
      {item.unavailableReason === 'PARTIAL' ? (
        <button
          type="button"
          onClick={() => onAdjust(item.available)}
          className="font-medium text-primary-ink underline-offset-4 hover:underline"
        >
          Ajustar para {item.available}
        </button>
      ) : (
        <span className="text-muted-foreground">Remova para continuar</span>
      )}
    </div>
  )
}
