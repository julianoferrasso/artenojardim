-- Contas que JÁ existiam quando a confirmação de e-mail passou a bloquear o login.
--
-- Sem este backfill, todo cliente cadastrado antes desta feature tem
-- `emailVerifiedAt` NULL e é recusado no login DEPOIS de digitar a senha certa —
-- um bloqueio total, e não gradual, no dia do deploy.
--
-- Marcamos com a data de criação da conta (não `now()`): é a data em que aquele
-- cadastro de fato aconteceu, e mentir menos no histórico custa nada aqui.
--
-- Só quem TEM senha: cliente de guest checkout (`passwordHash` NULL) nunca fez
-- login, então não há acesso a preservar — e ele confirma o e-mail pelo caminho
-- normal ao criar a conta.
UPDATE "Customer"
SET "emailVerifiedAt" = "createdAt"
WHERE "emailVerifiedAt" IS NULL
  AND "passwordHash" IS NOT NULL;
