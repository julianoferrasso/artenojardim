/**
 * Resume um `User-Agent` em algo que o cliente reconheça na lista de dispositivos
 * ("Chrome no Windows"). Puro: string entra, string sai.
 *
 * Por que regex e não uma biblioteca de UA parsing: a lista existe para o cliente
 * responder "fui eu?" — ele reconhece o próprio navegador e sistema, não a versão
 * do WebKit. Uma dependência que se atualiza toda semana para classificar bots
 * não paga o seu custo aqui.
 *
 * A ORDEM dos testes importa e é o oposto da intuição: todo navegador mente no
 * UA por compatibilidade histórica. Edge diz "Chrome" e "Safari"; Chrome diz
 * "Safari". Por isso o mais específico é testado primeiro — inverter faria todo
 * Edge do mundo aparecer como Chrome.
 */

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bEdg[A-Z]?\//, 'Edge'],
  [/\bOPR\/|\bOpera\//, 'Opera'],
  [/\bFirefox\/|\bFxiOS\//, 'Firefox'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\bCriOS\/|\bChrome\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
]

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  // Android antes de Linux: todo Android também se declara Linux.
  [/\bAndroid\b/, 'Android'],
  [/\biPhone\b/, 'iPhone'],
  [/\biPad\b/, 'iPad'],
  [/\bWindows\b/, 'Windows'],
  [/\bMac OS X\b|\bMacintosh\b/, 'Mac'],
  [/\bLinux\b/, 'Linux'],
]

const firstMatch = (ua: string, table: ReadonlyArray<readonly [RegExp, string]>): string | null => {
  for (const [pattern, label] of table) {
    if (pattern.test(ua)) return label
  }
  return null
}

export const describeDevice = (userAgent: string | null | undefined): string => {
  if (!userAgent) return 'Dispositivo desconhecido'

  const browser = firstMatch(userAgent, BROWSERS)
  const system = firstMatch(userAgent, SYSTEMS)

  if (browser && system) return `${browser} no ${system}`
  if (browser) return browser
  if (system) return system
  return 'Dispositivo desconhecido'
}
