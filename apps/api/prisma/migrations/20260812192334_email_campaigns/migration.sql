-- CreateEnum
CREATE TYPE "EmailCampaignKind" AS ENUM ('NEW_PRODUCT', 'MANUAL');

-- CreateEnum
CREATE TYPE "EmailCampaignStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "ProcessedEvent" (
    "id" TEXT NOT NULL,
    "queue" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "kind" "EmailCampaignKind" NOT NULL,
    "status" "EmailCampaignStatus" NOT NULL DEFAULT 'PENDING',
    "productId" TEXT,
    "subject" TEXT NOT NULL,
    "recipientCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaignRecipient" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),

    CONSTRAINT "EmailCampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedEvent_processedAt_idx" ON "ProcessedEvent"("processedAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_storeId_createdAt_idx" ON "EmailCampaign"("storeId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailCampaign_productId_idx" ON "EmailCampaign"("productId");

-- CreateIndex
CREATE INDEX "EmailCampaignRecipient_campaignId_status_idx" ON "EmailCampaignRecipient"("campaignId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmailCampaignRecipient_campaignId_email_key" ON "EmailCampaignRecipient"("campaignId", "email");

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaignRecipient" ADD CONSTRAINT "EmailCampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "EmailCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Trava de envio único do e-mail de novidade: um produto só pode ser anunciado
-- UMA vez. Escrito à mão porque o Prisma não expressa índice PARCIAL (`@@unique`
-- não aceita WHERE) — ele não aparece no schema.prisma e um `migrate dev` que
-- recrie a tabela vai perdê-lo. O comentário do modelo EmailCampaign guarda a
-- cópia deste SQL para esse dia.
--
-- MANUAL fica de fora do índice de propósito: reenviar é a função do botão.
-- `canceledAt IS NULL` deixa uma campanha cancelada liberar o produto de novo.
CREATE UNIQUE INDEX "EmailCampaign_new_product_once"
  ON "EmailCampaign" ("storeId", "productId")
  WHERE "kind" = 'NEW_PRODUCT' AND "canceledAt" IS NULL;
