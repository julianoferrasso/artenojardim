-- CreateTable
CREATE TABLE "NewsletterSubscriber" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unsubscribedAt" TIMESTAMP(3),

    CONSTRAINT "NewsletterSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NewsletterSubscriber_storeId_idx" ON "NewsletterSubscriber"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "NewsletterSubscriber_storeId_email_key" ON "NewsletterSubscriber"("storeId", "email");

-- AddForeignKey
ALTER TABLE "NewsletterSubscriber" ADD CONSTRAINT "NewsletterSubscriber_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
