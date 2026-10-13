import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { verifyMpSignature } from '../src/integrations/mercadopago/webhook.js'

/**
 * A assinatura é a única coisa entre o endpoint público do webhook e "qualquer um
 * marca pedido como pago". Os casos fixam as duas regras do MP que não estão no
 * código óbvio: o `data.id` alfanumérico entra em minúsculas, e um par ausente
 * sai do manifest.
 */

const SECRET = 'assinatura-secreta-de-teste'
const REQUEST_ID = '2066ca19-c6f1-498a-be75-1923005edd06'
const ORDER_ID = 'ORD01JQ4S4KY8HWQ6NA5PXB65B3D3'
const TS = '1742505638683'

const sign = (manifest: string, secret = SECRET) =>
  createHmac('sha256', secret).update(manifest).digest('hex')

const header = (hash: string, ts = TS) => `ts=${ts},v1=${hash}`

const validHash = sign(`id:${ORDER_ID.toLowerCase()};request-id:${REQUEST_ID};ts:${TS};`)

describe('verifyMpSignature', () => {
  it('aceita a notificação com o id da query em maiúsculas (assinado em minúsculas)', () => {
    expect(
      verifyMpSignature({ signature: header(validHash), requestId: REQUEST_ID, dataId: ORDER_ID, secret: SECRET }),
    ).toBe(true)
  })

  it('recusa um hash calculado com o id em maiúsculas — a regra do MP é minúsculas', () => {
    const upper = sign(`id:${ORDER_ID};request-id:${REQUEST_ID};ts:${TS};`)
    expect(
      verifyMpSignature({ signature: header(upper), requestId: REQUEST_ID, dataId: ORDER_ID, secret: SECRET }),
    ).toBe(false)
  })

  it('omite do manifest o x-request-id ausente', () => {
    const hash = sign(`id:${ORDER_ID.toLowerCase()};ts:${TS};`)
    expect(
      verifyMpSignature({ signature: header(hash), requestId: undefined, dataId: ORDER_ID, secret: SECRET }),
    ).toBe(true)
  })

  it('aceita espaços e ordem trocada no header', () => {
    expect(
      verifyMpSignature({
        signature: ` v1=${validHash} , ts=${TS} `,
        requestId: REQUEST_ID,
        dataId: ORDER_ID,
        secret: SECRET,
      }),
    ).toBe(true)
  })

  it('recusa hash adulterado', () => {
    const tampered = validHash.slice(0, -2) + (validHash.endsWith('00') ? 'ff' : '00')
    expect(
      verifyMpSignature({ signature: header(tampered), requestId: REQUEST_ID, dataId: ORDER_ID, secret: SECRET }),
    ).toBe(false)
  })

  it('recusa segredo errado', () => {
    expect(
      verifyMpSignature({ signature: header(validHash), requestId: REQUEST_ID, dataId: ORDER_ID, secret: 'outro' }),
    ).toBe(false)
  })

  it('recusa quando o id assinado não é o da notificação', () => {
    expect(
      verifyMpSignature({
        signature: header(validHash),
        requestId: REQUEST_ID,
        dataId: 'ORD01OUTRAORDERQUALQUER',
        secret: SECRET,
      }),
    ).toBe(false)
  })

  it('recusa header ausente, malformado ou sem ts/v1', () => {
    const base = { requestId: REQUEST_ID, dataId: ORDER_ID, secret: SECRET }
    expect(verifyMpSignature({ ...base, signature: undefined })).toBe(false)
    expect(verifyMpSignature({ ...base, signature: 'lixo' })).toBe(false)
    expect(verifyMpSignature({ ...base, signature: `v1=${validHash}` })).toBe(false)
    expect(verifyMpSignature({ ...base, signature: `ts=${TS}` })).toBe(false)
  })

  it('recusa tudo sem segredo configurado', () => {
    expect(
      verifyMpSignature({ signature: header(sign('id:;ts:1;', '')), requestId: undefined, dataId: undefined, secret: '' }),
    ).toBe(false)
  })
})
