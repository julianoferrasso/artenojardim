import { existsSync } from 'node:fs'
import { defineConfig } from 'prisma/config'

/**
 * Configuração do Prisma CLI. Substitui o bloco `package.json#prisma`, que está
 * deprecado e sai no Prisma 7.
 *
 * Este arquivo roda em contexto de CLI, fora da API — por isso lê `process.env`
 * direto em vez de `config/env.ts`. Não é violação da regra "só config/ lê env":
 * `env.ts` exige STORE_ID, que é justamente o que o seed produz. Um import aqui
 * criaria um ciclo em que nada sobe.
 */

// A presença deste arquivo faz o Prisma PARAR de carregar .env sozinho ("Prisma
// config detected, skipping environment variable loading"), então carregamos na
// mão. `process.loadEnvFile` é nativo do Node 21+ — a alternativa da doc oficial
// é `import 'dotenv/config'`, que seria uma dependência para o que já vem pronto.
// Em produção quem injeta o ambiente é o PM2, e aí não há .env para ler.
if (existsSync('.env')) process.loadEnvFile('.env')
export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    seed: 'tsx prisma/seed.ts',
  },

  engine: 'classic',
  datasource: {
    url: process.env['DATABASE_URL'] ?? '',

    /**
     * `migrate dev` precisa de um banco descartável para detectar drift e, por
     * padrão, o cria sozinho — o que exigiria CREATEDB no role da aplicação.
     * O servidor é compartilhado com outro projeto, então ampliar o privilégio
     * do nosso usuário para uma conveniência de desenvolvimento é troca ruim.
     *
     * `artenojardim_shadow` é pré-criado e de posse do role. Só desenvolvimento
     * usa isto: `migrate deploy` (produção) não toca em shadow.
     */
    ...(process.env['SHADOW_DATABASE_URL']
      ? { shadowDatabaseUrl: process.env['SHADOW_DATABASE_URL'] }
      : {}),
  },
})
