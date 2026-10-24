-- Posição da foto do banner (à direita ou de fundo) e desfoque atrás do texto.
-- Defaults = o comportamento da v1, então os banners existentes não mudam.

-- CreateEnum
CREATE TYPE "BannerLayout" AS ENUM ('SIDE', 'COVER');

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "blurBehindText" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "layout" "BannerLayout" NOT NULL DEFAULT 'SIDE';
