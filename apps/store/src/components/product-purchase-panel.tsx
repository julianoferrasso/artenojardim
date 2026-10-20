'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ERROR_CODES, type Product, type Variant } from '@ecommerce/shared/contracts'
import { optionValueState, type DerivedOption } from '@/lib/product-options'
import { formatBRL, cn } from '@/lib/utils'
import { useCart } from '@/lib/cart'
import { ApiError } from '@/lib/api'
import { VariantSelector } from './variant-selector'
import { ShippingCalculator } from './shipping-calculator'
import { FavoriteButton } from './favorite-button'
import { StockStatusLine } from './stock-status'
import { BackInStockForm } from './back-in-stock-form'
import { Button, buttonVariants } from './ui/button'

/**
 * Preço, opções, comprar e frete. Adicionar ao carrinho abre o minicarrinho em
 * vez de navegar para /carrinho: arrancar o cliente da página do produto matava
 * a chance de um segundo item.
 */
export const ProductPurchasePanel = ({
  product,
  options,
  selected,
  onSelect,
  current,
  hasAlternatives,
}: {
  product: Product
  options: DerivedOption[]
  selected: Record<string, string>
  onSelect: (selected: Record<string, string>) => void
  current: Variant | undefined
  hasAlternatives: boolean
}) => {
  const router = useRouter()
  const { add, openCart } = useCart()
  const [adding, setAdding] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  const soldOut = current?.stockStatus === 'OUT_OF_STOCK'

  const onAdd = async () => {
    if (!current) return
    setAdding(true)
    setFeedback(null)
    try {
      await add({ variantId: current.id, quantity: 1 })
      openCart()
    } catch (e) {
      // A API é a barreira: estoque insuficiente, produto indisponível → mostra
      // o motivo em vez de reimplementar a regra aqui.
      setFeedback(e instanceof ApiError ? e.message : 'Não foi possível adicionar.')
      // Esgotou com a página aberta: relê o produto, e o painel vira "Esgotado"
      // sem recarregar. O mesmo code também cobre "você já tem todas as
      // unidades no carrinho" — aí a releitura não muda nada e a mensagem fica.
      if (e instanceof ApiError && e.code === ERROR_CODES.INSUFFICIENT_STOCK) router.refresh()
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{product.name}</h1>

      {current ? (
        <div className="flex flex-col gap-1.5">
          <p className={cn('text-2xl font-semibold', soldOut && 'text-muted-foreground')}>
            {formatBRL(current.price)}
            {current.compareAtPrice && current.compareAtPrice > current.price && (
              <span className="ml-2 text-base font-normal text-muted-foreground line-through">
                {formatBRL(current.compareAtPrice)}
              </span>
            )}
          </p>
          <StockStatusLine status={current.stockStatus} remaining={current.lowStockRemaining} />
        </div>
      ) : (
        <p className="text-muted-foreground">
          {product.variants.length === 0 ? 'Indisponível' : 'Combinação indisponível'}
        </p>
      )}

      {options.length > 0 && (
        <VariantSelector
          options={options}
          value={selected}
          onChange={onSelect}
          stateOf={(option, value) => optionValueState(product.variants, selected, option, value)}
        />
      )}

      {current && soldOut ? (
        <SoldOutPanel product={product} variantId={current.id} hasAlternatives={hasAlternatives} />
      ) : (
        <>
          <div className="mt-2 flex items-center gap-2">
            <Button
              onClick={() => void onAdd()}
              disabled={!current || !current.isActive || adding}
              size="lg"
              className="flex-1"
            >
              {adding ? 'Adicionando…' : 'Adicionar ao carrinho'}
            </Button>
            {/* icon-lg pareia com o size="lg" do botão ao lado: antes o alinhamento
                dependia de alguém escrever 12 nos dois lugares. */}
            <FavoriteButton
              product={{ id: product.id, slug: product.slug }}
              className={cn(
                buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'iconLg' }),
                'shrink-0',
              )}
              iconClassName="size-5"
            />
          </div>
          {feedback && (
            <p role="alert" className="text-sm text-destructive">
              {feedback}
            </p>
          )}

          <ShippingCalculator
            items={current ? [{ variantId: current.id, quantity: 1 }] : []}
            disabled={!current}
          />
        </>
      )}
    </div>
  )
}

/**
 * No lugar do "Adicionar": o que aconteceu e qual a saída. Só "esgotado", sem
 * caminho, faz uma parte dos clientes desistir da loja inteira (Baymard) — por
 * isso o aviso de reposição, as alternativas e a outra opção do mesmo produto.
 * O `id` é o destino do "Avise-me" dos cards da vitrine.
 */
const SoldOutPanel = ({
  product,
  variantId,
  hasAlternatives,
}: {
  product: Product
  variantId: string
  hasAlternatives: boolean
}) => {
  // Todas as variações esgotaram, e não só a escolhida.
  const wholeProduct = product.stockStatus === 'OUT_OF_STOCK'
  return (
    <div
      id="avise-me"
      className="mt-2 flex scroll-mt-24 flex-col gap-3 rounded-xl border border-dashed border-border bg-muted/40 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold">
            {wholeProduct ? 'Esta peça esgotou' : 'Esta opção esgotou'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {wholeProduct
              ? 'Produzimos em pequenos lotes, à mão. Deixe seu e-mail e avisamos quando ela voltar.'
              : 'Escolha outra opção acima, ou deixe seu e-mail e avisamos quando esta voltar.'}
          </p>
        </div>
        <FavoriteButton
          product={{ id: product.id, slug: product.slug }}
          className={cn(buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'icon' }), 'shrink-0')}
          iconClassName="size-4.5"
        />
      </div>
      {/* `key`: outra variação esgotada é outro pedido, e o formulário recomeça. */}
      <BackInStockForm key={variantId} variantId={variantId} />
      {wholeProduct && hasAlternatives && (
        <a
          href="#alternativas"
          className="self-start text-sm font-medium text-primary-ink underline-offset-4 hover:underline"
        >
          Ver alternativas
        </a>
      )}
    </div>
  )
}
