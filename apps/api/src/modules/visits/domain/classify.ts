import type { VisitDevice, VisitSource } from '@ecommerce/shared/contracts'

/**
 * Classificação da visita a partir do que o navegador conta: user-agent, host do
 * referrer e UTM. Puro — quem grava é o service.
 */

/**
 * Robôs que executam JavaScript chegam até o beacon (o Googlebot renderiza a
 * página). UA vazio também sai: navegador de verdade sempre manda um.
 *
 * `[a-z]bot[/;-]` e não `bot` solto: há celular Android chamado CUBOT, e o UA
 * dele não pode virar robô. O `+http` pega o resto — todo crawler educado deixa
 * a URL dele no UA, e nenhum navegador faz isso.
 */
const BOT_RE =
  /[a-z]bot[/;-]|\bbot\b|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|\+https?:\/\//i

export const isBot = (userAgent: string): boolean => userAgent.trim() === '' || BOT_RE.test(userAgent)

/**
 * Android sem "Mobile" é tablet — é a convenção que o próprio Google documenta
 * para o UA. O iPad moderno se apresenta como Mac e conta como desktop; não há
 * como separar sem perguntar à tela, e a diferença não muda decisão nenhuma.
 */
export const classifyDevice = (userAgent: string): VisitDevice => {
  if (/ipad|tablet|kindle|silk|playbook/i.test(userAgent)) return 'tablet'
  if (/android/i.test(userAgent) && !/mobile/i.test(userAgent)) return 'tablet'
  if (/mobi|iphone|ipod|android|windows phone/i.test(userAgent)) return 'mobile'
  return 'desktop'
}

/** Apelidos que aparecem em UTM escrita à mão (bio, story, link do zap). */
const UTM_SOURCES: Record<string, VisitSource> = {
  instagram: 'instagram',
  ig: 'instagram',
  insta: 'instagram',
  facebook: 'facebook',
  fb: 'facebook',
  whatsapp: 'whatsapp',
  wa: 'whatsapp',
  zap: 'whatsapp',
  wpp: 'whatsapp',
  tiktok: 'tiktok',
  pinterest: 'pinterest',
  google: 'google',
  email: 'email',
  'e-mail': 'email',
  newsletter: 'email',
}

const EMAIL_MEDIUMS = new Set(['email', 'e-mail', 'newsletter'])

const sourceFromUtm = (utmSource?: string, utmMedium?: string): VisitSource | null => {
  const source = utmSource?.trim().toLowerCase()
  if (source && UTM_SOURCES[source]) return UTM_SOURCES[source]
  const medium = utmMedium?.trim().toLowerCase()
  if (medium && EMAIL_MEDIUMS.has(medium)) return 'email'
  return null
}

const normalizeHost = (host?: string): string =>
  (host ?? '')
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '')

const isDomain = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`)

/**
 * O webmail vem antes do Google: `mail.google.com` é e-mail, não busca. Os hosts
 * `com.google.android.*` são o referrer que o Android manda quando o link sai de
 * um app (Gmail, app do Google).
 */
const sourceFromHost = (host: string): VisitSource | null => {
  if (host === 'com.google.android.gm' || /^(web)?mail\./.test(host) || /^outlook\./.test(host)) return 'email'
  if (isDomain(host, 'instagram.com')) return 'instagram'
  if (isDomain(host, 'facebook.com') || isDomain(host, 'fb.com') || host === 'fb.me') return 'facebook'
  if (isDomain(host, 'whatsapp.com') || host === 'wa.me') return 'whatsapp'
  if (isDomain(host, 'tiktok.com')) return 'tiktok'
  if (/(^|\.)pinterest\.[a-z.]+$/.test(host) || host === 'pin.it') return 'pinterest'
  if (/(^|\.)google\.[a-z.]+$/.test(host) || host.includes('googlequicksearchbox')) return 'google'
  return null
}

/**
 * O navegador embutido dos apps costuma chegar SEM referrer — o clique no link
 * da bio do Instagram aparece como acesso direto. O UA do navegador embutido é o
 * que denuncia de onde a pessoa veio.
 */
const sourceFromInAppBrowser = (userAgent: string): VisitSource | null => {
  if (/instagram/i.test(userAgent)) return 'instagram'
  if (/FBAN|FBAV|FB_IAB|FBIOS/.test(userAgent)) return 'facebook'
  if (/musical_ly|bytedancewebview|tiktok/i.test(userAgent)) return 'tiktok'
  if (/pinterest/i.test(userAgent)) return 'pinterest'
  return null
}

export type VisitSignals = {
  referrerHost?: string | undefined
  utmSource?: string | undefined
  utmMedium?: string | undefined
  userAgent: string
}

/**
 * Precedência: UTM conhecida → domínio conhecido do referrer → navegador embutido
 * de app → qualquer outro sinal de origem (`other`) → `direct`.
 *
 * O navegador embutido vem DEPOIS do referrer e ANTES do referrer desconhecido:
 * quem clica no linktr.ee da bio do Instagram chega com referrer `linktr.ee` e UA
 * do Instagram — e o tráfego é do Instagram.
 */
export const classifySource = (signals: VisitSignals): VisitSource => {
  const fromUtm = sourceFromUtm(signals.utmSource, signals.utmMedium)
  if (fromUtm) return fromUtm

  const host = normalizeHost(signals.referrerHost)
  const fromHost = host ? sourceFromHost(host) : null
  if (fromHost) return fromHost

  const fromApp = sourceFromInAppBrowser(signals.userAgent)
  if (fromApp) return fromApp

  return host || signals.utmSource?.trim() ? 'other' : 'direct'
}
