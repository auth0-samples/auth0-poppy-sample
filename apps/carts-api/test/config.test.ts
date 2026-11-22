import { describe, expect, test } from 'vitest';
import { loadConfig } from '../src/config.js';

const base = { AUTH0_DOMAIN: 'tenant.example.com', AUTH0_AUDIENCE: 'http://localhost:4000' };

describe('loadConfig', () => {
  test('reads the port from CARTS_API_URL and the public origin from PUBLIC_ORIGIN', () => {
    const config = loadConfig({ ...base, CARTS_API_URL: 'http://localhost:4101', PUBLIC_ORIGIN: 'https://api.example.ngrok.app' });
    expect(config.port).toBe(4101);
    expect(config.publicOrigin).toBe('https://api.example.ngrok.app');
  });

  test('defaults CARTS_API_URL to port 4001, with no public origin', () => {
    const config = loadConfig(base);
    expect(config.baseUrl).toBe('http://localhost:4001');
    expect(config.port).toBe(4001);
    expect(config.publicOrigin).toBeUndefined();
  });

  test('strips a scheme and trailing slash from AUTH0_DOMAIN', () => {
    expect(loadConfig({ ...base, AUTH0_DOMAIN: 'https://tenant.example.com/' }).domain).toBe('tenant.example.com');
  });

  test('a missing AUTH0_AUDIENCE points at --identifier in auth0 quickstarts setup', () => {
    expect(() => loadConfig({ AUTH0_DOMAIN: 'tenant.example.com' })).toThrow(/AUTH0_AUDIENCE.*--identifier.*auth0 quickstarts setup/);
  });
});
