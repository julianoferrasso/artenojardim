'use client'

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Redo2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'
import { Button } from '@/components/ui/button'

type Format = {
  name: string
  attrs?: Record<string, unknown>
  label: string
  icon: LucideIcon
  toggle: (editor: Editor) => void
}

/**
 * A barra É a lista do que pode ser gravado: a API saneia com as mesmas tags
 * (apps/api/src/utils/rich-text.ts). Botão novo aqui exige a tag lá também,
 * senão a formatação some ao salvar.
 */
const FORMATS: Format[] = [
  { name: 'bold', label: 'Negrito', icon: Bold, toggle: (e) => e.chain().focus().toggleBold().run() },
  { name: 'italic', label: 'Itálico', icon: Italic, toggle: (e) => e.chain().focus().toggleItalic().run() },
  { name: 'underline', label: 'Sublinhado', icon: Underline, toggle: (e) => e.chain().focus().toggleUnderline().run() },
  {
    name: 'heading',
    attrs: { level: 2 },
    label: 'Subtítulo',
    icon: Heading2,
    toggle: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  { name: 'bulletList', label: 'Lista com marcadores', icon: List, toggle: (e) => e.chain().focus().toggleBulletList().run() },
  { name: 'orderedList', label: 'Lista numerada', icon: ListOrdered, toggle: (e) => e.chain().focus().toggleOrderedList().run() },
]

/**
 * Editor de texto rico (HTML). Não-controlado: `value` só vale como conteúdo
 * inicial — reescrever o documento a cada tecla perderia o cursor.
 *
 * Não coloque dentro de um <label>: o clique no texto viraria clique no
 * primeiro botão da barra.
 */
export function RichTextEditor({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (html: string) => void
  ariaLabel: string
}) {
  const editor = useEditor({
    // Sem isso o Tiptap renderiza no servidor e o Next acusa hydration mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2] },
        blockquote: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        link: false,
      }),
    ],
    content: value,
    editorProps: {
      attributes: {
        class: 'rich-text min-h-32 px-3 py-2 text-sm outline-none',
        'aria-label': ariaLabel,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      active: FORMATS.map((f) => editor?.isActive(f.name, f.attrs) ?? false),
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
    }),
  })

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
      <div role="toolbar" aria-label="Formatação" className="flex flex-wrap items-center gap-0.5 border-b border-border p-1">
        {FORMATS.map((f, i) => (
          <Toggle
            key={f.name}
            size="sm"
            pressed={state?.active[i] ?? false}
            onPressedChange={() => editor && f.toggle(editor)}
            disabled={!editor}
            aria-label={f.label}
            title={f.label}
          >
            <f.icon />
          </Toggle>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor?.chain().focus().undo().run()}
          disabled={!state?.canUndo}
          aria-label="Desfazer"
          title="Desfazer"
        >
          <Undo2 />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => editor?.chain().focus().redo().run()}
          disabled={!state?.canRedo}
          aria-label="Refazer"
          title="Refazer"
        >
          <Redo2 />
        </Button>
      </div>
      <EditorContent editor={editor} />
    </div>
  )
}
