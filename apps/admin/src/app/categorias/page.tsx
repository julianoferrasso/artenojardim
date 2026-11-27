'use client'

import { Fragment, useState } from 'react'
import { Plus } from 'lucide-react'
import type { CategoryTreeNode } from '@ecommerce/shared/contracts'
import { useCategoryTree, useDeleteCategory, flattenForSelect } from '@/lib/categories'
import { CategoryForm } from '@/components/category-form'
import { InlineEditItem, NewItemShell, Thumb, useDirtyGuard } from '@/components/inline-edit'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/** Aberto: uma categoria existente, uma nova (na raiz ou dentro de um pai), ou nada. */
type Editing = { kind: 'edit'; id: string } | { kind: 'new'; parentId: string | null } | null

/** Recuo por nível da árvore, em px. */
const INDENT = 24

export default function CategoriesPage() {
  const { data: tree, isLoading, error } = useCategoryTree()
  const del = useDeleteCategory()
  const [editing, setEditing] = useState<Editing>(null)
  const { onDirtyChange, guard, reset } = useDirtyGuard('Descartar as alterações desta categoria?')

  const changeEditing = (next: Editing) => guard(() => setEditing(next))

  const close = () => {
    reset()
    setEditing(null)
  }

  const onDelete = (node: CategoryTreeNode) => {
    if (node.children.length > 0) {
      alert(`"${node.name}" tem subcategorias. Mova ou exclua as subcategorias primeiro.`)
      return
    }
    const products =
      node.productCount > 0
        ? `\n\n${node.productCount} produto${node.productCount === 1 ? '' : 's'} vai sair desta categoria (os produtos não são excluídos).`
        : ''
    if (!confirm(`Excluir a categoria "${node.name}"?${products}`)) return
    del.mutate(node.id, {
      // Excluir a categoria aberta fecha o formulário: salvar depois daria 404.
      onSuccess: () => {
        if (editing?.kind === 'edit' && editing.id === node.id) close()
      },
      onError: (e) => alert(e instanceof ApiError ? e.message : 'Não foi possível excluir a categoria.'),
    })
  }

  const renderForm = (props: { initial?: CategoryTreeNode; parentId?: string | null }) => (
    <CategoryForm
      key={props.initial?.id ?? `new-${props.parentId ?? 'root'}`}
      parentOptions={flattenForSelect(tree ?? [], props.initial?.id)}
      initial={props.initial}
      defaultParentId={props.parentId ?? null}
      onDirtyChange={onDirtyChange}
      onDone={close}
      onCancel={() => changeEditing(null)}
    />
  )

  const newShell = (parentId: string | null, depth: number) => (
    <NewItemShell
      title={parentId ? 'Nova subcategoria' : 'Nova categoria'}
      hint="Preencha os campos e clique em Criar categoria."
      onClose={() => changeEditing(null)}
      indent={depth * INDENT}
    >
      {renderForm({ parentId })}
    </NewItemShell>
  )

  const renderNode = (node: CategoryTreeNode, depth: number): React.ReactNode => {
    const isOpen = editing?.kind === 'edit' && editing.id === node.id
    const addingChild = editing?.kind === 'new' && editing.parentId === node.id
    return (
      <Fragment key={node.id}>
        <InlineEditItem
          open={isOpen}
          label={`a categoria "${node.name}"`}
          summary={<CategorySummary node={node} />}
          onToggle={() => changeEditing(isOpen ? null : { kind: 'edit', id: node.id })}
          actions={
            <Button
              type="button"
              size="xs"
              variant="outline"
              title="Criar uma subcategoria dentro desta"
              onClick={() => changeEditing({ kind: 'new', parentId: node.id })}
              disabled={addingChild}
            >
              <Plus />
              <span className="max-sm:sr-only">Subcategoria</span>
            </Button>
          }
          onDelete={() => onDelete(node)}
          deleting={del.isPending}
          indent={depth * INDENT}
        >
          {isOpen && renderForm({ initial: node })}
        </InlineEditItem>
        {addingChild && newShell(node.id, depth + 1)}
        {node.children.map((child) => renderNode(child, depth + 1))}
      </Fragment>
    )
  }

  const creatingRoot = editing?.kind === 'new' && editing.parentId === null

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="mb-1 text-xl font-semibold tracking-tight">Categorias</h1>
          <p className="text-sm text-muted-foreground">
            Organizam o catálogo e o menu da loja. Clique numa categoria para editar.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => changeEditing({ kind: 'new', parentId: null })}
          disabled={creatingRoot}
          className="shrink-0"
        >
          <Plus />
          Nova categoria
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar categorias.</p>}

      <ul className="flex flex-col gap-2">
        {creatingRoot && newShell(null, 0)}
        {tree?.map((node) => renderNode(node, 0))}
      </ul>

      {tree && tree.length === 0 && !creatingRoot && (
        <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma categoria ainda. Crie a primeira.
        </p>
      )}
    </div>
  )
}

const CategorySummary = ({ node }: { node: CategoryTreeNode }) => (
  <>
    <Thumb url={node.imageUrl} label="sem foto" className="w-12" />
    <span className="min-w-0 flex-1">
      <span className="flex items-center gap-2 text-sm">
        <span className={cn('truncate font-medium', !node.isActive && 'text-muted-foreground line-through')}>
          {node.name}
        </span>
        {!node.isActive && (
          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">inativa</span>
        )}
      </span>
      <span className="block truncate text-xs text-muted-foreground">
        /categorias/{node.slug} · {node.productCount} produto{node.productCount === 1 ? '' : 's'} · posição{' '}
        {node.position}
      </span>
    </span>
  </>
)
