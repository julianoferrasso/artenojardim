import { describe, it, expect } from 'vitest'
import { classifyDevice, classifySource, isBot } from '../src/modules/visits/domain/classify.js'

/**
 * De onde vem a visita e em que aparelho. Erro aqui não quebra nada — só
 * distorce o card de origem, que é exatamente por isso que precisa de teste.
 */

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1'
const ANDROID_PHONE =
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
const ANDROID_TABLET =
  'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const WINDOWS_CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const INSTAGRAM_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 339.0.3.12.91 (iPhone15,2; iOS 17_5; pt_BR)'
const FACEBOOK_APP =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.97;FBBV/601234567]'
const CUBOT =
  'Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'

describe('isBot', () => {
  it('reconhece crawlers que executam JavaScript', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)')).toBe(true)
    expect(isBot('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 HeadlessChrome/126.0.0.0 Safari/537.36')).toBe(
      true,
    )
    expect(isBot('Mozilla/5.0 (Linux; Android 11; moto g power) Chrome-Lighthouse')).toBe(true)
    expect(isBot('facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)')).toBe(true)
    expect(isBot('')).toBe(true)
  })

  it('script que não se passa por navegador não é visita', () => {
    expect(isBot('curl/8.5.0')).toBe(true)
    expect(isBot('python-requests/2.32.3')).toBe(true)
    expect(isBot('node')).toBe(true)
  })

  it('não confunde navegador de gente com robô', () => {
    expect(isBot(IPHONE_SAFARI)).toBe(false)
    expect(isBot(WINDOWS_CHROME)).toBe(false)
    expect(isBot(INSTAGRAM_APP)).toBe(false)
    // Celular cuja marca termina em "bot".
    expect(isBot(CUBOT)).toBe(false)
  })
})

describe('classifyDevice', () => {
  it('separa celular, tablet e desktop', () => {
    expect(classifyDevice(IPHONE_SAFARI)).toBe('mobile')
    expect(classifyDevice(ANDROID_PHONE)).toBe('mobile')
    expect(classifyDevice(IPAD)).toBe('tablet')
    expect(classifyDevice(ANDROID_TABLET)).toBe('tablet')
    expect(classifyDevice(WINDOWS_CHROME)).toBe('desktop')
  })
})

describe('classifySource', () => {
  const ua = WINDOWS_CHROME

  it('UTM conhecida vence, inclusive apelido e maiúscula', () => {
    expect(classifySource({ utmSource: 'IG', userAgent: ua })).toBe('instagram')
    expect(classifySource({ utmSource: 'zap', userAgent: ua })).toBe('whatsapp')
    expect(classifySource({ utmSource: 'facebook', referrerHost: 'l.instagram.com', userAgent: ua })).toBe(
      'facebook',
    )
  })

  it('utm_medium=email marca e-mail', () => {
    expect(classifySource({ utmSource: 'campanha-outubro', utmMedium: 'email', userAgent: ua })).toBe('email')
  })

  it('reconhece o domínio do referrer', () => {
    expect(classifySource({ referrerHost: 'l.instagram.com', userAgent: ua })).toBe('instagram')
    expect(classifySource({ referrerHost: 'www.google.com.br', userAgent: ua })).toBe('google')
    expect(classifySource({ referrerHost: 'wa.me', userAgent: ua })).toBe('whatsapp')
    expect(classifySource({ referrerHost: 'lm.facebook.com', userAgent: ua })).toBe('facebook')
    expect(classifySource({ referrerHost: 'br.pinterest.com', userAgent: ua })).toBe('pinterest')
    expect(classifySource({ referrerHost: 'mail.google.com', userAgent: ua })).toBe('email')
  })

  it('o navegador embutido do app denuncia a origem quando o referrer some', () => {
    expect(classifySource({ userAgent: INSTAGRAM_APP })).toBe('instagram')
    expect(classifySource({ userAgent: FACEBOOK_APP })).toBe('facebook')
    // Link da bio passando pelo linktr.ee: o tráfego é do Instagram.
    expect(classifySource({ referrerHost: 'linktr.ee', userAgent: INSTAGRAM_APP })).toBe('instagram')
  })

  it('referrer desconhecido é "outros"; nada é "direto"', () => {
    expect(classifySource({ referrerHost: 'blogdaana.com.br', userAgent: ua })).toBe('other')
    expect(classifySource({ utmSource: 'parceiro-x', userAgent: ua })).toBe('other')
    expect(classifySource({ userAgent: ua })).toBe('direct')
  })
})
