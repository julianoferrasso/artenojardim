-- Fundo do banner que prolonga a borda da foto. Nulo de propósito: banner
-- existente continua sem fundo amostrado, e a loja cai na cor secundária do tema.

-- AlterTable
ALTER TABLE "Banner" ADD COLUMN     "backdrop" JSONB;
