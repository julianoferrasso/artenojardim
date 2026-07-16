/**
 * Placeholder da Fase 0. O shell real (login + layout) é o item 1 da Fase 1.
 */
export default function AdminHomePage() {
  return (
    <main className="min-h-svh bg-background text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-24">
        <span className="w-fit rounded-md bg-secondary px-3 py-1 text-sm text-secondary-foreground">
          Fase 0 — fundação
        </span>
        <h1 className="text-3xl font-semibold tracking-tight">Admin — Arte no Jardim</h1>
        <p className="text-muted-foreground">
          Painel em construção. Login e shell chegam no item 1 da Fase 1.
        </p>

        <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-card p-6">
          <span className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">
            primary
          </span>
          <span className="rounded-md bg-muted px-3 py-1.5 text-sm text-muted-foreground">
            muted
          </span>
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
      </div>
    </main>
  )
}
