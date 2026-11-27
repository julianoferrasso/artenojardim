'use client'

import { use } from 'react'
import { useProduct } from '@/lib/products'
import { EditProductForm } from '@/components/product-form/edit-product-form'

const createdOf = (criado: string | undefined, email: string | undefined) =>
  criado === 'rascunho'
    ? 'rascunho'
    : criado === 'publicado'
      ? email === 'falhou'
        ? 'publicado-sem-email'
        : 'publicado'
      : undefined

/** Edição do produto: o formulário inteiro, com um "Salvar" só. */
export default function ProductEditPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criado?: string; email?: string }>
}) {
  const { id } = use(params)
  const { criado, email } = use(searchParams)
  const { data: product, isLoading } = useProduct(id)

  if (isLoading) return <Centered>Carregando…</Centered>
  if (!product) return <Centered>Produto não encontrado.</Centered>
  // `key`: outro produto na mesma rota recomeça o rascunho do zero.
  return <EditProductForm key={product.id} product={product} created={createdOf(criado, email)} />
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center py-24 justify-center text-sm text-muted-foreground">{children}</div>
}
