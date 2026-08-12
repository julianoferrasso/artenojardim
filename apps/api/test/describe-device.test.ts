import { describe, it, expect } from 'vitest'
import { describeDevice } from '../src/modules/customer-profile/domain/describe-device.js'

/**
 * Os UAs abaixo são reais. O valor deste teste está justamente aí: todo
 * navegador mente no próprio UA por compatibilidade histórica, e um UA inventado
 * não reproduz a mentira que a ordem dos testes existe para desfazer.
 */
describe('describeDevice', () => {
  it('Edge diz "Chrome" e "Safari" no UA — ainda assim é Edge', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
    expect(describeDevice(ua)).toBe('Edge no Windows')
  })

  it('Chrome diz "Safari" no UA — ainda assim é Chrome', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(describeDevice(ua)).toBe('Chrome no Windows')
  })

  it('Safari de verdade não traz Chrome', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'
    expect(describeDevice(ua)).toBe('Safari no Mac')
  })

  it('Android também se declara Linux — vence o mais específico', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    expect(describeDevice(ua)).toBe('Chrome no Android')
  })

  it('Chrome no iPhone se chama CriOS', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.0.0 Mobile/15E148 Safari/604.1'
    expect(describeDevice(ua)).toBe('Chrome no iPhone')
  })

  it('Firefox no Linux', () => {
    expect(describeDevice('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0')).toBe(
      'Firefox no Linux',
    )
  })

  it.each([[null], [undefined], ['']])('sem user-agent (%s) não quebra a lista', (ua) => {
    expect(describeDevice(ua)).toBe('Dispositivo desconhecido')
  })

  it('UA irreconhecível (curl, bot) não vira string vazia na tela', () => {
    expect(describeDevice('curl/8.4.0')).toBe('Dispositivo desconhecido')
  })
})
