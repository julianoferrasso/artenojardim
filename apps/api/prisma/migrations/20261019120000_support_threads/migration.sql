-- Atendimento (conversas por pedido) + pedido de cancelamento consultável. Só
-- EXPANDE: o banco é compartilhado entre dev e produção, e o código antigo segue
-- no ar até o deploy — ele não lê nem escreve nada do que nasce aqui.

-- CreateEnum
CREATE TYPE "SupportThreadStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SupportAuthor" AS ENUM ('CUSTOMER', 'STAFF', 'SYSTEM');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cancelRequestReason" TEXT,
ADD COLUMN     "cancelRequestedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SupportThread" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "status" "SupportThreadStatus" NOT NULL DEFAULT 'OPEN',
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCustomerMessageAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SupportThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "author" "SupportAuthor" NOT NULL,
    "userId" TEXT,
    "topic" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SupportThread_orderId_key" ON "SupportThread"("orderId");

-- CreateIndex
CREATE INDEX "SupportThread_storeId_status_lastMessageAt_idx" ON "SupportThread"("storeId", "status", "lastMessageAt");

-- CreateIndex
CREATE INDEX "SupportThread_customerId_idx" ON "SupportThread"("customerId");

-- CreateIndex
CREATE INDEX "SupportMessage_threadId_createdAt_idx" ON "SupportMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportThread" ADD CONSTRAINT "SupportThread_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "SupportThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Até aqui, mensagem do cliente e pedido de cancelamento viviam só como
-- OrderEvent. Viram conversa. IDEMPOTENTE de propósito: entre o `migrate deploy`
-- e o restart da API o código antigo ainda grava eventos, então este bloco é
-- rodado de novo depois do deploy (docs/infra-vps.md) — o id da mensagem É o id
-- do evento, e o ON CONFLICT pula o que já veio.

-- Só pedido ainda vivo: a solicitação de um pedido já cancelado não espera nada.
UPDATE "Order" o
SET "cancelRequestedAt" = e."createdAt", "cancelRequestReason" = e."description"
FROM (
  SELECT DISTINCT ON ("orderId") "orderId", "createdAt", "description"
  FROM "OrderEvent"
  WHERE "type" = 'order.cancel_requested'
  ORDER BY "orderId", "createdAt" DESC
) e
WHERE o."id" = e."orderId" AND o."canceledAt" IS NULL AND o."cancelRequestedAt" IS NULL;

-- OPEN: ninguém respondeu, porque não havia por onde.
INSERT INTO "SupportThread" ("id", "storeId", "customerId", "orderId", "status", "lastMessageAt", "lastCustomerMessageAt", "createdAt", "updatedAt")
SELECT 'legacy_' || o."id", o."storeId", o."customerId", o."id", 'OPEN',
       max(e."createdAt"), max(e."createdAt"), min(e."createdAt"), now()
FROM "OrderEvent" e
JOIN "Order" o ON o."id" = e."orderId"
WHERE e."type" IN ('order.support_message', 'order.cancel_requested')
GROUP BY o."id"
ON CONFLICT ("orderId") DO NOTHING;

-- A descrição do support_message vinha com o assunto na frente ("[Entrega] ...");
-- o assunto agora tem coluna própria.
INSERT INTO "SupportMessage" ("id", "threadId", "author", "topic", "body", "createdAt")
SELECT e."id", t."id", 'CUSTOMER',
       CASE WHEN e."type" = 'order.cancel_requested' THEN 'CANCELLATION' ELSE e."metadataJson"->>'topic' END,
       CASE WHEN e."type" = 'order.support_message'
            THEN regexp_replace(e."description", '^\[[^]]*\]\s*', '')
            ELSE e."description" END,
       e."createdAt"
FROM "OrderEvent" e
JOIN "SupportThread" t ON t."orderId" = e."orderId"
WHERE e."type" IN ('order.support_message', 'order.cancel_requested')
ON CONFLICT ("id") DO NOTHING;
