-- Onde o banner aparece na home: carrossel do topo (HERO) ou faixa do meio
-- (MIDDLE). Default HERO = os banners existentes continuam no topo.

-- CreateEnum
CREATE TYPE "BannerPlacement" AS ENUM ('HERO', 'MIDDLE');

-- DropIndex
DROP INDEX "Banner_storeId_position_idx";

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "placement" "BannerPlacement" NOT NULL DEFAULT 'HERO';

-- CreateIndex
CREATE INDEX "Banner_storeId_placement_position_idx" ON "Banner"("storeId", "placement", "position");
