-- Pronta entrega × sob encomenda: a política de venda do produto, o prazo de
-- produção e o snapshot disso no pedido. Tudo com default: produto existente
-- continua STOCK_ONLY (comportamento de antes) e pedido existente, sem produção.

-- CreateEnum
CREATE TYPE "StockPolicy" AS ENUM ('STOCK_ONLY', 'STOCK_THEN_MADE_TO_ORDER', 'MADE_TO_ORDER');

-- AlterEnum
ALTER TYPE "AlertEventType" ADD VALUE 'PRODUCTION_DUE';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "productionDays" INTEGER,
ADD COLUMN     "stockPolicy" "StockPolicy" NOT NULL DEFAULT 'STOCK_ONLY';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "paymentDueAt" TIMESTAMP(3),
ADD COLUMN     "productionDays" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "madeToOrderQuantity" INTEGER NOT NULL DEFAULT 0;

-- CHECK constraints (o Prisma não modela; anexadas à mão).
-- O prazo, quando existe, é 1–60 dias úteis; fora de STOCK_ONLY ele é obrigatório.
-- A API valida antes (422); isto é a rede para o que escapar dela.
ALTER TABLE "Product" ADD CONSTRAINT "Product_productionDays_check"
  CHECK (("productionDays" IS NULL OR "productionDays" BETWEEN 1 AND 60)
     AND ("stockPolicy" = 'STOCK_ONLY' OR "productionDays" IS NOT NULL));

ALTER TABLE "Order" ADD CONSTRAINT "Order_productionDays_nonneg" CHECK ("productionDays" >= 0);

-- A parte sob encomenda nunca passa da quantidade da linha.
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_madeToOrderQuantity_range"
  CHECK ("madeToOrderQuantity" BETWEEN 0 AND "quantity");
