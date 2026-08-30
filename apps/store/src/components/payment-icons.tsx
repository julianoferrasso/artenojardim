import { Barcode, CreditCard, QrCode } from 'lucide-react'

/**
 * Formas de pagamento do rodapé. Chips monocromáticos com tokens do tema —
 * nunca os logos coloridos oficiais (regra do projeto: cor só via token; um
 * PNG da bandeira ignoraria o painel de Aparência e destoaria em qualquer
 * paleta que o lojista escolher).
 */

const CHIP =
  'flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-semibold tracking-wide text-muted-foreground'

export const PaymentMethods = () => (
  <ul className="flex flex-wrap gap-2" aria-label="Formas de pagamento aceitas">
    <li className={CHIP}>
      <QrCode className="size-3.5" aria-hidden />
      PIX
    </li>
    <li className={CHIP}>
      <Barcode className="size-3.5" aria-hidden />
      BOLETO
    </li>
    <li className={CHIP}>
      <CreditCard className="size-3.5" aria-hidden />
      VISA
    </li>
    <li className={CHIP}>
      <CreditCard className="size-3.5" aria-hidden />
      MASTERCARD
    </li>
    <li className={CHIP}>
      <CreditCard className="size-3.5" aria-hidden />
      ELO
    </li>
  </ul>
)
