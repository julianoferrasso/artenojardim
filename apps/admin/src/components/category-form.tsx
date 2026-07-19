'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCategorySchema, type CreateCategoryInput, type Category } from '@ecommerce/shared/contracts'
import { useCreateCategory, useUpdateCategory } from '@/lib/categories'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  parentOptions: Array<{ id: string; label: string }>
  initial?: Category
  onDone: () => void
  onCancel: () => void
}

/**
 * Formulário de criar/editar categoria. O MESMO createCategorySchema que a API
 * usa valida aqui — mudar um campo quebra o build no mesmo commit.
 */
export const CategoryForm = ({ parentOptions, initial, onDone, onCancel }: Props) => {
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    // Sem `slug`: ele é 100% do backend (gera do nome, valida, garante único).
    // O usuário nunca o define nem edita — não há campo, e não enviamos o valor.
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description ?? undefined,
          parentId: initial.parentId,
          imageId: initial.imageId,
          position: initial.position,
          isActive: initial.isActive,
          seoTitle: initial.seoTitle ?? undefined,
          seoDescription: initial.seoDescription ?? undefined,
        }
      : { isActive: true, position: 0 },
  })

  // A imagem vive fora do fluxo de texto do RHF: o uploader devolve um Upload, e
  // guardamos o id (enviado à API) e a URL (só para o preview). register('imageId')
  // é oculto — o setValue mantém o RHF em sincronia com o que o uploader entregou.
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null)

  const busy = create.isPending || update.isPending

  const onSubmit = (values: CreateCategoryInput) => {
    setFormError(null)
    // parentId vazio do <select> é string ''; normaliza para null (raiz).
    const input = { ...values, parentId: values.parentId || null }

    const onError = (e: unknown) =>
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')

    if (initial) {
      update.mutate({ id: initial.id, input }, { onSuccess: onDone, onError })
    } else {
      create.mutate(input, { onSuccess: onDone, onError })
    }
  }

  const field = 'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      noValidate
    >
      <h2 className="font-medium">{initial ? 'Editar categoria' : 'Nova categoria'}</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="name" className="text-sm font-medium">Nome</label>
        <input id="name" autoFocus {...register('name')} className={cn(field, errors.name && 'border-destructive')} />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Sem campo de slug: o backend gera do nome, valida e garante único. Na
          edição o slug NÃO muda (mudá-lo quebraria links já indexados). O
          endereço atual é mostrado apenas como referência, em leitura. */}
      {initial && (
        <p className="text-xs text-muted-foreground">
          Endereço: <code className="rounded bg-muted px-1">/{initial.slug}</code>
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="parentId" className="text-sm font-medium">Categoria pai</label>
        <select id="parentId" {...register('parentId')} className={field}>
          <option value="">— Raiz —</option>
          {parentOptions.map((opt) => (
            <option key={opt.id} value={opt.id}>{opt.label}</option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium">Descrição</label>
        <textarea id="description" rows={3} {...register('description')} className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>

      <input type="hidden" {...register('imageId')} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Imagem</span>
        {imageUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="size-16 rounded-md border border-border object-cover" />
            <button
              type="button"
              onClick={() => {
                setImageUrl(null)
                setValue('imageId', null, { shouldDirty: true })
              }}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
            >
              Remover
            </button>
          </div>
        ) : (
          <ImageUploader
            folder="categories"
            onUploaded={(upload) => {
              setImageUrl(upload.url)
              setValue('imageId', upload.id, { shouldDirty: true })
            }}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="position" className="text-sm font-medium">Posição</label>
        <input
          id="position"
          type="number"
          min={0}
          {...register('position', { valueAsNumber: true })}
          className={cn(field, errors.position && 'border-destructive')}
        />
        <p className="text-xs text-muted-foreground">Ordena entre categorias irmãs (menor primeiro).</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seoTitle" className="text-sm font-medium">Título SEO</label>
        <input id="seoTitle" {...register('seoTitle')} className={field} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="seoDescription" className="text-sm font-medium">Descrição SEO</label>
        <textarea id="seoDescription" rows={2} {...register('seoDescription')} className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} className="size-4" />
        Ativa (visível na loja)
      </label>

      {formError && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="h-10 flex-1 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Salvando…' : 'Salvar'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-border px-4 text-sm hover:bg-accent"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
