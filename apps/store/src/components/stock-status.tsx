import type { CartItem, StockStatus } from '@ecommerce/shared/contracts'
import {
  availabilityCopy,
  availabilityHint,
  businessDaysLabel,
  lineAvailabilityLabel,
  type StockPolicy,
} from '@ecommerce/shared/constants'
import { cn } from '@/lib/utils'
import { ReadyByDate } from './ready-by-date'

/**
 * O único lugar que desenha estoque na loja. A situação chega pronta da API
 * (`stockStatus`): aqui só se escolhe a frase e a cor, nunca a regra. As frases
 * vêm de `availability-labels` (shared) — a mesma fonte da prévia do admin.
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

/**
 * A bolinha: verde = sai agora, âmbar = últimas, sálvia = feito sob encomenda
 * (não é alerta — é outro jeito de comprar), cinza = esgotado.
 */
const DOT_CLASS: Record<StockStatus, string> = {
  IN_STOCK: 'bg-success',
  LOW_STOCK: 'bg-warning',
  MADE_TO_ORDER: 'bg-tertiary',
  OUT_OF_STOCK: 'bg-muted-foreground',
}

const Dot = ({ status, className }: { status: StockStatus; className?: string }) => (
  <span className={cn('size-2 shrink-0 rounded-full', DOT_CLASS[status], className)} aria-hidden />
)

/**
 * A disponibilidade na página do produto: o título curto e a frase que diz
 * QUANDO. A bolinha é estática (pulsar soa como pressão de venda), e
 * `role="status"` faz o leitor de tela anunciar a troca quando o cliente muda
 * de variação.
 *
 * Na encomenda vem junto "como funciona": o cliente que não sabe o que é
 * "sob encomenda" descobre ANTES de pagar — o risco documentado da Shopify é
 * ele descobrir depois, e virar pedido de reembolso.
 */
export const AvailabilityBlock = ({
  status,
  remaining,
  policy,
  productionDays,
  handlingDays,
  className,
}: {
  status: StockStatus
  remaining: number | null
  policy: StockPolicy
  productionDays: number | null
  handlingDays: number | null
  className?: string
}) => {
  const copy = availabilityCopy({
    stockStatus: status,
    stockPolicy: policy,
    lowStockRemaining: remaining,
    productionDays,
    handlingDays,
  })
  const madeToOrder = status === 'MADE_TO_ORDER'

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <p
        role="status"
        className={cn(
          'inline-flex items-center gap-2 text-sm',
          status === 'LOW_STOCK' && 'font-medium',
          madeToOrder && 'font-medium',
          status === 'OUT_OF_STOCK' && 'text-muted-foreground',
        )}
      >
        <Dot status={status} />
        {copy.title}
      </p>
      {copy.detail && (
        <p className="pl-4 text-sm text-muted-foreground">
          {copy.detail}
          {madeToOrder && productionDays ? (
            <>
              {' '}
              <ReadyByDate days={productionDays} />
            </>
          ) : null}
        </p>
      )}
      {madeToOrder && productionDays ? <MadeToOrderHowTo productionDays={productionDays} /> : null}
    </div>
  )
}

/** Três passos, num <details> nativo: sem JS, acessível, e fechado não ocupa a dobra. */
const MadeToOrderHowTo = ({ productionDays }: { productionDays: number }) => (
  <details className="group pl-4 text-sm">
    <summary className="cursor-pointer list-none font-medium text-primary-ink underline-offset-4 hover:underline [&::-webkit-details-marker]:hidden">
      Como funciona a encomenda
    </summary>
    <ol className="mt-2 flex flex-col gap-1.5 text-muted-foreground">
      <li>
        <span className="font-medium text-foreground">1.</span> Você faz o pedido e paga.
      </li>
      <li>
        <span className="font-medium text-foreground">2.</span> Produzimos a sua peça em até{' '}
        {businessDaysLabel(productionDays)}, contados da confirmação do pagamento.
      </li>
      <li>
        <span className="font-medium text-foreground">3.</span> Enviamos com rastreio — o prazo do frete conta a
        partir do envio. A previsão completa aparece no cálculo do frete.
      </li>
    </ol>
  </details>
)

/**
 * A linha discreta do card: "Pronta entrega" ou "Sob encomenda". Esgotado não
 * tem linha — o selo sobre a foto já diz. "Últimas unidades" fica de fora de
 * propósito: numa loja de 1–2 peças por item, ela estaria em quase todo card.
 */
export const AvailabilityHint = ({ status, className }: { status: StockStatus; className?: string }) => {
  const label = availabilityHint(status)
  if (!label) return null
  return (
    <p className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
      <Dot status={status} className="size-1.5" />
      {label}
    </p>
  )
}

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

/**
 * Pronta entrega ou sob encomenda, por linha do carrinho — e, no híbrido que
 * passou do estoque, o atalho para levar só o que já está pronto e receber antes.
 */
export const CartItemAvailability = ({
  item,
  onAdjust,
}: {
  item: CartItem
  onAdjust: (quantity: number) => void
}) => {
  if (!item.purchasable) return null
  const madeToOrder = item.madeToOrderQuantity > 0
  const readyNow = item.quantity - item.madeToOrderQuantity
  const canShortcut = madeToOrder && item.stockPolicy === 'STOCK_THEN_MADE_TO_ORDER' && readyNow > 0

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span className="inline-flex items-center gap-1.5">
        <Dot status={madeToOrder ? 'MADE_TO_ORDER' : 'IN_STOCK'} className="size-1.5" />
        {lineAvailabilityLabel(item)}
      </span>
      {canShortcut && (
        <button
          type="button"
          onClick={() => onAdjust(readyNow)}
          className="font-medium text-primary-ink underline-offset-4 hover:underline"
        >
          Ajustar para {readyNow} e receber antes
        </button>
      )}
    </div>
  )
}

/**
 * O aviso do pedido com encomenda, no carrinho e no checkout: o pedido sai
 * inteiro, numa remessa só — o item pronto espera o produzido. Dizer isso antes
 * de pagar é o que evita o "comprei pronta entrega e não chegou".
 */
export const MadeToOrderNotice = ({
  items,
  className,
}: {
  items: Array<Pick<CartItem, 'quantity' | 'madeToOrderQuantity' | 'productionDays'>>
  className?: string
}) => {
  const made = items.filter((i) => i.madeToOrderQuantity > 0)
  if (made.length === 0) return null
  const days = Math.max(...made.map((i) => i.productionDays ?? 0))
  const allMade = items.every((i) => i.madeToOrderQuantity >= i.quantity)
  const when = days > 0 ? ` em até ${businessDaysLabel(days)} após a confirmação do pagamento` : ''

  return (
    <div className={cn('rounded-lg border border-tertiary/30 bg-tertiary/10 px-3 py-2.5 text-sm', className)}>
      <p className="font-medium">{allMade ? 'Pedido sob encomenda' : 'Seu pedido tem item sob encomenda'}</p>
      <p className="mt-0.5 text-muted-foreground">
        {allMade
          ? `Produzimos${when} e enviamos em seguida.`
          : `Ele fica pronto${when}, e enviamos o pedido completo, tudo junto.`}
      </p>
    </div>
  )
}
