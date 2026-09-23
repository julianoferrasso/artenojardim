'use client'

import { useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react'
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
import {
  Camera,
  Code,
  ExternalLink,
  GripVertical,
  ImageIcon,
  LoaderCircle,
  MoreHorizontal,
  Pause,
  Play,
  Trash2,
} from 'lucide-react'
import {
  ERROR_CODES,
  INSTAGRAM_MAX_ACTIVE_POSTS,
  parseInstagramInput,
  type InstagramPost,
} from '@ecommerce/shared/contracts'
import type { InstagramDisplayMode } from '@ecommerce/shared/constants'
import {
  useCreateInstagramPost,
  useDeleteInstagramPost,
  useInstagramPosts,
  useReorderInstagramPosts,
  useUpdateInstagramPost,
} from '@/lib/instagram'
import { ImageUploader } from '@/components/image-uploader'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

const errorMessage = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback)

const MODES: Array<{ value: InstagramDisplayMode; label: string; hint: string }> = [
  {
    value: 'IMAGE',
    label: 'Foto (recomendado)',
    hint: 'A foto do post no visual da loja. Leve, rápida e sem rastreadores do Instagram. Ideal para fotos.',
  },
  {
    value: 'EMBED',
    label: 'Post incorporado',
    hint:
      'O post original do Instagram, com vídeo, carrossel e curtidas. Mais pesado e carrega scripts da Meta. ' +
      'Só funciona com a conta pública e com “Incorporações” ligada nas configurações do Instagram.',
  },
]

