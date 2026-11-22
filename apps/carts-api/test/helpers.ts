import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { vi } from 'vitest';
import { createApp } from '../src/app.js';

// The tenant and API in vitest.config.ts `test.env`, which src/auth0.ts reads.
export const DOMAIN = 'carts-test.example.com';
export const ISSUER = `https://${DOMAIN}/`;
export const AUDIENCE = 'http://localhost:4000';
export const PUBLIC_URL = 'https://carts-api.example.com';
export const WEB_CLIENT_ID = 'web-client-id';

// A stand-in for the Auth0 tenant: its discovery document and signing keys, served through a stubbed global `fetch`,
// so the API's shared SDK client verifies the tokens below with no network. Every other URL goes to the real `fetch`.
// One key pair per test file, because the SDK client caches the tenant's keys.
const { publicKey, privateKey } = await generateKeyPair('RS256');
const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'RS256', use: 'sig' };
const jwksUri = `${ISSUER}.well-known/jwks.json`;
const realFetch = globalThis.fetch;
vi.stubGlobal('fetch', (async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url === `${ISSUER}.well-known/openid-configuration`) {
    return Response.json({ issuer: ISSUER, jwks_uri: jwksUri, token_endpoint: `${ISSUER}oauth/token` });
  }
  if (url === jwksUri) {
    return Response.json({ keys: [jwk] });
  }
  return realFetch(input, init);
}) satisfies typeof fetch);

/** An access token for the Carts API, signed by the fake tenant. */
export async function issueToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT({ scope: 'openid profile email', ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key', typ: 'at+jwt' })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

export interface TestContext {
  baseUrl: string;
  issueToken: typeof issueToken;
  request: (path: string, init?: RequestInit) => Promise<Response>;
  close: () => Promise<void>;
}

/** Starts the app on a random port with fresh in-memory stores. */
export async function setup(): Promise<TestContext> {
  const app = createApp({ publicUrl: PUBLIC_URL });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const { port } = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${port}`;

  return {
    baseUrl,
    issueToken,
    request: (path, init) => fetch(`${baseUrl}${path}`, init),
    close: () => new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))),
  };
}

export function wwwAuthenticate(response: Response): string {
  return response.headers.get('www-authenticate') ?? '';
}
