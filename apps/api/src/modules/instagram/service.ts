import {
  ERROR_CODES,
  parseInstagramPostUrl,
  type CreateInstagramPostInput,
  type InstagramPost,
  type PublicInstagramPost,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { appError, conflict, notFound } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, type AuditContext } from '../../shared/audit.js'
import { storage, buildUploadKey } from '../../integrations/storage/index.js'
import { fetchPostImage } from '../../integrations/instagram/client.js'

/**
 * Posts da seção "No Instagram" da home. Dezenas de registros no máximo — sem
 * paginação nem repository, como banners.
 */

const SELECT = {
  id: true,
  shortcode: true,
  permalink: true,
  caption: true,
  imageId: true,
  position: true,
  createdAt: true,
  image: { select: { key: true } },
} satisfies Prisma.InstagramPostSelect

type Row = Prisma.InstagramPostGetPayload<{ select: typeof SELECT }>

const ORDER_BY = [{ position: 'asc' }, { createdAt: 'asc' }] satisfies Prisma.InstagramPostOrderByWithRelationInput[]

const toDTO = (row: Row): InstagramPost => ({
  id: row.id,
  shortcode: row.shortcode,
  permalink: row.permalink,
  caption: row.caption,
  imageId: row.imageId,
  imageUrl: storage().getPublicUrl(row.image.key),
  position: row.position,
  createdAt: row.createdAt.toISOString(),
})

const toPublicDTO = (row: Row): PublicInstagramPost => {
  const { id, permalink, caption, imageUrl } = toDTO(row)
  return { id, permalink, caption, imageUrl }
}

const findAll = () =>
  prisma.instagramPost.findMany({
    where: { storeId: getActiveStoreId() },
    select: SELECT,
    orderBy: ORDER_BY,
  })

export const listPublicInstagramPosts = async (): Promise<PublicInstagramPost[]> =>
  (await findAll()).map(toPublicDTO)

export const listInstagramPosts = async (): Promise<InstagramPost[]> =>
  (await findAll()).map(toDTO)

const DUPLICATE = 'Este post já está na lista'

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

/**
 * Baixa a imagem do post e a registra como Upload. Devolve o id do upload e a
 * legenda lida do post.
 */
const importImage = async (
  permalink: string,
  shortcode: string,
  userId: string | undefined,
): Promise<{ uploadId: string; caption: string | null; key: string }> => {
  const storeId = getActiveStoreId()
  const image = await fetchPostImage(permalink)
  const ext = image.mimeType.split('/')[1]!.replace('jpeg', 'jpg')
  const filename = `${shortcode}.${ext}`
  const key = buildUploadKey({ storeId, folder: 'instagram', filename })

  await storage().putObject(key, image.body, image.mimeType)

  const upload = await prisma.upload.create({
    data: {
      storeId,
      key,
      filename,
      mimeType: image.mimeType,
      size: image.body.length,
      folder: 'instagram',
      userId: userId ?? null,
    },
    select: { id: true },
  })

  return { uploadId: upload.id, caption: image.caption, key }
}

/** Posse verificada no SERVICE: um id forjado não pode virar foto da vitrine. */
const assertImageOwned = async (imageId: string): Promise<void> => {
  const upload = await prisma.upload.findFirst({
    where: { id: imageId, storeId: getActiveStoreId() },
    select: { id: true },
  })
  if (!upload) throw appError(ERROR_CODES.VALIDATION_ERROR, 'Imagem não encontrada', 422)
}

