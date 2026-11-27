'use client'

import { RichTextEditor } from '@/components/rich-text-editor'
import type { FieldErrors, ProductFields } from '@/lib/product-draft'
import { Field, Section, inputCls, textareaCls } from './section'

type Props = {
  fields: ProductFields
  onChange: (patch: Partial<ProductFields>) => void
  errors: FieldErrors
  /** Troca para remontar o editor rico, que é não-controlado (descartar alterações). */
  editorKey: string
}

export function InfoSection({ fields, onChange, errors, editorKey }: Props) {
  return (
    <Section title="Informações">
      <Field label="Nome" htmlFor="product-name" required error={errors.name}>
        <input
          id="product-name"
          value={fields.name}
          maxLength={200}
          onChange={(e) => onChange({ name: e.target.value })}
          aria-invalid={errors.name ? true : undefined}
          placeholder="Ex.: Vela aromática de lavanda"
          className={inputCls}
        />
      </Field>

      <Field
        label="Descrição curta"
        htmlFor="product-short"
        hint="Uma ou duas frases. Aparece na página do produto e no Google quando o SEO está vazio."
        counter={{ value: fields.shortDescription.length, recommended: 160 }}
      >
        <textarea
          id="product-short"
          rows={2}
          maxLength={500}
          value={fields.shortDescription}
          onChange={(e) => onChange({ shortDescription: e.target.value })}
          className={textareaCls}
        />
      </Field>

      <Field label="Descrição">
        <RichTextEditor
          key={editorKey}
          value={fields.description}
          onChange={(description) => onChange({ description })}
          ariaLabel="Descrição"
        />
      </Field>
    </Section>
  )
}
