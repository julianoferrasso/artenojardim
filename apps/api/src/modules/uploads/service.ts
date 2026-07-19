import {
  ERROR_CODES,
  type PresignUploadInput,
  type ConfirmUploadInput,
  type Upload,
} from '@ecommerce/shared/contracts'
import { prisma } from '../../config/prisma.js'
import { appError, notFound } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { storage, buildUploadKey } from '../../integrations/storage/index.js'

/**
 * Uploads. O arquivo NUNCA passa pela API: o browser recebe uma URL assinada e
 * faz PUT direto no storage (docs/arquitetura.md §13). Por isso não há multer
 * aqui, nem disco temporário, nem limite de body para megabytes.
 *
 * O fluxo tem dois passos de propósito:
 *   presign  → reserva a key e devolve a URL de escrita
 *   confirm  → registra o Upload só depois que o PUT deu certo
 *
 * Um passo só (registrar no presign) encheria o banco de linhas para uploads que
 * o usuário abandonou no seletor de arquivo. Separar mantém a tabela honesta:
 * uma linha em Upload significa "o byte está lá".
 */

const toDTO = (row: {
  id: string
  key: string
  filename: string
  mimeType: string
  size: number
  width: number | null
  height: number | null
  createdAt: Date
}): Upload => ({
  id: row.id,
  key: row.key,
  // A URL é DERIVADA da key, nunca lida do banco: trocar de provedor de storage
  // não pode exigir um UPDATE em toda a tabela.
  url: storage().getPublicUrl(row.key),
  filename: row.filename,
  mimeType: row.mimeType,
  size: row.size,
  width: row.width,
  height: row.height,
  createdAt: row.createdAt.toISOString(),
})

export const presignUpload = async (
  input: PresignUploadInput,
): Promise<{ uploadUrl: string; method: 'PUT'; headers: Record<string, string>; key: string }> => {
  const key = buildUploadKey({
    storeId: getActiveStoreId(),
    folder: input.folder,
    filename: input.filename,
  })

  const target = await storage().getUploadUrl(key, input.mimeType)
  return { uploadUrl: target.uploadUrl, method: 'PUT', headers: target.headers, key }
}

export const confirmUpload = async (
  input: ConfirmUploadInput,
  userId: string,
): Promise<Upload> => {
  const store = storage()

  // Posse ANTES de existência: a checagem de tenant é local e barata, o
  // exists() é um round-trip ao storage. Além da ordem importar por custo, ela
  // importa pela mensagem — uma key de outra loja deve receber "sem permissão",
  // não "não encontrado", que é o que a checagem de existência devolveria.
  // A key foi gerada por nós no presign e embute o storeId.
  if (!input.key.startsWith(`store/${getActiveStoreId()}/`)) {
    throw appError(ERROR_CODES.FORBIDDEN, 'Chave de upload inválida', 403)
  }

  // Confia mas verifica: o cliente diz que fez o PUT, mas quem confirma é o
  // storage. Sem isto, um confirm forjado criaria uma linha apontando para um
  // arquivo que não existe, e o card do produto renderiza uma imagem quebrada.
  if (!(await store.exists(input.key))) {
    throw appError(
      ERROR_CODES.NOT_FOUND,
      'Arquivo não encontrado no storage. O upload não foi concluído.',
      422,
    )
  }

  const filename = input.key.split('/').pop() ?? input.key

  const row = await prisma.upload.upsert({
    // Idempotente: um duplo-clique no confirm não cria duas linhas para o mesmo
    // byte. A key é única no schema.
    where: { key: input.key },
    create: {
      storeId: getActiveStoreId(),
      key: input.key,
      filename,
      mimeType: guessMimeFromKey(input.key),
      size: 0,
      width: input.width ?? null,
      height: input.height ?? null,
      userId,
    },
    update: {
      width: input.width ?? null,
      height: input.height ?? null,
    },
    select: {
      id: true,
      key: true,
      filename: true,
      mimeType: true,
      size: true,
      width: true,
      height: true,
      createdAt: true,
    },
  })

  return toDTO(row)
}

export const listUploads = async (params: {
  folder?: string
  skip: number
  take: number
}): Promise<{ items: Upload[]; total: number }> => {
  const where = {
    storeId: getActiveStoreId(),
    ...(params.folder ? { folder: params.folder } : {}),
  }

  // Paralelo: a contagem e a página não dependem uma da outra.
  const [rows, total] = await Promise.all([
    prisma.upload.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: params.skip,
      take: params.take,
      select: {
        id: true,
        key: true,
        filename: true,
        mimeType: true,
        size: true,
        width: true,
        height: true,
        createdAt: true,
      },
    }),
    prisma.upload.count({ where }),
  ])

  return { items: rows.map(toDTO), total }
}

export const deleteUpload = async (id: string): Promise<void> => {
  const upload = await prisma.upload.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: { id: true, key: true },
  })
  if (!upload) throw notFound('Upload')

  // Remove do storage ANTES do banco: se a ordem fosse inversa e o storage
  // falhasse, o registro sumiria e o arquivo ficaria órfão para sempre, sem
  // ninguém sabendo que ele existe para limpar. Com esta ordem, um erro no
  // storage aborta tudo e o registro permanece — recuperável.
  await storage().delete(upload.key)
  await prisma.upload.delete({ where: { id: upload.id } })
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
}

const guessMimeFromKey = (key: string): string => {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}
