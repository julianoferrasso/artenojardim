import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * O token de descadastro é a peça de SEGURANÇA do e-mail de marketing: quem
 * conseguir forjá-lo descadastra qualquer pessoa. Testado com env e loja
 * mockados — o módulo lê os dois, e subir banco para exercitar um HMAC seria
 * trocar um teste de milissegundos por um de infraestrutura.
 */

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres-aqui'
const OTHER_SECRET = 'outro-segredo-completamente-diferente-com-32+'

let activeSecret = SECRET
let activeStoreId = 'store_1'

vi.mock('../src/config/env.js', () => ({
  get env() {
    return {
      EMAIL_UNSUBSCRIBE_SECRET: activeSecret,
      STORE_URL: 'https://loja.test',
      API_URL: 'https://api.test',
    }
  },
}))

vi.mock('../src/shared/store-context.js', () => ({
  getActiveStoreId: () => activeStoreId,
}))

const {
  buildUnsubscribeToken,
  parseUnsubscribeToken,
  buildUnsubscribeUrl,
  buildOneClickUnsubscribeUrl,
} = await import('../src/shared/unsubscribe.js')

beforeEach(() => {
  activeSecret = SECRET
  activeStoreId = 'store_1'
})

describe('token de descadastro', () => {
  it('vai e volta preservando o e-mail', () => {
    const token = buildUnsubscribeToken('cliente@loja.com')
    expect(parseUnsubscribeToken(token)).toBe('cliente@loja.com')
  })

  it.each([
    'cliente+tag@loja.com', // o + do Gmail sobrevive ao base64url
    'nome.sobrenome@dominio.com.br',
    'a@x.co',
  ])('preserva %s', (email) => {
    expect(parseUnsubscribeToken(buildUnsubscribeToken(email))).toBe(email)
  })

  it('normaliza caixa e espaço antes de assinar', () => {
    expect(parseUnsubscribeToken(buildUnsubscribeToken('  Cliente@Loja.COM  '))).toBe(
      'cliente@loja.com',
    )
  })

  it('token adulterado no e-mail é recusado — é o ataque que importa', () => {
    const token = buildUnsubscribeToken('vitima@loja.com')
    const signature = token.split('.')[1]
    const forjado = `${Buffer.from('outro@loja.com').toString('base64url')}.${signature}`

    expect(() => parseUnsubscribeToken(forjado)).toThrow()
  })

  it('assinatura trocada é recusada', () => {
    const token = buildUnsubscribeToken('cliente@loja.com')
    const [encoded] = token.split('.')
    expect(() => parseUnsubscribeToken(`${encoded}.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa`)).toThrow()
  })

  it('token assinado com OUTRO segredo é recusado', () => {
    const token = buildUnsubscribeToken('cliente@loja.com')
    activeSecret = OTHER_SECRET
    expect(() => parseUnsubscribeToken(token)).toThrow()
  })

  it('token de OUTRA loja é recusado — a promessa multi-tenant da Fase 4', () => {
    const token = buildUnsubscribeToken('cliente@loja.com')
    activeStoreId = 'store_2'
    expect(() => parseUnsubscribeToken(token)).toThrow()
  })

  it.each([
    ['sem separador', 'tokensemponto'],
    ['partes demais', 'a.b.c'],
    ['vazio', ''],
    ['sem e-mail dentro', `${Buffer.from('naoehemail').toString('base64url')}.aaaaaaaaaaaaaaaa`],
  ])('%s é recusado', (_caso, token) => {
    expect(() => parseUnsubscribeToken(token)).toThrow()
  })

  it('e-mails diferentes geram assinaturas diferentes', () => {
    const a = buildUnsubscribeToken('a@x.com').split('.')[1]
    const b = buildUnsubscribeToken('b@x.com').split('.')[1]
    expect(a).not.toBe(b)
  })

  it('NÃO expira: o mesmo e-mail gera sempre o mesmo token', () => {
    // Um link de descadastro que expira transforma "sair da lista" em "marcar
    // como spam". O token de um e-mail de dois anos atrás tem de continuar valendo.
    expect(buildUnsubscribeToken('cliente@loja.com')).toBe(buildUnsubscribeToken('cliente@loja.com'))
  })
})

describe('URLs', () => {
  it('o link do rodapé leva à PÁGINA da loja', () => {
    expect(buildUnsubscribeUrl('cliente@loja.com')).toMatch(
      /^https:\/\/loja\.test\/descadastrar\?token=/,
    )
  })

  it('o one-click do Gmail aponta para a API: ele posta sem navegador', () => {
    expect(buildOneClickUnsubscribeUrl('cliente@loja.com')).toMatch(
      /^https:\/\/api\.test\/api\/v1\/newsletter\/unsubscribe\?token=/,
    )
  })

  it('o token vai percent-encoded — ele pode conter caracteres de URL', () => {
    const url = buildUnsubscribeUrl('cliente+tag@loja.com')
    const token = new URL(url).searchParams.get('token')
    expect(token).not.toBeNull()
    expect(parseUnsubscribeToken(token!)).toBe('cliente+tag@loja.com')
  })
})
