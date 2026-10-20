-- Visitas à loja (rollup por hora, origem e dispositivo), o denominador da taxa
-- de conversão do dashboard. Só EXPANDE: o banco é compartilhado entre dev e
-- produção, e o código antigo segue no ar até o deploy — ele não lê nem escreve
-- nada do que nasce aqui.

-- CreateTable
CREATE TABLE "StoreVisit" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hour" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "StoreVisit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoreVisit_storeId_date_hour_source_device_key" ON "StoreVisit"("storeId", "date", "hour", "source", "device");

-- AddForeignKey
ALTER TABLE "StoreVisit" ADD CONSTRAINT "StoreVisit_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
