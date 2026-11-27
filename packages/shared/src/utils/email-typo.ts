/**
 * "Você quis dizer @gmail.com?" — sugestão para erro de digitação no domínio.
 *
 * No checkout o e-mail é por onde chega o código: "gmial.com" só se descobre
 * quando o código não chega, com o cliente parado na frente do pagamento.
 * Só SUGERE, nunca corrige sozinho: domínio próprio parecido com um grande
 * (ex.: `mail.com`) é legítimo, e quem decide é quem digitou.
 */

/** Provedores comuns no Brasil. Estar aqui é "conhecido": nunca vira sugestão. */
const KNOWN_DOMAINS = [
  'gmail.com',
  'hotmail.com',
  'hotmail.com.br',
  'outlook.com',
  'outlook.com.br',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.br',
  'icloud.com',
  'me.com',
  'uol.com.br',
  'bol.com.br',
  'terra.com.br',
  'ig.com.br',
  'globo.com',
  'globomail.com',
  'r7.com',
  'aol.com',
  'mail.com',
  'email.com',
  'gmx.com',
  'zoho.com',
  'yandex.com',
  'proton.me',
  'protonmail.com',
]

/** Erros que a distância não pega (ou pegaria errado). */
const EXPLICIT: Record<string, string> = {
  'gmail.com.br': 'gmail.com',
  'gmail.br': 'gmail.com',
  'icloud.com.br': 'icloud.com',
}

/** Damerau-Levenshtein restrito: troca de duas letras vizinhas ("gmial") conta 1. */
const distance = (a: string, b: string): number => {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  )
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const row = d[i]!
      const prev = d[i - 1]!
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        row[j] = Math.min(row[j]!, d[i - 2]![j - 2]! + 1)
      }
    }
  }
  return d[a.length]![b.length]!
}

/** E-mail corrigido para sugerir, ou null quando o domínio parece certo. */
export const suggestEmailDomain = (email: string): string | null => {
  const at = email.lastIndexOf('@')
  if (at <= 0) return null
  const local = email.slice(0, at).trim()
  const domain = email.slice(at + 1).trim().toLowerCase()
  // Curto demais, a distância aproxima qualquer coisa de qualquer coisa.
  if (domain.length < 5 || KNOWN_DOMAINS.includes(domain)) return null

  const explicit = EXPLICIT[domain]
  if (explicit) return `${local}@${explicit}`

  let best: string | null = null
  let bestDistance = 3
  for (const known of KNOWN_DOMAINS) {
    const dist = distance(domain, known)
    if (dist < bestDistance) {
      best = known
      bestDistance = dist
    }
  }
  return best ? `${local}@${best}` : null
}
