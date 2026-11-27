'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Trash2 } from 'lucide-react'
import { ROUTES } from '@ecommerce/shared/constants'
import { ERROR_CODES, type Upload } from '@ecommerce/shared/contracts'
import { ApiError, apiFetchPaginated } from '@/lib/api'
import { deleteUpload, downloadUpload } from '@/lib/upload'
import { ImageUploader } from '@/components/image-uploader'
import { useDialogs } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils'

/**
 * Biblioteca de mídia — a tela que exercita o módulo de uploads de ponta a
 * ponta. Produtos e CMS vão reusar o <ImageUploader>, não esta página.
 */
export default function UploadsPage() {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['uploads'],
    queryFn: () => apiFetchPaginated<Upload>(`${ROUTES.uploads.list}?perPage=60`),
  })

  const { confirm, notify } = useDialogs()
  const [downloading, setDownloading] = useState<string | null>(null)

  const remove = useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
    onError: (e) =>
      void notify({
        title:
          e instanceof ApiError && e.code === ERROR_CODES.UPLOAD_IN_USE
            ? 'Esta imagem está em uso'
            : 'Não foi possível excluir a imagem',
        description: e instanceof ApiError ? e.message : 'Tente de novo em instantes.',
      }),
  })

  const onDelete = async (upload: Upload) => {
    const ok = await confirm({
      title: 'Excluir esta imagem?',
      description: (
        <>
          <p>O arquivo é apagado do armazenamento. Não dá para desfazer.</p>
          <p>
            Se ela ainda estiver em um produto, banner, categoria ou post do Instagram, a exclusão é
            recusada. Troque a imagem lá primeiro.
          </p>
        </>
      ),
      confirmLabel: 'Excluir imagem',
      tone: 'danger',
    })
    if (ok) remove.mutate(upload.id)
  }

  const onDownload = async (upload: Upload) => {
    setDownloading(upload.id)
    try {
      await downloadUpload(upload.id)
    } catch (e) {
      void notify({
        title: 'Não foi possível baixar a imagem',
        description: e instanceof ApiError ? e.message : 'Tente de novo em instantes.',
      })
    } finally {
      setDownloading(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8">
      <h1 className="text-xl font-semibold tracking-tight">Biblioteca de mídia</h1>

      <section className="max-w-md">
          <ImageUploader
            folder="products"
            onUploaded={() => qc.invalidateQueries({ queryKey: ['uploads'] })}
          />
        </section>

        <section>
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {error && <p className="text-sm text-destructive">Não foi possível carregar a biblioteca.</p>}

          {data && data.data.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma imagem ainda. Envie a primeira acima.
            </p>
          )}

          {data && data.data.length > 0 && (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{data.meta.total} imagem(ns)</p>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {data.data.map((upload) => (
                  <li
                    key={upload.id}
                    className="group relative overflow-hidden rounded-lg border border-border bg-card"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- o
                        next/image exige domínios configurados; a biblioteca do
                        admin mostra thumbnails do storage local em dev. */}
                    <img
                      src={upload.url}
                      alt={upload.filename}
                      className="aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <div className="p-2">
                      <p className="truncate text-xs text-muted-foreground" title={upload.filename}>
                        {formatDate(upload.createdAt)}
                        {upload.width ? ` · ${upload.width}×${upload.height}` : ''}
                      </p>
                    </div>
                    {/* Sempre visíveis no toque (não há hover); no mouse, aparecem no hover/foco. */}
                    <div className="absolute right-2 top-2 flex gap-1 transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="secondary"
                        onClick={() => void onDownload(upload)}
                        disabled={downloading === upload.id}
                        aria-label="Baixar imagem"
                        title="Baixar imagem"
                      >
                        <Download />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="destructive"
                        onClick={() => void onDelete(upload)}
                        disabled={remove.isPending}
                        aria-label="Excluir imagem"
                        title="Excluir imagem"
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
    </div>
  )
}
