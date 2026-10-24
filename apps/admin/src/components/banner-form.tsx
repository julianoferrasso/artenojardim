'use client'

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createBannerSchema,
  type BannerBackdrop,
  type CreateBannerInput,
  type Banner,
} from '@ecommerce/shared/contracts'
import { deriveBannerVars } from '@ecommerce/shared/utils'
import { useCreateBanner, useUpdateBanner } from '@/lib/banners'
import { sampleImageBackdrop } from '@/lib/backdrop'
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
    watch,
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
          backdrop: initial.backdrop,
          position: initial.position,
          isActive: initial.isActive,
        }
      : { isActive: true, position: 0, backdrop: null },
  })

  // A imagem vive fora do fluxo de texto do RHF, como no form de categoria: o
  // uploader devolve um Upload, guardamos o id (API) e a URL (preview).
  const [imageUrl, setImageUrl] = useState<string | null>(initial?.imageUrl ?? null)
  const [imageSize, setImageSize] = useState(
    initial?.imageWidth && initial.imageHeight
      ? { width: initial.imageWidth, height: initial.imageHeight }
      : null,
  )

  const backdrop = watch('backdrop') ?? null
  const title = watch('title')
  const [sampling, setSampling] = useState(false)
  const [sampleFailed, setSampleFailed] = useState(false)
  // Não é gravado: só serve para o aviso, e é refeito a cada amostragem.
  const [edgeBusy, setEdgeBusy] = useState(NOT_BUSY)
  // Amostragem mais nova vence: trocar de foto no meio de uma leitura não pode
  // deixar a cor da foto anterior no banner.
  const sampleSeq = useRef(0)

  const sampleFromImage = useCallback(
    async (url: string) => {
      const seq = ++sampleSeq.current
      setSampling(true)
      const result = await sampleImageBackdrop(url)
      if (seq !== sampleSeq.current) return
      setSampling(false)
      setSampleFailed(!result)
      setEdgeBusy(result?.busy ?? NOT_BUSY)
      setValue(
        'backdrop',
        result ? { source: 'image', left: result.left, bottom: result.bottom } : null,
        { shouldDirty: true },
      )
    },
    [setValue],
  )

  // Banner antigo (sem fundo) ganha a cor ao abrir; o que já usa as cores da
  // foto é relido para saber se a borda é carregada. Cor própria fica intocada.
  // Congelado na abertura: um refetch da lista recria `initial`, e reler ali
  // apagaria a cor própria que o lojista acabou de escolher.
  const [imageOnOpen] = useState(() =>
    initial?.imageUrl && initial.backdrop?.source !== 'custom' ? initial.imageUrl : null,
  )
  useEffect(() => {
    if (imageOnOpen) void sampleFromImage(imageOnOpen)
  }, [imageOnOpen, sampleFromImage])

  const setCustomColor = (color: string) =>
    setValue('backdrop', { source: 'custom', left: [color], bottom: [color] }, { shouldDirty: true })

  const busy = create.isPending || update.isPending || sampling
  const edgeWarning = backdrop?.source === 'image' ? busyWarning(edgeBusy) : null

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
                sampleSeq.current++
                setSampling(false)
                setSampleFailed(false)
                setEdgeBusy(NOT_BUSY)
                setImageUrl(null)
                setImageSize(null)
                setValue('imageId', null, { shouldDirty: true })
                setValue('backdrop', null, { shouldDirty: true })
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
              setImageSize(upload.width && upload.height ? { width: upload.width, height: upload.height } : null)
              setValue('imageId', upload.id, { shouldDirty: true })
              void sampleFromImage(upload.url)
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Qualquer proporção funciona: a foto fica à direita e a cor da borda dela preenche o resto
          do banner. Uma foto bem larga (ex.: 1920×640), com o lado esquerdo livre, aparece por trás
          do texto. Sem imagem, o slide usa um fundo decorativo.
        </p>
      </div>

      {imageUrl && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">Fundo atrás do texto</legend>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="backdrop-source"
              checked={backdrop?.source !== 'custom'}
              onChange={() => void sampleFromImage(imageUrl)}
              className="size-4"
            />
            Cores da borda da foto
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="backdrop-source"
              checked={backdrop?.source === 'custom'}
              onChange={() => setCustomColor(middleColor(backdrop))}
              className="size-4"
            />
            Cor própria
          </label>

          {backdrop?.source === 'custom' && (
            <HexColorInput value={backdrop.left[0] ?? DEFAULT_CUSTOM} onChange={setCustomColor} />
          )}

          {sampling && <p className="text-xs text-muted-foreground">Lendo as cores da foto…</p>}
          {!sampling && sampleFailed && backdrop?.source !== 'custom' && (
            <p className="text-xs text-destructive">
              Não foi possível ler as cores desta foto. Escolha uma cor própria; sem ela, a loja usa
              a cor secundária do tema.
            </p>
          )}
          {!sampling && edgeWarning && (
            <p className="rounded-md bg-accent px-3 py-2 text-xs">{edgeWarning}</p>
          )}

          <BannerPreview
            imageUrl={imageUrl}
            ratio={imageSize ? imageSize.width / imageSize.height : 4 / 3}
            backdrop={backdrop}
            title={title || 'Título do banner'}
          />
        </fieldset>
      )}

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

