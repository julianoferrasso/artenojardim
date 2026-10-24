import {
  ERROR_CODES,
  bannerBackdropSchema,
  type Banner,
  type BannerBackdrop,
  type CreateBannerInput,
  type PublicBanner,
  type UpdateBannerInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { appError, notFound } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit, diff, type AuditContext } from '../../shared/audit.js'
import { storage } from '../../integrations/storage/index.js'

/**
 * Banners do carrossel da home. São ~4 registros por loja — por isso não há
 * paginação nem repository: o service faz as chamadas Prisma direto.
 */

const SELECT = {
  id: true,
  title: true,
  subtitle: true,
  buttonLabel: true,
  linkUrl: true,
  imageId: true,
  backdrop: true,
  layout: true,
  blurBehindText: true,
  position: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  image: { select: { key: true, width: true, height: true } },
} satisfies Prisma.BannerSelect

type Row = Prisma.BannerGetPayload<{ select: typeof SELECT }>

/**
 * O Json do banco passa pelo MESMO schema da escrita na volta: uma linha
 * editada à mão no banco com formato errado vira "sem fundo" (a loja cai na cor
 * do tema), em vez de um degradê quebrado na home.
 */
const parseBackdrop = (value: Prisma.JsonValue): BannerBackdrop | null => {
  const parsed = bannerBackdropSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

const toDTO = (row: Row): Banner => ({
  id: row.id,
  title: row.title,
  subtitle: row.subtitle,
  buttonLabel: row.buttonLabel,
  linkUrl: row.linkUrl,
  imageId: row.imageId,
  // URL derivada da key a cada leitura, nunca persistida — trocar de provedor
  // de storage não pode exigir um UPDATE.
  imageUrl: row.image ? storage().getPublicUrl(row.image.key) : null,
  imageWidth: row.image?.width ?? null,
  imageHeight: row.image?.height ?? null,
  backdrop: row.image ? parseBackdrop(row.backdrop) : null,
  layout: row.layout,
  blurBehindText: row.blurBehindText,
  position: row.position,
  isActive: row.isActive,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

/** A projeção pública: sem imageId/isActive/position — só o que o slide pinta. */
const toPublicDTO = (row: Row): PublicBanner => {
  const dto = toDTO(row)
  return {
    id: dto.id,
    title: dto.title,
    subtitle: dto.subtitle,
    buttonLabel: dto.buttonLabel,
    linkUrl: dto.linkUrl,
    imageUrl: dto.imageUrl,
    imageWidth: dto.imageWidth,
    imageHeight: dto.imageHeight,
    backdrop: dto.backdrop,
    layout: dto.layout,
    blurBehindText: dto.blurBehindText,
  }
}

export const listPublicBanners = async (): Promise<PublicBanner[]> => {
  const rows = await prisma.banner.findMany({
    where: { storeId: getActiveStoreId(), isActive: true },
    select: SELECT,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toPublicDTO)
}

export const listBanners = async (): Promise<Banner[]> => {
  const rows = await prisma.banner.findMany({
    where: { storeId: getActiveStoreId() },
    select: SELECT,
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
  })
  return rows.map(toDTO)
}

/**
 * Posse verificada no SERVICE, não na rota: `requireStaff` diz quem é, não diz
 * que este upload é desta loja. Sem isto, um id forjado vira imagem do banner.
 */
const assertImageOwned = async (imageId: string): Promise<void> => {
  const upload = await prisma.upload.findFirst({
    where: { id: imageId, storeId: getActiveStoreId() },
    select: { id: true },
  })
  if (!upload) throw appError(ERROR_CODES.VALIDATION_ERROR, 'Imagem não encontrada', 422)
}

export const createBanner = async (
  input: CreateBannerInput,
  ctx: AuditContext,
): Promise<Banner> => {
  if (input.imageId) await assertImageOwned(input.imageId)

  // `||` e não `??`: string vazia também precisa virar null (FK inexistente).
  const imageId = input.imageId || null

  const row = await prisma.banner.create({
    data: {
      storeId: getActiveStoreId(),
      title: input.title,
      subtitle: input.subtitle ?? null,
      buttonLabel: input.buttonLabel ?? null,
      linkUrl: input.linkUrl ?? null,
      imageId,
      // Fundo é a borda DA FOTO: sem foto, não há o que prolongar.
      backdrop: imageId && input.backdrop ? input.backdrop : Prisma.DbNull,
      layout: input.layout ?? 'SIDE',
      blurBehindText: input.blurBehindText ?? true,
      position: input.position ?? 0,
      isActive: input.isActive ?? true,
    },
    select: SELECT,
  })

  await audit({
    action: EVENTS.banner.created,
    entityType: 'Banner',
    entityId: row.id,
    changes: { title: { from: null, to: row.title } },
    context: ctx,
  })

  return toDTO(row)
}

export const updateBanner = async (
  id: string,
  input: UpdateBannerInput,
  ctx: AuditContext,
): Promise<Banner> => {
  const current = await prisma.banner.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: SELECT,
  })
  if (!current) throw notFound('Banner')

  if (input.imageId) await assertImageOwned(input.imageId)

  const data: Prisma.BannerUpdateInput = {}
  if (input.title !== undefined) data.title = input.title
  if (input.subtitle !== undefined) data.subtitle = input.subtitle
  if (input.buttonLabel !== undefined) data.buttonLabel = input.buttonLabel
  if (input.linkUrl !== undefined) data.linkUrl = input.linkUrl
  if (input.imageId !== undefined) data.image = input.imageId
    ? { connect: { id: input.imageId } }
    : { disconnect: true }
  if (input.backdrop !== undefined) data.backdrop = input.backdrop ?? Prisma.DbNull
  // Tirar a foto leva o fundo junto, mesmo que o cliente não mande o backdrop.
  if (input.imageId !== undefined && !input.imageId) data.backdrop = Prisma.DbNull
  if (input.layout !== undefined) data.layout = input.layout
  if (input.blurBehindText !== undefined) data.blurBehindText = input.blurBehindText
  if (input.position !== undefined) data.position = input.position
  if (input.isActive !== undefined) data.isActive = input.isActive

  const row = await prisma.banner.update({ where: { id }, data, select: SELECT })

  const changes = diff(
    {
      title: current.title,
      subtitle: current.subtitle,
      buttonLabel: current.buttonLabel,
      linkUrl: current.linkUrl,
      imageId: current.imageId,
      backdrop: current.backdrop,
      layout: current.layout,
      blurBehindText: current.blurBehindText,
      position: current.position,
      isActive: current.isActive,
    },
    {
      title: row.title,
      subtitle: row.subtitle,
      buttonLabel: row.buttonLabel,
      linkUrl: row.linkUrl,
      imageId: row.imageId,
      backdrop: row.backdrop,
      layout: row.layout,
      blurBehindText: row.blurBehindText,
      position: row.position,
      isActive: row.isActive,
    },
  )

  // Só audita se algo mudou de fato — salvar o form sem tocar em nada não vira log.
  if (Object.keys(changes).length > 0) {
    await audit({
      action: EVENTS.banner.updated,
      entityType: 'Banner',
      entityId: id,
      changes,
      context: ctx,
    })
  }

  return toDTO(row)
}

/** Hard delete: banner não é documento histórico como pedido ou movimento. */
export const deleteBanner = async (id: string, ctx: AuditContext): Promise<void> => {
  const banner = await prisma.banner.findFirst({
    where: { id, storeId: getActiveStoreId() },
    select: { id: true, title: true },
  })
  if (!banner) throw notFound('Banner')

  await prisma.banner.delete({ where: { id } })

  await audit({
    action: EVENTS.banner.deleted,
    entityType: 'Banner',
    entityId: id,
    changes: { title: { from: banner.title, to: null } },
    context: ctx,
  })
}
