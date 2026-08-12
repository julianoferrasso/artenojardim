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

export type EmailLayoutParams = {
  branding: EmailBranding
  heading: string
  /** Parágrafos do corpo, em texto puro — a função escapa e envolve em <p>. */
  paragraphs: string[]
  ctaLabel: string
  ctaUrl: string
  /** Aviso final: o que fazer se o cliente não pediu isto. */
  footerNote: string
}

export const renderEmailLayout = (params: EmailLayoutParams): string => {
  const { branding, heading, paragraphs, ctaLabel, ctaUrl, footerNote } = params

  const logo = branding.logoUrl
    ? `<img src="${escapeHtml(branding.logoUrl)}" alt="${escapeHtml(branding.storeName)}" width="56" style="display:block;margin:0 auto 16px;border:0;max-width:56px;height:auto;">`
    : ''

  const body = paragraphs
    .map(
      (text) =>
        `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#3f3f46;">${escapeHtml(text)}</p>`,
    )
    .join('')

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
        <tr><td style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
          ${body}
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
    '',
    `${params.ctaLabel}: ${params.ctaUrl}`,
    '',
    params.footerNote,
    '',
    `${params.branding.storeName} — ${params.branding.storeUrl}`,
  ].join('\n')
