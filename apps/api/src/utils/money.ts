import { DEFAULT_CURRENCY, DEFAULT_LOCALE } from '@ecommerce/shared/constants'

/**
 * Centavos → "R$ 129,90".
 *
 * A loja e o admin têm cada um o seu `formatBRL` porque renderizam no browser.
 * A API precisa do mesmo na borda do E-MAIL: o template é uma função pura que
 * recebe texto pronto, e o HTML é montado aqui, não no navegador de ninguém.
 *
 * Esta é a ÚNICA borda do backend onde centavo vira texto, e onde a divisão por
 * 100 acontece. Fazer essa conta em outro lugar é como centavo vira float.
 */
export const formatBRL = (cents: number): string =>
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: DEFAULT_CURRENCY.code,
  }).format(cents / 100)
