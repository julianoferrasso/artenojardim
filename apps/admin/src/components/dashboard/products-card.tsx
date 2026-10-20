'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Package } from 'lucide-react'
import type { DashboardCategory, DashboardProduct } from '@ecommerce/shared/contracts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatBRL } from '@/lib/utils'
import { CARD_DEFINITIONS } from './definitions'
import { formatCount, formatPercent } from './format'
import { BarList, DashboardCard, EmptyState, InfoTip } from './parts'

type SortKey = 'revenue' | 'unitsSold' | 'views'

const SORT_LABEL: Record<SortKey, string> = { revenue: 'Receita', unitsSold: 'Vendidos', views: 'Visualizações' }

const COLLAPSED_ROWS = 10

/**
 * Vendidos e vistos na mesma tabela: "muito visto, pouco vendido" é o achado que
 * pede ação (preço, foto, descrição) — duas listas separadas escondem isso.
 */
export function ProductsCard({
  products,
  categories,
  className,
}: {
  products: DashboardProduct[]
  categories: DashboardCategory[]
  className?: string
}) {
  const [sort, setSort] = useState<SortKey>('revenue')
  const [expanded, setExpanded] = useState(false)

  const sorted = [...products].sort((a, b) => b[sort] - a[sort] || b.revenue - a.revenue)
  const rows = expanded ? sorted : sorted.slice(0, COLLAPSED_ROWS)

  return (
    <DashboardCard title="Produtos" info={CARD_DEFINITIONS.products} className={className}>
      <Tabs defaultValue="products" className="gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="products">Produtos</TabsTrigger>
            <TabsTrigger value="categories">Categorias</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="products" className="flex flex-col gap-3">
          {products.length === 0 ? (
            <EmptyState icon={Package}>Nenhum produto vendido ou visto no período.</EmptyState>
          ) : (
            <>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={sort}
                onValueChange={(value: string) => value && setSort(value as SortKey)}
                aria-label="Ordenar produtos por"
              >
                {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                  <ToggleGroupItem key={key} value={key} className="px-2.5 text-xs">
                    {SORT_LABEL[key]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produto</TableHead>
                      <TableHead className="text-right">Vendidos</TableHead>
                      <TableHead className="text-right">Receita</TableHead>
                      <TableHead className="text-right">Visualizações</TableHead>
                      <TableHead className="text-right">Conversão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((p) => (
                      <TableRow key={p.productId ?? `nome:${p.name}`}>
                        <TableCell className="max-w-64">
                          <ProductName product={p} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatCount(p.unitsSold)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatBRL(p.revenue)}</TableCell>
                        <TableCell className="text-right text-muted-foreground tabular-nums">
                          {formatCount(p.views)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{formatPercent(p.conversionRate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {sorted.length > COLLAPSED_ROWS && (
                <Button variant="ghost" size="sm" className="self-start" onClick={() => setExpanded((v) => !v)}>
                  {expanded ? 'Mostrar menos' : `Mostrar todos (${sorted.length})`}
                </Button>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="categories" className="flex flex-col gap-3">
          {categories.length === 0 ? (
            <EmptyState icon={Package}>Nenhuma venda em categoria no período.</EmptyState>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Receita dos itens por categoria
                <InfoTip label="Categorias" text={CARD_DEFINITIONS.categories} />
              </p>
              <BarList
                items={categories.map((c) => ({
                  key: c.categoryId,
                  label: c.name,
                  value: c.revenue,
                  valueLabel: formatBRL(c.revenue),
                  detail: `${formatCount(c.unitsSold)} un.`,
                }))}
              />
            </>
          )}
        </TabsContent>
      </Tabs>
    </DashboardCard>
  )
}

function ProductName({ product }: { product: DashboardProduct }) {
  const content = (
    <span className="flex min-w-0 items-center gap-3">
      <span className="size-9 shrink-0 overflow-hidden rounded-md bg-muted">
        {product.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={product.imageUrl} alt="" className="size-full object-cover" loading="lazy" />
        )}
      </span>
      <span className="truncate">{product.name}</span>
    </span>
  )
  return product.productId ? (
    <Link href={`/produtos/${product.productId}`} className="hover:text-primary">
      {content}
    </Link>
  ) : (
    content
  )
}