const DEFAULT_CUSTOM = '#f4ece4'
const NOT_BUSY = { left: false, bottom: false }
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Cada borda só aparece num tamanho de tela — a esquerda no computador, a de
 * baixo no celular —, então o aviso diz ONDE o fundo vai ficar borrado. Uma
 * foto larga com a bandeja cortada embaixo fica perfeita no computador.
 */
const busyWarning = (busy: { left: boolean; bottom: boolean }): string | null => {
  const where = [busy.left && 'no computador', busy.bottom && 'no celular'].filter(Boolean).join(' e ')
  if (!where) return null
  return `A borda desta foto tem muitos detalhes, e o fundo prolongado pode parecer borrado ${where}. Prefira uma foto com fundo liso ou escolha uma cor própria.`
}

/** Ao trocar para "cor própria", parte da cor do meio da borda — não de um bege qualquer. */
const middleColor = (backdrop: BannerBackdrop | null): string =>
  backdrop?.left[Math.floor(backdrop.left.length / 2)] ?? DEFAULT_CUSTOM

/** Seletor + campo hex — o picker nativo não deixa COLAR um hex. */
const HexColorInput = ({ value, onChange }: { value: string; onChange: (hex: string) => void }) => {
  const [draft, setDraft] = useState(value)
  // Segue o seletor; reagir ao rascunho corrigiria o texto no meio da digitação.
  useEffect(() => setDraft(value), [value])

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        aria-label="Cor do fundo"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
      />
      <input
        type="text"
        aria-label="Cor do fundo em hexadecimal"
        value={draft}
        spellCheck={false}
        onChange={(e) => {
          setDraft(e.target.value)
          if (HEX.test(e.target.value)) onChange(e.target.value.toLowerCase())
        }}
        onBlur={() => {
          if (!HEX.test(draft)) setDraft(value)
        }}
        className="h-10 w-full rounded-md border border-input bg-background px-3 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  )
}

/**
 * Prévia do slide no desktop e no celular. A COR é a da loja (mesmo
 * `deriveBannerVars`); o tamanho é aproximado — o desktop numa caixa 8:3, que é
 * a proporção do slide numa tela de 1280px.
 */
const BannerPreview = ({
  imageUrl,
  ratio,
  backdrop,
  title,
}: {
  imageUrl: string
  ratio: number
  backdrop: BannerBackdrop | null
  title: string
}) => {
  const style = {
    ...(backdrop ? deriveBannerVars(backdrop) : {}),
    '--photo-ratio': ratio,
    '--photo-ratio-sm': Math.min(16 / 9, Math.max(4 / 3, ratio)),
  } as CSSProperties
  // Sem fundo a loja usa a secundária DO TEMA DA LOJA, que o admin não carrega
  // aqui — a prévia mostra um neutro em vez de fingir a cor.
  const fallback = !backdrop && 'bg-muted text-foreground'

  return (
    <div style={style} className="mt-1 flex items-start gap-2">
      <div
        className={cn(
          'relative flex aspect-8/3 flex-1 items-center overflow-hidden rounded-md border border-border',
          backdrop && 'bg-(image:--hero-bg-md) text-(--hero-ink-md)',
          fallback,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-y-0 right-0 aspect-(--photo-ratio) h-full max-w-full object-cover object-right mask-l-from-80%"
        />
        <p className="relative w-1/2 px-3 font-display text-sm font-semibold leading-tight">{title}</p>
      </div>

      <div
        className={cn(
          'flex w-24 shrink-0 flex-col overflow-hidden rounded-md border border-border',
          backdrop && 'bg-(image:--hero-bg) text-(--hero-ink)',
          fallback,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={imageUrl}
          alt=""
          className="aspect-(--photo-ratio-sm) w-full object-cover object-right mask-b-from-75%"
        />
        <p className="px-1.5 pb-3 pt-1 text-center font-display text-xs font-semibold leading-tight">
          {title}
        </p>
      </div>
    </div>
  )
}
