'use client'

import { useEffect, useId, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createCategorySchema, type CreateCategoryInput, type Category } from '@ecommerce/shared/contracts'
import { useCreateCategory, useUpdateCategory } from '@/lib/categories'
import { ImageUploader } from '@/components/image-uploader'
import { Counter, FormFooter, FormTopBar, Group, Notice, groupTitleClass, selectClass } from '@/components/form-parts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'

type Props = {
  parentOptions: Array<{ id: string; label: string }>
  initial?: Category
  /** Pai da categoria NOVA (o "+ Subcategoria" de um card). */
  defaultParentId?: string | null
  onDone: () => void
  onCancel: () => void
  /** Avisa a página quando há alteração não salva (para confirmar antes de fechar). */
  onDirtyChange?: (dirty: boolean) => void
}

// Os mesmos limites do createCategorySchema: o contador avisa antes da API recusar.
const NAME_MAX = 120
const DESCRIPTION_MAX = 2000
const SEO_TITLE_MAX = 160
const SEO_DESCRIPTION_MAX = 320

/** Só para a prévia: o endereço de verdade é gerado (e normalizado) no backend. */
const previewSlug = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const clip = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text)

/**
 * Criar/editar categoria, aberto dentro do card da categoria. O MESMO
 * createCategorySchema que a API usa valida aqui.
 */
