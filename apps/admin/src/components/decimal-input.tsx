'use client'

import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'type'> & {
  /** O texto do campo, como digitado. Quem converte é a borda (parseDecimal). */
  value: string
  onChange: (text: string) => void
  /** Sem casas decimais: gramas e peças. */
  integer?: boolean
}

/**
 * Número como TEXTO, não `type="number"`: aceita a vírgula do pt-BR em qualquer
 * navegador, não some com o "0" de "0,5" e a roda do mouse não troca o valor
 * de quem só estava rolando a página.
 */
export function DecimalInput({ value, onChange, integer = false, ...props }: Props) {
  return (
    <input
      {...props}
      type="text"
      inputMode={integer ? 'numeric' : 'decimal'}
      autoComplete="off"
      value={value}
      onChange={(e) => {
        const raw = e.target.value
        const clean = integer
          ? raw.replace(/\D/g, '')
          : raw.replace(/[^\d.,]/g, '').replace(/[.,](?=.*[.,])/g, '')
        onChange(clean)
      }}
    />
  )
}
