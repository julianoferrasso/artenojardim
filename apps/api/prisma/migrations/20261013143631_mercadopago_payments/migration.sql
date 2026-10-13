-- Mercado Pago (Orders API) como provedor de pagamento, Stripe em standby.
-- Só EXPANDE: o banco é compartilhado entre dev e produção, e o código antigo
-- continua no ar até o deploy — ele insere Payment sem `provider` (o default
-- STRIPE cobre) e só lê linhas do Stripe.

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MERCADO_PAGO');

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "metadataJson" JSONB,
ADD COLUMN     "mpOrderId" TEXT,
ADD COLUMN     "mpPaymentId" TEXT,
ADD COLUMN     "provider" "PaymentProvider" NOT NULL DEFAULT 'STRIPE',
ADD COLUMN     "statusDetail" TEXT,
ALTER COLUMN "stripePaymentIntentId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpOrderId_key" ON "Payment"("mpOrderId");
