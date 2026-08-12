import type { PaginationMeta } from '@ecommerce/shared/contracts'
import { cn } from '@/lib/utils'
import { buttonVariants } from './ui/button'

/**
 * Paginação simples: anterior, posição, próxima.
 *
 * `buildMeta` da API devolve `totalPages: 0` quando não há resultado (o admin
 * monta o meta à mão com Math.max(1, …) e não passa por isso). Por isso a
 * comparação é `>= totalPages` e não `> totalPages`: sem isso, a lista vazia
 * mostraria "página 1 de 0" com o botão "próxima" habilitado.
 */
export const Pagination = ({
  meta,
  onPageChange,
  label = 'itens',
}: {
  meta: PaginationMeta
  onPageChange: (page: number) => void
  label?: string
}) => {
  if (meta.totalPages <= 1) return null

  // Era `rounded-full` fixo, que IGNORAVA o raio escolhido no painel.
  const buttonCls = cn(
    buttonVariants({ variant: 'neutral', emphasis: 'quiet', size: 'sm' }),
    'disabled:cursor-not-allowed disabled:opacity-40',
  )

  return (
    <nav className="mt-6 flex items-center justify-between gap-4" aria-label="Paginação">
      <button
        type="button"
        onClick={() => onPageChange(meta.page - 1)}
        disabled={meta.page <= 1}
        className={buttonCls}
      >
        Anterior
      </button>

      <span className="text-center text-xs text-muted-foreground">
        {meta.total} {label} · página {meta.page} de {meta.totalPages}
      </span>

      <button
        type="button"
        onClick={() => onPageChange(meta.page + 1)}
        disabled={meta.page >= meta.totalPages}
        className={buttonCls}
      >
        Próxima
      </button>
    </nav>
  )
}
