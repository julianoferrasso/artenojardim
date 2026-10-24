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
import type { BannerLayout } from '@ecommerce/shared/constants'
import {
  bannerTextContrast,
  contrastForeground,
  deriveBannerVars,
  hexToOklch,
  oklchToCss,
  MIN_CONTRAST,
  type BannerLook,
} from '@ecommerce/shared/utils'
import { useCreateBanner, useUpdateBanner } from '@/lib/banners'
import { sampleImageBackdrop } from '@/lib/backdrop'
import { useStoreTheme } from '@/lib/store-theme'
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
    getValues,
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
          layout: initial.layout,
          blurBehindText: initial.blurBehindText,
          position: initial.position,
          isActive: initial.isActive,
        }
      : { isActive: true, position: 0, backdrop: null, layout: 'SIDE', blurBehindText: true },
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
  const layout = watch('layout') ?? 'SIDE'
  const blur = watch('blurBehindText') ?? true
  const title = watch('title')
  const [sampling, setSampling] = useState(false)
  const [sampleFailed, setSampleFailed] = useState(false)
  // Não é gravado: só serve para o aviso, e é refeito a cada amostragem.
  const [edgeBusy, setEdgeBusy] = useState(NOT_BUSY)
  // Amostragem mais nova vence: trocar de foto no meio de uma leitura não pode
  // deixar a cor da foto anterior no banner.
  const sampleSeq = useRef(0)

  /**
   * `replace` grava as cores da foto (upload, ou voltar de "cor própria").
   * `refresh` relê ao abrir: com cor própria, só atualiza `region` (as cores da
   * foto debaixo do texto, que a cor própria não substitui) e o aviso.
   */
  const sampleFromImage = useCallback(
    async (url: string, mode: 'replace' | 'refresh') => {
      const seq = ++sampleSeq.current
      setSampling(true)
      const result = await sampleImageBackdrop(url)
      if (seq !== sampleSeq.current) return
      setSampling(false)
      setSampleFailed(!result)
      setEdgeBusy(result?.busy ?? NOT_BUSY)

      const current = getValues('backdrop')
      if (mode === 'refresh' && current?.source === 'custom') {
        if (result) setValue('backdrop', { ...current, region: result.region })
        return
      }
      setValue(
        'backdrop',
        result ? { source: 'image', left: result.left, bottom: result.bottom, region: result.region } : null,
        { shouldDirty: mode === 'replace' },
      )
    },
    [getValues, setValue],
  )

  // Banner antigo (sem fundo ou sem `region`) se completa ao abrir, e o aviso de
  // borda carregada volta. Congelado na abertura: um refetch da lista recria
  // `initial`, e reler a cada refetch reescreveria o que o lojista está editando.
  const [imageOnOpen] = useState(() => initial?.imageUrl ?? null)
  useEffect(() => {
    if (imageOnOpen) void sampleFromImage(imageOnOpen, 'refresh')
  }, [imageOnOpen, sampleFromImage])

  const setCustomColor = (color: string) =>
    setValue(
      'backdrop',
      { source: 'custom', left: [color], bottom: [color], region: backdrop?.region },
      { shouldDirty: true },
    )

  const look: BannerLook = { layout, blur, backdrop }
  const ratio = imageSize ? imageSize.width / imageSize.height : 4 / 3
  const warnings = [
    imageSize && resolutionWarning(imageSize, layout),
    backdrop?.source === 'image' && blur && busyWarning(edgeBusy, layout),
    !sampling && legibilityWarning(look),
  ].filter((w): w is string => Boolean(w))

  const busy = create.isPending || update.isPending || sampling

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
              const size = upload.width && upload.height ? { width: upload.width, height: upload.height } : null
              setImageSize(size)
              setValue('imageId', upload.id, { shouldDirty: true })
              // Sugestão pela proporção; o lojista troca abaixo se quiser.
              if (size) setValue('layout', suggestLayout(size), { shouldDirty: true })
              void sampleFromImage(upload.url, 'replace')
            }}
          />
        )}
        <p className="text-xs text-muted-foreground">
          Foto larga (ex.: 1920×640) funciona bem como fundo; quadrada ou em pé, à direita do texto.
          Sem imagem, o slide usa um fundo decorativo.
        </p>
      </div>

      {imageUrl && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 text-sm font-medium">Como a foto aparece</legend>

          <div className="flex flex-col gap-1.5">
            {LAYOUT_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  value={option.value}
                  {...register('layout')}
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>
                  {option.label}
                  <span className="block text-xs text-muted-foreground">{option.hint}</span>
                </span>
              </label>
            ))}
            <p className="text-xs text-muted-foreground">No celular, a foto fica sempre em cima do texto.</p>
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" {...register('blurBehindText')} className="mt-0.5 size-4 shrink-0" />
            <span>
              Desfoque atrás do texto
              <span className="block text-xs text-muted-foreground">
                {layout === 'COVER'
                  ? 'A foto fica desfocada atrás do título, com um véu na cor dela.'
                  : 'A foto se dissolve aos poucos numa cor tirada da borda dela.'}{' '}
                Desligado, a foto fica nítida, com corte reto.
              </span>
            </span>
          </label>

          {blur && (
            <div className="flex flex-col gap-1.5 pl-6">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="backdrop-source"
                  checked={backdrop?.source !== 'custom'}
                  onChange={() => void sampleFromImage(imageUrl, 'replace')}
                  className="size-4"
                />
                Cor tirada da foto
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
            </div>
          )}

          {sampling && <p className="text-xs text-muted-foreground">Lendo as cores da foto…</p>}
          {!sampling && sampleFailed && blur && backdrop?.source !== 'custom' && (
            <p className="text-xs text-destructive">
              Não foi possível ler as cores desta foto. Escolha uma cor própria; sem ela, a loja usa
              a cor secundária do tema.
            </p>
          )}
          {!sampling &&
            warnings.map((warning) => (
              <p key={warning} className="rounded-md bg-accent px-3 py-2 text-xs">
                {warning}
              </p>
            ))}

          <BannerPreview imageUrl={imageUrl} ratio={ratio} look={look} title={title || 'Título do banner'} />
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

