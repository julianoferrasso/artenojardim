import type { EmailContent } from '../../integrations/email/index.js'
import { renderNewProduct } from '../../integrations/email/index.js'
import { getEmailBranding } from '../../shared/email-branding.js'
import { buildOneClickUnsubscribeUrl, buildUnsubscribeUrl } from '../../shared/unsubscribe.js'

/**
 * Dados do produto que viajam DENTRO da mensagem, resolvidos uma vez pelo
 * service no momento do disparo.
 *
 * Poderiam ser relidos do banco por destinatário — e seria errado: o produto
 * pode mudar de preço, de foto ou ser arquivado no meio de um envio de 2.000
 * e-mails, e metade da base receberia um e-mail diferente da outra metade. O
 * snapshot é o que garante que a campanha é UMA campanha.
 */
export type CampaignEmailData = {
  productName: string
  productUrl: string
  imageUrl: string | null
  priceLabel: string
  shortDescription: string | null
  subject: string
}

export const renderCampaignEmail = async (
  data: CampaignEmailData,
  to: string,
): Promise<{ email: EmailContent; headers: Record<string, string> }> => {
  const branding = await getEmailBranding()
  const unsubscribeUrl = buildUnsubscribeUrl(to)

  const email = renderNewProduct({
    branding,
    productName: data.productName,
    productUrl: data.productUrl,
    imageUrl: data.imageUrl,
    priceLabel: data.priceLabel,
    shortDescription: data.shortDescription,
    unsubscribeUrl,
    subjectOverride: data.subject,
  })

  return {
    email,
    headers: {
      // O que faz o Gmail mostrar "Cancelar inscrição" ao lado do remetente. O
      // cliente que aperta esse botão não aperta o de spam — e é a diferença
      // entre os dois que sustenta a reputação do domínio no SES.
      //
      // Aponta para a API, não para a página da loja: o Gmail faz um POST direto
      // do servidor dele, sem navegador e sem rodar JavaScript.
      'List-Unsubscribe': `<${buildOneClickUnsubscribeUrl(to)}>`,
      // Sem este segundo cabeçalho o Gmail exige confirmação por e-mail e a
      // maioria desiste no meio, ficando na lista e marcando spam depois.
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  }
}
