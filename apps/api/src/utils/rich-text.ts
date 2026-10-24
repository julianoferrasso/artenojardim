import sanitizeHtml from 'sanitize-html'

/**
 * Saneia o HTML do editor de texto rico do admin antes de gravar. A loja
 * renderiza o resultado com dangerouslySetInnerHTML e NAO saneia de novo:
 * esta funcao e a unica barreira contra XSS.
 *
 * Lista fechada, espelho da barra do editor (rich-text-editor.tsx no admin).
 * Nenhum atributo passa - sem style, class, href ou on* nao ha por onde
 * injetar script. Tag fora da lista some e o texto dela fica.
 *
 * Devolve null quando nao sobra texto visivel: o editor vazio manda "<p></p>".
 * Paragrafo vazio nas pontas sai - o editor sempre deixa um no fim, depois de
 * lista; no meio ele fica, porque e a "linha em branco" que o lojista quis.
 */
const ALLOWED_TAGS = ['p', 'br', 'strong', 'em', 'u', 'h2', 'ul', 'ol', 'li']

const EMPTY_P = '<p>(?:\\s|&nbsp;|<br />)*</p>'
const EMPTY_EDGES = new RegExp(`^(?:${EMPTY_P})+|(?:${EMPTY_P})+$`, 'g')

export const sanitizeRichText = (html: string): string | null => {
  const clean = sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {},
    transformTags: { b: 'strong', i: 'em' },
  })
    .trim()
    .replace(EMPTY_EDGES, '')

  const text = sanitizeHtml(clean, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ')
    .trim()

  return text ? clean : null
}
