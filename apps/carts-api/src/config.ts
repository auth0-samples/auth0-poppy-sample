// Reads the service configuration from the environment. Never log the values: some are secrets.

export interface Config {
  /** Auth0 tenant domain, such as `tenant.auth0.com`, without a scheme. */
  domain: string;
  /** The API identifier (`aud` of access tokens). */
  audience: string;
  /** The base URL this service is reached at locally, such as `http://localhost:4001`. */
  baseUrl: string;
  /** The port to listen on, taken from `baseUrl`. */
  port: number;
  /** Optional https origin when the API sits behind a tunnel or proxy (`npm run tunnel` sets it). */
  publicOrigin?: string;
  /** `NODE_ENV === 'production'`. */
  isProduction: boolean;
}

function required(env: NodeJS.ProcessEnv, name: string, hint = 'See .env.example at the repo root.'): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. ${hint}`);
  }
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const domain = required(env, 'AUTH0_DOMAIN').replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const audience = required(
    env,
    'AUTH0_AUDIENCE',
    'It is the API identifier: pass --api --identifier http://localhost:4000 to `auth0 quickstarts setup`, or set it in .env.local. See .env.example at the repo root.'
  );
  const baseUrl = (env.CARTS_API_URL?.trim() || 'http://localhost:4001').replace(/\/+$/, '');
  const parsed = new URL(baseUrl);
  // PORT (set by most hosts and containers) wins; otherwise the port in CARTS_API_URL.
  const port = Number(env.PORT) || Number(parsed.port || (parsed.protocol === 'https:' ? 443 : 80));

  return {
    domain,
    audience,
    baseUrl,
    port,
    publicOrigin: env.PUBLIC_ORIGIN?.trim() || undefined,
    isProduction: env.NODE_ENV === 'production',
  };
}
