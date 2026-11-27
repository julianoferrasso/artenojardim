'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import type { ProductFields } from '@/lib/product-draft'
import { cn } from '@/lib/utils'
import { Field, inputCls, textareaCls } from './section'

/** Recomendação de tamanho do Google (o limite do contrato é 200/400). */
const TITLE_REC = 60
const DESCRIPTION_REC = 160

type Props = {
  fields: ProductFields
  onChange: (patch: Partial<ProductFields>) => void
  slug?: string | undefined
}

/**
 * Opcional, então começa fechado (a menos que já tenha algo). A prévia usa o
 * MESMO fallback da loja: título → nome; descrição → descrição curta.
 */
export function SeoSection({ fields, onChange, slug }: Props) {
  const [open, setOpen] = useState(() => !!(fields.seoTitle || fields.seoDescription))
  const title = fields.seoTitle.trim() || fields.name.trim() || 'Nome do produto'
  const description = fields.seoDescription.trim() || fields.shortDescription.trim()

  return (
    <section className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left sm:px-6"
      >
        <span>
          <span className="block font-medium">Aparência no Google</span>
          <span className="block text-sm text-muted-foreground">Opcional. Sem preencher, usa o nome e a descrição curta.</span>
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="flex flex-col gap-4 border-t border-border p-4 sm:p-6">
          <div className="rounded-md border border-border bg-background p-3">
            <p className="truncate text-xs text-muted-foreground">/produtos/{slug ?? '…'}</p>
            <p className="truncate text-base text-primary">{title}</p>
            <p className="line-clamp-2 text-sm text-muted-foreground">
              {description || 'Sem descrição: o Google escolhe um trecho da página.'}
            </p>
          </div>

          <Field
            label="Título"
            htmlFor="seo-title"
            counter={{ value: fields.seoTitle.length, recommended: TITLE_REC }}
            hint={`Até ${TITLE_REC} caracteres aparecem inteiros no Google.`}
          >
            <input
              id="seo-title"
              value={fields.seoTitle}
              maxLength={200}
              placeholder={fields.name}
              onChange={(e) => onChange({ seoTitle: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field
            label="Descrição"
            htmlFor="seo-description"
            counter={{ value: fields.seoDescription.length, recommended: DESCRIPTION_REC }}
          >
            <textarea
              id="seo-description"
              rows={3}
              maxLength={400}
              value={fields.seoDescription}
              placeholder={fields.shortDescription}
              onChange={(e) => onChange({ seoDescription: e.target.value })}
              className={textareaCls}
            />
          </Field>
        </div>
      )}
    </section>
  )
}
