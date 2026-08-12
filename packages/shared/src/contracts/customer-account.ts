import { z } from 'zod'
import { emailSchema, passwordSchema } from './common.js'

/**
 * Troca de CREDENCIAL pelo próprio cliente, na área da conta.
 *
 * Separado de `customer-profile.ts` de propósito: aquele é dado cadastral, que
 * salva e acabou. Aqui cada operação exige a senha atual e tem consequência de
 * segurança — derrubar sessões, ou trocar o endereço por onde a conta é
 * recuperada. Misturar os dois faria o formulário de "mudar o telefone" herdar,
 * algum dia, um campo de senha.
 */

/**
 * Troca de senha por quem SABE a senha atual.
 *
 * `currentPassword` é `min(1)` e não `passwordSchema`: a senha antiga pode ter
 * nascido sob outra regra, e recusá-la por comprimento diria ao cliente que ele
 * digitou errado quando o problema é o nosso schema.
 *
 * A confirmação ("repita a senha") NÃO está aqui — é validação de formulário, e
 * a API não tem o que fazer com um segundo campo idêntico. Ela mora no `.extend`
 * da página, como em `/entrar/redefinir-senha`.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual'),
    password: passwordSchema,
  })
  .refine((v) => v.currentPassword !== v.password, {
    path: ['password'],
    message: 'A nova senha deve ser diferente da atual',
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

/**
 * Pedido de troca de e-mail. Exige a senha porque trocar o e-mail é trocar a
 * credencial de RECUPERAÇÃO: quem controla a caixa controla o "esqueci a senha",
 * logo controla a conta. Uma aba esquecida aberta não pode bastar.
 *
 * O e-mail NÃO muda aqui — vai para `Customer.pendingEmail` e só substitui o
 * atual quando o link enviado para ele for clicado.
 */
export const changeEmailSchema = z.object({
  email: emailSchema,
  currentPassword: z.string().min(1, 'Informe a senha atual'),
})

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>

/** Consumo do link da troca. Público: quem clica costuma estar deslogado, e a
 *  posse do token é a prova. */
export const confirmEmailChangeSchema = z.object({ token: z.string().min(1) })

export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>

/**
 * Exclusão da própria conta (LGPD). Pede a senha porque é irreversível: o dado
 * pessoal é destruído e não há desfazer. Os pedidos permanecem, anonimizados —
 * nota fiscal emitida não pode sumir.
 */
export const deleteAccountSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual'),
})

export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>

/**
 * Uma sessão viva do cliente, para a lista de dispositivos.
 *
 * `device` já vem resumido do backend ("Chrome no Windows"): o `userAgent` cru é
 * ilegível, e decidir isso no front espalharia a mesma tabela de regex por dois
 * apps.
 */
export const customerSessionSchema = z.object({
  id: z.string(),
  device: z.string(),
  ip: z.string().nullable(),
  createdAt: z.string(),
  /// A sessão de onde veio esta requisição. A tela não pode oferecer "encerrar"
  /// para ela sem avisar que é a de agora.
  current: z.boolean(),
})

export type CustomerSessionItem = z.infer<typeof customerSessionSchema>