export const CategoryForm = ({ parentOptions, initial, defaultParentId = null, onDone, onCancel, onDirtyChange }: Props) => {
  const uid = useId()
  const create = useCreateCategory()
  const update = useUpdateCategory()
  const [formError, setFormError] = useState<string | null>(null)
  // Fora do RHF: o resolver é o createCategorySchema, que não tem slug (só a
  // edição o aceita). Vai no PATCH só se mudou.
  const [slug, setSlug] = useState(initial?.slug ?? '')

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<CreateCategoryInput>({
    resolver: zodResolver(createCategorySchema),
    // Todo campo com valor inicial, '' nos textos: sem isso o RHF lê '' do input
    // vazio, compara com undefined e acusa "alterações não salvas" num form intocado.
    defaultValues: initial
      ? {
          name: initial.name,
          description: initial.description ?? '',
          parentId: initial.parentId ?? '',
          imageId: initial.imageId ?? '',
          position: initial.position,
          isActive: initial.isActive,
          seoTitle: initial.seoTitle ?? '',
          seoDescription: initial.seoDescription ?? '',
        }
      : {
          name: '',
          description: '',
          parentId: defaultParentId ?? '',
          imageId: '',
          position: 0,
          isActive: true,
          seoTitle: '',
          seoDescription: '',
        },
  })

  // A imagem vive fora do fluxo de texto do RHF: o uploader devolve um Upload, e
  // guardamos o id (enviado à API) e a URL (só para o preview).
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null)
  const [replacingImage, setReplacingImage] = useState(false)

  const name = watch('name') ?? ''
  const description = watch('description') ?? ''
  const seoTitle = watch('seoTitle') ?? ''
  const seoDescription = watch('seoDescription') ?? ''

  const slugChanged = Boolean(initial) && slug.trim() !== initial?.slug
  const dirty = isDirty || slugChanged
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange])

  const busy = create.isPending || update.isPending
  const saveLabel = busy ? 'Salvando…' : initial ? 'Salvar alterações' : 'Criar categoria'

  const onSubmit = (values: CreateCategoryInput) => {
    setFormError(null)
    // Campos opcionais que nascem como string '' no DOM viram null aqui: o
    // <select> de pai devolve '' na opção "Raiz", e o input hidden de imagem
    // devolve '' quando nada foi enviado. Sem isto o '' viaja até o Prisma e
    // vira violação de FK (nenhum registro tem id '').
    const input = {
      ...values,
      parentId: values.parentId || null,
      imageId: values.imageId || null,
    }

    const onError = (e: unknown) =>
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')

    if (initial) {
      const nextSlug = slug.trim()
      if (!nextSlug) {
        setFormError('Informe o endereço.')
        return
      }
      update.mutate(
        { id: initial.id, input: nextSlug !== initial.slug ? { ...input, slug: nextSlug } : input },
        { onSuccess: onDone, onError },
      )
    } else {
      create.mutate(input, { onSuccess: onDone, onError })
    }
  }

  const shownSlug = initial ? previewSlug(slug) || initial.slug : previewSlug(name)

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="@container">
      <FormTopBar>
        <div className="flex items-center gap-2">
          <Label htmlFor={`${uid}-position`} title="Ordem entre categorias irmãs (menor primeiro)">
            Posição
          </Label>
          <Input
            id={`${uid}-position`}
            type="number"
            min={0}
            aria-invalid={Boolean(errors.position)}
            {...register('position', { valueAsNumber: true })}
            className="h-8 w-16"
          />
        </div>

        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="isActive"
            render={({ field }) => (
              <Switch id={`${uid}-active`} checked={field.value ?? true} onCheckedChange={field.onChange} />
            )}
          />
          <Label htmlFor={`${uid}-active`}>Visível na loja</Label>
        </div>
      </FormTopBar>

      <div className="grid gap-8 p-5 @3xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Group title="Identificação">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-name`}>Nome</Label>
                <Counter value={name} max={NAME_MAX} />
              </div>
              <Input
                id={`${uid}-name`}
                autoFocus={!initial}
                aria-invalid={Boolean(errors.name)}
                placeholder="Ex.: Velas aromáticas"
                {...register('name')}
              />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>

            <div className="grid gap-4 @md:grid-cols-2">
              {/* Na criação o endereço nasce do nome, no backend. */}
              {initial && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor={`${uid}-slug`}>Endereço</Label>
                  <div className="flex h-9 items-center rounded-md border border-input bg-background shadow-xs focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50">
                    <span className="pl-3 text-sm text-muted-foreground">/categorias/</span>
                    <input
                      id={`${uid}-slug`}
                      value={slug}
                      onChange={(e) => setSlug(e.target.value)}
                      className="h-full min-w-0 flex-1 bg-transparent pr-3 text-sm outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-parent`}>Categoria pai</Label>
                <select id={`${uid}-parent`} {...register('parentId')} className={selectClass}>
                  <option value="">— Nenhuma (categoria principal) —</option>
                  {parentOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {slugChanged ? (
              <Notice>
                Mudar o endereço quebra links antigos (Google, redes sociais, mensagens) que apontam para ele. Os
                banners da loja acompanham sozinhos. Acentos e espaços viram hífen ao salvar.
              </Notice>
            ) : (
              !initial && (
                <p className="-mt-2 text-xs text-muted-foreground">O endereço é gerado a partir do nome.</p>
              )
            )}
          </Group>

          <Group title="Descrição">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-description`}>Texto da página da categoria</Label>
                <Counter value={description} max={DESCRIPTION_MAX} />
              </div>
              <Textarea
                id={`${uid}-description`}
                rows={4}
                aria-invalid={Boolean(errors.description)}
                placeholder="Uma ou duas frases que apresentam a categoria."
                {...register('description')}
              />
            </div>
          </Group>

          <Group title="Google (SEO)">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-seo-title`}>Título</Label>
                <Counter value={seoTitle} max={SEO_TITLE_MAX} />
              </div>
              <Input
                id={`${uid}-seo-title`}
                aria-invalid={Boolean(errors.seoTitle)}
                placeholder={name || 'Vazio = o nome da categoria'}
                {...register('seoTitle')}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-seo-description`}>Descrição</Label>
                <Counter value={seoDescription} max={SEO_DESCRIPTION_MAX} />
              </div>
              <Textarea
                id={`${uid}-seo-description`}
                rows={2}
                aria-invalid={Boolean(errors.seoDescription)}
                placeholder="Vazio = a descrição da categoria"
                {...register('seoDescription')}
              />
            </div>
          </Group>
        </div>

        <aside className="flex min-w-0 flex-col gap-6 @3xl:sticky @3xl:top-4 @3xl:self-start">
          <section className="flex flex-col gap-3">
            <h3 className={groupTitleClass}>Imagem</h3>
            <input type="hidden" {...register('imageId')} />
            {imageUrl && !replacingImage ? (
              <div className="flex flex-col gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="aspect-square w-full rounded-md border border-border object-cover" />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setReplacingImage(true)}>
                    Trocar imagem
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setImageUrl(null)
                      setValue('imageId', '', { shouldDirty: true })
                    }}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    Remover
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ImageUploader
                  folder="categories"
                  onUploaded={(upload) => {
                    setReplacingImage(false)
                    setImageUrl(upload.url)
                    setValue('imageId', upload.id, { shouldDirty: true })
                  }}
                />
                {replacingImage && (
                  <button
                    type="button"
                    onClick={() => setReplacingImage(false)}
                    className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Manter a imagem atual
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Aparece no card da categoria na home. Prefira foto quadrada.</p>
          </section>

          <section className="flex flex-col gap-3">
            <h3 className={groupTitleClass}>Prévia no Google</h3>
            <div className="flex flex-col gap-1 rounded-md border border-border bg-background p-3">
              <span className="truncate text-xs text-muted-foreground">
                sua loja › categorias › {shownSlug || '…'}
              </span>
              <span className="text-base leading-snug text-primary">
                {clip(seoTitle || name || 'Nome da categoria', 60)}
              </span>
              <span className="text-xs text-muted-foreground">
                {clip(seoDescription || description || 'Sem descrição: o Google escolhe um trecho da página.', 160)}
              </span>
            </div>
          </section>
        </aside>
      </div>

      <FormFooter error={formError} dirty={dirty} saveLabel={saveLabel} busy={busy} onCancel={onCancel} />
    </form>
  )
}
