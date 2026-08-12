-- CreateTable
CREATE TABLE "CustomerProductView" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerProductView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerProductView_customerId_viewedAt_idx" ON "CustomerProductView"("customerId", "viewedAt");

-- CreateIndex
CREATE INDEX "CustomerProductView_storeId_date_idx" ON "CustomerProductView"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerProductView_customerId_productId_date_key" ON "CustomerProductView"("customerId", "productId", "date");

-- AddForeignKey
ALTER TABLE "CustomerProductView" ADD CONSTRAINT "CustomerProductView_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerProductView" ADD CONSTRAINT "CustomerProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
