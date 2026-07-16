import type { Response } from 'express'
import type { PaginationMeta } from '@ecommerce/shared/contracts'

/**
 * Envelope padronizado. Existe para que acrescentar `meta` nunca seja breaking
 * change — um array cru virando `{data, meta}` quebraria todo cliente.
 */

export const ok = <T>(res: Response, data: T): Response => res.status(200).json({ data })

export const created = <T>(res: Response, data: T): Response => res.status(201).json({ data })

export const noContent = (res: Response): Response => res.status(204).send()

export const paginated = <T>(res: Response, data: T[], meta: PaginationMeta): Response =>
  res.status(200).json({ data, meta })
