import { z } from 'zod'
import { emailSchema, internalPathSchema, passwordSchema } from './common.js'
import { userRoleSchema } from '../constants/enums.js'

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe a senha'),
})

export type LoginInput = z.infer<typeof loginSchema>

/** `trim` ANTES do `min`: "  a " passaria no comprimento e viraria "a". */
export const customerNameSchema = z.string().trim().min(2, 'Informe seu nome').max(120)

/**
 * Cadastro. SEM senha de propósito: senha só existe em conta com e-mail
 * confirmado. Gravá-la antes abriria o pré-sequestro — alguém cadastra o e-mail
 * alheio com uma senha sua, e o dono, ao confirmar a caixa, ativa a senha do
 * outro. A loja guarda a senha digitada e a grava logo depois da confirmação,
 * já com a sessão (`POST /customers/me/password`, primeira senha).
 */
export const registerSchema = z.object({
  name: customerNameSchema,
  email: emailSchema,
  /** Para onde o link do e-mail devolve o cliente (ex.: `/checkout`). */
  next: internalPathSchema.optional(),
  /**
   * Novidades e promoções. Marcado por padrão no formulário, o cliente desmarca.
   *
   * O default TRUE mora AQUI e não na coluna do Prisma, que segue `false`. A
   * coluna também governa quem nasce pelo guest checkout — sem nunca ter visto
   * caixa nenhuma. Mudá-la lá inscreveria todo comprador convidado em silêncio,
   * que é exatamente o que a LGPD não perdoa. Aqui, o default significa "quem
   * usou o formulário e não mexeu na caixa quis dizer sim".
   */
  acceptsMarketing: z.boolean().default(true),
})

export type RegisterInput = z.infer<typeof registerSchema>

/**
 * O formulário da loja: o cadastro mais a senha, que fica na aba e só viaja
 * depois da confirmação (ver `registerSchema`).
 */
export const registerFormSchema = registerSchema.extend({ password: passwordSchema })

/**
 * O que o FORMULÁRIO preenche, antes do Zod aplicar o default. Difere da saída
 * em `acceptsMarketing`, que aqui é opcional e lá é obrigatório — é a diferença
 * que o `useForm<Entrada, _, Saída>` precisa enxergar, senão o resolver não casa
 * com o tipo do formulário.
 */
export type RegisterFormInput = z.input<typeof registerFormSchema>
export type RegisterFormOutput = z.infer<typeof registerFormSchema>

export const EMAIL_CODE_LENGTH = 6

/** Código do e-mail. Aceita "123 456" e "123-456": quem cola do e-mail traz o que vier junto. */
export const emailCodeSchema = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))
  .pipe(z.string().length(EMAIL_CODE_LENGTH, `O código tem ${EMAIL_CODE_LENGTH} dígitos`))

/**
 * Pede um código por e-mail (checkout, "entrar com código", confirmação). A
 * resposta é a MESMA para qualquer e-mail: a conta só nasce quando o código
 * confere, então pedir não diz se o endereço é cliente.
 */
export const requestEmailCodeSchema = z.object({ email: emailSchema })

/**
 * Confere o código e entra. `name` só é usado se o e-mail ainda não tem conta
 * (sem ele a API responde NAME_REQUIRED e o mesmo código continua valendo).
 */
export const verifyEmailCodeSchema = z.object({
  email: emailSchema,
  code: emailCodeSchema,
  name: customerNameSchema.optional(),
})

export type RequestEmailCodeInput = z.infer<typeof requestEmailCodeSchema>
export type VerifyEmailCodeInput = z.infer<typeof verifyEmailCodeSchema>

/** `resendInSeconds`: quando a tela pode oferecer "reenviar". */
export const emailCodeSentResponseSchema = z.object({
  data: z.object({
    email: z.string(),
    resendInSeconds: z.number().int().nonnegative(),
  }),
})

export type EmailCodeSent = z.infer<typeof emailCodeSentResponseSchema>['data']

export const forgotPasswordSchema = z.object({ email: emailSchema })

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
})

export const verifyEmailSchema = z.object({ token: z.string().min(1) })

export const resendVerificationSchema = z.object({ email: emailSchema })

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>
export type ResendVerificationInput = z.infer<typeof resendVerificationSchema>

/**
 * Resposta do cadastro. NÃO traz sessão: a conta só entra depois que o cliente
 * digita o código (ou clica no link) enviado por e-mail. O `email` volta para a
 * tela dizer "enviamos para fulano@..." e oferecer o reenvio sem pedir de novo.
 */
export const registerResponseSchema = z.object({
  data: z.object({
    emailVerificationRequired: z.literal(true),
    email: z.string(),
    resendInSeconds: z.number().int().nonnegative(),
  }),
})

/**
 * A resposta NÃO carrega o refresh token: ele vai em cookie HttpOnly, fora do
 * alcance do JS. `expiresIn` em segundos para o cliente agendar a renovação.
 */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
})

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: userRoleSchema,
})

export const authCustomerSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  /// Derivado de `emailVerifiedAt`: o front não precisa da data, só do estado.
  emailVerified: z.boolean(),
  /// Vem junto da sessão para a tela de preferências abrir já no estado certo,
  /// sem um segundo request só para ler um booleano.
  acceptsMarketing: z.boolean(),
  /// Idem: `/conta/dados` abre com o telefone preenchido sem um GET extra. Um
  /// endpoint de perfil à parte criaria duas fontes de "quem é o cliente", e
  /// elas divergem no primeiro dia em que uma for atualizada e a outra não.
  phone: z.string().nullable(),
  /// E-mail aguardando confirmação, ou null. A tela precisa saber se há troca em
  /// curso para mostrar "aguardando" em vez do formulário.
  pendingEmail: z.string().nullable(),
  document: z.string().nullable(),
  /// `true` quando já existe pedido: o CPF virou dado fiscal e congelou. Vem
  /// derivado porque o front não pode decidir isso — quem sabe é o banco.
  documentLocked: z.boolean(),
  /// Conta criada pelo código do e-mail nasce sem senha. A loja oferece "criar
  /// senha" em vez de "trocar senha", e esconde o que exige a senha atual.
  hasPassword: z.boolean(),
})

export const adminLoginResponseSchema = z.object({
  data: z.object({
    user: authUserSchema,
    tokens: authTokensSchema,
  }),
})

export const customerLoginResponseSchema = z.object({
  data: z.object({
    customer: authCustomerSchema,
    tokens: authTokensSchema,
  }),
})

export type AuthUser = z.infer<typeof authUserSchema>
export type AuthCustomer = z.infer<typeof authCustomerSchema>
export type AuthTokens = z.infer<typeof authTokensSchema>
