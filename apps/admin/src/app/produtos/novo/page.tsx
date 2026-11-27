'use client'

import { use } from 'react'
import { useProduct } from '@/lib/products'
import { draftForDuplicate } from '@/lib/product-draft'
import { CreateProductForm } from '@/components/product-form/create-product-form'

/**
 * Criação de produto. `?duplicar=<id>` abre o formulário preenchido com uma
 * cópia — o atalho para cadastrar peças parecidas (a mesma vela em outro aroma).
 */
export default function NewProductPage({ searchParams }: { searchParams: Promise<{ duplicar?: string }> }) {
  const { duplicar } = use(searchParams)
  const { data: source, isLoading } = useProduct(duplicar)

  if (!duplicar) return <CreateProductForm />
  if (isLoading) return <Centered>Carregando o produto a duplicar…</Centered>
  if (!source) return <Centered>Produto a duplicar não encontrado.</Centered>
  return <CreateProductForm key={source.id} initial={draftForDuplicate(source)} duplicateOf={source.name} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center py-24 justify-center text-sm text-muted-foreground">{children}</div>
}
