import { z } from 'zod'

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

export const UPLOAD_FOLDERS = ['products', 'categories', 'banners', 'pages'] as const
export const uploadFolderSchema = z.enum(UPLOAD_FOLDERS)
export type UploadFolder = z.infer<typeof uploadFolderSchema>

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  folder: uploadFolderSchema,
})

export type PresignUploadInput = z.infer<typeof presignUploadSchema>

/**
 * O browser recebe uma URL e faz PUT nela. Com R2 aponta para o bucket;
 * com o driver local aponta para a própria API. O front é idêntico nos dois casos —
 * é isso que torna `local.ts` uma implementação de verdade, e não uma gambiarra de dev.
 */
export const presignUploadResponseSchema = z.object({
  data: z.object({
    uploadUrl: z.string(),
    method: z.literal('PUT'),
    headers: z.record(z.string(), z.string()),
    key: z.string(),
  }),
})

export const confirmUploadSchema = z.object({
  key: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>

export const uploadSchema = z.object({
  id: z.string(),
  key: z.string(),
  url: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  createdAt: z.string(),
})

export type Upload = z.infer<typeof uploadSchema>
