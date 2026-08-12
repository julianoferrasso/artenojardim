import { Prisma } from '@prisma/client'
import {
  ERROR_CODES,
  type ChangeEmailInput,
  type ChangePasswordInput,
  type CustomerSessionItem,
  type DeleteAccountInput,
} from '@ecommerce/shared/contracts'
import { EVENTS } from '@ecommerce/shared/constants'
import { prisma } from '../../config/prisma.js'
import { env } from '../../config/env.js'
import { logger } from '../../config/logger.js'
import { appError, conflict, unauthorized } from '../../shared/errors.js'
import { getActiveStoreId } from '../../shared/store-context.js'
import { audit } from '../../shared/audit.js'
import { getEmailBranding } from '../../shared/email-branding.js'
import { anonymizeCustomerData } from '../../shared/anonymize-customer.js'
import {
  revokeAllSessions,
  type SessionContext,
} from '../../shared/refresh-tokens.js'
import { hashPassword, verifyPassword } from '../../utils/crypto.js'
import {
  renderConfirmEmailChange,
  renderEmailChangeNotice,
  sendEmailSafe,
} from '../../integrations/email/index.js'
import {
  consumeCustomerToken,
  findValidCustomerToken,
  issueCustomerToken,
} from '../customer-auth/tokens.js'
import { issueCustomerSession, type CustomerSession } from '../customer-auth/service.js'
import { describeDevice } from './domain/describe-device.js'
import { maskEmail } from './domain/mask-email.js'

/**
 * Troca de CREDENCIAL e encerramento de conta pelo próprio cliente.
 *
 * Separado do `service.ts` do mesmo módulo de propósito: lá o comentário de topo
 * declara que ação de cliente não é auditada, e está certo para dado cadastral.
 * Aqui é o oposto — toda operação deste arquivo é evento de SEGURANÇA e vai para
 * o AuditLog, a mesma exceção que já vale para `customer.passwordReset`.
 */

const emailChangeTtlMs = (): number => env.EMAIL_VERIFICATION_TTL_HOURS * 3600 * 1000

/**
 * Carrega o cliente e confere a senha atual. É o portão das três operações.
 *
 * Sem `dummyVerify`: as rotas daqui exigem sessão válida, então não há
 * enumeração de e-mail a fechar — quem chegou já provou ser este cliente.
 */
const assertPassword = async (
  customerId: string,
  currentPassword: string,
): Promise<{ id: string; name: string; email: string }> => {
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    select: { id: true, name: true, email: true, passwordHash: true },
  })

  // Cliente sem senha só existe em conta de guest checkout, e ela não consegue
  // logar (loginCustomer recusa passwordHash null) — logo não chega aqui. Isto é
  // uma guarda contra um futuro com magic link, não um caminho da interface: por
  // isso responde "sessão inválida", e não "crie uma senha".
  if (!customer?.passwordHash) throw unauthorized('Sessão inválida')

  if (!(await verifyPassword(customer.passwordHash, currentPassword))) {
    throw appError(ERROR_CODES.INVALID_CREDENTIALS, 'Senha atual incorreta', 401)
  }

  return { id: customer.id, name: customer.name, email: customer.email }
}

/**
 * Troca de senha por quem SABE a senha atual. Devolve uma sessão NOVA.
 *
 * Revogar tudo e reemitir, em vez de deslogar: quem acabou de provar a senha
 * atual não é o invasor que a revogação existe para expulsar. Mandá-lo para o
 * login logo depois de trocar a senha faz a tela parecer erro — e a leitura
 * natural ("não funcionou, vou tentar a antiga") desestimula justamente o que a
 * funcionalidade quer incentivar.
 *
 * O contraste com `resetCustomerPassword`, que de propósito NÃO emite sessão, é
 * correto: lá o cliente não sabe a senha e pode estar se recuperando de um
 * comprometimento.
 */
