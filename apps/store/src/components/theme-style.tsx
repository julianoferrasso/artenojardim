import type { PublicTheme } from '@ecommerce/shared/contracts'
import { THEME_RADIUS_REM } from '@ecommerce/shared/contracts'
import { deriveThemeVars, deriveButtonVars } from '@ecommerce/shared/utils'

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
 * Todo o resto é derivado por CONTRASTE MEDIDO em `deriveThemeVars`, que mora no
 * pacote compartilhado para o admin montar a prévia com a mesma conta. Se a cor
 * do texto fosse escolha do lojista, mais cedo ou mais tarde seria branco sobre
 * amarelo claro; e se cada app tivesse sua fórmula, a prévia mentiria.
 */

export const buildThemeVars = (theme: PublicTheme): Record<string, string> => ({
  '--radius': THEME_RADIUS_REM[theme.radius],
  ...deriveThemeVars(theme),
  ...deriveButtonVars(theme, theme.buttons),
})

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
