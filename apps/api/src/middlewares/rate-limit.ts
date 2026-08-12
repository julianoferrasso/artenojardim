import {
  ipKeyGenerator,
  rateLimit,
  type Store,
  type ClientRateLimitInfo,
  type Options,
} from 'express-rate-limit'
import type { Request, RequestHandler } from 'express'
import { ERROR_CODES } from '@ecommerce/shared/contracts'
import { prisma } from '../config/prisma.js'
import { logger } from '../config/logger.js'
import { isTest } from '../config/env.js'

/**
 * Store no Postgres, não em memória.
 *
 * Com `pm2 cluster` de 4 instâncias, um contador em memória vive por processo:
 * o limite real vira 4x o configurado, e quem faz brute force simplesmente cai
 * na instância que ainda tem folga. O contador precisa ser compartilhado.
 *
 * Não usamos Redis porque há uma VPS e o Postgres já está lá, com backup e
 * monitoramento. Trocar quando houver uma segunda VPS — só este arquivo muda.
 */
const createPostgresStore = (windowMs: number): Store => ({
  async increment(key: string): Promise<ClientRateLimitInfo> {
    const expiresAt = new Date(Date.now() + windowMs)

    // Um UPSERT atômico, e não SELECT-depois-UPDATE: entre a leitura e a escrita
    // cabem dez requisições do atacante. Aqui o Postgres arbitra, sob o lock da
    // linha. O CASE reinicia a janela quando ela já expirou, em vez de exigir
    // um job de limpeza no caminho crítico.
    //
    // Os `AT TIME ZONE 'UTC'` daqui não são enfeite: sem eles a janela erra por
    // 3 horas nesta VPS.
    //
    // A coluna é `timestamp without time zone` guardando instante UTC (padrão do
    // Prisma). No SQL CRU o Prisma vincula um `Date` como `timestamptz`, e o
    // Postgres o converte para a coluna naive usando o fuso da SESSÃO — que aqui
    // é America/Sao_Paulo. Resultado: o INSERT gravava 3h no passado, e a
    // comparação com `now()` (também timestamptz) reinterpretava o armazenado 3h
    // no futuro. Dois erros que se cancelavam em parte, e por isso passavam
    // despercebidos. Pelo caminho TIPADO do Prisma nada disso acontece — é
    // exclusivo do SQL cru.
    //
    // Com os casts, os dois lados são naive-UTC e batem com o que o resto do
    // sistema grava. Não troque por um `Date` do JS vinculado sem cast: volta ao
    // mesmo bug.
    const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
      INSERT INTO "RateLimit" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${expiresAt}::timestamptz AT TIME ZONE 'UTC')
      ON CONFLICT ("key") DO UPDATE SET
        "count"     = CASE WHEN "RateLimit"."expiresAt" < (now() AT TIME ZONE 'UTC') THEN 1 ELSE "RateLimit"."count" + 1 END,
        "expiresAt" = CASE WHEN "RateLimit"."expiresAt" < (now() AT TIME ZONE 'UTC') THEN ${expiresAt}::timestamptz AT TIME ZONE 'UTC' ELSE "RateLimit"."expiresAt" END
      RETURNING "count", "expiresAt"
    `

    const row = rows[0]
    if (!row) throw new Error('rate limit: upsert não retornou linha')

    return { totalHits: row.count, resetTime: row.expiresAt }
  },

  async decrement(key: string): Promise<void> {
    await prisma.$executeRaw`
      UPDATE "RateLimit" SET "count" = GREATEST("count" - 1, 0) WHERE "key" = ${key}
    `
  },

  async resetKey(key: string): Promise<void> {
    await prisma.rateLimit.deleteMany({ where: { key } })
  },
})

const handler: Options['handler'] = (req, res, _next, options) => {
  logger.warn({ ip: req.ip, path: req.path }, 'rate limit atingido')
  res.status(options.statusCode).json({
    error: {
      code: ERROR_CODES.RATE_LIMITED,
      message: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      requestId: req.requestId,
    },
  })
}

type LimiterConfig = {
  name: string
  windowMs: number
  max: number
  /**
   * Escopo do contador. Sem isto, o limite é por IP.
   *
   * Recebe o IP JÁ NORMALIZADO: um endereço IPv6 é reduzido ao prefixo /64. Sem
   * essa redução o limite por IP é decorativo — uma faixa IPv6 doméstica tem
   * trilhões de endereços, e trocar de endereço a cada tentativa zera o contador.
   */
  keyBy?: (req: Request, ip: string) => string
}

const build = ({ name, windowMs, max, keyBy }: LimiterConfig): RequestHandler =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    store: createPostgresStore(windowMs),
    handler,
    // O prefixo evita que dois limitadores diferentes compartilhem contador para
    // o mesmo IP — sem ele, errar o login consumiria a cota do checkout.
    //
    // `ipKeyGenerator` normaliza IPv6 para o prefixo /64. É a própria lib que
    // exige: um keyGenerator que use req.ip cru derruba o boot com
    // ERR_ERL_KEY_GEN_IPV6, porque o limite por IP seria contornável.
    keyGenerator: (req) => {
      const ip = ipKeyGenerator(req.ip ?? '')
      return `${name}:${keyBy ? keyBy(req, ip) : ip || 'unknown'}`
    },
    skip: () => isTest,
  })

/** Barreira geral. O Nginx tem a dele na frente — bloquear lá custa 1000x menos. */
export const globalLimiter = build({ name: 'global', windowMs: 15 * 60_000, max: 300 })

/**
 * Por IP **e** e-mail: só por IP, um atacante atrás de CGNAT bloqueia usuários
 * legítimos; só por e-mail, ele varre e-mails à vontade de um único IP.
 * O e-mail entra normalizado — senão `A@x.com` e `a@x.com` seriam cotas distintas.
 */
export const loginLimiter = build({
  name: 'login',
  windowMs: 15 * 60_000,
  max: 5,
  keyBy: (req, ip) => {
    const email = (req.body as { email?: string })?.email?.toLowerCase().trim() ?? ''
    return `${ip}:${email}`
  },
})

export const refreshLimiter = build({ name: 'refresh', windowMs: 15 * 60_000, max: 60 })

export const registerLimiter = build({ name: 'register', windowMs: 60 * 60_000, max: 3 })

export const forgotPasswordLimiter = build({
  name: 'forgot',
  windowMs: 60 * 60_000,
  max: 3,
  keyBy: (req, ip) => (req.body as { email?: string })?.email?.toLowerCase().trim() || ip,
})

/**
 * Consumir um link de e-mail: por IP, contra varredura de token. Mais folgado
 * que o envio porque o mesmo cliente reabre o link, volta e clica de novo — e
 * nenhuma dessas tentativas é ataque.
 *
 * Dois limitadores e não um: com o contador compartilhado, uma casa atrás do
 * mesmo NAT gastaria no reset a cota de confirmar a conta, e vice-versa.
 */
export const verifyEmailLimiter = build({ name: 'verify-email', windowMs: 60 * 60_000, max: 10 })

export const resetPasswordLimiter = build({ name: 'reset-password', windowMs: 60 * 60_000, max: 10 })

/** Reenvio da confirmação: por e-mail, como o forgot. Só por IP, um atacante
 *  varreria mil endereços; só por IP também puniria a casa toda atrás do NAT. */
export const resendVerificationLimiter = build({
  name: 'resend-verification',
  windowMs: 60 * 60_000,
  max: 3,
  keyBy: (req, ip) => (req.body as { email?: string })?.email?.toLowerCase().trim() || ip,
})

/**
 * Cotação de frete: cada chamada bate no Melhor Envio (custo e latência de 1–3s).
 * Público (loja anônima cota no produto), então o limite protege a nossa cota na
 * API deles contra abuso.
 */
export const shippingQuoteLimiter = build({ name: 'shipping-quote', windowMs: 60 * 60_000, max: 60 })

/** Confirmar pedido cria Order + reserva estoque: limita abuso por IP. */
export const checkoutConfirmLimiter = build({ name: 'checkout-confirm', windowMs: 60 * 60_000, max: 20 })

/** Inscrição na newsletter é pública e grava no banco: 5/h por IP segura flood de bots. */
export const newsletterLimiter = build({ name: 'newsletter', windowMs: 60 * 60_000, max: 5 })

/**
 * Descadastro. Mais folgado que a inscrição de propósito: sair da lista não pode
 * ser mais difícil que entrar. Quem clica duas vezes no link, ou volta ao e-mail
 * antigo semanas depois, precisa conseguir — um 429 aqui empurra a pessoa direto
 * para o botão de spam, que custa a reputação do domínio no SES.
 */
export const unsubscribeLimiter = build({ name: 'unsubscribe', windowMs: 60 * 60_000, max: 30 })

/**
 * Beacon de visita ao produto. Generoso de propósito: um cliente navegando pela
 * loja dispara um por produto aberto, e apertar aqui mutila a própria métrica.
 * O limite existe contra o script que inflaria "mais visitados", não contra quem
 * está comprando. Por IP mesmo quando há cliente logado — o abuso que importa
 * vem do anônimo, e limitar por customerId deixaria a rota pública sem teto.
 */
export const productViewLimiter = build({ name: 'product-view', windowMs: 60_000, max: 60 })

/**
 * Ações do cliente sobre o próprio pedido.
 *
 * Escopo por CLIENTE e não por IP: estas rotas estão atrás de
 * `authenticateCustomer`, e limitar por IP faria uma casa com três pessoas no
 * mesmo NAT — ou um escritório inteiro — dividir a mesma cota.
 */
/**
 * Sem fallback para req.ip de propósito: estas rotas ficam atrás do
 * `authenticateCustomer` no router, então `req.auth.sub` sempre existe. Um
 * fallback por IP aqui seria código morto — e faria o express-rate-limit
 * reclamar de bypass por IPv6 sobre um caminho que não é alcançável.
 */
const byCustomer = (req: Request): string => req.auth?.sub ?? 'anonymous'

/** Mensagem de suporte cria evento no pedido: o limite é contra flood na timeline. */
export const orderSupportLimiter = build({
  name: 'order-support',
  windowMs: 60 * 60_000,
  max: 5,
  keyBy: byCustomer,
})

export const orderCancelLimiter = build({
  name: 'order-cancel',
  windowMs: 60 * 60_000,
  max: 10,
  keyBy: byCustomer,
})

/** Comprar de novo escreve no carrinho e lê estoque item a item. */
export const orderReorderLimiter = build({
  name: 'order-reorder',
  windowMs: 60 * 60_000,
  max: 30,
  keyBy: byCustomer,
})

/**
 * Trocar a senha sabendo a atual. Escopo por CLIENTE, não por IP: a rota exige
 * sessão, e limitar por IP faria uma casa atrás do mesmo NAT dividir a cota.
 *
 * 5 e não 3 porque `currentPassword` errado consome tentativa, e quem erra a
 * senha atual três vezes costuma acertar na quarta. O que este limite impede é
 * usar a rota como oráculo de senha a partir de uma sessão roubada — e para isso
 * 5 por hora já é intransponível.
 */
export const changePasswordLimiter = build({
  name: 'change-password',
  windowMs: 60 * 60_000,
  max: 5,
  keyBy: byCustomer,
})

/** Pedir a troca de e-mail dispara DOIS envios (novo + aviso ao antigo). O teto
 *  aqui é a nossa cota no SES, não o abuso de conta: 3/h, como o cadastro. */
export const changeEmailLimiter = build({
  name: 'change-email',
  windowMs: 60 * 60_000,
  max: 3,
  keyBy: byCustomer,
})

/**
 * Consumir o link da troca. PÚBLICO — o cliente costuma clicar deslogado, noutro
 * navegador — então por IP, porque não há `req.auth` para escopar. Os mesmos
 * 10/h dos outros consumos de link: reabrir a aba e clicar de novo não é ataque.
 */
export const confirmEmailChangeLimiter = build({
  name: 'confirm-email-change',
  windowMs: 60 * 60_000,
  max: 10,
})

/** Excluir a conta é irreversível e exige a senha: o limite é contra usar a rota
 *  como oráculo de senha, não contra o cliente decidido. */
export const deleteAccountLimiter = build({
  name: 'delete-account',
  windowMs: 60 * 60_000,
  max: 3,
  keyBy: byCustomer,
})
