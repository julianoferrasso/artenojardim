import { formatBRL } from '@/lib/utils'

/**
 * Placeholder da Fase 0. A home real (banners, destaques, categorias) é o item 6
 * da Fase 1 e depende de Products.
 *
 * Serve para uma coisa: provar que os tokens estão ligados. Nenhuma cor literal
 * abaixo — tudo vem de globals.css.
 */
export default function HomePage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-24">
        <header className="flex flex-col gap-3">
          <span className="w-fit rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground">
            Fase 0 — fundação
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">Arte no Jardim</h1>
          <p className="text-muted-foreground">
            Loja em construção. Esta página existe para validar os design tokens.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-lg border border-border bg-card p-6 text-card-foreground">
          <h2 className="font-medium">Tokens semânticos</h2>

          <div className="flex flex-wrap gap-2">
            <span className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
              primary
            </span>
            <span className="rounded-md bg-secondary px-3 py-1.5 text-sm text-secondary-foreground">
              secondary
            </span>
            <span className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
              muted
            </span>
            <span className="rounded-md bg-sale px-3 py-1.5 text-sm text-sale-foreground">sale</span>
            <span className="rounded-md bg-warning px-3 py-1.5 text-sm text-warning-foreground">
              warning
            </span>
            <span className="rounded-md bg-success px-3 py-1.5 text-sm text-success-foreground">
              success
            </span>
            <span className="rounded-md bg-destructive px-3 py-1.5 text-sm text-destructive-foreground">
              destructive
            </span>
          </div>

          <p className="text-sm text-muted-foreground">
            Trocar <code className="rounded bg-muted px-1">--primary</code> em globals.css muda a
            loja inteira. É o ensaio da Fase 4.
          </p>
        </section>

        <section className="flex items-baseline gap-3 rounded-lg border border-border p-6">
          <span className="text-2xl font-semibold">{formatBRL(14900)}</span>
          <span className="text-sm text-muted-foreground line-through">{formatBRL(19900)}</span>
          <span className="rounded-md bg-sale px-2 py-0.5 text-xs text-sale-foreground">-25%</span>
        </section>
      </div>
    </main>
  )
}