export default function InstagramPage() {
  const { data: posts, isLoading, error } = useInstagramPosts()
  const create = useCreateInstagramPost()
  const update = useUpdateInstagramPost()
  const reorder = useReorderInstagramPosts()
  const del = useDeleteInstagramPost()

  const [mode, setMode] = useState<InstagramDisplayMode>('IMAGE')
  const [source, setSource] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Post cuja foto o Instagram não entregou: abre o envio manual da imagem.
  const [manualSource, setManualSource] = useState<string | null>(null)

  const activeCount = posts?.filter((p) => p.isActive).length ?? 0

  const add = (raw: string, displayMode: InstagramDisplayMode, imageId?: string) => {
    setFormError(null)
    setNotice(null)
    if (!parseInstagramInput(raw)) {
      setFormError('Cole o link de um post do Instagram (instagram.com/p/…) ou o código do “Incorporar”.')
      return
    }
    create.mutate(
      { source: raw.trim(), displayMode, imageId },
      {
        onSuccess: (post) => {
          setSource('')
          setManualSource(null)
          if (!post.isActive) {
            setNotice(
              `O post entrou pausado: a loja já exibe ${INSTAGRAM_MAX_ACTIVE_POSTS} posts. Pause outro para ativá-lo.`,
            )
          }
        },
        onError: (e) => {
          if (e instanceof ApiError && e.code === ERROR_CODES.INSTAGRAM_POST_UNAVAILABLE) {
            setManualSource(raw.trim())
            return
          }
          setFormError(errorMessage(e, 'Não foi possível adicionar o post.'))
        },
      },
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    add(source, mode)
  }

  // Colar já adiciona: é o gesto natural de quem vem do Instagram com o link ou
  // o código copiado. Código do "Incorporar" escolhe o modo sozinho.
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData('text')
    const parsed = parseInstagramInput(text)
    if (!parsed || create.isPending) return
    e.preventDefault()
    const pastedMode = parsed.kind === 'embed' ? 'EMBED' : mode
    setMode(pastedMode)
    setSource(text.trim())
    add(text, pastedMode)
  }

  // Enter envia (o textarea é só para o código longo caber); Shift+Enter quebra linha.
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      add(source, mode)
    }
  }

  const onToggleActive = (post: InstagramPost) => {
    update.mutate(
      { id: post.id, input: { isActive: !post.isActive } },
      { onError: (e) => alert(errorMessage(e, 'Não foi possível alterar o post.')) },
    )
  }

  const onChangeMode = (post: InstagramPost, displayMode: InstagramDisplayMode) => {
    update.mutate(
      { id: post.id, input: { displayMode } },
      {
        onError: (e) =>
          alert(
            e instanceof ApiError && e.code === ERROR_CODES.INSTAGRAM_POST_UNAVAILABLE
              ? 'Não foi possível carregar a foto deste post. Para exibi-lo como foto, exclua e adicione de novo enviando a imagem manualmente.'
              : errorMessage(e, 'Não foi possível alterar o post.'),
          ),
      },
    )
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

  const modeHint = MODES.find((m) => m.value === mode)?.hint

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <h1 className="mb-1 text-xl font-semibold tracking-tight">Instagram</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Os posts do carrossel “No Instagram” da loja. Cole o link ou o código do “Incorporar” de um
        post e arraste para ordenar. As alterações aparecem em até 1 minuto.
      </p>

      <fieldset className="mb-3">
        <legend className="mb-2 text-sm font-medium">Como exibir na loja</legend>
        <div role="radiogroup" className="inline-flex rounded-md border border-border p-0.5">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              role="radio"
              aria-checked={mode === m.value}
              onClick={() => setMode(m.value)}
              className={cn(
                'rounded px-3 py-1.5 text-sm transition-colors',
                mode === m.value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="mt-2 max-w-2xl text-xs text-muted-foreground">{modeHint}</p>
      </fieldset>

      <form onSubmit={onSubmit} className="mb-2 flex gap-2">
        <label htmlFor="instagram-source" className="sr-only">
          Link ou código do post
        </label>
        <textarea
          id="instagram-source"
          rows={2}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          placeholder="Cole o link (https://www.instagram.com/p/…) ou o código do “Incorporar” do post"
          disabled={create.isPending}
          className="min-w-0 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={create.isPending || !source.trim()}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {create.isPending ? 'Carregando…' : 'Adicionar'}
        </button>
      </form>

      {formError && (
        <p role="alert" className="mb-2 text-sm text-destructive">
          {formError}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-2 text-sm text-muted-foreground">
          {notice}
        </p>
      )}

      {manualSource && (
        <div role="alert" className="mb-4 rounded-lg border border-border bg-muted/40 p-4">
          <p className="mb-1 text-sm font-medium">Não conseguimos carregar a foto deste post.</p>
          <p className="mb-3 text-sm text-muted-foreground">
            O Instagram às vezes bloqueia a leitura (post privado, removido ou limite de acesso).
            Envie a imagem do post, ou adicione-o como post incorporado.
          </p>
          <ImageUploader folder="instagram" onUploaded={(upload) => add(manualSource, 'IMAGE', upload.id)} />
          <div className="mt-3 flex gap-4">
            <button
              type="button"
              onClick={() => {
                setMode('EMBED')
                add(manualSource, 'EMBED')
              }}
              className="text-xs font-medium underline-offset-2 hover:underline"
            >
              Adicionar como incorporado
            </button>
            <button
              type="button"
              onClick={() => setManualSource(null)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="mb-4 mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {activeCount} de {INSTAGRAM_MAX_ACTIVE_POSTS} ativos
          {posts && posts.length > activeCount && (
            <span className="font-normal text-muted-foreground"> · {posts.length - activeCount} pausados</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          Arraste pela imagem — ou foque nela com Tab, aperte espaço e use as setas.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {error && <p className="text-sm text-destructive">Falha ao carregar os posts.</p>}
      {posts && posts.length === 0 && !create.isPending && (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum post ainda. Sem posts ativos, a loja mostra tiles decorativos.
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
                  busy={
                    (update.isPending && update.variables?.id === post.id) ||
                    (del.isPending && del.variables === post.id)
                  }
                  onToggleActive={() => onToggleActive(post)}
                  onChangeMode={(m) => onChangeMode(post, m)}
                  onDelete={() => onDelete(post)}
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
  busy: boolean
  onToggleActive: () => void
  onChangeMode: (mode: InstagramDisplayMode) => void
  onDelete: () => void
}

const SortableTile = ({ post, index, busy, onToggleActive, onChangeMode, onDelete }: TileProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: post.id })

  const embed = post.displayMode === 'EMBED'

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        isDragging && 'relative z-10 shadow-lg ring-2 ring-primary',
        busy && 'opacity-60',
      )}
    >
      {/* Só a imagem é a alça: os botões do rodapé ficam fora dela, senão o
          espaço/enter do teclado neles iniciaria um arrasto. */}
      <div
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label={`Post ${index + 1}${post.isActive ? '' : ', pausado'}. Arraste para reordenar.`}
        className={cn(
          'group relative aspect-square cursor-grab touch-none bg-muted outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
          isDragging && 'cursor-grabbing',
        )}
      >
        {post.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.imageUrl}
            alt={post.caption ?? ''}
            draggable={false}
            className={cn('size-full object-cover', !post.isActive && 'opacity-40 grayscale')}
          />
        ) : (
          <span className={cn('flex size-full items-center justify-center', !post.isActive && 'opacity-40')}>
            <Camera className="size-8 text-muted-foreground" strokeWidth={1.2} aria-hidden />
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded bg-background/90 px-1.5 py-0.5 text-xs font-medium tabular-nums">
          {index + 1}
        </span>
        {embed && (
          <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded bg-background/90 px-1.5 py-0.5 text-xs">
            <Code className="size-3" aria-hidden />
            Incorporado
          </span>
        )}
        {!embed && (
          <GripVertical
            aria-hidden
            className="absolute right-1.5 top-1.5 size-5 rounded bg-background/90 p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        )}
        {!post.isActive && (
          <span className="absolute inset-x-1.5 bottom-1.5 rounded bg-background/90 px-1.5 py-0.5 text-center text-xs font-medium">
            Pausado
          </span>
        )}
      </div>

      <div className="flex items-center justify-between gap-1 px-1.5 py-1">
        <button
          type="button"
          onClick={onToggleActive}
          disabled={busy}
          aria-pressed={post.isActive}
          className="flex items-center gap-1 rounded px-1.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          {post.isActive ? <Pause className="size-3.5" aria-hidden /> : <Play className="size-3.5" aria-hidden />}
          {post.isActive ? 'Pausar' : 'Ativar'}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              disabled={busy}
              aria-label={`Mais ações do post ${index + 1}`}
              className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={post.permalink} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden />
                Abrir no Instagram
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onChangeMode(embed ? 'IMAGE' : 'EMBED')}>
              {embed ? <ImageIcon aria-hidden /> : <Code aria-hidden />}
              {embed ? 'Exibir como foto' : 'Exibir incorporado'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 aria-hidden />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}
