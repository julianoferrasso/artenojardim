'use client'

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  createBannerSchema,
  type BannerBackdrop,
  type CreateBannerInput,
  type Banner,
  type Upload,
} from '@ecommerce/shared/contracts'
import type { BannerLayout, BannerPlacement } from '@ecommerce/shared/constants'
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
import { flattenForSelect, useCategoryTree } from '@/lib/categories'
import { sampleImageBackdrop } from '@/lib/backdrop'
import { useStoreTheme } from '@/lib/store-theme'
import { ImageUploader } from '@/components/image-uploader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Counter, FormFooter, FormTopBar, Group, Notice, Segmented, groupTitleClass, selectClass } from '@/components/form-parts'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Props = {
  initial?: Banner
  /** Onde o banner NOVO nasce (a seção em que o staff clicou). */
  placement?: BannerPlacement
  onDone: () => void
  onCancel: () => void
  /** Avisa a página quando há alteração não salva (para confirmar antes de fechar). */
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Formulário de criar/editar banner da home (topo ou meio), aberto dentro do
 * card do banner. O MESMO createBannerSchema que a API usa valida aqui.
 *
 * Campos à esquerda, prévia fixa à direita (por container query: o card pode
 * ser estreito mesmo numa tela larga) e a barra de salvar presa no pé.
 */
