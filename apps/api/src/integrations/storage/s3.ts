import { S3Client, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../../config/env.js'
import { externalServiceError } from '../../shared/errors.js'
import type { StorageProvider, UploadTarget } from './types.js'

/**
 * Driver de PRODUÇÃO: AWS S3 nativo.
 *
 * Existe ao lado do r2.ts, não no lugar dele. O motivo é operacional, não técnico:
 * a conta AWS já está de pé para o SES (domínio verificado, DKIM publicado), então
 * subir o S3 custou um bucket e um usuário IAM — o R2 custaria uma segunda conta de
 * nuvem, um segundo par de credenciais e um segundo lugar onde a fatura surpreende.
 * O argumento de egress do §13 continua válido e o r2.ts continua no registry:
 * quando a banda de imagem doer, é uma variável de ambiente para voltar.
 *
 * A diferença de código para o R2 é de duas linhas: não setamos `endpoint` (o SDK
 * deriva o da AWS a partir da region) e a region é real, não 'auto'. Isso é a prova
 * de que a interface fez o trabalho dela.
 *
 * O bucket é PÚBLICO para leitura (bucket policy com s3:GetObject em store/*) e
 * privado para escrita — quem escreve é a URL assinada de 5 minutos gerada aqui.
 * Sem CloudFront por ora: a origem responde direto e o next/image na frente já
 * cacheia as derivadas.
 */

// env.ts já garantiu que estas variáveis existem quando STORAGE_DRIVER=s3.
const client = () =>
  new S3Client({
    region: env.S3_REGION,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
    // NÃO REMOVER. Desde a 3.729.0 o SDK calcula um CRC32 por padrão — e numa URL
    // assinada não existe corpo ainda, então ele assina o checksum do VAZIO
    // (`x-amz-checksum-crc32=AAAAAA==`) e congela essa afirmação na query string.
    // O browser depois manda o arquivo de verdade, o S3 compara com o CRC32 do
    // vazio e recusa o PUT. Com WHEN_REQUIRED o parâmetro simplesmente não é
    // emitido. A integridade não se perde: o TLS já protege o transporte.
    requestChecksumCalculation: 'WHEN_REQUIRED',
  })

export const createS3Storage = (): StorageProvider => {
  const s3 = client()
  const bucket = env.S3_BUCKET!

  // Sem CDN, a URL pública é o endpoint virtual-hosted do próprio bucket.
  // S3_PUBLIC_URL existe para o dia em que entrar CloudFront ou domínio próprio:
  // troca a variável e nem esta linha nem o banco mudam, porque a URL é sempre
  // derivada da key.
  const publicUrl = (
    env.S3_PUBLIC_URL ?? `https://${bucket}.s3.${env.S3_REGION}.amazonaws.com`
  ).replace(/\/$/, '')

  return {
    id: 's3',

    getUploadUrl: async (key: string, mimeType: string): Promise<UploadTarget> => {
      try {
        const uploadUrl = await getSignedUrl(
          s3,
          new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: mimeType }),
          // signableHeaders: sem isto o SDK assina só o `host`, e a URL aceitaria
          // um PUT com QUALQUER Content-Type — o presign valida o mime contra a
          // allowlist, mas o upload poderia subir outro. Assinado, o browser é
          // obrigado a mandar exatamente este valor, senão o S3 responde 403
          // SignatureDoesNotMatch. É o mesmo header que o front já devolve
          // (apps/admin/src/lib/upload.ts) — não adicione outros headers ao PUT.
          { expiresIn: 300, signableHeaders: new Set(['content-type']) },
        )

        return {
          uploadUrl,
          method: 'PUT',
          headers: { 'Content-Type': mimeType },
          key,
        }
      } catch (err) {
        throw externalServiceError('S3', err)
      }
    },

    getPublicUrl: (key: string): string => `${publicUrl}/${key}`,

    delete: async (key: string): Promise<void> => {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      } catch (err) {
        throw externalServiceError('S3', err)
      }
    },

    exists: async (key: string): Promise<boolean> => {
      try {
        await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }))
        return true
      } catch (err) {
        // Depende de s3:ListBucket na policy do usuário IAM: sem essa permissão o
        // S3 não revela existência e responde 403 (Forbidden) em vez de 404 numa
        // key inexistente — o confirmUpload devolveria 502 no lugar do 422 certo.
        if ((err as { name?: string }).name === 'NotFound') return false
        throw externalServiceError('S3', err)
      }
    },
  }
}
