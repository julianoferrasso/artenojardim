import { ROUTES } from '@ecommerce/shared/constants'
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  type Upload,
  type UploadFolder,
} from '@ecommerce/shared/contracts'
import { apiFetch, ApiError } from './api'

/**
 * Orquestra o upload de 3 passos (presign → PUT → confirm) num só lugar.
 *
 * Produtos e CMS vão precisar disso; sem esta função, cada um repetiria a dança
 * e um deles esqueceria de ler as dimensões, ou de tratar o PUT que falha no
 * meio. É o caso de reuso que justifica extrair — não especulação.
 *
 * O PUT vai DIRETO ao storage (R2 em prod, /uploads/direct em dev). A API nunca
 * vê o arquivo: sem multer, sem base64, sem pico de memória no servidor.
 */

export type UploadProgress = 'validating' | 'uploading' | 'confirming'

export class UploadError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message)
    this.name = 'UploadError'
  }
}

/** Lê largura/altura no browser. O storage guarda o original; estas dimensões
 *  vão para o banco para o front reservar o espaço da imagem e evitar layout
 *  shift, sem precisar baixar o arquivo para medir. */
const readImageSize = (file: File): Promise<{ width: number; height: number } | undefined> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(undefined)
    }
    img.src = url
  })

export const uploadImage = async (
  file: File,
  folder: UploadFolder,
  onProgress?: (stage: UploadProgress) => void,
): Promise<Upload> => {
  onProgress?.('validating')

  // Valida no cliente com os MESMOS limites do contrato. Não é a barreira de
  // verdade — a API revalida — mas dá erro imediato em vez de gastar um round-trip.
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new UploadError('Formato não suportado. Use JPG, PNG, WebP ou AVIF.', 'UNSUPPORTED_FILE_TYPE')
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadError('Arquivo maior que 10 MB.', 'FILE_TOO_LARGE')
  }

  const dimensions = await readImageSize(file)

  // 1. presign
  const presign = await apiFetch<{ uploadUrl: string; method: string; headers: Record<string, string>; key: string }>(
    ROUTES.uploads.presign,
    {
      method: 'POST',
      body: JSON.stringify({ filename: file.name, mimeType: file.type, size: file.size, folder }),
    },
  )

  // 2. PUT direto no storage. NÃO passa por apiFetch: a URL é do storage (ou da
  // rota /direct), não da API, e o corpo é binário, não JSON.
  onProgress?.('uploading')
  const putRes = await fetch(presign.uploadUrl, {
    method: 'PUT',
    headers: {
      ...presign.headers,
      // O driver local exige o token na query (já está na URL); o R2 não usa
      // Authorization no PUT assinado. Em nenhum dos dois mandamos o Bearer —
      // mas garantimos que ele NÃO vaze para o storage de terceiro.
    },
    body: file,
  })
  if (!putRes.ok) {
    throw new UploadError('Falha ao enviar o arquivo. Tente novamente.', 'UPLOAD_FAILED')
  }

  // 3. confirm — só agora o Upload nasce no banco
  onProgress?.('confirming')
  try {
    return await apiFetch<Upload>(ROUTES.uploads.confirm, {
      method: 'POST',
      body: JSON.stringify({ key: presign.key, ...dimensions }),
    })
  } catch (err) {
    if (err instanceof ApiError) throw new UploadError(err.message, err.code)
    throw err
  }
}

export const deleteUpload = (id: string): Promise<void> =>
  apiFetch<void>(ROUTES.uploads.detail(id), { method: 'DELETE' })