export const BannerForm = ({
  initial,
  placement: initialPlacement = 'HERO',
  onDone,
  onCancel,
  onDirtyChange,
}: Props) => {
  const uid = useId()
  const create = useCreateBanner()
  const update = useUpdateBanner()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setValue,
    getValues,
    watch,
    control,
    formState: { errors, isDirty },
  } = useForm<CreateBannerInput>({
    resolver: zodResolver(createBannerSchema),
    // Todo campo com valor inicial, '' nos textos: sem isso o RHF lê '' do input
    // vazio, compara com undefined e acusa "alterações não salvas" num form intocado.
    defaultValues: initial
      ? {
          title: initial.title,
          subtitle: initial.subtitle ?? '',
          buttonLabel: initial.buttonLabel ?? '',
          linkCategoryId: initial.linkCategoryId,
          imageId: initial.imageId,
          backdrop: initial.backdrop,
          layout: initial.layout,
          blurBehindText: initial.blurBehindText,
          placement: initial.placement,
          position: initial.position,
          isActive: initial.isActive,
        }
      : {
          title: '',
          subtitle: '',
          buttonLabel: '',
          imageId: null,
          isActive: true,
          position: 0,
          backdrop: null,
          linkCategoryId: null,
          layout: 'SIDE',
          blurBehindText: true,
          placement: initialPlacement,
        },
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
  const subtitle = watch('subtitle')
  const placement = watch('placement') ?? 'HERO'
  const buttonLabel = watch('buttonLabel')?.trim()
  const linkCategoryId = watch('linkCategoryId') || null

  const categoryTree = useCategoryTree()
  const categories = flattenForSelect(categoryTree.data ?? [])
  const linkCategory = categories.find((c) => c.id === linkCategoryId)
  const linkWarning =
    buttonLabel && !linkCategoryId
      ? 'Escolha a categoria do botão: sem ela, o banner aparece sem botão.'
      : linkCategory && !linkCategory.isActive
        ? 'Esta categoria está inativa: enquanto estiver, o banner aparece sem botão.'
        : !buttonLabel && linkCategoryId
          ? 'Escreva o texto do botão: sem ele, o banner aparece sem botão.'
          : null
  useEffect(() => onDirtyChange?.(isDirty), [isDirty, onDirtyChange])

  // "Trocar foto" mostra o uploader sem jogar fora a atual até chegar a nova.
  const [replacingImage, setReplacingImage] = useState(false)
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
    imageSize && resolutionWarning(imageSize, layout, placement),
    backdrop?.source === 'image' && blur && busyWarning(edgeBusy, layout),
    !sampling && legibilityWarning(look),
  ].filter((w): w is string => Boolean(w))

  const busy = create.isPending || update.isPending || sampling

  const onSubmit = (values: CreateBannerInput) => {
    setFormError(null)
    // '' do input hidden e do "sem link" vira null — '' viajaria até o Prisma
    // como FK inválida.
    const input = {
      ...values,
      imageId: values.imageId || null,
      linkCategoryId: values.linkCategoryId || null,
    }

    const onError = (e: unknown) =>
      setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.')

    if (initial) {
      update.mutate({ id: initial.id, input }, { onSuccess: onDone, onError })
    } else {
      create.mutate(input, { onSuccess: onDone, onError })
    }
  }

  const onImageUploaded = (upload: Upload) => {
    setReplacingImage(false)
    setImageUrl(upload.url)
    const size = upload.width && upload.height ? { width: upload.width, height: upload.height } : null
    setImageSize(size)
    setValue('imageId', upload.id, { shouldDirty: true })
    // Sugestão pela proporção; o lojista troca abaixo se quiser.
    if (size) setValue('layout', suggestLayout(size), { shouldDirty: true })
    void sampleFromImage(upload.url, 'replace')
  }

  const removeImage = () => {
    sampleSeq.current++
    setSampling(false)
    setSampleFailed(false)
    setEdgeBusy(NOT_BUSY)
    setReplacingImage(false)
    setImageUrl(null)
    setImageSize(null)
    setValue('imageId', null, { shouldDirty: true })
    setValue('backdrop', null, { shouldDirty: true })
  }

  const saveLabel = sampling
    ? 'Lendo a foto…'
    : create.isPending || update.isPending
      ? 'Salvando…'
      : initial
        ? 'Salvar alterações'
        : 'Criar banner'

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="@container">
      {/* Onde e quando o banner aparece: no topo, à vista, sem rolar. */}
      <FormTopBar>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Lugar</span>
          <Controller
            control={control}
            name="placement"
            render={({ field }) => (
              <Segmented
                ariaLabel="Lugar na home"
                value={field.value ?? 'HERO'}
                options={PLACEMENT_OPTIONS}
                onChange={field.onChange}
              />
            )}
          />
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor={`${uid}-position`} title="Ordem entre os banners do mesmo lugar (menor primeiro)">
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

      <div className="grid gap-8 p-5 @3xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="flex min-w-0 flex-col gap-8">
          <Group title="Texto">
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-title`}>Título</Label>
                <Counter value={title} max={TITLE_MAX} />
              </div>
              <Input
                id={`${uid}-title`}
                autoFocus={!initial}
                aria-invalid={Boolean(errors.title)}
                placeholder="Ex.: Detalhes que tornam tudo especial."
                {...register('title')}
              />
              {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`${uid}-subtitle`}>Subtítulo</Label>
                <Counter value={subtitle} max={SUBTITLE_MAX} />
              </div>
              <Textarea
                id={`${uid}-subtitle`}
                rows={3}
                aria-invalid={Boolean(errors.subtitle)}
                placeholder="Uma frase curta que complementa o título."
                {...register('subtitle')}
              />
            </div>

            <div className="grid gap-4 @md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-button`}>Texto do botão</Label>
                <Input id={`${uid}-button`} placeholder="Ex.: Ver produtos" {...register('buttonLabel')} />
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor={`${uid}-link`}>Link do botão</Label>
                {/* Só monta com as opções na mão: o select não-controlado do RHF pega o
                    valor salvo ao montar, e sem a opção ainda ele mostraria "Sem link". */}
                {categoryTree.isLoading ? (
                  <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
                    Carregando categorias…
                  </div>
                ) : (
                  <select id={`${uid}-link`} {...register('linkCategoryId')} className={selectClass}>
                    <option value="">Sem link (sem botão)</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.label}
                        {category.isActive ? '' : ' (inativa)'}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {categoryTree.error && (
              <p className="text-xs text-destructive">Não foi possível carregar as categorias.</p>
            )}
            {linkWarning ? (
              <Notice>{linkWarning}</Notice>
            ) : (
              linkCategory && (
                <p className="-mt-2 text-xs text-muted-foreground">
                  O botão leva para <span className="font-mono">/categorias/{linkCategory.slug}</span>
                </p>
              )
            )}
          </Group>

          <Group title="Foto">
            <input type="hidden" {...register('imageId')} />
            {imageUrl && !replacingImage ? (
              <div className="flex items-center gap-4 rounded-lg border border-border bg-muted/40 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt="" className="h-20 w-32 shrink-0 rounded-md object-cover" />
                <div className="flex min-w-0 flex-col gap-2">
                  <span className="text-sm text-muted-foreground">
                    {imageSize ? `${imageSize.width} × ${imageSize.height} px` : 'Foto enviada'}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setReplacingImage(true)}>
                      Trocar foto
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={removeImage}
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      Remover
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <ImageUploader folder="banners" onUploaded={onImageUploaded} />
                {replacingImage && (
                  <button
                    type="button"
                    onClick={() => setReplacingImage(false)}
                    className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Manter a foto atual
                  </button>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Foto larga (ex.: 1920×640) funciona bem como fundo; quadrada ou em pé, à direita do texto.
              Sem foto, o banner usa um fundo decorativo.
            </p>
          </Group>

          {imageUrl && (
            <Group title="Aparência">
              <div role="radiogroup" aria-label="Posição da foto" className="grid gap-3 @md:grid-cols-2">
                {LAYOUT_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      'flex cursor-pointer flex-col gap-3 rounded-lg border p-3 transition-colors',
                      'has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                      layout === option.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/40 hover:bg-accent/40',
                    )}
                  >
                    <input type="radio" value={option.value} {...register('layout')} className="sr-only" />
                    <LayoutSketch layout={option.value} active={layout === option.value} />
                    <span>
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              <p className="-mt-1 text-xs text-muted-foreground">No celular, a foto fica sempre em cima do texto.</p>

              <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
                <div>
                  <Label htmlFor={`${uid}-blur`}>Desfoque atrás do texto</Label>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {layout === 'COVER'
                      ? 'A foto fica desfocada atrás do título, com um véu na cor dela.'
                      : 'A foto se dissolve aos poucos numa cor tirada da borda dela.'}{' '}
                    Desligado, a foto fica nítida, com corte reto.
                  </p>
                </div>
                <Controller
                  control={control}
                  name="blurBehindText"
                  render={({ field }) => (
                    <Switch
                      id={`${uid}-blur`}
                      checked={field.value ?? true}
                      onCheckedChange={field.onChange}
                      className="mt-0.5"
                    />
                  )}
                />
              </div>

              {blur && (
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium">Cor do fundo</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Segmented
                      ariaLabel="Cor do fundo"
                      value={backdrop?.source === 'custom' ? 'custom' : 'image'}
                      options={BACKDROP_SOURCE_OPTIONS}
                      onChange={(source) =>
                        source === 'custom'
                          ? setCustomColor(middleColor(backdrop))
                          : void sampleFromImage(imageUrl, 'replace')
                      }
                    />
                    {backdrop?.source === 'custom' && (
                      <HexColorInput value={backdrop.left[0] ?? DEFAULT_CUSTOM} onChange={setCustomColor} />
                    )}
                  </div>
                </div>
              )}

              {sampling && <p className="text-xs text-muted-foreground">Lendo as cores da foto…</p>}
              {!sampling && sampleFailed && blur && backdrop?.source !== 'custom' && (
                <p className="text-xs text-destructive">
                  Não foi possível ler as cores desta foto. Escolha uma cor própria; sem ela, a loja usa
                  a cor secundária do tema.
                </p>
              )}
            </Group>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-3 @3xl:sticky @3xl:top-4 @3xl:self-start">
          <h3 className={groupTitleClass}>Prévia</h3>
          {imageUrl ? (
            <div className="flex flex-col gap-1.5">
              <BannerPreview imageUrl={imageUrl} ratio={ratio} look={look} title={title || 'Título do banner'} />
              <div className="flex gap-2 text-xs text-muted-foreground">
                <span className="flex-1">Computador</span>
                <span className="w-24 text-center">Celular</span>
              </div>
            </div>
          ) : (
            <div className="flex aspect-8/3 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 px-6 text-center text-xs text-muted-foreground">
              Sem foto, a loja usa o fundo decorativo do tema.
            </div>
          )}
          {!sampling && warnings.map((warning) => <Notice key={warning}>{warning}</Notice>)}
        </aside>
      </div>

      <FormFooter
        error={formError}
        dirty={isDirty}
        saveLabel={saveLabel}
        busy={busy}
        onCancel={onCancel}
      />
    </form>
  )
}

const TITLE_MAX = 140
const SUBTITLE_MAX = 400

/** Esquema da posição da foto: blocos do tema, não a foto — vale antes de escolher. */
const LayoutSketch = ({ layout, active }: { layout: BannerLayout; active: boolean }) => (
  <span aria-hidden className="relative flex aspect-8/3 w-full items-center overflow-hidden rounded-md bg-muted">
    <span
      className={cn(
        'absolute inset-y-0 right-0 transition-colors',
        layout === 'COVER' ? 'left-0' : 'w-2/5',
        active ? 'bg-primary/30' : 'bg-foreground/10',
      )}
    />
    <span className="relative flex w-1/2 flex-col gap-1 pl-3">
      <span className="h-1.5 w-4/5 rounded-full bg-foreground/40" />
      <span className="h-1 w-3/5 rounded-full bg-foreground/25" />
      <span className="mt-1 h-2 w-1/3 rounded-sm bg-primary/60" />
    </span>
  </span>
)

const PLACEMENT_OPTIONS = [
  { value: 'HERO', label: 'Topo' },
  { value: 'MIDDLE', label: 'Meio' },
] as const satisfies readonly { value: BannerPlacement; label: string }[]

const BACKDROP_SOURCE_OPTIONS = [
  { value: 'image', label: 'Da foto' },
  { value: 'custom', label: 'Própria' },
] as const

const LAYOUT_OPTIONS: { value: BannerLayout; label: string; hint: string }[] = [
  { value: 'SIDE', label: 'Foto à direita', hint: 'Para foto quadrada ou em pé: o texto fica ao lado dela.' },
  { value: 'COVER', label: 'Foto de fundo', hint: 'Para foto larga: ela cobre o banner, por trás do texto.' },
]

/** A partir desta proporção (largura ÷ altura) a foto é sugerida como fundo. */
const COVER_SUGGESTION_RATIO = 1.6

const suggestLayout = ({ width, height }: { width: number; height: number }): BannerLayout =>
  width / height >= COVER_SUGGESTION_RATIO ? 'COVER' : 'SIDE'

/**
 * O slide do topo tem ~480 a ~620px de altura no computador e cobre a tela toda
 * de largura na foto de fundo; o do meio fica num cartão de ~1120px de largura
 * e ~320 a ~420px de altura. Abaixo disto, a foto é ampliada e fica borrada (o
 * primeiro banner real tinha 225×225).
 */
const MIN_SIZE: Record<BannerPlacement, { sideHeight: number; coverWidth: number; shownHeight: number; coverWhere: string }> = {
  HERO: { sideHeight: 800, coverWidth: 1600, shownHeight: 620, coverWhere: 'a tela inteira' },
  MIDDLE: { sideHeight: 600, coverWidth: 1200, shownHeight: 420, coverWhere: 'o cartão inteiro' },
}

const resolutionWarning = (
  { width, height }: { width: number; height: number },
  layout: BannerLayout,
  placement: BannerPlacement,
): string | null => {
  const min = MIN_SIZE[placement]
  if (layout === 'COVER' && width < min.coverWidth) {
    return `Esta foto tem só ${width}×${height} px. Como fundo ela cobre ${min.coverWhere} e vai ficar borrada. Use uma foto com pelo menos ${min.coverWidth} px de largura.`
  }
  if (layout === 'SIDE' && height < min.sideHeight) {
    return `Esta foto tem só ${width}×${height} px. No banner ela aparece com até ~${min.shownHeight} px de altura e vai ficar borrada. Use uma foto com pelo menos ${min.sideHeight} px de altura.`
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
