'use client'

import { useState, useRef, useEffect } from 'react'
import { Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Copiar o endereço é a ação mais repetida do dia: o operador cola na etiqueta.
 * O "Copiado!" é a única confirmação — sem ele não dá para saber se o clique
 * pegou, e o operador cola o endereço do pedido anterior.
 */
export const CopyButton = ({
  value,
  label = 'Copiar',
  className,
}: {
  value: string
  label?: string
  className?: string
}) => {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Trocar de pedido antes do timeout dispararia setState num componente já
  // desmontado.
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard exige contexto seguro (https/localhost). Sem ele, o operador
      // ainda pode selecionar o texto na tela — não vale quebrar nada.
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => void copy()} className={className}>
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {copied ? 'Copiado!' : label}
    </Button>
  )
}
