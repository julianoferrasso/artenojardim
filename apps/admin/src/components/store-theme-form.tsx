'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { useController, useForm, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  updateStoreThemeSchema,
  THEME_RADIUS,
  THEME_RADIUS_REM,
  type AdminTheme,
  type ThemeRadius,
  type UpdateStoreThemeInput,
} from '@ecommerce/shared/contracts'
import {
  contrastForeground,
  hexToOklch,
  oklchToCss,
  shiftLightness,
} from '@ecommerce/shared/utils'
import { useUpdateStoreTheme } from '@/lib/store-theme'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Formulário da aparência da loja. O MESMO updateStoreThemeSchema que a API
 * valida roda aqui — mudar um campo quebra o build no mesmo commit.
 *
 * As cores viajam em HEX (é o que <input type="color"> fala); a API converte
 * para OKLCH ao gravar. O preview refaz a mesma derivação de contraste que a
 * loja usa, para o lojista ver o resultado real antes de salvar.
 */

const COLOR_FIELDS = [
  { name: 'primary', label: 'Cor principal', hint: 'Botões, links e destaques.' },
  { name: 'secondary', label: 'Cor secundária', hint: 'Faixas e áreas de apoio.' },
  { name: 'accent', label: 'Cor de realce', hint: 'Hover de menu e detalhes.' },
  { name: 'background', label: 'Fundo', hint: 'O fundo das páginas.' },
] as const

const RADIUS_LABEL: Record<ThemeRadius, string> = {
  none: 'Reto',
  small: 'Suave',
  medium: 'Médio',
  large: 'Arredondado',
}

type ColorName = (typeof COLOR_FIELDS)[number]['name']

const HEX = /^#[0-9a-fA-F]{6}$/

const FIELD_CLASS =
  'h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring'

/**
 * Uma cor: o seletor nativo e o campo hex, sempre mostrando a mesma coisa.
 *
 * ── Por que campo CONTROLADO e não dois register() ──────────────────────────
 * Dois `register(name)` no mesmo campo NÃO funcionam: cada chamada devolve um
 * `ref` próprio e o RHF guarda um só por campo (o array de refs existe apenas
 * para radio/checkbox). O segundo input sobrescreve o primeiro, e como o RHF é
 * não-controlado ele nunca reescreve o valor no DOM do outro — escolher a cor no
 * seletor deixava o hex ao lado congelado. Foi exatamente esse o bug.
 *
 * O campo hex tem rascunho PRÓPRIO em vez de ler o valor do formulário: sem ele,
 * apagar para reescrever seria impossível (o valor voltaria a cada tecla) e
 * digitar "#2d6" — um meio-caminho legítimo — seria rejeitado. O formulário só
 * recebe o valor quando ele fica válido; sair do campo com lixo restaura a
 * última cor boa.
 */
