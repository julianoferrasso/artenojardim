import Link from 'next/link'
import type { CustomerOrderListItem } from '@ecommerce/shared/contracts'
import { PAYMENT_METHOD_LABEL } from '@ecommerce/shared/constants'
import { ProductImage } from '@/components/product-image'
import { OrderSituationBadge } from '@/components/order-situation-badge'
import { formatBRL, formatDate } from '@/lib/utils'

/**
 * Uma linha da lista de pedidos.
 *
 * UM componente para celular e desktop — empilhado por padrão, em grade a
 * partir de md. Manter um markup de card e outro de tabela em paralelo é como
 * as duas versões divergem: alguém corrige o preço numa e esquece a outra.
 */
export const OrderCard = ({ order }: { order: CustomerOrderListItem }) => {
  const extraItems = order.itemCount - 1

  return (
    <Link
      href={`/conta/pedidos/${order.id}`}
      className="flex gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/40 md:items-center md:gap-5"
    >
      {/* ProductImage exige pai posicionado com tamanho. */}
      <div className="relative size-16 shrink-0 overflow-hidden rounded-md bg-muted md:size-20">
        <ProductImage src={order.highlightImageUrl} alt={order.highlightName} sizes="80px" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2 md:flex-row md:items-center md:gap-5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">Pedido #{order.number}</span>
            <OrderSituationBadge situation={order.situation} />
          </div>

          <p className="mt-1 truncate text-sm text-muted-foreground">
            {order.highlightName}
            {extraItems > 0 && ` e mais ${extraItems} ${extraItems === 1 ? 'item' : 'itens'}`}
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {formatDate(order.createdAt)}
            {' · '}
            {order.itemCount} {order.itemCount === 1 ? 'produto' : 'produtos'}
            {' · '}
            {/* Sem pagamento ainda não é "erro": é o boleto que não venceu. */}
            {order.paymentMethod ? PAYMENT_METHOD_LABEL[order.paymentMethod] : 'Aguardando pagamento'}
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 md:flex-col md:items-end md:gap-1">
          <span className="text-base font-semibold">{formatBRL(order.total)}</span>
          <span className="text-xs text-primary md:whitespace-nowrap">Ver detalhes →</span>
        </div>
      </div>
    </Link>
  )
}