export const createInstagramPost = async (
  input: CreateInstagramPostInput,
  ctx: AuditContext,
): Promise<InstagramPost> => {
  const storeId = getActiveStoreId()
  // O schema já validou; o parse aqui é para obter o shortcode normalizado.
  const parsed = parseInstagramPostUrl(input.url)
  if (!parsed) throw appError(ERROR_CODES.VALIDATION_ERROR, 'Link de post do Instagram inválido', 422)

  // Checagem barata ANTES de ir ao Instagram: colar o mesmo link duas vezes não
  // deve baixar e gravar uma imagem que vai ser descartada.
  const existing = await prisma.instagramPost.findFirst({
    where: { storeId, shortcode: parsed.shortcode },
    select: { id: true },
  })
  if (existing) throw conflict(DUPLICATE)

  let imageId: string
  let caption: string | null = null
  let importedKey: string | null = null

  if (input.imageId) {
    await assertImageOwned(input.imageId)
    imageId = input.imageId
  } else {
    const imported = await importImage(parsed.permalink, parsed.shortcode, ctx.userId)
    imageId = imported.uploadId
    caption = imported.caption
    importedKey = imported.key
  }

  const last = await prisma.instagramPost.aggregate({
    where: { storeId },
    _max: { position: true },
  })

  let row: Row
  try {
    row = await prisma.instagramPost.create({
      data: {
        storeId,
        shortcode: parsed.shortcode,
        permalink: parsed.permalink,
        caption,
        imageId,
        // Entra no fim da grade: quem cola um post novo decide depois se o arrasta.
        position: (last._max.position ?? -1) + 1,
      },
      select: SELECT,
    })
  } catch (err) {
    // A imagem baixada agora não ilustra nada: sem limpar, vira órfã no bucket.
    if (importedKey) await discardImport(imageId, importedKey)
    if (isUniqueViolation(err)) throw conflict(DUPLICATE)
    throw err
  }

  await audit({
    action: EVENTS.instagramPost.created,
    entityType: 'InstagramPost',
    entityId: row.id,
    changes: { permalink: { from: null, to: row.permalink } },
    context: ctx,
  })

  return toDTO(row)
}

const discardImport = async (uploadId: string, key: string): Promise<void> => {
  try {
    await storage().delete(key)
    await prisma.upload.delete({ where: { id: uploadId } })
  } catch (err) {
    logger.warn({ err, uploadId }, 'Falha ao descartar imagem importada do Instagram')
  }
}

/**
 * Recebe a lista inteira na nova ordem. Exigir TODOS os ids (nem mais, nem
 * menos) evita que duas abas abertas gravem posições de listas diferentes.
 */
export const reorderInstagramPosts = async (ids: string[], ctx: AuditContext): Promise<InstagramPost[]> => {
  const storeId = getActiveStoreId()
  const current = await prisma.instagramPost.findMany({
    where: { storeId },
    select: { id: true },
    orderBy: ORDER_BY,
  })

  const known = new Set(current.map((p) => p.id))
  const sameSet = ids.length === known.size && new Set(ids).size === ids.length && ids.every((id) => known.has(id))
  if (!sameSet) throw conflict('A lista de posts mudou. Recarregue a página e tente de novo.')

  await prisma.$transaction(
    ids.map((id, position) =>
      prisma.instagramPost.update({ where: { id }, data: { position }, select: { id: true } }),
    ),
  )

  await audit({
    action: EVENTS.instagramPost.reordered,
    entityType: 'InstagramPost',
    entityId: storeId,
    changes: { order: { from: current.map((p) => p.id), to: ids } },
    context: ctx,
  })

  return listInstagramPosts()
}

/**
 * Hard delete. A imagem sai junto quando era só deste post (o caso normal);
 * se o mesmo upload ilustra outra coisa, fica — apagar quebraria a outra tela.
 */
export const deleteInstagramPost = async (id: string, ctx: AuditContext): Promise<void> => {
  const storeId = getActiveStoreId()
  const post = await prisma.instagramPost.findFirst({
    where: { id, storeId },
    select: {
      id: true,
      permalink: true,
      image: {
        select: {
          id: true,
          key: true,
          _count: { select: { productImages: true, banners: true, categories: true, instagramPosts: true } },
        },
      },
    },
  })
  if (!post) throw notFound('Post')

  const { productImages, banners, categories, instagramPosts } = post.image._count
  const exclusive = productImages + banners + categories === 0 && instagramPosts === 1

  if (exclusive) {
    // Storage ANTES do banco, como em uploads: falha no storage aborta e deixa
    // tudo recuperável. O delete do Upload leva o post junto (Cascade).
    await storage().delete(post.image.key)
    await prisma.upload.delete({ where: { id: post.image.id } })
  } else {
    await prisma.instagramPost.delete({ where: { id } })
  }

  await audit({
    action: EVENTS.instagramPost.deleted,
    entityType: 'InstagramPost',
    entityId: id,
    changes: { permalink: { from: post.permalink, to: null } },
    context: ctx,
  })
}
