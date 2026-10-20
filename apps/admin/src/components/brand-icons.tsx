/**
 * Ícones de MARCA dos canais de alerta — o lucide 1.x não traz ícone de marca.
 * Mesmo traço dos ícones do lucide e sempre `currentColor`: a cor vem do token de
 * quem usa, nunca do logo oficial colorido. O do WhatsApp é o mesmo da loja.
 */

export const WhatsAppIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <path d="M3 21l1.65-4.4A8.5 8.5 0 1 1 8 19.34z" />
    <path d="M9 10a4.5 4.5 0 0 0 5 5l1-2-2-1-1 1a2.5 2.5 0 0 1-1-1l1-1-1-2z" />
  </svg>
)

/** O avião de papel do Telegram dentro do círculo. */
export const TelegramIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="10" />
    <path d="M7 12.5l9.5-4.5-2 9-3.5-2.5-1.5 2v-3.5l5-4" />
  </svg>
)
