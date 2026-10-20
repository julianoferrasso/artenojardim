-- Alertas da equipe (e-mail, Telegram, WhatsApp) com destinos confirmados por
-- código. Só EXPANDE: o banco é compartilhado entre dev e produção, e o código
-- antigo segue no ar até o deploy — ele não lê nem escreve nada do que nasce aqui.
-- O Setting `notifications` fica onde está (inerte): o código novo não o lê mais.

-- CreateEnum
CREATE TYPE "AlertChannel" AS ENUM ('EMAIL', 'TELEGRAM', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('ORDER_PAID', 'CANCELLATION_REQUESTED', 'ORDER_CANCELED_BY_CUSTOMER', 'REFUND_FAILED', 'ORDER_CREATED', 'CUSTOMER_MESSAGE', 'LOW_STOCK', 'SHIPPING_DISCONNECTED', 'SITE_DOWN');

-- CreateTable
CREATE TABLE "AlertDestination" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "channel" "AlertChannel" NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT,
    "addressLabel" TEXT,
    "events" "AlertEventType"[] DEFAULT ARRAY[]::"AlertEventType"[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "verifiedAt" TIMESTAMP(3),
    "codeHash" TEXT,
    "codeExpiresAt" TIMESTAMP(3),
    "codeAttempts" INTEGER NOT NULL DEFAULT 0,
    "codeSentAt" TIMESTAMP(3),
    "linkTokenHash" TEXT,
    "linkExpiresAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertDestination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "type" "AlertEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertDelivery" (
    "id" TEXT NOT NULL,
    "alertId" TEXT NOT NULL,
    "destinationId" TEXT NOT NULL,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AlertDestination_linkTokenHash_key" ON "AlertDestination"("linkTokenHash");

-- CreateIndex
CREATE INDEX "AlertDestination_storeId_idx" ON "AlertDestination"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDestination_storeId_channel_address_key" ON "AlertDestination"("storeId", "channel", "address");

-- CreateIndex
CREATE INDEX "Alert_storeId_createdAt_idx" ON "Alert"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "AlertDelivery_destinationId_idx" ON "AlertDelivery"("destinationId");

-- CreateIndex
CREATE UNIQUE INDEX "AlertDelivery_alertId_destinationId_key" ON "AlertDelivery"("alertId", "destinationId");

-- AddForeignKey
ALTER TABLE "AlertDestination" ADD CONSTRAINT "AlertDestination_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "Alert"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertDelivery" ADD CONSTRAINT "AlertDelivery_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "AlertDestination"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── Backfill ────────────────────────────────────────────────────────────────
-- O e-mail que já recebia os avisos da equipe (notifications.staffEmail, ou o
-- e-mail da loja quando vazio) vira o primeiro destino, JÁ VERIFICADO: exigir o
-- código no deploy calaria os avisos até alguém digitá-lo. Assina os eventos de
-- padrão ligado (todos menos ORDER_CREATED). Idempotente: id derivado da loja.
INSERT INTO "AlertDestination" ("id", "storeId", "channel", "label", "address", "events", "enabled", "verifiedAt", "createdAt", "updatedAt")
SELECT 'legacy_email_' || st."id",
       st."id",
       'EMAIL',
       'E-mail da equipe',
       lower(trim(COALESCE(NULLIF(trim(s."valueJson"->>'staffEmail'), ''), st."email"))),
       ARRAY['ORDER_PAID', 'CANCELLATION_REQUESTED', 'ORDER_CANCELED_BY_CUSTOMER', 'REFUND_FAILED',
             'CUSTOMER_MESSAGE', 'LOW_STOCK', 'SHIPPING_DISCONNECTED', 'SITE_DOWN']::"AlertEventType"[],
       true,
       now(),
       now(),
       now()
FROM "Store" st
LEFT JOIN "Setting" s ON s."storeId" = st."id" AND s."key" = 'notifications'
ON CONFLICT DO NOTHING;
