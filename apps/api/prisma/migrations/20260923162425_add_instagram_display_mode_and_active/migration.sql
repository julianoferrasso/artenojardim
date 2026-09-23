-- CreateEnum
CREATE TYPE "InstagramDisplayMode" AS ENUM ('IMAGE', 'EMBED');

-- DropForeignKey
ALTER TABLE "InstagramPost" DROP CONSTRAINT "InstagramPost_imageId_fkey";

-- AlterTable
ALTER TABLE "InstagramPost" ADD COLUMN     "captioned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "displayMode" "InstagramDisplayMode" NOT NULL DEFAULT 'IMAGE',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "imageId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "InstagramPost" ADD CONSTRAINT "InstagramPost_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Upload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
