'use client'

import { useState, type ClipboardEvent, type FormEvent } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ExternalLink, GripVertical, LoaderCircle, Trash2 } from 'lucide-react'
import {
  ERROR_CODES,
  parseInstagramPostUrl,
  type InstagramPost,
} from '@ecommerce/shared/contracts'
import {
  useCreateInstagramPost,
  useDeleteInstagramPost,
  useInstagramPosts,
  useReorderInstagramPosts,
} from '@/lib/instagram'
import { ImageUploader } from '@/components/image-uploader'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

/**
 * Quantos tiles a grade da loja pinta (apps/store/.../instagram-strip.tsx).
 * No celular só os 3 primeiros aparecem. Mudou lá, mude aqui.
 */
const STORE_VISIBLE = 5
const STORE_VISIBLE_MOBILE = 3

const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

export default function InstagramPage() {
  const { data: posts, isLoading, error } = useInstagramPosts()
  const create = useCreateInstagramPost()
  const reorder = useReorderInstagramPosts()
  const del = useDeleteInstagramPost()

  const [url, setUrl] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Link cujo post o Instagram não entregou: abre o envio manual da imagem.
  const [manualUrl, setManualUrl] = useState<string | null>(null)

  const add = (raw: string, imageId?: string) => {
    setFormError(null)
    if (!parseInstagramPostUrl(raw)) {
      setFormError('Cole o link de um post, reel ou vídeo do Instagram (instagram.com/p/…).')
      return
    }
    create.mutate(
      { url: raw.trim(), imageId },
      {
        onSuccess: () => {
          setUrl('')
          setManualUrl(null)
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === ERROR_CODES.INSTAGRAM_POST_UNAVAILABLE) {
            setManualUrl(raw.trim())
            return
          }
          setFormError(errorMessage(e, 'Não foi possível adicionar o post.'))
        },
      },
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    add(url)
  }

  // Colar já adiciona: é o gesto natural de quem vem do app com o link copiado.
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text')
    if (!parseInstagramPostUrl(text) || create.isPending) return
    e.preventDefault()
    setUrl(text.trim())
    add(text)
  }

  const onDelete = (post: InstagramPost) => {
    if (!confirm('Remover este post da loja?')) return
    del.mutate(post.id, {
      onError: (e) => alert(errorMessage(e, 'Não foi possível remover o post.')),
    })
  }

  const sensors = useSensors(
    // Distância mínima: sem ela, todo clique no tile vira um arrasto de 0px.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // No toque, segurar para arrastar — senão rolar a página arrasta tiles.
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!posts || !over || active.id === over.id) return
    const from = posts.findIndex((p) => p.id === active.id)
    const to = posts.findIndex((p) => p.id === over.id)
    if (from < 0 || to < 0) return
    reorder.mutate(arrayMove(posts, from, to), {
      onError: (e) => alert(errorMessage(e, 'Não foi possível salvar a nova ordem.')),
    })
  }

  const positionOf = (id: string | number) => (posts?.findIndex((p) => p.id === id) ?? -1) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Post ${positionOf(active.id)} selecionado.`,
    onDragOver: ({ over }) => (over ? `Sobre a posição ${positionOf(over.id)}.` : 'Fora da grade.'),
    onDragEnd: ({ over }) => (over ? `Post movido para a posição ${positionOf(over.id)}.` : 'Movimento cancelado.'),
    onDragCancel: () => 'Movimento cancelado.',
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Instagram</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Os posts da seção “No Instagram” da loja. Cole o link de um post e arraste para ordenar.
        As alterações aparecem em até 1 minuto.
      </p>

      <form onSubmit={onSubmit} className="mb-2 flex gap-2">
        <label htmlFor="instagram-url" className="sr-only">
          Link do post
        </label>
        <input
          id="instagram-url"
          type="url"
          inputMode="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onPaste={onPaste}
          placeholder="Cole aqui o link do post — https://www.instagram.com/p/…"
          disabled={create.isPending}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={create.isPending || !url.trim()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? 'Carregando…' : 'Adicionar'}
        </button>
      </form>

      {formError && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {formError}
        </p>
      )}

      {manualUrl && (
        <div role="alert" className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="mb-1 text-sm font-medium">Não conseguimos carregar a imagem deste post.</p>
          <p className="mb-3 text-sm text-muted-foreground">
            O Instagram às vezes bloqueia a leitura (post privado, removido ou limite de acesso).
            Envie a imagem do post e ele será adicionado com o mesmo link.
          </p>
          <p className="mb-3 truncate text-xs text-muted-foreground">{manualUrl}</p>
          <ImageUploader folder="instagram" onUploaded={(upload) => add(manualUrl, upload.id)} />
          <button
            type="button"
            onClick={() => setManualUrl(null)}
            className="mt-3 text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Cancelar
          </button>
        </div>
      )}

      <p className="mb-4 mt-4 text-xs text-muted-foreground">
        A loja exibe os {STORE_VISIBLE} primeiros ({STORE_VISIBLE_MOBILE} no celular). Arraste pela
        imagem — ou foque nela com Tab, aperte espaço e use as setas.
      </p>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar os posts.</p>}
      {posts && posts.length === 0 && !create.isPending && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum post ainda. Sem posts, a loja mostra tiles decorativos.
        </p>
      )}

      {posts && (posts.length > 0 || create.isPending) && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          accessibility={{
            announcements,
            screenReaderInstructions: {
              draggable:
                'Para mover, aperte espaço. Use as setas para escolher a posição e espaço de novo para soltar. Esc cancela.',
            },
          }}
        >
          <SortableContext items={posts.map((p) => p.id)} strategy={rectSortingStrategy}>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {posts.map((post, i) => (
                <SortableTile
                  key={post.id}
                  post={post}
                  index={i}
                  onDelete={() => onDelete(post)}
                  deleting={del.isPending && del.variables === post.id}
                />
              ))}
              {create.isPending && (
                <li
                  aria-label="Carregando post"
                  className="flex aspect-square items-center justify-center rounded-lg border border-border bg-muted"
                >
                  <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden />
                </li>
              )}
            </ul>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}

type TileProps = {
  post: InstagramPost
  index: number
  onDelete: () => void
  deleting: boolean
}

const SortableTile = ({ post, index, onDelete, deleting }: TileProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: post.id })

  const hidden = index >= STORE_VISIBLE
  const desktopOnly = !hidden && index >= STORE_VISIBLE_MOBILE

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-primary',
        deleting && 'opacity-50',
      )}
    >
      {/* Só a imagem é a alça: os botões do rodapé ficam fora dela, senão o
          espaço/enter do teclado neles iniciaria um arrasto. */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Post ${index + 1}. Arraste para reordenar.`}
        className={cn(
          'group relative aspect-square cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          isDragging && 'cursor-grabbing',
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={post.imageUrl}
          alt={post.caption ?? ''}
          draggable={false}
          className={cn('size-full object-cover', hidden && 'opacity-40 grayscale')}
        />
        <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium tabular-nums">
          {index + 1}
        </span>
        <GripVertical
          aria-hidden
          className="absolute right-1.5 top-1.5 size-5 rounded bg-background/90 p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
        />
        {(hidden || desktopOnly) && (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-background/90 px-1.5 py-0.5 text-center text-xs text-muted-foreground">
            {hidden ? 'fora da vitrine' : 'só no computador'}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <a
          href={post.permalink}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ExternalLink className="size-3.5" aria-hidden />
          Abrir
        </a>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          aria-label={`Remover post ${index + 1}`}
          className="rounded p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  )
}
