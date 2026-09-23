import {
  ERROR_CODES,
  INSTAGRAM_MAX_ACTIVE_POSTS,
  parseInstagramInput,
  type CreateInstagramPostInput,
  type InstagramPost,
  type PublicInstagramPost,
  type UpdateInstagramPostInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { logger } from '../../config/logger.js'
import { appError, conflict, isAppError, notFound } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
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
  displayMode: true,
  captioned: true,
  isActive: true,
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
  displayMode: row.displayMode,
  captioned: row.captioned,
  isActive: row.isActive,
  imageId: row.imageId,
  imageUrl: row.image ? storage().getPublicUrl(row.image.key) : null,
  position: row.position,
  createdAt: row.createdAt.toISOString(),
})

const toPublicDTO = (row: Row): PublicInstagramPost => {
  const { id, shortcode, permalink, caption, displayMode, captioned, imageUrl } = toDTO(row)
  return { id, shortcode, permalink, caption, displayMode, captioned, imageUrl }
}

export const listPublicInstagramPosts = async (): Promise<PublicInstagramPost[]> => {
  const rows = await prisma.instagramPost.findMany({
    where: {
      storeId: getActiveStoreId(),
      isActive: true,
      // Um IMAGE cuja mídia foi apagada não tem o que pintar; EMBED não precisa dela.
      OR: [{ displayMode: 'EMBED' }, { imageId: { not: null } }],
    },
    select: SELECT,
    orderBy: ORDER_BY,
  })
  return rows.map(toPublicDTO)
}

export const listInstagramPosts = async (): Promise<InstagramPost[]> => {
  const rows = await prisma.instagramPost.findMany({
    where: { storeId: getActiveStoreId() },
    select: SELECT,
    orderBy: ORDER_BY,
  })
  return rows.map(toDTO)
}

const DUPLICATE = 'Este post já está na lista'

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'

const countActive = (tx: Prisma.TransactionClient = prisma) =>
  tx.instagramPost.count({ where: { storeId: getActiveStoreId(), isActive: true } })

type ImportedImage = { uploadId: string; caption: string | null; key: string }

