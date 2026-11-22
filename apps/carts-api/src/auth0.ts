import { ApiClient } from '@auth0/auth0-api-js';

// One client for the whole API. It reads the tenant's signing keys once and verifies every access token against
// AUTH0_AUDIENCE. The env files load before this module (see server.ts), and bootstrap.ts checks both variables first.
export const apiClient = new ApiClient({
  domain: process.env.AUTH0_DOMAIN!,
  audience: process.env.AUTH0_AUDIENCE!,
});
