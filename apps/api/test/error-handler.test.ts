import { describe, it, expect, vi } from 'vitest'
import type { Request, Response } from 'express'
import { Prisma } from '@prisma/client'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { errorHandler } from '../src/middlewares/error-handler.js'
import { appError } from '../src/shared/errors.js'

/**
 * A tradução erro → HTTP. O que importa aqui é o `code` e o `status`: é neles
 * que o front reage, nunca no texto.
 */

const run = (err: unknown) => {
  const json = vi.fn()
  const res = { status: vi.fn().mockReturnValue({ json }) } as unknown as Response
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const req = { requestId: 'req-1', log } as unknown as Request

  errorHandler(err, req, res, vi.fn())

  return {
    status: (res.status as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as number,
    body: json.mock.calls[0]?.[0] as { error: { code: string; message: string } },
  }
}

const prismaError = (code: string, meta?: Record<string, unknown>) =>
  new Prisma.PrismaClientKnownRequestError('erro do banco', {
    code,
    clientVersion: 'test',
    ...(meta ? { meta } : {}),
  })

describe('errorHandler', () => {
  it('AppError mantém o próprio code e status', () => {
    const { status, body } = run(appError(ERROR_CODES.CART_EMPTY, 'Carrinho vazio', 422))
    expect(status).toBe(422)
    expect(body.error.code).toBe(ERROR_CODES.CART_EMPTY)
  })

  it('P2002 (unique) vira 409 CONFLICT', () => {
    const { status, body } = run(prismaError('P2002', { target: ['slug'] }))
    expect(status).toBe(409)
    expect(body.error.code).toBe(ERROR_CODES.CONFLICT)
  })

  it('P2025 (não encontrado) vira 404', () => {
    const { status, body } = run(prismaError('P2025'))
    expect(status).toBe(404)
    expect(body.error.code).toBe(ERROR_CODES.NOT_FOUND)
  })

  /*
   * Regressão: apontar para um id inexistente é o cliente errando (422), não
   * falha de servidor. Sem este mapeamento, criar categoria sem imagem chegava
   * ao usuário como "Erro interno. Tente novamente." — um 500 mudo.
   */
  it('P2003 (FK inválida) vira 422 VALIDATION_ERROR, não 500', () => {
    const { status, body } = run(prismaError('P2003', { field_name: 'imageId' }))
    expect(status).toBe(422)
    expect(body.error.code).toBe(ERROR_CODES.VALIDATION_ERROR)
  })

  it('erro desconhecido vira 500 sem vazar detalhe', () => {
    const { status, body } = run(new Error('connection reset by peer'))
    expect(status).toBe(500)
    expect(body.error.code).toBe(ERROR_CODES.INTERNAL_ERROR)
  })
})
