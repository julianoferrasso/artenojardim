import Image from 'next/image'
import Link from 'next/link'
import { CreditCard, Mail, Phone, QrCode, ShieldCheck } from 'lucide-react'
import type { PublicStore } from '@ecommerce/shared/contracts'
import { NewsletterForm } from './newsletter-form'

// Ícones de marca saíram do lucide (deprecados) — SVG inline com o mesmo traço.
const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
)

const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
)

// Fase 4 (temas/settings): estes links passam a vir da API junto com o themeJson.
const SOCIAL_LINKS = [
  { label: 'Instagram', href: 'https://instagram.com/artenojardim', icon: InstagramIcon },
  { label: 'Facebook', href: 'https://facebook.com/artenojardim', icon: FacebookIcon },
]

const INSTITUTIONAL_LINKS = [
  { label: 'Início', href: '/' },
  { label: 'Favoritos', href: '/favoritos' },
  { label: 'Minha conta', href: '/conta' },
  { label: 'Meus pedidos', href: '/conta/pedidos' },
]

// Páginas institucionais ainda não existem (CMS é fase futura); os links já
// ocupam o lugar definitivo e passam a apontar para as páginas quando nascerem.
const HELP_LINKS = [
  { label: 'Como comprar', href: '/' },
  { label: 'Entregas e frete', href: '/' },
  { label: 'Trocas e devoluções', href: '/' },
  { label: 'Política de privacidade', href: '/' },
]

/**
 * Rodapé da loja. Server Component: tudo aqui é estático por request — a única
 * ilha client é o formulário de newsletter.
 */
export const SiteFooter = ({ store }: { store: PublicStore | null }) => {
  const storeName = store?.name ?? 'Arte no Jardim'
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-border bg-secondary/40">
      {/* Newsletter */}
      <div className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-6 px-4 py-10 md:flex-row md:justify-between">
          <div className="text-center md:text-left">
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Receba novidades com carinho
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Lançamentos, promoções e inspirações para a sua casa — sem spam.
            </p>
          </div>
          <NewsletterForm className="max-w-md" />
        </div>
      </div>

      {/* Colunas */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <div className="flex items-center gap-3">
            <Image
              src="/18521.jpg"
              alt={`Logo ${storeName}`}
              width={56}
              height={56}
              className="size-14 rounded-full"
            />
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">{storeName}</p>
              <p className="text-sm text-muted-foreground">feito à mão</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Velas e peças artesanais feitas uma a uma, para deixar a sua casa mais acolhedora.
          </p>
          <div className="mt-4 flex gap-2">
            {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="flex size-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:border-primary hover:text-primary"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        <nav aria-label="Institucional">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Institucional
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {INSTITUTIONAL_LINKS.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Ajuda">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Ajuda</h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {HELP_LINKS.map(({ label, href }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Atendimento
          </h3>
          <ul className="mt-4 flex flex-col gap-2.5">
            {store?.email && (
              <li>
                <a
                  href={`mailto:${store.email}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  <Mail className="size-4 shrink-0" />
                  {store.email}
                </a>
              </li>
            )}
            {store?.phone && (
              <li>
                <a
                  href={`tel:${store.phone.replace(/\D/g, '')}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-primary"
                >
                  <Phone className="size-4 shrink-0" />
                  {store.phone}
                </a>
              </li>
            )}
          </ul>

          <h3 className="mt-6 text-sm font-semibold uppercase tracking-wider text-foreground">
            Pagamento
          </h3>
          <ul className="mt-3 flex flex-col gap-2">
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <CreditCard className="size-4 shrink-0" />
              Cartão de crédito
            </li>
            <li className="flex items-center gap-2 text-sm text-muted-foreground">
              <QrCode className="size-4 shrink-0" />
              Pix
            </li>
          </ul>
        </div>
      </div>

      {/* Selos + copyright */}
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-center md:flex-row md:text-left">
          <p className="text-xs text-muted-foreground">
            © {year} {storeName} · feito à mão · todos os direitos reservados
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" />
              Compra segura · SSL
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 text-success" />
              Pagamento processado pela Stripe
            </span>
          </div>
        </div>
      </div>
    </footer>
  )
}
