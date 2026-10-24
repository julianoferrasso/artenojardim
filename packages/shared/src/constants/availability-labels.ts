import type { StockPolicy } from './enums.js'
// `import type`: contracts/ importa de constants/, e um import de valor fecharia
// um ciclo em runtime. Tipo é apagado na compilação.
import type { StockStatus } from '../contracts/products.js'

/**
 * Pronta entrega × sob encomenda, em português — para a loja E para a prévia do
 * cadastro no admin. Uma fonte só: a prévia não pode prometer uma coisa e a
 * página do produto dizer outra.
 *
 * Só TEXTO. Cor e ícone são de cada app.
 */

export const STOCK_POLICY_LABEL: Record<StockPolicy, string> = {
  STOCK_ONLY: 'Pronta entrega',
  STOCK_THEN_MADE_TO_ORDER: 'Pronta entrega + sob encomenda',
  MADE_TO_ORDER: 'Sob encomenda',
}

/** O que cada política faz, dito para quem cadastra o produto. */
export const STOCK_POLICY_HINT: Record<StockPolicy, string> = {
  STOCK_ONLY: 'Vende só o que está em estoque. Acabou: aparece "Esgotado", com o Avise-me.',
  STOCK_THEN_MADE_TO_ORDER:
    'Vende o estoque primeiro. O que faltar é produzido sob encomenda — nunca fica "Esgotado".',
  MADE_TO_ORDER: 'Produzido depois da compra. O estoque não é usado na venda.',
}

export const businessDaysLabel = (days: number): string => (days === 1 ? '1 dia útil' : `${days} dias úteis`)

/** O selo curto do card da vitrine. null = o card já diz (o "Esgotado" sobre a foto). */
export const availabilityHint = (status: StockStatus): string | null => {
  switch (status) {
    case 'IN_STOCK':
    case 'LOW_STOCK':
      return 'Pronta entrega'
    case 'MADE_TO_ORDER':
      return 'Sob encomenda'
    case 'OUT_OF_STOCK':
      return null
  }
}

export type AvailabilityCopy = { title: string; detail: string | null }

/**
 * A linha de disponibilidade da página do produto: o título curto e a frase que
 * diz QUANDO. Sempre "após a confirmação do pagamento": é dali que a loja conta,
 * e o Pix gerado e não pago não pode parecer prazo correndo.
 *
 * No híbrido com as últimas unidades, o detalhe avisa o que acontece depois
 * delas — é a pergunta de quem quer mais de uma.
 */
export const availabilityCopy = (p: {
  stockStatus: StockStatus
  stockPolicy: StockPolicy
  lowStockRemaining: number | null
  productionDays: number | null
  /** Prazo de postagem da loja. 0 ou null = sem frase de postagem. */
  handlingDays: number | null
}): AvailabilityCopy => {
  switch (p.stockStatus) {
    case 'OUT_OF_STOCK':
      return { title: 'Esgotado', detail: null }
    case 'MADE_TO_ORDER':
      return {
        title: 'Sob encomenda',
        detail: p.productionDays
          ? `Feito para você em até ${businessDaysLabel(p.productionDays)} após a confirmação do pagamento.`
          : 'Feito para você depois da confirmação do pagamento.',
      }
    case 'IN_STOCK':
    case 'LOW_STOCK': {
      const remaining = p.stockStatus === 'LOW_STOCK' ? p.lowStockRemaining : null
      const title = !remaining
        ? 'Pronta entrega'
        : remaining === 1
          ? 'Pronta entrega · última unidade'
          : `Pronta entrega · últimas ${remaining} unidades`

      if (remaining && p.stockPolicy === 'STOCK_THEN_MADE_TO_ORDER' && p.productionDays) {
        return {
          title,
          detail: `Precisa de mais? Produzimos sob encomenda em até ${businessDaysLabel(p.productionDays)}.`,
        }
      }
      return {
        title,
        detail: p.handlingDays
          ? `Postamos em até ${businessDaysLabel(p.handlingDays)} após a confirmação do pagamento.`
          : null,
      }
    }
  }
}

/**
 * Uma linha de carrinho ou de pedido: quanto sai da prateleira e quanto é
 * produzido. A conta é da API (`madeToOrderQuantity`); aqui só a frase.
 */
export const lineAvailabilityLabel = (p: {
  quantity: number
  madeToOrderQuantity: number
  productionDays: number | null
}): string => {
  const ready = p.quantity - p.madeToOrderQuantity
  const days = p.productionDays ? ` (até ${businessDaysLabel(p.productionDays)})` : ''
  if (p.madeToOrderQuantity <= 0) return 'Pronta entrega'
  if (ready <= 0) return `Sob encomenda${days}`
  return `${ready} pronta entrega + ${p.madeToOrderQuantity} sob encomenda${days}`
}
