'use client'

import { useCallback, useRef, useState } from 'react'
import type { Upload, UploadFolder } from '@ecommerce/shared/contracts'
import { uploadImage, UploadError, type UploadProgress } from '@/lib/upload'
import { cn } from '@/lib/utils'

/**
 * Uploader reutilizável: drag & drop ou clique, um arquivo por vez.
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
}

export const ImageUploader = ({ folder, onUploaded }: Props) => {
  const inputRef = useRef<HTMLInputElement>(null)
  const [stage, setStage] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback(
    async (file: File) => {
      setError(null)
      try {
        const upload = await uploadImage(file, folder, setStage)
        onUploaded(upload)
      } catch (err) {
        setError(err instanceof UploadError ? err.message : 'Não foi possível enviar o arquivo.')
      } finally {
        setStage(null)
        if (inputRef.current) inputRef.current.value = ''
      }
    },
    [folder, onUploaded],
  )

  const busy = stage !== null

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
          const file = e.dataTransfer.files[0]
          if (file) void handleFile(file)
        }}
        className={cn(
          'flex h-32 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed',
          'text-sm text-muted-foreground transition-colors',
          dragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/50',
          busy && 'pointer-events-none opacity-60',
        )}
      >
        {busy ? (
          <span className="text-primary">{STAGE_LABEL[stage]}</span>
        ) : (
          <>
            <span className="font-medium text-foreground">Arraste uma imagem ou clique</span>
            <span className="text-xs">JPG, PNG, WebP ou AVIF · até 10 MB</span>
          </>
        )}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
        }}
      />

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
