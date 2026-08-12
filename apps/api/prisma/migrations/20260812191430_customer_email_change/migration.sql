-- AlterEnum
ALTER TYPE "CustomerTokenPurpose" ADD VALUE 'EMAIL_CHANGE';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "pendingEmail" TEXT;
