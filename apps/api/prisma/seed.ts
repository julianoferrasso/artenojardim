import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { randomBytes } from 'node:crypto'

/**
 * Cria a loja única, o usuário OWNER e as settings iniciais.
 *
 * Idempotente: rodar duas vezes não duplica nada. Seed que só funciona em banco
 * vazio é seed que você não roda quando precisa.
 *
 * Não importa src/config/env.ts de propósito: aquele módulo exige STORE_ID, que
 * é justamente o que este script produz.
 */

const prisma = new PrismaClient()

const STORE_SLUG = 'arte-no-jardim'

const seed = async (): Promise<void> => {
  const store = await prisma.store.upsert({
    where: { slug: STORE_SLUG },
    update: {},
    create: {
      name: 'Arte no Jardim',
      slug: STORE_SLUG,
      domain: process.env['STORE_DOMAIN'] ?? 'localhost:3000',
      email: 'contato@artenojardim.com.br',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
    },
  })

  const ownerEmail = process.env['OWNER_EMAIL'] ?? 'julianoferrasso@hotmail.com'
  const existingOwner = await prisma.user.findUnique({
    where: { storeId_email: { storeId: store.id, email: ownerEmail } },
    select: { id: true },
  })

  // Senha aleatória impressa uma vez. Um seed com senha fixa ("admin123") é uma
  // senha fixa em produção no dia em que alguém rodar o seed lá.
  let ownerPassword: string | undefined
  if (!existingOwner) {
    ownerPassword = randomBytes(12).toString('base64url')
    await prisma.user.create({
      data: {
        storeId: store.id,
        name: 'Juliano Ferrasso',
        email: ownerEmail,
        passwordHash: await argon2.hash(ownerPassword, { type: argon2.argon2id }),
        role: 'OWNER',
      },
    })
  }

  const settings: Array<{ key: string; valueJson: object }> = [
    { key: 'feature_flags', valueJson: { reviews: false, wishlist: false, giftCards: false } },
    { key: 'reservation_ttl_minutes', valueJson: { CARD: 30, PIX: 60, BOLETO: 4320 } },
    {
      key: 'shipping',
      valueJson: { freeShippingAboveCents: null, additionalDays: 2, enabledServices: [] },
    },
  ]

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { storeId_key: { storeId: store.id, key: setting.key } },
      update: {},
      create: { storeId: store.id, ...setting },
    })
  }

  console.log(`
┌────────────────────────────────────────────────────────────────────┐
│  Seed concluído                                                    │
└────────────────────────────────────────────────────────────────────┘

  Loja:  ${store.name}  (${store.slug})

  Copie para apps/api/.env:

    STORE_ID=${store.id}
${
  ownerPassword
    ? `
  Usuário OWNER criado. A senha aparece UMA vez — guarde agora:

    E-mail: ${ownerEmail}
    Senha:  ${ownerPassword}
`
    : `
  Usuário OWNER já existia (${ownerEmail}); senha inalterada.
`
}`)
}

seed()
  .catch((err) => {
    console.error('Seed falhou:', err)
    process.exit(1)
  })
  .finally(() => void prisma.$disconnect())
