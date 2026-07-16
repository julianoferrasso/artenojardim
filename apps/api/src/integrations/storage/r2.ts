import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../../config/env.js'
import { externalServiceError } from '../../shared/errors.js'
import type { StorageProvider, UploadTarget } from './types.js'

/**
 * Driver de PRODUÇÃO: Cloudflare R2, S3-compatível.
 *
 * R2 e não S3 por um motivo concreto: R2 não cobra egress. Em e-commerce a banda
 * de imagem é o custo dominante, e no S3 ela cresce junto com o tráfego —
 * exatamente quando você menos quer uma conta surpresa.
 */

// env.ts já garantiu que estas variáveis existem quando STORAGE_DRIVER=r2.
const client = () =>
  new S3Client({
    region: 'auto',
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  })

export const createR2Storage = (): StorageProvider => {
  const s3 = client()
  const bucket = env.R2_BUCKET!
  const publicUrl = env.R2_PUBLIC_URL!.replace(/\/$/, '')

  return {
    id: 'r2',

    getUploadUrl: async (key: string, mimeType: string): Promise<UploadTarget> => {
      try {
        const uploadUrl = await getSignedUrl(
          s3,
          new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }),
          { expiresIn: 300 },
        )

        return {
          uploadUrl,
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          key,
        }
      } catch (err) {
        throw externalServiceError('R2', err)
      }
    },

    getPublicUrl: (key: string): string => `${publicUrl}/${key}`,

    delete: async (key: string): Promise<void> => {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      } catch (err) {
        throw externalServiceError('R2', err)
      }
    },

    exists: async (key: string): Promise<boolean> => {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (err) {
        if ((err as { name?: string }).name === 'NotFound') return false
        throw externalServiceError('R2', err)
      }
    },
  }
}
