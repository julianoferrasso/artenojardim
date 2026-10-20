import { Mail } from 'lucide-react'
import type { AlertChannel } from '@ecommerce/shared/constants'
import { TelegramIcon, WhatsAppIcon } from '@/components/brand-icons'

export const ChannelIcon = ({ channel, className }: { channel: AlertChannel; className?: string }) => {
  if (channel === 'TELEGRAM') return <TelegramIcon className={className} />
  if (channel === 'WHATSAPP') return <WhatsAppIcon className={className} />
  return <Mail className={className} aria-hidden="true" />
}
