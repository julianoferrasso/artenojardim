'use client'

import { useEffect, useState } from 'react'
import { addBusinessDays } from '@ecommerce/shared/contracts'
import { formatSpDeliveryDay } from '@ecommerce/shared/utils'

/**
 * "fica pronto até qua., 4 de nov." — a data, e não só "N dias úteis".
 *
 * Calculada no navegador, depois de montar: a página do produto é ISR, e uma
 * data renderizada no servidor ficaria velha no cache (o primeiro visitante da
 * manhã veria o prazo de ontem). A data que vale como promessa é a do checkout,
 * calculada pela API; esta só ajuda a decidir.
 */
export const ReadyByDate = ({ days, prefix = 'Fica pronto até' }: { days: number; prefix?: string }) => {
  const [label, setLabel] = useState<string | null>(null)

  useEffect(() => {
    setLabel(formatSpDeliveryDay(addBusinessDays(new Date(), days)))
  }, [days])

  if (!label) return null
  return (
    <span className="font-medium text-foreground">
      {prefix} {label}.
    </span>
  )
}
