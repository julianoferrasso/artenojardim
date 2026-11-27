'use client'

import { useCallback, useRef, useState } from 'react'
import type { Upload, UploadFolder } from '@ecommerce/shared/contracts'
import { uploadImage, UploadError, type UploadProgress } from '@/lib/upload'
import { cn } from '@/lib/utils'

/**
 * Uploader reutilizável: drag & drop ou clique. Um arquivo por vez, ou vários
 * com `multiple` (enviados em sequência, um `onUploaded` por arquivo).
 * Produtos, categorias e CMS consomem o mesmo componente — a razão de ele
 * existir separado da página de mídia.
 */

const STAGE_LABEL: Record<UploadProgress, string> = {
  validating: 'Validando…',
  uploading: 'Enviando…',
  confirming: 'Finalizando…',
}

type Props = {
  folder: UploadFolder
  onUploaded: (upload: Upload) => void
  multiple?: boolean
  /** Altura menor para caber ao lado de uma galeria. */
  compact?: boolean
}

export const ImageUploader = ({ folder, onUploaded, multiple = false, compact = false }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<UploadProgress | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    async (files: File[]) => {
      setErrors([])
      const failed: string[] = []
      try {
        for (const [i, file] of files.entries()) {
          setProgress({ current: i + 1, total: files.length })
          try {
            onUploaded(await uploadImage(file, folder, setStage))
          } catch (err) {
            const reason = err instanceof UploadError ? err.message : 'Não foi possível enviar o arquivo.'
            failed.push(files.length > 1 ? `${file.name}: ${reason}` : reason)
          }
        }
      } finally {
        setErrors(failed)
        setStage(null)
        setProgress(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [folder, onUploaded],
  )

  const take = (list: FileList | null | undefined) => {
    const files = Array.from(list ?? [])
    const picked = multiple ? files : files.slice(0, 1)
    if (picked.length > 0) void handleFiles(picked)
  }

  const busy = stage !== null || progress !== null

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          take(e.dataTransfer.files)
        }}
        className={cn(
          'flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4',
          'text-center text-sm text-muted-foreground transition-colors',
          compact ? 'h-full min-h-28' : 'h-32',
          dragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/50',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? (
          <span className="text-primary">
            {progress && progress.total > 1 ? `Enviando ${progress.current} de ${progress.total}…` : STAGE_LABEL[stage ?? 'validating']}
          </span>
        ) : (
          <>
            <span className="font-medium text-foreground">
              {multiple ? 'Arraste fotos ou clique' : 'Arraste uma imagem ou clique'}
            </span>
            <span className="text-xs">JPG, PNG, WebP ou AVIF · até 10 MB</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />

      {errors.map((message) => (
        <p key={message} role="alert" className="text-xs text-destructive">
          {message}
        </p>
      ))}
    </div>
  )
}
