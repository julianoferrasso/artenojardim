import { z } from 'zod'
import { paginationQuerySchema, uploadFolderSchema } from '@ecommerce/shared/contracts'

/**
 * Query da listagem da biblioteca de mídia. É input só desta rota (não é
 * contrato reusado pelo front além da chamada), então vive aqui em vez de em
 * shared/contracts.
 */
export const listUploadsQuerySchema = paginationQuerySchema.extend({
  folder: uploadFolderSchema.optional(),
})

export type ListUploadsQuery = z.infer<typeof listUploadsQuerySchema>
