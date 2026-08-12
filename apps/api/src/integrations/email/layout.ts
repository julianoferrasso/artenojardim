/**
 * Casca visual comum dos e-mails. Função PURA: recebe tudo pronto, não lê banco
 * nem env — é o que a torna testável sem infraestrutura.
 *
 * ── Por que estilo inline e tabela, e não Tailwind ───────────────────────────
 * A regra de "só token semântico do shadcn" vale para a loja, onde há CSS. Aqui
 * não há: o Gmail remove <style> do <head>, e nenhum cliente de e-mail conhece
 * classe utilitária. Cor literal e <table> são a única coisa que renderiza igual
 * no Gmail, Outlook e Apple Mail. É a exceção, e ela para na caixa de entrada.
 */

export type EmailBranding = {
  storeName: string
  storeUrl: string
  logoUrl: string | null
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

/** Destaque visual acima dos parágrafos: a foto do produto e o preço. */
export type EmailHero = {
  imageUrl: string
  imageAlt: string
  /** Já formatado ("R$ 129,90", "A partir de R$ 129,90"): a função é PURA e não
   *  conhece Intl nem centavos. */
  priceLabel: string
}

/** Tabela de itens de um pedido. Todo valor chega em texto, já formatado. */
export type EmailLineItems = {
  rows: Array<{ label: string; qty: number; price: string }>
  /** Subtotal, frete, desconto, total — nesta ordem, do jeito que aparece. */
  totals: Array<{ label: string; value: string; strong?: boolean }>
}

export type EmailLayoutParams = {
  branding: EmailBranding
  heading: string
  /** Parágrafos do corpo, em texto puro — a função escapa e envolve em <p>. */
  paragraphs: string[]
  ctaLabel: string
  ctaUrl: string
  /** Aviso final: o que fazer se o cliente não pediu isto. */
  footerNote: string
  /** Opcional: ausente nos transacionais, que não têm produto para mostrar. */
  hero?: EmailHero | undefined
  /** Opcional: só a confirmação de pedido tem itens. */
  lineItems?: EmailLineItems | undefined
  /**
   * Opcional, e a ausência é significativa: e-mail TRANSACIONAL não leva link de
   * descadastro. Quem confirma a conta não pode "sair da lista" da confirmação —
   * e oferecer isso num e-mail obrigatório treina o cliente a marcar spam.
   */
  unsubscribeUrl?: string | undefined
}

export const renderEmailLayout = (params: EmailLayoutParams): string => {
  const { branding, heading, paragraphs, ctaLabel, ctaUrl, footerNote, hero, lineItems } = params

  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.storeName)}" width="56" style="display:block;margin:0 auto 16px;border:0;max-width:56px;height:auto;">`
    : ''

  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(text)}</p>`,
    )
    .join('')

  // width fixo + max-width:100%: o Outlook ignora CSS de dimensão e obedece só ao
  // atributo width; os demais clientes respeitam o max-width e não estouram no
  // celular. Os dois juntos é o que faz a imagem caber nos dois mundos.
  const heroBlock = hero
    ? `<tr><td style="padding-bottom:20px;">
            <img src="${escapeHtml(hero.imageUrl)}" alt="${escapeHtml(hero.imageAlt)}" width="416" style="display:block;width:100%;max-width:416px;height:auto;border:0;border-radius:8px;">
            <p style="margin:12px 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:17px;font-weight:600;color:#1c1917;">${escapeHtml(hero.priceLabel)}</p>
          </td></tr>`
    : ''

  const itemRows = lineItems
    ? lineItems.rows
        .map(
          (row) =>
            `<tr>
              <td style="padding:8px 0;border-bottom:1px solid #f4f1ef;font-size:14px;line-height:1.5;color:#3f3f46;">${escapeHtml(row.label)}<span style="color:#a8a29e;"> × ${row.qty}</span></td>
              <td align="right" style="padding:8px 0 8px 12px;border-bottom:1px solid #f4f1ef;font-size:14px;color:#3f3f46;white-space:nowrap;">${escapeHtml(row.price)}</td>
            </tr>`,
        )
        .join('')
    : ''

  const totalRows = lineItems
    ? lineItems.totals
        .map(
          (total) =>
            `<tr>
              <td style="padding:${total.strong ? '12px 0 0' : '6px 0 0'};font-size:${total.strong ? '15px' : '14px'};color:${total.strong ? '#1c1917' : '#78716c'};${total.strong ? 'font-weight:600;' : ''}">${escapeHtml(total.label)}</td>
              <td align="right" style="padding:${total.strong ? '12px 0 0 12px' : '6px 0 0 12px'};font-size:${total.strong ? '15px' : '14px'};color:${total.strong ? '#1c1917' : '#78716c'};${total.strong ? 'font-weight:600;' : ''}white-space:nowrap;">${escapeHtml(total.value)}</td>
            </tr>`,
        )
        .join('')
    : ''

  const itemsBlock = lineItems
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
            ${itemRows}${totalRows}
          </table>`
    : ''

  // Fora do cartão branco, junto do nome da loja: é onde o olho procura, e é o
  // que o cliente encontra em vez do botão "marcar como spam".
  const unsubscribeBlock = params.unsubscribeUrl
    ? `<p style="margin:8px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#a8a29e;">
        <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#a8a29e;text-decoration:underline;">Não quero mais receber estes e-mails</a>
      </p>`
    : ''

  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#faf7f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf7f5;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border:1px solid #ece7e3;border-radius:12px;padding:32px;">
        <tr><td align="center" style="padding-bottom:8px;">
          ${logo}
          <h1 style="margin:0 0 24px;font-family:Georgia,'Times New Roman',serif;font-size:22px;font-weight:600;color:#1c1917;">${escapeHtml(heading)}</h1>
        </td></tr>
        ${heroBlock}
        <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          ${body}
          ${itemsBlock}
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;">
            <tr><td align="center" style="border-radius:8px;background-color:#b4654a;">
              <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;font-weight:500;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
            </td></tr>
          </table>
          <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#78716c;">Se o botão não funcionar, copie e cole este endereço no navegador:</p>
          <p style="margin:0 0 24px;font-size:12px;line-height:1.5;word-break:break-all;color:#78716c;">${escapeHtml(ctaUrl)}</p>
          <p style="margin:0;padding-top:20px;border-top:1px solid #ece7e3;font-size:13px;line-height:1.6;color:#78716c;">${escapeHtml(footerNote)}</p>
        </td></tr>
      </table>
      <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;color:#a8a29e;">
        <a href="${escapeHtml(branding.storeUrl)}" style="color:#a8a29e;text-decoration:none;">${escapeHtml(branding.storeName)}</a>
      </p>
      ${unsubscribeBlock}
    </td></tr>
  </table>
</body>
</html>`
}

/** Versão texto puro do mesmo conteúdo. Não é opcional: e-mail só-HTML pontua
 *  como spam, e leitor de tela agradece. */
export const renderEmailText = (params: EmailLayoutParams): string =>
  [
    params.heading,
    '',
    ...params.paragraphs,
    ...(params.hero ? ['', params.hero.priceLabel] : []),
    ...(params.lineItems
      ? [
          '',
          ...params.lineItems.rows.map((row) => `- ${row.label} × ${row.qty}  ${row.price}`),
          '',
          ...params.lineItems.totals.map((total) => `${total.label}: ${total.value}`),
        ]
      : []),
    '',
    `${params.ctaLabel}: ${params.ctaUrl}`,
    '',
    params.footerNote,
    '',
    `${params.branding.storeName} — ${params.branding.storeUrl}`,
    ...(params.unsubscribeUrl
      ? ['', `Para não receber mais estes e-mails: ${params.unsubscribeUrl}`]
      : []),
  ].join('\n')