const LAYOUT_OPTIONS: { value: BannerLayout; label: string; hint: string }[] = [
  { value: 'SIDE', label: 'Foto à direita', hint: 'Para foto quadrada ou em pé: o texto fica ao lado dela.' },
  { value: 'COVER', label: 'Foto de fundo', hint: 'Para foto larga: ela cobre o banner, por trás do texto.' },
]

/** A partir desta proporção (largura ÷ altura) a foto é sugerida como fundo. */
const COVER_SUGGESTION_RATIO = 1.6

const suggestLayout = ({ width, height }: { width: number; height: number }): BannerLayout =>
  width / height >= COVER_SUGGESTION_RATIO ? 'COVER' : 'SIDE'

/**
 * O slide tem ~480 a ~620px de altura no computador e cobre a tela toda de
 * largura na foto de fundo; abaixo disto, a foto é ampliada e fica borrada (o
 * primeiro banner real tinha 225×225).
 */
const MIN_SIDE_HEIGHT = 800
const MIN_COVER_WIDTH = 1600

const resolutionWarning = ({ width, height }: { width: number; height: number }, layout: BannerLayout): string | null => {
  if (layout === 'COVER' && width < MIN_COVER_WIDTH) {
    return `Esta foto tem só ${width}×${height} px. Como fundo ela cobre a tela inteira e vai ficar borrada. Use uma foto com pelo menos ${MIN_COVER_WIDTH} px de largura.`
  }
  if (layout === 'SIDE' && height < MIN_SIDE_HEIGHT) {
    return `Esta foto tem só ${width}×${height} px. No banner ela aparece com até ~620 px de altura e vai ficar borrada. Use uma foto com pelo menos ${MIN_SIDE_HEIGHT} px de altura.`
  }
  return null
}

const DEFAULT_CUSTOM = '#f4ece4'
const NOT_BUSY = { left: false, bottom: false }
const HEX = /^#[0-9a-fA-F]{6}$/

/**
 * Cada borda só aparece onde é prolongada — a esquerda no computador (só com a
 * foto à direita), a de baixo no celular —, então o aviso diz ONDE o fundo vai
 * ficar borrado.
 */
