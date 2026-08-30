import { Gift } from 'lucide-react'

/**
 * Barra de aviso acima do header — em todas as páginas, fora do sticky (rola
 * junto com o conteúdo). A cor é a das FAIXAS (--tertiary), controlada pelo
 * painel de Aparência.
 */
export const AnnouncementBar = () => (
  <div className="bg-tertiary text-tertiary-foreground">
    <p className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-4 py-2 text-center text-xs sm:text-sm">
      <Gift className="size-3.5 shrink-0" aria-hidden />
      Embalagens para presente com carinho em cada detalhe.
    </p>
  </div>
)
