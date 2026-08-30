import Link from 'next/link'
import { ChevronDown, Mail, Phone, ShieldCheck } from 'lucide-react'
import type { PublicStore } from '@ecommerce/shared/contracts'
import { NewsletterForm } from './newsletter-form'
import { StoreLogo } from './store-logo'
import { PaymentMethods } from './payment-icons'
import {
  FacebookIcon,
  InstagramIcon,
  WhatsAppIcon,
  FACEBOOK_PROFILE,
  INSTAGRAM_PROFILE,
} from './brand-icons'

// Fase 4 (temas/settings): estes links passam a vir da API junto com o themeJson.
const SOCIAL_LINKS = [
  { label: 'Instagram', href: INSTAGRAM_PROFILE.url, icon: InstagramIcon },
  { label: 'Facebook', href: FACEBOOK_PROFILE.url, icon: FacebookIcon },
]

const INSTITUTIONAL_LINKS = [
  { label: 'Início', href: '/' },
  { label: 'Favoritos', href: '/favoritos' },
  { label: 'Minha conta', href: '/conta' },
  { label: 'Meus pedidos', href: '/conta/pedidos' },
  // Páginas institucionais ainda não existem (CMS é fase futura); os links já
  // ocupam o lugar definitivo e passam a apontar para elas quando nascerem.
  { label: 'Trocas e devoluções', href: '/' },
  { label: 'Política de privacidade', href: '/' },
]

/**
 * Uma coluna do rodapé: título fixo no desktop, acordeão no mobile.
 *
 * Renderização DUPLA do mesmo conteúdo de propósito (details para mobile, div
 * para desktop): CSS puro não força um <details> fechado a exibir o conteúdo no
 * desktop de forma confiável, e duplicar uma lista de links custa nada — zero
 * JS novo (o cursor do summary já vem do globals.css).
 */
const FooterSection = ({
  title,
  id,
  children,
}: {
  title: string
  id?: string
  children: React.ReactNode
}) => (
  <div id={id} className="scroll-mt-24">
    <details className="group border-b border-border py-3 md:hidden">
      <summary className="flex list-none items-center justify-between text-sm font-semibold uppercase tracking-wider [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <div className="pt-3">{children}</div>
    </details>

    <div className="hidden md:block">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">{title}</h3>
      <div className="mt-4">{children}</div>
    </div>
  </div>
)

const FooterLink = ({ label, href }: { label: string; href: string }) => (
  <Link
    href={href}
    className="text-sm text-muted-foreground transition-colors hover:text-foreground"
  >
    {label}
  </Link>
)

/**
 * Rodapé da loja no desenho do layout da cliente: newsletter + colunas
 * (acordeões no mobile) + formas de pagamento + faixa inferior na cor das
 * faixas (--tertiary). Server Component: a única ilha client é a newsletter.
 */
export const SiteFooter = ({
  store,
  logoUrl,
}: {
  store: PublicStore | null
  logoUrl: string | null
}) => {
  const storeName = store?.name ?? 'Arte no Jardim'
  const year = new Date().getFullYear()
  const whatsappHref = store?.phone ? `https://wa.me/55${store.phone.replace(/\D/g, '')}` : null

  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-8 px-4 py-10 md:grid-cols-[1.3fr_1fr_1fr] md:py-12 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        {/* Newsletter — sempre aberta, até no mobile: é a coluna que converte. */}
        <div className="md:pr-6 lg:col-span-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            Receba novidades e inspirações
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre-se e fique por dentro das novidades e lançamentos exclusivos.
          </p>
          <NewsletterForm className="mt-4 max-w-md" />
        </div>

        <FooterSection title="Atendimento" id="contato">
          <ul className="flex flex-col gap-2.5">
            {whatsappHref && (
              <li>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <WhatsAppIcon className="size-4 shrink-0" />
                  WhatsApp
                </a>
              </li>
            )}
            {store?.email && (
              <li>
                <a
                  href={`mailto:${store.email}`}
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
                  className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Phone className="size-4 shrink-0" />
                  {store.phone}
                </a>
              </li>
            )}
          </ul>
        </FooterSection>

        <FooterSection title="Institucional">
          <ul className="flex flex-col gap-2.5">
            {INSTITUTIONAL_LINKS.map((link) => (
              <li key={link.label}>
                <FooterLink {...link} />
              </li>
            ))}
          </ul>
        </FooterSection>

        <FooterSection title="Formas de pagamento">
          <PaymentMethods />
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden />
            Compra segura · pagamento processado pela Stripe
          </p>
        </FooterSection>
      </div>

      {/* Faixa inferior — a cor das faixas (--tertiary), como a barra de aviso. */}
      <div className="bg-tertiary text-tertiary-foreground">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-4 text-center md:flex-row md:text-left">
          <div className="flex items-center gap-2.5">
            <StoreLogo src={logoUrl} alt="" size={32} className="size-8 rounded-full bg-card/90 p-0.5" />
            <span className="font-display text-lg font-semibold tracking-tight">{storeName}</span>
          </div>

          <p className="text-xs opacity-90">
            © {year} {storeName} · feito à mão · todos os direitos reservados
          </p>

          <div className="flex items-center gap-3">
            {SOCIAL_LINKS.map(({ label, href, icon: Icon }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="transition-opacity hover:opacity-75"
              >
                <Icon className="size-4.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