const busyWarning = (busy: { left: boolean; bottom: boolean }, layout: BannerLayout): string | null => {
  const where = [busy.left && layout === 'SIDE' && 'no computador', busy.bottom && 'no celular']
    .filter(Boolean)
    .join(' e ')
  if (!where) return null
  return `A borda desta foto tem muitos detalhes, e o fundo prolongado pode parecer borrado ${where}. Prefira uma foto com fundo liso ou escolha uma cor própria.`
}

/** O texto vai ler mal? Mede com a mesma derivação da loja. */
const legibilityWarning = (look: BannerLook): string | null => {
  const { mobile, desktop } = bannerTextContrast(look)
  const where = [desktop !== null && desktop < MIN_CONTRAST && 'no computador', mobile !== null && mobile < MIN_CONTRAST && 'no celular']
    .filter(Boolean)
    .join(' e ')
  if (!where) return null
  return look.blur
    ? `O texto pode ficar difícil de ler ${where}: as cores atrás dele variam muito. Escolha uma cor própria.`
    : `O texto pode ficar difícil de ler ${where}, direto sobre a foto. Ligue o desfoque.`
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
 * Prévia do slide no desktop e no celular. Cores e máscaras são as da loja
 * (mesmo `deriveBannerVars`, mesmas utilities copiadas no globals.css, e a
 * secundária vem do tema da loja); o tamanho é aproximado — o desktop numa caixa
 * 8:3, a proporção do slide numa tela de 1280px — e o desfoque é proporcional.
 */
const BannerPreview = ({
  imageUrl,
  ratio,
  look,
  title,
}: {
  imageUrl: string
  ratio: number
  look: BannerLook
  title: string
}) => {
  const theme = useStoreTheme()
  const vars = deriveBannerVars(look)
  const has = (name: string) => name in vars
  const cover = look.layout === 'COVER'
  const secondary = theme.data?.secondary

  const style = {
    ...vars,
    '--photo-ratio': ratio,
    '--photo-ratio-sm': Math.min(16 / 9, Math.max(4 / 3, ratio)),
    ...(secondary
      ? {
          '--store-secondary': secondary,
          '--store-secondary-fg': oklchToCss(contrastForeground(hexToOklch(secondary))),
        }
      : {}),
  } as CSSProperties
  // Enquanto o tema carrega, um neutro em vez de fingir a cor.
  const themeSurface = secondary ? 'bg-(--store-secondary) text-(--store-secondary-fg)' : 'bg-muted text-foreground'

  return (
    <div style={style} className="mt-1 flex items-start gap-2">
      <div
        className={cn(
          'relative flex aspect-8/3 flex-1 items-center overflow-hidden rounded-md border border-border',
          has('--hero-bg-md') ? 'bg-(image:--hero-bg-md)' : themeSurface,
          has('--hero-ink-md') && 'text-(--hero-ink-md)',
        )}
      >
        <div
          className={cn(
            'absolute overflow-hidden',
            cover ? 'inset-0' : 'inset-y-0 right-0 aspect-(--photo-ratio) h-full max-w-full',
            look.blur && !cover && 'mask-fade-l',
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover object-right" />
          {look.blur && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className={cn(
                'absolute inset-0 size-full scale-110 object-cover object-right',
                cover ? 'blur-sm mask-veil-l' : 'blur-xs mask-blur-l',
              )}
            />
          )}
          {look.blur && cover && has('--hero-tint') && (
            <div className="absolute inset-0 bg-(--hero-tint) mask-veil-l" />
          )}
        </div>
        <p className="relative w-1/2 px-3 font-display text-sm font-semibold leading-tight">{title}</p>
      </div>

      <div
        className={cn(
          'flex w-24 shrink-0 flex-col overflow-hidden rounded-md border border-border',
          has('--hero-bg') ? 'bg-(image:--hero-bg) text-(--hero-ink)' : themeSurface,
        )}
      >
        <div className={cn('relative aspect-(--photo-ratio-sm) w-full overflow-hidden', look.blur && 'mask-fade-b')}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="" className="absolute inset-0 size-full object-cover object-right" />
          {look.blur && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 size-full scale-110 object-cover object-right blur-xs mask-blur-b"
            />
          )}
        </div>
        <p className="px-1.5 pb-3 pt-1 text-center font-display text-xs font-semibold leading-tight">
          {title}
        </p>
      </div>
    </div>
  )
}
