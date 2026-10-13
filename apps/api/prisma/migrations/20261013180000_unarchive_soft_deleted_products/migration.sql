-- "Arquivar" deixa de ser soft delete: passa a ser só status ARCHIVED, visível no
-- admin. Os produtos arquivados pelo fluxo antigo (ARCHIVED + deletedAt) estavam
-- invisíveis até para o lojista — este UPDATE os traz de volta como Arquivados.
-- Continuam fora da loja: o público só vê ACTIVE.
UPDATE "Product" SET "deletedAt" = NULL WHERE "status" = 'ARCHIVED' AND "deletedAt" IS NOT NULL;
