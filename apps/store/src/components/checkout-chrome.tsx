import Link from 'next/link'
import { Lock, Mail, ShieldCheck } from 'lucide-react'
import type { PublicStore } from '@ecommerce/shared/contracts'
import { StoreLogo } from './store-logo'
import { WhatsAppIcon } from './brand-icons'

/**
 * Moldura do checkout: a marca, o selo de compra segura e a ajuda. Busca, menu
 * e vitrine ficam de fora — no funil, todo link é uma saída (arquitetura §19:
 * "nada deve tirar o cliente daqui").
 */

export const CheckoutHeader = ({ storeName, logoUrl }: { storeName: string; logoUrl: string | null }) => (
  <header className="border-b border-border bg-background">
    <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
      <Link href="/" className="flex min-w-0 items-center gap-2.5">
        <StoreLogo src={logoUrl} alt="" size={40} priority className="size-9 md:size-10" />
        <span className="truncate font-display text-xl font-semibold tracking-tight md:text-2xl">
          {storeName}
        </span>
      </Link>
      <p className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-4 text-success" aria-hidden />
        Compra segura
      </p>
    </div>
  </header>
)

export const CheckoutFooter = ({ store }: { store: PublicStore | null }) => {
  const storeName = store?.name ?? 'Arte no Jardim'
  const year = new Date().getFullYear()
  const whatsappHref = store?.phone ? `https://wa.me/55${store.phone.replace(/\D/g, '')}` : null

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-6 text-center text-xs text-muted-foreground md:flex-row md:justify-between md:text-left">
        {(whatsappHref || store?.email) && (
          <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <span>Precisa de ajuda?</span>
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <WhatsAppIcon className="size-4 shrink-0" />
                WhatsApp
              </a>
            )}
            {store?.email && (
              <a
                href={`mailto:${store.email}`}
                className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
              >
                <Mail className="size-4 shrink-0" aria-hidden />
                {store.email}
              </a>
            )}
          </p>
        )}
        <p className="flex items-center gap-1.5">
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
          © {year} {storeName} · pagamento processado pelo Mercado Pago
        </p>
      </div>
    </footer>
  )
}
