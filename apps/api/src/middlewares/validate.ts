import type { Request, Response, NextFunction, RequestHandler } from 'express'
import { z, type ZodType } from 'zod'
import { validationError } from '../shared/errors.js'
import type { ErrorDetail } from '@ecommerce/shared/contracts'

/**
 * O ÚNICO validador do projeto (docs/arquitetura.md §5).
 *
 * É por causa deste arquivo que `products/validator.ts` não existe. Aquele arquivo,
 * presente em todo boilerplate de Express, contém sempre a mesma função com o
 * schema trocado — ou seja, um parâmetro travestido de arquivo. Um middleware
 * genérico substitui dezessete cópias.
 *
 * Quando o Zod não basta ("o SKU já existe?"), isso é regra de negócio: mora no
 * service, que tem banco. Não em um validator, que não tem.
 *
 *   router.post('/', authenticate, requireRole('ADMIN'),
 *     validate({ body: createProductSchema }), createProductController)
 */

type ValidationTargets = {
  body?: ZodType
  query?: ZodType
  params?: ZodType
}

const toDetails = (error: z.ZodError, target: string): ErrorDetail[] =>
  error.issues.map((issue) => ({
    field: issue.path.length ? issue.path.join('.') : target,
    message: issue.message,
  }))

export const validate = (targets: ValidationTargets): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const details: ErrorDetail[] = []

    for (const key of ['body', 'query', 'params'] as const) {
      const schema = targets[key]
      if (!schema) continue

      const result = schema.safeParse(req[key])

      if (!result.success) {
        details.push(...toDetails(result.error, key))
        continue
      }

      // Substituir pelo valor PARSEADO é o detalhe que faz a diferença:
      // `?page=2` chega ao handler como number com default aplicado, não como
      // string — sem Number() espalhado por controller nenhum.
      //
      // Em Express 5 req.query é getter-only; definir a propriedade é a via oficial.
      Object.defineProperty(req, key, { value: result.data, writable: true, configurable: true })
    }

    if (details.length) return next(validationError(details))
    next()
  }
}
