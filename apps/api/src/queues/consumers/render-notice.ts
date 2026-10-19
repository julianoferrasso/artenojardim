import type { EmailContent, NoticeContent } from '../../integrations/email/index.js'
import { renderNotice } from '../../integrations/email/index.js'
import { getEmailBranding } from '../../shared/email-branding.js'

/**
 * O texto do aviso chega pronto na mensagem; aqui entra só a marca. Como na
 * confirmação de pedido, o consumidor não relê o banco: o e-mail registra o que
 * aconteceu no instante da publicação.
 */
export type NoticeEmailData = NoticeContent

export const renderNoticeEmail = async (data: NoticeEmailData): Promise<EmailContent> =>
  renderNotice({ branding: await getEmailBranding(), ...data })