/** Baixa a imagem do post e a registra como Upload. */
const importImage = async (
  permalink: string,
  shortcode: string,
  userId: string | undefined,
): Promise<ImportedImage> => {
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

/**
 * No modo EMBED a imagem é só a miniatura do admin: se o Instagram não a
 * entregar, o post entra do mesmo jeito — quem pinta a loja é o iframe.
 */
const tryImportImage = async (
  permalink: string,
  shortcode: string,
  userId: string | undefined,
): Promise<ImportedImage | null> => {
  try {
    return await importImage(permalink, shortcode, userId)
  } catch (err) {
    if (isAppError(err) && err.code === ERROR_CODES.INSTAGRAM_POST_UNAVAILABLE) return null
    throw err
  }
}

const discardImport = async (uploadId: string, key: string): Promise<void> => {
  try {
    await storage().delete(key)
    await prisma.upload.delete({ where: { id: uploadId } })
  } catch (err) {
    logger.warn({ err, uploadId }, 'Falha ao descartar imagem importada do Instagram')
  }
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
  const parsed = parseInstagramInput(input.source)
  if (!parsed) throw appError(ERROR_CODES.VALIDATION_ERROR, 'Link de post do Instagram inválido', 422)

  // Checagem barata ANTES de ir ao Instagram: colar o mesmo post duas vezes não
  // deve baixar e gravar uma imagem que vai ser descartada.
  const existing = await prisma.instagramPost.findFirst({
    where: { storeId, shortcode: parsed.shortcode },
    select: { id: true },
  })
  if (existing) throw conflict(DUPLICATE)

  let imported: ImportedImage | null = null
  let imageId: string | null = null

  if (input.imageId) {
    await assertImageOwned(input.imageId)
    imageId = input.imageId
  } else if (input.displayMode === 'IMAGE') {
    imported = await importImage(parsed.permalink, parsed.shortcode, ctx.userId)
    imageId = imported.uploadId
  } else {
    imported = await tryImportImage(parsed.permalink, parsed.shortcode, ctx.userId)
    imageId = imported?.uploadId ?? null
  }

  const [last, active] = await Promise.all([
    prisma.instagramPost.aggregate({ where: { storeId }, _max: { position: true } }),
    countActive(),
  ])

  let row: Row
  try {
    row = await prisma.instagramPost.create({
      data: {
        storeId,
        shortcode: parsed.shortcode,
        permalink: parsed.permalink,
        caption: imported?.caption ?? null,
        displayMode: input.displayMode,
        captioned: parsed.captioned,
        // Com a vitrine cheia o post entra PAUSADO em vez de ser recusado: o
        // lojista não perde o que colou e decide qual trocar.
        isActive: active < INSTAGRAM_MAX_ACTIVE_POSTS,
        imageId,
        // Entra no fim: quem cola um post novo decide depois se o arrasta.
        position: (last._max.position ?? -1) + 1,
      },
      select: SELECT,
    })
  } catch (err) {
    // A imagem baixada agora não ilustra nada: sem limpar, vira órfã no bucket.
    if (imported) await discardImport(imported.uploadId, imported.key)
    if (isUniqueViolation(err)) throw conflict(DUPLICATE)
    throw err
  }

  await audit({
    action: EVENTS.instagramPost.created,
    entityType: 'InstagramPost',
    entityId: row.id,
    changes: {
      permalink: { from: null, to: row.permalink },
      displayMode: { from: null, to: row.displayMode },
    },
    context: ctx,
  })

  return toDTO(row)
}

export const updateInstagramPost = async (
  id: string,
  input: UpdateInstagramPostInput,
  ctx: AuditContext,
): Promise<InstagramPost> => {
  const current = await prisma.instagramPost.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!current) throw notFound('Post')

  const data: Prisma.InstagramPostUpdateInput = {}
  if (input.displayMode !== undefined) data.displayMode = input.displayMode
  if (input.isActive !== undefined) data.isActive = input.isActive
  if (input.captioned !== undefined) data.captioned = input.captioned

  // Virar foto exige a foto. Post que entrou como EMBED pode não ter imagem:
  // tenta buscar agora, e a falha chega ao admin como INSTAGRAM_POST_UNAVAILABLE.
  let imported: ImportedImage | null = null
  if (input.displayMode === 'IMAGE' && !current.imageId) {
    imported = await importImage(current.permalink, current.shortcode, ctx.userId)
    data.image = { connect: { id: imported.uploadId } }
    if (!current.caption) data.caption = imported.caption
  }

  // Contagem e escrita na MESMA transação: dois "ativar" simultâneos não podem
  // passar os dois pela contagem de 17 e deixar a vitrine com 19.
  let row: Row
  try {
    row = await prisma.$transaction(async (tx) => {
      if (input.isActive && !current.isActive) {
        if ((await countActive(tx)) >= INSTAGRAM_MAX_ACTIVE_POSTS) {
          throw appError(
            ERROR_CODES.INSTAGRAM_ACTIVE_LIMIT_REACHED,
            `Limite de ${INSTAGRAM_MAX_ACTIVE_POSTS} posts ativos. Pause outro antes de ativar este.`,
            422,
          )
        }
      }
      return tx.instagramPost.update({ where: { id }, data, select: SELECT })
    })
  } catch (err) {
    if (imported) await discardImport(imported.uploadId, imported.key)
    throw err
  }

  const changes = diff(
    {
      displayMode: current.displayMode,
      isActive: current.isActive,
      captioned: current.captioned,
      imageId: current.imageId,
    },
    { displayMode: row.displayMode, isActive: row.isActive, captioned: row.captioned, imageId: row.imageId },
  )
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.instagramPost.updated,
      entityType: 'InstagramPost',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
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

  const refs = post.image?._count
  const exclusive =
    refs !== undefined && refs.productImages + refs.banners + refs.categories === 0 && refs.instagramPosts === 1

  // O post sai primeiro: com SetNull, apagar só o Upload o deixaria órfão de imagem.
  await prisma.instagramPost.delete({ where: { id } })

  if (exclusive && post.image) {
    try {
      await storage().delete(post.image.key)
      await prisma.upload.delete({ where: { id: post.image.id } })
    } catch (err) {
      // O post já saiu; uma imagem que sobrou é lixo recuperável pela biblioteca de mídia.
      logger.warn({ err, uploadId: post.image.id }, 'Falha ao apagar a imagem do post do Instagram')
    }
  }

  await audit({
    action: EVENTS.instagramPost.deleted,
    entityType: 'InstagramPost',
    entityId: id,
    changes: { permalink: { from: post.permalink, to: null } },
    context: ctx,
  })
}
