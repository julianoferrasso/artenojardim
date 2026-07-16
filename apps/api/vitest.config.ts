import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
  },
  resolve: {
    // O `development` condition do package.json de @ecommerce/shared aponta para
    // src/, então o teste roda sem precisar buildar o pacote antes.
    conditions: ['development', 'import', 'node'],
  },
})
