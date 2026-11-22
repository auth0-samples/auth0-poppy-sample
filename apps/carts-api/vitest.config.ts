import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // src/auth0.ts creates the SDK client from these when it is imported. test/helpers.ts serves this tenant's keys.
    env: {
      AUTH0_DOMAIN: 'carts-test.example.com',
      AUTH0_AUDIENCE: 'http://localhost:4000',
      PUBLIC_ORIGIN: 'https://carts-api.example.com',
    },
  },
});
