'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ROUTES } from '@ecommerce/shared/constants'
import type { Upload } from '@ecommerce/shared/contracts'
import { apiFetchPaginated } from '@/lib/api'
import { deleteUpload } from '@/lib/upload'
import { ImageUploader } from '@/components/image-uploader'
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

  const remove = useMutation({
    mutationFn: deleteUpload,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['uploads'] }),
  })

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
                    <button
                      onClick={() => {
                        if (confirm('Excluir esta imagem?')) remove.mutate(upload.id)
                      }}
                      disabled={remove.isPending}
                      className="absolute right-2 top-2 rounded-md bg-destructive px-2 py-1 text-xs text-destructive-foreground opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
                    >
                      Excluir
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
    </div>
  )
}
