import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
  // @ecommerce/shared resolve pelo dist/ (o `test` da raiz o builda antes).
  // esbuild do vitest lida com o .ts do próprio app; o shared já vem compilado.
})
