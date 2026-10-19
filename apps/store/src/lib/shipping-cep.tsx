'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

/**
 * O CEP de entrega que o cliente já informou, lembrado no aparelho. Digitado no
 * simulador do produto, ele vale para o carrinho e para o checkout. Antes era
 * pedido de novo a cada tela.
 *
 * Só o CEP: nenhum preço é guardado. Toda cotação vem da API, e o confirm
 * recota do banco. Não sai no logout, porque é do aparelho e não da conta (o
 * visitante anônimo também usa).
 */

const STORAGE_KEY = 'anj:shipping-cep:v1'

const isCep = (v: unknown): v is string => typeof v === 'string' && /^\d{8}$/.test(v)

const readStorage = (): string | null => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return isCep(raw) ? raw : null
  } catch {
    // Storage bloqueado (modo privado): o cliente digita o CEP, como antes.
    return null
  }
}

const writeStorage = (cep: string | null) => {
  try {
    if (cep) window.localStorage.setItem(STORAGE_KEY, cep)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Cheio/bloqueado: o estado em memória continua valendo para esta aba.
  }
}

type ShippingCepContextValue = {
  /** 8 dígitos, sem máscara. */
  cep: string | null
  /** false até ler o localStorage — sem isso o simulador piscaria vazio. */
  ready: boolean
  setCep: (cep: string | null) => void
}

const ShippingCepContext = createContext<ShippingCepContextValue | null>(null)

export const ShippingCepProvider = ({ children }: { children: ReactNode }) => {
  const [cep, setCepState] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Pós-mount: no SSR não existe localStorage.
  useEffect(() => {
    setCepState(readStorage())
    setReady(true)
  }, [])

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setCepState(readStorage())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setCep = useCallback((next: string | null) => {
    const value = isCep(next) ? next : null
    setCepState(value)
    writeStorage(value)
  }, [])

  return (
    <ShippingCepContext.Provider value={{ cep, ready, setCep }}>
      {children}
    </ShippingCepContext.Provider>
  )
}

export const useShippingCep = (): ShippingCepContextValue => {
  const ctx = useContext(ShippingCepContext)
  if (!ctx) throw new Error('useShippingCep precisa estar dentro de ShippingCepProvider')
  return ctx
}
