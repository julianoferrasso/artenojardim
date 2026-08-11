import type { PublicTheme } from '@ecommerce/shared/contracts'
import { THEME_RADIUS_REM } from '@ecommerce/shared/contracts'
import { contrastForeground, oklchToCss, shiftLightness } from '@ecommerce/shared/utils'

/**
 * Sobrescreve os tokens do globals.css com o tema configurado no painel.
 *
 * Funciona porque TODO o CSS da loja já lê de variáveis semânticas — é o retorno
 * de nunca ter escrito bg-[#3a5f2b] em lugar nenhum.
 *
 * Server Component de propósito: o <style> viaja no HTML da primeira resposta,
 * antes do primeiro paint. Um useEffect trocaria a cor DEPOIS de pintar, e o
 * visitante veria a paleta antiga piscar em toda navegação.
 *
 * ── Só QUATRO cores vêm do lojista ──────────────────────────────────────────
 * Todo o resto é derivado aqui. Se o lojista pudesse escolher a cor do texto,
 * mais cedo ou mais tarde escolheria branco sobre amarelo claro e o botão
 * ficaria ilegível. Derivar é o que torna a tela segura de entregar.
 *
 * As constantes de deslocamento abaixo reproduzem as relações que o globals.css
 * já tinha entre background (0.985), card (0.997), muted (0.955) e border
 * (0.905) — por isso o tema default renderiza a loja idêntica ao que estava no ar.
 */

const foreground = (color: Parameters<typeof contrastForeground>[0]): string =>
  oklchToCss(contrastForeground(color))

export const buildThemeVars = (theme: PublicTheme): Record<string, string> => {
  const { primary, secondary, accent, background } = theme

  // Superfícies e traços derivados do fundo, preservando o passo de luminosidade.
  const card = shiftLightness(background, 0.012, 0.5)
  const muted = shiftLightness(background, -0.03, 1.5)
  const border = shiftLightness(background, -0.08, 2.25)
  const bodyText = contrastForeground(background)

  return {
    '--radius': THEME_RADIUS_REM[theme.radius],

    '--background': oklchToCss(background),
    '--foreground': oklchToCss(bodyText),

    '--card': oklchToCss(card),
    '--card-foreground': oklchToCss(bodyText),
    '--popover': oklchToCss(card),
    '--popover-foreground': oklchToCss(bodyText),

    '--primary': oklchToCss(primary),
    '--primary-foreground': foreground(primary),

    '--secondary': oklchToCss(secondary),
    '--secondary-foreground': foreground(secondary),

    '--accent': oklchToCss(accent),
    '--accent-foreground': foreground(accent),

    '--muted': oklchToCss(muted),
    // Texto secundário: legível, mas um degrau abaixo do corpo do texto.
    '--muted-foreground': oklchToCss(shiftLightness(bodyText, bodyText.l > 0.5 ? -0.26 : 0.27, 2)),

    '--border': oklchToCss(border),
    '--input': oklchToCss(border),
    // O anel de foco é a cor da marca — como já era no globals.css.
    '--ring': oklchToCss(primary),
  }
}

export const ThemeStyle = ({ theme }: { theme: PublicTheme }) => {
  const css = Object.entries(buildThemeVars(theme))
    .map(([name, value]) => `${name}:${value}`)
    .join(';')

  /*
   * dangerouslySetInnerHTML é seguro AQUI e só aqui: nada nesta string veio de
   * texto livre. Cada cor passou por oklchSchema (três números com faixa fixa),
   * o raio é enum, e a URL do logo NÃO entra no CSS — é atributo de <img>.
   *
   * No dia em que o tema ganhar um campo de texto (fonte custom, CSS extra),
   * esta garantia morre e o valor precisa ser escapado ou recusado.
   */
  return <style dangerouslySetInnerHTML={{ __html: `:root{${css}}` }} />
}
