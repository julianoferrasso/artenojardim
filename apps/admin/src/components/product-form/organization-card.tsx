'use client'

import Link from 'next/link'
import { useCategoryTree, flattenForSelect } from '@/lib/categories'
import type { ProductFields } from '@/lib/product-draft'
import { cn } from '@/lib/utils'
import { Field, inputCls } from './section'

/** Indentação por nível — classe nomeada, não `pl-[..]` arbitrário. */
const DEPTH_PADDING = ['pl-0', 'pl-5', 'pl-10', 'pl-14'] as const

type Props = {
  fields: ProductFields
  onChange: (patch: Partial<ProductFields>) => void
}

export function OrganizationCard({ fields, onChange }: Props) {
  const { data: tree, isLoading } = useCategoryTree()
  const categories = flattenForSelect(tree ?? [])
  const selected = new Set(fields.categoryIds)

  const toggle = (id: string) =>
    onChange({
      categoryIds: selected.has(id) ? fields.categoryIds.filter((x) => x !== id) : [...fields.categoryIds, id],
    })

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <h2 className="text-sm font-semibold">Organização</h2>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Categorias</span>
          {selected.size > 0 && <span className="text-xs text-muted-foreground">{selected.size} marcada{selected.size > 1 ? 's' : ''}</span>}
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : categories.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma categoria ainda.{' '}
            <Link href="/categorias" className="underline hover:text-foreground">
              Criar em Categorias
            </Link>
          </p>
        ) : (
          <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto rounded-md border border-border p-1.5">
            {categories.map((c) => (
              <li key={c.id} className={DEPTH_PADDING[Math.min(c.depth, DEPTH_PADDING.length - 1)]}>
                <label className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="size-4 shrink-0 accent-primary"
                  />
                  <span className={cn('truncate', !c.isActive && 'text-muted-foreground')}>{c.name}</span>
                  {!c.isActive && <span className="shrink-0 text-xs text-muted-foreground">(oculta)</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Field label="Marca" htmlFor="product-brand">
        <input
          id="product-brand"
          value={fields.brand}
          maxLength={120}
          onChange={(e) => onChange({ brand: e.target.value })}
          className={inputCls}
        />
      </Field>

      <Field label="Tags" htmlFor="product-tags" hint="Separadas por vírgula. Uso interno, para organizar o catálogo.">
        <input
          id="product-tags"
          value={fields.tags}
          onChange={(e) => onChange({ tags: e.target.value })}
          placeholder="presente, aromática"
          className={inputCls}
        />
      </Field>
    </section>
  )
}
