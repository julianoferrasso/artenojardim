import { z } from 'zod'

/**
 * O ÚNICO lugar do projeto que lê process.env.
 *
 * Valida no import: faltou variável, o processo morre no boot com mensagem clara.
 * A alternativa — ler process.env.X espalhado — troca um erro de boot legível por
 * um `undefined` que só aparece na requisição que ninguém testou.
 */

const secret = (name: string) =>
  z.string().min(32, `${name} deve ter ao menos 32 caracteres — gere com: openssl rand -base64 48`)

const baseSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_URL: z.string().url(),

  DATABASE_URL: z.string().url(),

  /// Na Fase 4 esta variável some: o tenant passa a ser resolvido pelo Host.
  STORE_ID: z.string().min(1, 'STORE_ID vazio — rode `pnpm db:seed` e copie o id impresso'),

  JWT_ACCESS_SECRET: secret('JWT_ACCESS_SECRET'),
  JWT_REFRESH_SECRET: secret('JWT_REFRESH_SECRET'),
  JWT_CUSTOMER_ACCESS_SECRET: secret('JWT_CUSTOMER_ACCESS_SECRET'),
  JWT_CUSTOMER_REFRESH_SECRET: secret('JWT_CUSTOMER_REFRESH_SECRET'),
  ACCESS_TOKEN_TTL: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  COOKIE_DOMAIN: z.string().default('localhost'),

  STORE_URL: z.string().url(),
  ADMIN_URL: z.string().url(),

  STORAGE_DRIVER: z.enum(['local', 'r2']).default('local'),
  LOCAL_UPLOAD_DIR: z.string().default('./uploads'),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_PUBLIC_URL: z.string().url().optional(),

  // Frete via Melhor Envio (OAuth2). Opcional: sem isso a cotação responde um
  // erro de negócio claro ("frete não configurado"), não derruba o boot. O
  // access token NÃO vem daqui — é obtido pelo fluxo OAuth e guardado em Setting.
  MELHOR_ENVIO_BASE_URL: z.string().url().default('https://melhorenvio.com.br'),
  MELHOR_ENVIO_CLIENT_ID: z.string().optional(),
  MELHOR_ENVIO_CLIENT_SECRET: z.string().optional(),
  MELHOR_ENVIO_REDIRECT_URI: z.string().url().optional(),
  MELHOR_ENVIO_CONTACT_EMAIL: z.string().email().optional(),
})

/**
 * Credencial de R2 é obrigatória apenas quando o driver é r2. É o que permite
 * `pnpm dev` sem nenhuma credencial de nuvem — e o que impede subir em produção
 * com STORAGE_DRIVER=r2 e o bucket em branco.
 */
const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.STORAGE_DRIVER !== 'r2') return

  const required = [
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
    'R2_PUBLIC_URL',
  ] as const

  for (const key of required) {
    if (!env[key]) {
      ctx.addIssue({
        code: 'custom',
        path: [key],
        message: `${key} é obrigatório quando STORAGE_DRIVER=r2`,
      })
    }
  }
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('\n')

  // console.error e não o logger: o logger depende deste módulo.
  console.error(`\n✖ Variáveis de ambiente inválidas:\n\n${issues}\n\nVeja .env.example.\n`)
  process.exit(1)
}

export const env = parsed.data

export const isProduction = env.NODE_ENV === 'production'
export const isDevelopment = env.NODE_ENV === 'development'
export const isTest = env.NODE_ENV === 'test'
