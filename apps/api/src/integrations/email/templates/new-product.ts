import type { EmailContent } from '../send.js'
import {
  renderEmailLayout,
  renderEmailText,
  type EmailBranding,
  type EmailLayoutParams,
} from '../layout.js'

/**
 * E-mail de divulgação de produto. Função PURA — recebe URL, preço e imagem já
 * prontos, não sabe de banco, de centavos nem de storage.
 *
 * Serve tanto o disparo automático ao publicar quanto o botão da tela do
 * produto: a diferença entre os dois é quem chama, não o que o cliente lê.
 */
export const renderNewProduct = (params: {
  branding: EmailBranding
  productName: string
  productUrl: string
  /** Nulo quando o produto não tem foto — o layout simplesmente não mostra o bloco. */
  imageUrl: string | null
  /** Já formatado: "R$ 129,90" ou "A partir de R$ 129,90". */
  priceLabel: string
  shortDescription: string | null
  unsubscribeUrl: string
  /** Assunto escolhido pelo lojista no diálogo. Vazio = o padrão daqui. */
  subjectOverride?: string | undefined
}): EmailContent => {
  const paragraphs = [
    `Acabou de chegar no ateliê: ${params.productName}.`,
    ...(params.shortDescription ? [params.shortDescription] : []),
    'Toque no botão abaixo para ver as fotos e os detalhes na loja.',
  ]

  const layout: EmailLayoutParams = {
    branding: params.branding,
    heading: params.productName,
    paragraphs,
    ctaLabel: 'Ver na loja',
    ctaUrl: params.productUrl,
    footerNote: `Você recebe este e-mail porque aceitou receber novidades da ${params.branding.storeName}.`,
    ...(params.imageUrl
      ? {
          hero: {
            imageUrl: params.imageUrl,
            imageAlt: params.productName,
            priceLabel: params.priceLabel,
          },
        }
      : {}),
    unsubscribeUrl: params.unsubscribeUrl,
  }

  return {
    subject: params.subjectOverride ?? `Novidade na ${params.branding.storeName}: ${params.productName}`,
    html: renderEmailLayout(layout),
    text: renderEmailText(layout),
  }
}
