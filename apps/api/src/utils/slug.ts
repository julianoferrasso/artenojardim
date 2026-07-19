/**
 * Gera slug a partir de texto livre. Puro, sem dependencias - reusado por
 * categorias, produtos e CMS.
 *
 * Remove acento antes de tudo: "Ceramica" (com acento) vira "ceramica". No
 * Brasil, slug com acento na URL e fonte de link quebrado.
 */
export const slugify = (input: string): string =>
  input
    .normalize('NFD')
    // \p{Diacritic} com flag u, NAO o range combinante literal [U+0300-U+036F]:
    // escrito com os caracteres combinantes de verdade, o combining grave se
    // anexa ao `[` e o range vira lixo - foi assim que "ceramica" (com acento)
    // saia "cer-mica". A property escape e ASCII no fonte, sem essa armadilha.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 160)

/**
 * Dado um slug base e a lista de slugs ja usados, devolve um unico.
 * Colidiu? Sufixa -2, -3... E a estrategia do Shopify, e mantem a URL legivel.
 * Funcao pura: o service passa os slugs existentes; a decisao e testavel sem banco.
 */
export const uniqueSlug = (base: string, taken: Set<string>): string => {
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}
