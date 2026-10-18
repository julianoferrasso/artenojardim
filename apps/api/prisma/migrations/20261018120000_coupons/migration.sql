-- Cupons de desconto. Só EXPANDE: o banco é compartilhado entre dev e produção,
-- e o código antigo continua no ar até o deploy — ele nunca escreve
-- Order.couponId (sempre NULL hoje), então a FK nova não barra nada.
--
-- Sem tabela de usos: um pedido não cancelado com couponId É o uso. O
-- Coupon.usageCount é só o cache que permite o UPDATE atômico do limite.

-- CreateEnum
CREATE TYPE "CouponType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING');

-- CreateTable
CREATE TABLE "Coupon" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" "CouponType" NOT NULL,
    "value" INTEGER NOT NULL,
    "minOrderValue" INTEGER,
    "usageLimit" INTEGER,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "usageLimitPerCustomer" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Coupon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Coupon_storeId_code_key" ON "Coupon"("storeId", "code");

-- CreateIndex
CREATE INDEX "Order_couponId_idx" ON "Order"("couponId");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "Coupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraints (o Prisma não modela; anexadas à mão).
-- Porcentagem acima de 100 faria o desconto passar do subtotal; o contador
-- negativo seria um cancelamento devolvendo um uso que nunca foi contado.
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_percentage_range" CHECK ("type" <> 'PERCENTAGE' OR "value" BETWEEN 1 AND 100);
ALTER TABLE "Coupon" ADD CONSTRAINT "Coupon_usageCount_nonneg" CHECK ("usageCount" >= 0);
