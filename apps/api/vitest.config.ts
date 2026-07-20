import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    // UTC fixo: a VPS roda em UTC e a máquina de dev em Brasília. Sem fixar, a
    // suíte dependia do fuso de quem a roda — e passava nos dois por sorte dos
    // fixtures ao meio-dia, não por desenho. Fuso brasileiro é sempre nomeado
    // explicitamente (ver packages/shared/src/utils/date-br.ts).
    env: { TZ: 'UTC' },
  },
  // @ecommerce/shared resolve pelo dist/ (o `test` da raiz o builda antes).
  // esbuild do vitest lida com o .ts do próprio app; o shared já vem compilado.
})
