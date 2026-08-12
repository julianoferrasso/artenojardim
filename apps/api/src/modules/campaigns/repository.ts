import { prisma } from '../../config/prisma.js'
import type { CampaignRecipientSource } from '@ecommerce/shared/contracts'

/**
 * A união dos destinatários: clientes que aceitam marketing (com e-mail
 * confirmado) e inscritos ativos da newsletter, deduplicados por ENDEREÇO.
 *
 * Existe como repository — e não dentro do service — porque a mesma query serve
 * a prévia da tela e o disparo, e as duas PRECISAM concordar: uma lista que
 * mostra 300 e envia para 280 é um bug que só aparece depois do envio.
 */

export type RecipientRow = {
  email: string
  name: string | null
  customerId: string | null
  source: CampaignRecipientSource
}

/**
 * FULL OUTER JOIN entre os dois conjuntos, em UMA query.
 *
 * `$queryRaw` porque o Prisma não faz FULL OUTER JOIN entre modelos distintos. A
 * alternativa seria dois `findMany` + merge em JS, o que traria as duas listas
 * inteiras para a memória do Node e faria a dedupe virar código nosso — e a
 * dedupe é exatamente onde o bug mora.
 *
 * Tagged template = prepared statement: `storeId` é parâmetro, não interpolação.
 * As colunas são listadas uma a uma, como manda a regra do `select` explícito.
 *
 * `LOWER(email)` nos dois lados: os contratos normalizam hoje, mas nem sempre
 * normalizaram, e um endereço gravado com maiúscula viraria destinatário
 * duplicado — a mesma pessoa recebendo o e-mail duas vezes.
 */
export const findRecipients = async (storeId: string): Promise<RecipientRow[]> => {
  const rows = await prisma.$queryRaw<
    Array<{ email: string; name: string | null; customerId: string | null; source: string }>
  >`
    SELECT
      COALESCE(c.email, n.email) AS email,
      c.name                     AS name,
      c.id                       AS "customerId",
      CASE
        WHEN c.id IS NOT NULL AND n.id IS NOT NULL THEN 'BOTH'
        WHEN c.id IS NOT NULL                      THEN 'CUSTOMER'
        ELSE 'NEWSLETTER'
      END                        AS source
    FROM (
      SELECT id, LOWER(email) AS email, name
      FROM "Customer"
      WHERE "storeId" = ${storeId}
        AND "acceptsMarketing" = true
        -- Sem e-mail confirmado não há prova de que o endereço é de quem disse
        -- ser: mandar marketing para lá é spam para um terceiro.
        AND "emailVerifiedAt" IS NOT NULL
        AND "deletedAt" IS NULL
    ) c
    FULL OUTER JOIN (
      SELECT id, LOWER(email) AS email
      FROM "NewsletterSubscriber"
      WHERE "storeId" = ${storeId}
        AND "unsubscribedAt" IS NULL
    ) n ON n.email = c.email
    ORDER BY 1
  `

  return rows.map((row) => ({
    email: row.email,
    name: row.name,
    customerId: row.customerId,
    source: row.source as CampaignRecipientSource,
  }))
}
