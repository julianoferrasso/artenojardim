import type { Request, Response } from 'express'
import type { CreateAddressInput, UpdateAddressInput } from '@ecommerce/shared/contracts'
import { zipCodeSchema } from '@ecommerce/shared/constants'
import { ok, created, noContent } from '../../shared/http.js'
import { validationError } from '../../shared/errors.js'
import * as service from './service.js'

export const listController = async (req: Request, res: Response): Promise<void> => {
  ok(res, await service.listAddresses(req.auth!.sub))
}

export const createController = async (req: Request, res: Response): Promise<void> => {
  created(res, await service.createAddress(req.auth!.sub, req.body as CreateAddressInput))
}

export const updateController = async (req: Request, res: Response): Promise<void> => {
  ok(
    res,
    await service.updateAddress(req.auth!.sub, req.params['id'] as string, req.body as UpdateAddressInput),
  )
}

export const deleteController = async (req: Request, res: Response): Promise<void> => {
  await service.deleteAddress(req.auth!.sub, req.params['id'] as string)
  noContent(res)
}

/**
 * Consulta de CEP — pública. Útil também no checkout de guest (sem conta ainda).
 * O CEP vem na URL; valida com o mesmo schema (normaliza para 8 dígitos).
 */
export const cepController = async (req: Request, res: Response): Promise<void> => {
  const parsed = zipCodeSchema.safeParse(req.params['cep'])
  if (!parsed.success) {
    throw validationError([{ field: 'cep', message: 'CEP inválido' }])
  }
  ok(res, await service.lookupAddressByCep(parsed.data))
}
