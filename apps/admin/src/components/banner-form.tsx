'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { createBannerSchema, type CreateBannerInput, type Banner } from '@ecommerce/shared/contracts'
import { useCreateBanner, useUpdateBanner } from '@/lib/banners'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  initial?: Banner
  onDone: () => void
  onCancel: () => void
}

/**
 * Formulário de criar/editar banner do carrossel da home. O MESMO
 * createBannerSchema que a API usa valida aqui.
 */
export const BannerForm = ({ initial, onDone, onCancel }: Props) => {
  const create = useCreateBanner()
  const update = useUpdateBanner()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateBannerInput>({
    resolver: zodResolver(createBannerSchema),
    defaultValues: initial
      ? {
          title: initial.title,
          subtitle: initial.subtitle ?? undefined,
          buttonLabel: initial.buttonLabel ?? undefined,
          linkUrl: initial.linkUrl ?? undefined,
          imageId: initial.imageId,
          position: initial.position,
          isActive: initial.isActive,
        }
      : { isActive: true, position: 0 },
  })

  // A imagem vive fora do fluxo de texto do RHF, como no form de categoria: o
  // uploader devolve um Upload, guardamos o id (API) e a URL (preview).
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null)

  const busy = create.isPending || update.isPending

  const onSubmit = (values: CreateBannerInput) => {
    setFormError(null)
    // '' do input hidden vira null — '' viajaria até o Prisma como FK inválida.
    const input = { ...values, imageId: values.imageId || null }

    const onError = (e: unknown) =>
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')

    if (initial) {
      update.mutate({ id: initial.id, input }, { onSuccess: onDone, onError })
    } else {
      create.mutate(input, { onSuccess: onDone, onError })
    }
  }

  const field =
    'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 rounded-lg border border-border bg-card p-5"
      noValidate
    >
      <h2 className="font-medium">{initial ? 'Editar banner' : 'Novo banner'}</h2>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium">Título</label>
        <input id="title" autoFocus {...register('title')} className={cn(field, errors.title && 'border-destructive')} />
        {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="subtitle" className="text-sm font-medium">Subtítulo</label>
        <textarea
          id="subtitle"
          rows={2}
          {...register('subtitle')}
          className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="buttonLabel" className="text-sm font-medium">Texto do botão</label>
        <input id="buttonLabel" placeholder="Ex.: Ver produtos" {...register('buttonLabel')} className={field} />
        <p className="text-xs text-muted-foreground">Sem texto, o slide fica sem botão.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="linkUrl" className="text-sm font-medium">Link do botão</label>
        <input id="linkUrl" placeholder="Ex.: /categorias/velas" {...register('linkUrl')} className={field} />
      </div>

      <input type="hidden" {...register('imageId')} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Imagem</span>
        {imageUrl ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" className="h-20 w-32 rounded-md border border-border object-cover" />
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
            folder="banners"
            onUploaded={(upload) => {
              setImageUrl(upload.url)
              setValue('imageId', upload.id, { shouldDirty: true })
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Foto horizontal funciona melhor. Sem imagem, o slide usa um fundo decorativo.
        </p>
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
        <p className="text-xs text-muted-foreground">Ordem no carrossel (menor primeiro).</p>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" {...register('isActive')} className="size-4" />
        Ativo (visível na loja)
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
