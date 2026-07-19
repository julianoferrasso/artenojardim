'use client'

import { useState } from 'react'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import {
  useCategoryTree,
  useDeleteCategory,
  flattenForSelect,
} from '@/lib/categories'
import { CategoryForm } from '@/components/category-form'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Editing = { mode: 'create' } | { mode: 'edit'; node: CategoryTreeNode } | null

export default function CategoriesPage() {
  const { data: tree, isLoading, error } = useCategoryTree()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Editing>(null)

  const onDelete = (node: CategoryTreeNode) => {
    if (!confirm(`Excluir "${node.name}"?`)) return
    del.mutate(node.id, {
      onError: (e) =>
        alert(e instanceof ApiError ? e.message : 'Não foi possível excluir a categoria.'),
    })
  }

  return (
    <div className="min-h-svh bg-muted">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
          <span className="font-semibold tracking-tight">Categorias</span>
          <a href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Voltar
          </a>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-8 px-6 py-8 md:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Árvore</h2>
            <button
              onClick={() => setEditing({ mode: 'create' })}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Nova categoria
            </button>
          </div>

          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && <p className="text-sm text-destructive">Falha ao carregar categorias.</p>}
          {tree && tree.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma categoria ainda. Crie a primeira.
            </p>
          )}

          {tree && tree.length > 0 && (
            <ul className="flex flex-col gap-1">
              {tree.map((node) => (
                <CategoryRow
                  key={node.id}
                  node={node}
                  depth={0}
                  onEdit={(n) => setEditing({ mode: 'edit', node: n })}
                  onDelete={onDelete}
                  deleting={del.isPending}
                />
              ))}
            </ul>
          )}
        </section>

        <aside>
          {editing ? (
            <CategoryForm
              key={editing.mode === 'edit' ? editing.node.id : 'new'}
              parentOptions={flattenForSelect(
                tree ?? [],
                editing.mode === 'edit' ? editing.node.id : undefined,
              )}
              initial={editing.mode === 'edit' ? editing.node : undefined}
              onDone={() => setEditing(null)}
              onCancel={() => setEditing(null)}
            />
          ) : (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Selecione uma categoria para editar, ou crie uma nova.
            </p>
          )}
        </aside>
      </main>
    </div>
  )
}

function CategoryRow({
  node,
  depth,
  onEdit,
  onDelete,
  deleting,
}: {
  node: CategoryTreeNode
  depth: number
  onEdit: (n: CategoryTreeNode) => void
  onDelete: (n: CategoryTreeNode) => void
  deleting: boolean
}) {
  return (
    <>
      <li
        className="group flex items-center justify-between rounded-md border border-border bg-card px-3 py-2"
        style={{ marginLeft: depth * 20 }}
      >
        <span className="flex items-center gap-2 text-sm">
          <span className={cn(!node.isActive && 'text-muted-foreground line-through')}>
            {node.name}
          </span>
          {!node.isActive && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
              inativa
            </span>
          )}
          <span className="text-xs text-muted-foreground">/{node.slug}</span>
        </span>
        <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onEdit(node)}
            className="rounded px-2 py-1 text-xs hover:bg-accent"
          >
            Editar
          </button>
          <button
            onClick={() => onDelete(node)}
            disabled={deleting}
            className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10 disabled:opacity-50"
          >
            Excluir
          </button>
        </span>
      </li>
      {node.children.map((child) => (
        <CategoryRow
          key={child.id}
          node={child}
          depth={depth + 1}
          onEdit={onEdit}
          onDelete={onDelete}
          deleting={deleting}
        />
      ))}
    </>
  )
}
