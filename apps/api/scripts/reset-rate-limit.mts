import { PrismaClient } from '@prisma/client'

// Utilitário de DESENVOLVIMENTO: zera os contadores de rate limit para poder
// testar login repetidamente sem esperar 15 minutos.
// Fica em scripts/ e não em src/: não faz parte da API, nunca é importado por ela.
const prisma = new PrismaClient()
const { count } = await prisma.rateLimit.deleteMany({})
console.log(`contadores de rate limit removidos: ${count}`)
await prisma.$disconnect()
