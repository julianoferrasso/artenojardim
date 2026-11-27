-- O botão do banner passa a apontar para uma CATEGORIA, não para uma URL
-- digitada à mão: link inválido deixa de ser possível e renomear o endereço da
-- categoria não quebra o banner. Os links existentes são todos /categorias/{slug}
-- e viram o id da categoria da MESMA loja; o que não casar fica sem botão.

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "linkCategoryId" TEXT;

UPDATE "Banner" b
SET "linkCategoryId" = c."id"
FROM "Category" c
WHERE c."storeId" = b."storeId"
  AND b."linkUrl" = '/categorias/' || c."slug";

ALTER TABLE "Banner" DROP COLUMN "linkUrl";

-- AddForeignKey
ALTER TABLE "Banner" ADD CONSTRAINT "Banner_linkCategoryId_fkey" FOREIGN KEY ("linkCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
