import Link from 'next/link'
import type { OrderItem, OrderAddress, OrderShippingMethod } from '@ecommerce/shared/contracts'
import { ProductImage } from '@/components/product-image'
import { formatBRL } from '@/lib/utils'

/**
 * As três seções que descrevem um pedido: itens, entrega e totais.
 *
 * Nasceram dentro da tela de pagamento do checkout e viviam soldadas a ela.
 * Saíram quando "meus pedidos" precisou das mesmas três — duas cópias divergem
 * na primeira vez que alguém acrescenta uma linha de desconto em uma só.
 *
 * As props são tipadas nos contratos BASE (OrderItem, OrderAddress) de
 * propósito: assim servem tanto ao `Order` do checkout quanto ao
 * `CustomerOrder`, que estende aquele.
 */

type ItemLike = OrderItem & { productSlug?: string | null }

export const OrderItemList = ({
  items,
  title = 'Itens',
  action,
}: {
  items: readonly ItemLike[]
  title?: string
  /** Botão por item — "comprar de novo" na área do cliente. */
  action?: (item: ItemLike) => React.ReactNode
}) => (
  <section className="rounded-xl border border-border bg-card p-5 shadow-soft">
    <h2 className="mb-3 font-medium">{title}</h2>
    <ul className="flex flex-col gap-4 text-sm">
      {items.map((i) => (
        <li key={i.id} className="flex items-start gap-3">
          <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
            <ProductImage src={i.imageUrl} alt={i.productName} fit="cover" sizes="56px" />
          </div>

          <div className="min-w-0 flex-1">
            {/* O link existe quando o produto ainda está publicado: é por onde o
                cliente vê a galeria completa, já que o pedido guarda uma foto
                congelada e não a galeria viva. */}
            {i.productSlug ? (
              <Link href={`/produtos/${i.productSlug}`} className="font-medium hover:underline">
                {i.productName}
              </Link>
            ) : (
              <span className="font-medium">{i.productName}</span>
            )}
            {i.variantName !== '—' && (
              <p className="text-xs text-muted-foreground">{i.variantName}</p>
            )}
            <p className="mt-0.5 text-xs text-muted-foreground">
              {i.quantity} × {formatBRL(i.unitPrice)}
            </p>
            {action?.(i)}
          </div>

          <span className="shrink-0 font-medium">{formatBRL(i.totalPrice)}</span>
        </li>
      ))}
    </ul>
  </section>
)

export const OrderDeliveryCard = ({
  address,
  method,
  children,
}: {
  address: OrderAddress
  method: OrderShippingMethod
  children?: React.ReactNode
}) => (
  <section className="rounded-xl border border-border bg-card p-5 shadow-soft text-sm">
    <h2 className="mb-2 font-medium">Entrega</h2>
    <address className="not-italic text-muted-foreground">
      <span className="block font-medium text-foreground">{address.recipient}</span>
      {address.street}, {address.number}
      {address.complement ? ` — ${address.complement}` : ''}
      <br />
      {address.district} · {address.city}/{address.state}
      <br />
      CEP {address.zipCode}
    </address>
    <p className="mt-3 border-t border-border pt-3 text-muted-foreground">
      {method.carrier} · {method.service} · {method.deliveryDays}{' '}
      {method.deliveryDays === 1 ? 'dia útil' : 'dias úteis'}
    </p>
    {children}
  </section>
)

export const OrderTotals = ({
  subtotal,
  shippingTotal,
  discountTotal,
  total,
  couponCode,
}: {
  subtotal: number
  shippingTotal: number
  discountTotal: number
  total: number
  couponCode?: string | null
}) => (
  <section className="rounded-xl border border-border bg-card p-5 shadow-soft text-sm">
    <h2 className="mb-3 font-medium">Resumo</h2>
    <div className="flex justify-between">
      <span className="text-muted-foreground">Subtotal</span>
      <span>{formatBRL(subtotal)}</span>
    </div>
    <div className="mt-1 flex justify-between">
      <span className="text-muted-foreground">Frete</span>
      <span>{formatBRL(shippingTotal)}</span>
    </div>
    {/* Só aparece quando houve desconto: uma linha "Desconto R$ 0,00" é ruído
        que faz o cliente procurar um desconto que não existe. */}
    {discountTotal > 0 && (
      <div className="mt-1 flex justify-between text-success">
        <span>Desconto{couponCode ? ` (${couponCode})` : ''}</span>
        <span>−{formatBRL(discountTotal)}</span>
      </div>
    )}
    <div className="mt-3 flex justify-between border-t border-border pt-3 text-base font-semibold">
      <span>Total</span>
      <span>{formatBRL(total)}</span>
    </div>
  </section>
)
