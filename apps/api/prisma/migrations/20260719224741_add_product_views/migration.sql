-- CreateTable
CREATE TABLE "ProductView" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductView_storeId_date_idx" ON "ProductView"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductView_storeId_productId_date_key" ON "ProductView"("storeId", "productId", "date");

-- AddForeignKey
ALTER TABLE "ProductView" ADD CONSTRAINT "ProductView_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
