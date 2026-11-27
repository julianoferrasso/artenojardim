-- CreateTable
CREATE TABLE "CustomerEmailCode" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "CustomerEmailCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerEmailCode_storeId_email_createdAt_idx" ON "CustomerEmailCode"("storeId", "email", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerEmailCode_createdAt_idx" ON "CustomerEmailCode"("createdAt");

-- AddForeignKey
ALTER TABLE "CustomerEmailCode" ADD CONSTRAINT "CustomerEmailCode_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

