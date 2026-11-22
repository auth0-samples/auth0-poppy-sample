import { loadConfig } from './config.js';
import { createStores } from './storage/index.js';

/** Builds the configured Express app. Shared by the local server (`server.ts`) and the Vercel function (`api/index.ts`). */
export async function buildApp() {
  // On Vercel, clients call the deployment's https origin. Use the production domain unless PUBLIC_ORIGIN is set.
  if (process.env.VERCEL && !process.env.PUBLIC_ORIGIN && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    process.env.PUBLIC_ORIGIN = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  // Checks AUTH0_DOMAIN and AUTH0_AUDIENCE with a clear message before auth0.ts creates the SDK client from them, so
  // the app (which imports auth0.ts) is imported after this.
  const config = loadConfig();
  const { createApp } = await import('./app.js');
  const stores = createStores();
  const app = createApp({
    publicUrl: config.publicOrigin ?? config.baseUrl,
    carts: stores.carts,
    orders: stores.orders,
  });

  return { app, config };
}