export const changeCustomerPassword = async (
  customerId: string,
  input: ChangePasswordInput,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  await assertPassword(customerId, input.currentPassword)

  const passwordHash = await hashPassword(input.password)

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id: customerId },
      data: {
        passwordHash,
        // Trocar a senha CANCELA uma troca de e-mail pendente. É o que o aviso
        // enviado à caixa antiga promete ao dono legítimo: "se não foi você,
        // troque a senha agora". Sem isto, a promessa seria falsa e o link do
        // atacante continuaria de pé.
        pendingEmail: null,
      },
    })
    await tx.customerToken.updateMany({
      where: { customerId, purpose: 'EMAIL_CHANGE', usedAt: null },
      data: { usedAt: new Date() },
    })
    await revokeAllSessions({ kind: 'customer', id: customerId }, tx)
  })

  await audit({
    action: EVENTS.customer.passwordChanged,
    entityType: 'Customer',
    entityId: customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  // DEPOIS do commit, nunca dentro: emitir o refresh token dentro da mesma
  // transação que revoga tudo o mataria junto — o updateMany do revoke não tem
  // como excluir uma linha que ainda não existe.
  return issueCustomerSession(customerId, ctx)
}

/**
 * Emite o token e manda os DOIS e-mails da troca. NUNCA lança: é chamada depois
 * de o pedido já estar gravado, e uma falha do SES não pode virar 500 numa
 * operação que aconteceu. O cliente sempre tem a saída de pedir de novo.
 */
const dispatchEmailChange = async (
  customer: { id: string; name: string; email: string },
  newEmail: string,
  ctx: SessionContext,
): Promise<void> => {
  try {
    const [{ token, confirmDelivery }, branding] = await Promise.all([
      issueCustomerToken({
        customerId: customer.id,
        purpose: 'EMAIL_CHANGE',
        ttlMs: emailChangeTtlMs(),
        ctx,
      }),
      getEmailBranding(),
    ])

    const confirm = renderConfirmEmailChange({
      branding,
      customerName: customer.name,
      newEmail,
      // Fora de /conta: quem clica costuma estar deslogado (abriu no celular),
      // e o guard daquele layout o mandaria para o login.
      confirmUrl: `${branding.storeUrl}/confirmar-email?token=${encodeURIComponent(token)}`,
      expiresInHours: env.EMAIL_VERIFICATION_TTL_HOURS,
    })

    const sent = await sendEmailSafe({
      ...confirm,
      to: newEmail,
      tags: { template: 'confirm_email_change' },
    })

    // Só aposenta os links anteriores se este de fato saiu.
    if (sent) await confirmDelivery()

    // Aviso à caixa ANTIGA, enviado mesmo que o primeiro tenha falhado: é a única
    // detecção que o dono legítimo tem se a sessão foi roubada.
    const notice = renderEmailChangeNotice({
      branding,
      customerName: customer.name,
      maskedNewEmail: maskEmail(newEmail),
      accountUrl: `${branding.storeUrl}/conta/dados`,
    })
    await sendEmailSafe({
      ...notice,
      to: customer.email,
      tags: { template: 'email_change_notice' },
    })
  } catch (err) {
    // A URL NUNCA entra no log: o token cru está nela.
    logger.error({ err, customerId: customer.id }, 'falha ao enviar a troca de e-mail')
  }
}

/**
 * Pede a troca de e-mail. NÃO troca nada: grava o pendente e dispara os e-mails.
 * O endereço só muda quando o link enviado ao novo for clicado.
 */
export const requestEmailChange = async (
  customerId: string,
  input: ChangeEmailInput,
  ctx: SessionContext,
): Promise<{ pendingEmail: string }> => {
  const storeId = getActiveStoreId()
  const customer = await assertPassword(customerId, input.currentPassword)

  // Pedir o e-mail que já é o seu não é erro, é ruído: responde sucesso sem
  // gastar dois envios e sem deixar uma pendência que nunca vai se resolver.
  if (input.email === customer.email) {
    return { pendingEmail: customer.email }
  }

  // Checagem OTIMISTA: não fecha a corrida — o endereço pode ser cadastrado entre
  // aqui e o clique, e por isso o consumo tem o seu próprio tratamento de P2002.
  // Ela existe para não gastar um envio e um clique do cliente no caso comum.
  const taken = await prisma.customer.findUnique({
    where: { storeId_email: { storeId, email: input.email } },
    select: { id: true },
  })
  if (taken) {
    throw conflict('Este e-mail já pertence a outra conta.', ERROR_CODES.EMAIL_ALREADY_EXISTS)
  }

  // Sobrescreve: um pedido novo aposenta o anterior. O token antigo segue vivo
  // por um instante, mas o consumo confere o `pendingEmail` — um link velho
  // apontando para um endereço de que o cliente desistiu não troca nada.
  await prisma.customer.updateMany({
    where: { id: customerId, storeId, deletedAt: null },
    data: { pendingEmail: input.email },
  })

  await dispatchEmailChange(customer, input.email, ctx)

  // Auditado mesmo que a troca nunca se conclua: o pedido que não virou troca é
  // justamente o rastro de uma tentativa de tomada de conta.
  await audit({
    action: EVENTS.customer.emailChangeRequested,
    entityType: 'Customer',
    entityId: customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  return { pendingEmail: input.email }
}

/** Desiste da troca. Sem senha e sem auditoria: só remove uma pendência, que é a
 *  direção segura. Mata o link ativamente em vez de confiar só na checagem do
 *  consumo. */
export const cancelEmailChange = async (customerId: string): Promise<void> => {
  await prisma.customer.updateMany({
    where: { id: customerId, storeId: getActiveStoreId(), deletedAt: null },
    data: { pendingEmail: null },
  })
  await prisma.customerToken.updateMany({
    where: { customerId, purpose: 'EMAIL_CHANGE', usedAt: null },
    data: { usedAt: new Date() },
  })
}

/**
 * Consome o link e efetiva a troca. Público: a posse do token é a prova, e quem
 * clica costuma estar deslogado.
 */
export const confirmEmailChange = async (token: string, ctx: SessionContext): Promise<void> => {
  const stored = await findValidCustomerToken(token, 'EMAIL_CHANGE')

  await prisma.$transaction(async (tx) => {
    await consumeCustomerToken(tx, stored.id)

    const current = await tx.customer.findUniqueOrThrow({
      where: { id: stored.customerId },
      select: { pendingEmail: true },
    })

    // Sem pendingEmail o token é órfão: o cliente cancelou, trocou a senha ou
    // pediu outro endereço depois. O link não tinha sido consumido, mas o que ele
    // prometia trocar já não existe.
    if (!current.pendingEmail) {
      throw appError(
        ERROR_CODES.EMAIL_TOKEN_INVALID,
        'Este link expirou ou já foi utilizado. Solicite um novo.',
        400,
      )
    }

    try {
      await tx.customer.update({
        where: { id: stored.customerId },
        data: {
          email: current.pendingEmail,
          pendingEmail: null,
          // Clicar no link PROVOU a posse da caixa nova. Diferente da troca feita
          // pelo staff, onde quem digitou não prova posse de nada.
          emailVerifiedAt: new Date(),
        },
      })
    } catch (err) {
      // P2002 = @@unique([storeId, email]): entre o pedido e o clique alguém
      // cadastrou este endereço. É a corrida que o `pendingEmail` sem índice
      // único aceita de propósito. O throw reverte o consumo do token — queimar o
      // link por um problema que não foi do cliente seria punição indevida.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw conflict('Este e-mail já pertence a outra conta.', ERROR_CODES.EMAIL_ALREADY_EXISTS)
      }
      throw err
    }

    // O e-mail é a credencial de recuperação: sessões abertas sob o endereço
    // antigo não podem sobreviver à troca.
    await revokeAllSessions({ kind: 'customer', id: stored.customerId }, tx)
  })

  await audit({
    action: EVENTS.customer.emailChanged,
    entityType: 'Customer',
    entityId: stored.customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })
}

/**
 * Dispositivos conectados. Lê os refresh tokens vivos — cada um é uma sessão.
 *
 * Como sabemos qual é a sessão ATUAL: pelo par (userAgent, ip) da requisição, a
 * mais recente que casar. Não pelo cookie de refresh — ele é gravado com
 * `Path=/api/v1/auth/refresh` e por isso o navegador NÃO o envia para esta rota;
 * tentar lê-lo aqui marcaria "este dispositivo" em ninguém, sempre. Também não
 * pelo access token, que não carrega identificador de sessão.
 *
 * É heurística, e assumidamente: dois navegadores idênticos no mesmo IP marcam a
 * sessão errada. O custo desse erro é pequeno — o rótulo "este dispositivo" sai
 * do lugar — e o botão que importa encerra TODAS as outras de qualquer forma.
 */
export const listCustomerSessions = async (
  customerId: string,
  ctx: SessionContext,
): Promise<CustomerSessionItem[]> => {
  const rows = await prisma.refreshToken.findMany({
    where: { customerId, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, ip: true, userAgent: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  })

  // `find` sobre a lista já ordenada por createdAt desc: a mais recente que casa.
  const currentId = rows.find(
    (row) => row.userAgent === (ctx.userAgent ?? null) && row.ip === (ctx.ip ?? null),
  )?.id

  return rows.map((row) => ({
    id: row.id,
    device: describeDevice(row.userAgent),
    ip: row.ip,
    createdAt: row.createdAt.toISOString(),
    current: row.id === currentId,
  }))
}

/**
 * Encerra as outras sessões e reemite a atual — a mesma mecânica da troca de
 * senha, e pela mesma razão: quem pediu está aqui e não deve ser expulso junto.
 */
export const revokeOtherSessions = async (
  customerId: string,
  ctx: SessionContext,
): Promise<CustomerSession> => {
  await revokeAllSessions({ kind: 'customer', id: customerId })

  await audit({
    action: EVENTS.customer.sessionsRevoked,
    entityType: 'Customer',
    entityId: customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })

  return issueCustomerSession(customerId, ctx)
}

/**
 * Exclusão da própria conta (LGPD). Destrói o dado pessoal e preserva os pedidos:
 * histórico fiscal não pode sumir, e o pedido já guarda nome e endereço em
 * snapshot próprio.
 *
 * Mesmo efeito da anonimização feita pelo staff — o que muda é a autorização
 * (aqui, a senha atual) e o evento de auditoria.
 */
export const deleteOwnAccount = async (
  customerId: string,
  input: DeleteAccountInput,
  ctx: SessionContext,
): Promise<void> => {
  await assertPassword(customerId, input.currentPassword)

  await anonymizeCustomerData(customerId)

  // SEM `changes`: o diff seria justamente o dado pessoal que esta ação existe
  // para destruir.
  await audit({
    action: EVENTS.customer.selfDeleted,
    entityType: 'Customer',
    entityId: customerId,
    context: { ip: ctx.ip, userAgent: ctx.userAgent },
  })
}
