/**
 * Fachada da integração de e-mail. Os módulos importam daqui — não dos arquivos
 * internos — para que a organização (client, envio, templates) mude sem tocar em
 * quem usa. O SDK do SES só existe atrás desta porta: trocar SES por outro
 * provedor é reescrever `client.ts` e `send.ts`, e nada mais.
 */
export { sendEmail, sendEmailSafe, type EmailContent, type SendEmailInput } from './send.js'
export { type EmailBranding } from './layout.js'
export { renderVerifyEmail } from './templates/verify-email.js'
export { renderResetPassword } from './templates/reset-password.js'
