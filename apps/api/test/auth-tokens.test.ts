import { describe, it, expect } from 'vitest'
import { SignJWT } from 'jose'
import {
  signAccessToken,
  verifyAccessToken,
  ttlToSeconds,
  type StaffClaims,
} from '../src/modules/auth/domain/tokens.js'

/**
 * Testes de domain/: funções puras, sem banco, sem HTTP. Rodam em milissegundos.
 * É o retorno concreto de ter separado a camada — dá para exercitar toda a
 * lógica de token sem subir infraestrutura nenhuma.
 */

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-aqui'
const OTHER_SECRET = 'outro-segredo-completamente-diferente-com-32+'

const claims: StaffClaims = {
  sub: 'user_123',
  type: 'user',
  role: 'ADMIN',
  storeId: 'store_1',
}

describe('ttlToSeconds', () => {
  it.each([
    ['30s', 30],
    ['15m', 900],
    ['2h', 7200],
    ['30d', 2592000],
  ])('converte %s em %i segundos', (input, expected) => {
    expect(ttlToSeconds(input)).toBe(expected)
  })

  it('rejeita formato inválido em vez de devolver NaN silencioso', () => {
    expect(() => ttlToSeconds('15 minutos')).toThrow()
    expect(() => ttlToSeconds('abc')).toThrow()
    // "15" sem unidade é ambíguo: segundos? minutos? Melhor falhar.
    expect(() => ttlToSeconds('15')).toThrow()
  })
})

describe('access token', () => {
  it('ida e volta preserva os claims', async () => {
    const token = await signAccessToken(claims, SECRET, '15m')
    const result = await verifyAccessToken(token, SECRET)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.claims).toMatchObject(claims)
  })

  it('recusa token assinado com OUTRO segredo', async () => {
    const token = await signAccessToken(claims, OTHER_SECRET, '15m')
    const result = await verifyAccessToken(token, SECRET)

    expect(result).toEqual({ ok: false, reason: 'invalid' })
  })

  it('distingue EXPIRADO de INVÁLIDO', async () => {
    // Não é preciosismo: expirado faz o cliente renovar e repetir de forma
    // transparente; inválido mata a sessão. Unificar os dois deslogaria o
    // usuário legítimo a cada 15 minutos.
    const expired = await new SignJWT({ ...claims })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 3600)
      .setSubject(claims.sub)
      .sign(new TextEncoder().encode(SECRET))

    expect(await verifyAccessToken(expired, SECRET)).toEqual({ ok: false, reason: 'expired' })
  })

  it('recusa token com payload adulterado', async () => {
    const token = await signAccessToken(claims, SECRET, '15m')
    const [header, payload, sig] = token.split('.')

    // Sobe de STAFF para OWNER no payload e mantém a assinatura original.
    const forged = Buffer.from(
      JSON.stringify({ ...claims, role: 'OWNER' }),
    ).toString('base64url')

    const result = await verifyAccessToken(`${header}.${forged}.${sig}`, SECRET)
    expect(result).toEqual({ ok: false, reason: 'invalid' })
    expect(payload).toBeDefined()
  })

  it('recusa alg:none — o ataque clássico de JWT', async () => {
    // Sem `algorithms: ['HS256']` na verificação, a lib acreditaria no algoritmo
    // declarado pelo PRÓPRIO token e aceitaria um token sem assinatura nenhuma.
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ ...claims, exp: 9999999999 })).toString('base64url')

    expect(await verifyAccessToken(`${header}.${payload}.`, SECRET)).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('recusa lixo que nem é JWT', async () => {
    for (const junk of ['', 'abc', 'a.b.c', '...', 'Bearer token']) {
      expect((await verifyAccessToken(junk, SECRET)).ok).toBe(false)
    }
  })

  it('recusa token sem sub ou com type desconhecido', async () => {
    const noSub = await new SignJWT({ type: 'user', role: 'ADMIN' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(SECRET))
    expect((await verifyAccessToken(noSub, SECRET)).ok).toBe(false)

    const badType = await new SignJWT({ type: 'robot' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('x')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode(SECRET))
    expect((await verifyAccessToken(badType, SECRET)).ok).toBe(false)
  })

  it('segredo de staff não valida token de cliente', async () => {
    // A razão de existir 4 segredos distintos no .env: vazar um não vaza o outro.
    const customerToken = await signAccessToken(
      { sub: 'cust_1', type: 'customer', storeId: 'store_1' },
      OTHER_SECRET,
      '15m',
    )
    expect((await verifyAccessToken(customerToken, SECRET)).ok).toBe(false)
  })
})
