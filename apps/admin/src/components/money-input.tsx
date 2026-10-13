'use client'

import type { ComponentProps } from 'react'
import { formatBRL } from '@/lib/utils'

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** Centavos — o mesmo inteiro que vai para a API. */
  value: number
  onChange: (cents: number) => void
}

/** 9 dígitos = R$ 9.999.999,99. Acima disso é dedo escorregado, não preço. */
const MAX_DIGITS = 9

/**
 * Campo de dinheiro estilo caixa registradora: os dígitos entram pela direita
 * (1 → R$ 0,01, 12 → R$ 0,12, 123 → R$ 1,23). O estado é sempre centavos, então
 * não existe conversão reais↔centavos nem erro de arredondamento de float.
 *
 * Funciona porque tudo que não é dígito (o "R$", pontos, vírgula) é descartado
 * a cada tecla: apagar remove o último dígito e colar "R$ 12,50" vira 1250.
 */
export function MoneyInput({ value, onChange, placeholder = formatBRL(0), ...props }: Props) {
  return (
    <input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      value={value ? formatBRL(value) : ''}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS)
        onChange(Number(digits || 0))
      }}
    />
  )
}
