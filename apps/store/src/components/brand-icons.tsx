/**
 * Ícones de MARCA (redes sociais, meios de pagamento) — saíram do lucide
 * (deprecados) ou nunca existiram lá. SVG inline com o mesmo traço dos demais
 * ícones da loja, sempre `currentColor`: a cor vem do token de quem usa, nunca
 * do logo oficial colorido.
 */

export const InstagramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
)

export const FacebookIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
  </svg>
)

export const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M3 21l1.65-4.4A8.5 8.5 0 1 1 8 19.34z" />
    <path d="M9 10a4.5 4.5 0 0 0 5 5l1-2-2-1-1 1a2.5 2.5 0 0 1-1-1l1-1-1-2z" />
  </svg>
)

/** O elo (handle) das redes: perfil e URL num lugar só, para não divergirem. */
export const INSTAGRAM_PROFILE = {
  handle: '@arte_no_jardim',
  url: 'https://instagram.com/arte_no_jardim',
}

export const FACEBOOK_PROFILE = {
  url: 'https://facebook.com/artenojardim',
}