const ColorField = ({
  name,
  label,
  hint,
  control,
  error,
}: {
  name: ColorName
  label: string
  hint: string
  control: Control<UpdateStoreThemeInput>
  error?: string
}) => {
  const { field } = useController({ name, control })
  const [draft, setDraft] = useState(field.value)

  // Acompanha a cor escolhida no SELETOR (ou um reset do formulário). Depende do
  // valor do formulário, nunca do rascunho: reagir ao rascunho corrigiria o texto
  // no meio da digitação.
  useEffect(() => setDraft(field.value), [field.value])

  return (
    <div className="flex flex-col gap-1.5">
      {/* htmlFor aponta para o seletor: é o controle principal da cor. */}
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>

      <div className="flex items-center gap-2">
        <input
          id={name}
          type="color"
          value={field.value}
          onChange={(e) => field.onChange(e.target.value)}
          onBlur={field.onBlur}
          className="size-10 shrink-0 cursor-pointer rounded-md border border-input bg-background p-1"
        />

        {/* O picker nativo não deixa COLAR um hex — daí o campo de texto. */}
        <input
          type="text"
          aria-label={`${label} em hexadecimal`}
          value={draft}
          spellCheck={false}
          onChange={(e) => {
            const next = e.target.value
            setDraft(next)
            if (HEX.test(next)) field.onChange(next)
          }}
          onBlur={() => {
            if (!HEX.test(draft)) setDraft(field.value)
            field.onBlur()
          }}
          className={cn(FIELD_CLASS, 'w-full font-mono uppercase')}
        />
      </div>

      <p className="text-xs text-muted-foreground">{hint}</p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * As MESMAS derivações de apps/store/src/components/theme-style.tsx. Estão
 * duplicadas de propósito: o preview precisa das variáveis num objeto de estilo
 * React, e a loja num texto CSS. Se as regras divergirem, o preview mente —
 * então qualquer mudança lá precisa vir para cá.
 */
const previewVars = (values: UpdateStoreThemeInput): CSSProperties => {
  const primary = hexToOklch(values.primary)
  const secondary = hexToOklch(values.secondary)
  const accent = hexToOklch(values.accent)
  const background = hexToOklch(values.background)
  const bodyText = contrastForeground(background)

  return {
    '--radius': THEME_RADIUS_REM[values.radius],
    '--background': oklchToCss(background),
    '--foreground': oklchToCss(bodyText),
    '--card': oklchToCss(shiftLightness(background, 0.012, 0.5)),
    '--card-foreground': oklchToCss(bodyText),
    '--primary': oklchToCss(primary),
    '--primary-foreground': oklchToCss(contrastForeground(primary)),
    '--secondary': oklchToCss(secondary),
    '--secondary-foreground': oklchToCss(contrastForeground(secondary)),
    '--accent': oklchToCss(accent),
    '--accent-foreground': oklchToCss(contrastForeground(accent)),
    '--muted': oklchToCss(shiftLightness(background, -0.03, 1.5)),
    '--muted-foreground': oklchToCss(
      shiftLightness(bodyText, bodyText.l > 0.5 ? -0.26 : 0.27, 2),
    ),
    '--border': oklchToCss(shiftLightness(background, -0.08, 2.25)),
  } as CSSProperties
}

/** Contraste fraco entre marca e fundo — avisa, não bloqueia. É gosto do dono. */
const lowContrast = (values: UpdateStoreThemeInput): boolean =>
  Math.abs(hexToOklch(values.primary).l - hexToOklch(values.background).l) < 0.25

export const StoreThemeForm = ({ initial }: { initial: AdminTheme }) => {
  const update = useUpdateStoreTheme()
  const [formError, setFormError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<UpdateStoreThemeInput>({
    resolver: zodResolver(updateStoreThemeSchema),
    defaultValues: {
      primary: initial.primary,
      secondary: initial.secondary,
      accent: initial.accent,
      background: initial.background,
      radius: initial.radius,
      logoId: initial.logoId,
    },
  })

  const values = watch()

  // A confirmação some sozinha: um "Salvo ✓" permanente vira parte do botão e
  // deixa de comunicar que ALGO acabou de acontecer.
  useEffect(() => {
    if (!saved) return
    const timer = setTimeout(() => setSaved(false), 3000)
    return () => clearTimeout(timer)
  }, [saved])

  const onSubmit = (input: UpdateStoreThemeInput) => {
    setFormError(null)
    update.mutate(input, {
      onSuccess: () => setSaved(true),
      onError: (e) =>
        setFormError(e instanceof ApiError ? e.message : 'Não foi possível salvar.'),
    })
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-8">
        <section>
          <h2 className="mb-1 text-sm font-medium">Cores da marca</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            A cor do texto é calculada automaticamente para continuar legível sobre cada uma.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map(({ name, label, hint }) => (
              <ColorField
                key={name}
                name={name}
                label={label}
                hint={hint}
                control={control}
                error={errors[name]?.message}
              />
            ))}
          </div>

          {lowContrast(values) && (
            <p className="mt-4 rounded-md bg-warning/15 px-3 py-2 text-sm">
              A cor principal está muito parecida com o fundo. Os botões podem ficar difíceis de
              enxergar.
            </p>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium">Cantos</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Vale para botões, cards e imagens da loja inteira.
          </p>

          <div className="flex flex-wrap gap-2">
            {THEME_RADIUS.map((radius) => {
              const active = values.radius === radius
              return (
                <button
                  key={radius}
                  type="button"
                  onClick={() => setValue('radius', radius, { shouldDirty: true })}
                  aria-pressed={active}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                    active
                      ? 'border-primary bg-accent'
                      : 'border-border hover:border-primary/50',
                  )}
                >
                  <span
                    aria-hidden
                    className="size-5 border-2 border-current"
                    style={{ borderRadius: THEME_RADIUS_REM[radius] }}
                  />
                  {RADIUS_LABEL[radius]}
                </button>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-1 text-sm font-medium">Logo</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Usado no topo, no rodapé e na tela de login. PNG com fundo transparente fica melhor.
          </p>

          <input type="hidden" {...register('logoId')} />

          {logoUrl ? (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={logoUrl}
                alt="Logo atual"
                className="size-16 rounded-md border border-border object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  setLogoUrl(null)
                  setValue('logoId', null, { shouldDirty: true })
                }}
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              >
                Remover
              </button>
            </div>
          ) : (
            <ImageUploader
              folder="branding"
              onUploaded={(upload) => {
                setLogoUrl(upload.url)
                setValue('logoId', upload.id, { shouldDirty: true })
              }}
            />
          )}
        </section>

        {formError && (
          <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {formError}
          </p>
        )}

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={update.isPending}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {update.isPending ? 'Salvando…' : saved ? 'Salvo ✓' : 'Salvar'}
          </button>
          <p className="text-sm text-muted-foreground">
            As alterações aparecem na loja em até 1 minuto.
          </p>
        </div>
      </div>

      {/*
        Preview. Usa TOKENS (bg-primary, text-muted-foreground) sobre as
        variáveis reescritas no wrapper — nunca bg-[#hex]. É por isso que ele
        reproduz a loja de verdade em vez de imitá-la.
      */}
      <aside className="lg:sticky lg:top-8 lg:self-start">
        <h2 className="mb-3 text-sm font-medium">Prévia</h2>
        <div
          style={previewVars(values)}
          className="overflow-hidden rounded-lg border border-border bg-background text-foreground"
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt="" className="size-7 object-contain" />
            ) : (
              <span className="size-7 rounded-full bg-primary" />
            )}
            <span className="text-base font-semibold">Sua loja</span>
          </div>

          <div className="flex flex-col gap-3 p-4">
            <div className="rounded-lg border border-border bg-card p-3">
              <p className="text-sm font-medium">Vela de soja</p>
              <p className="text-sm text-muted-foreground">R$ 89,00</p>
            </div>

            <button
              type="button"
              className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
            >
              Comprar agora
            </button>

            <button
              type="button"
              className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground"
            >
              Ver detalhes
            </button>

            <span className="self-start rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
              Frete grátis
            </span>
          </div>
        </div>
      </aside>
    </form>
  )
}
