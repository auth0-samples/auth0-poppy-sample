import { SAMPLE_ADDRESS } from './shipping.js';
import { simulatePayment, type PaymentInput } from './payments.js';
import { randomUUID } from 'node:crypto';
import express, { type ErrorRequestHandler, type Response } from 'express';
import { toHttpErrorResponse, type VerifiedAccessTokenClaims } from '@auth0/auth0-api-js';
import { CATEGORIES, PRODUCTS, findProduct, priceLines } from './catalog.js';
import { authenticate } from './auth.js';
import { apiClient } from './auth0.js';
import { SCOPES, accountOf, isAnonymousSubject, isGuestToken } from './accounts.js';
import { openApiDocument } from './openapi.js';
import { MemoryCartStore, MemoryOrderStore } from './storage/memory.js';
import { MAX_QUANTITY, type CartStore, type OrderStore } from './storage/index.js';

export interface AppOptions {
  /** The origin clients call, for the `servers` entry of `GET /openapi.json`: `PUBLIC_ORIGIN` when set, else `CARTS_API_URL`. */
  publicUrl: string;
  carts?: CartStore;
  orders?: OrderStore;
}

/** A refusal decided by the store's own rules (not the SDK's). The error handler turns it into JSON. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly headers: Record<string, string> = {}
  ) {
    super(message);
  }
}

/** 401 for a request that needs the customer's account and has a guest's token (or none). */
const signInRequired = (scope: string) =>
  new HttpError(401, 'unauthorized', 'Sign in to continue.', { 'www-authenticate': `Bearer realm="api", scope="${scope}"` });

export interface PlaceOrderOptions {
  /** The test card to pay with (see payments.ts). Defaults to an approved card. */
  payment?: PaymentInput;
  /** Who placed the order for the customer, when it wasn't the customer. The orders page shows it. */
  placedVia?: string | null;
}

/**
 * The caller's cart, keyed by the verified token's `sub`: the account for a signed-in person, and the anonymous
 * session for a guest. `POST /cart/merge` moves a guest's cart into the account at sign-in.
 */
const cartKey = (res: Response) => `user:${res.locals.claims?.sub}`;

export function createApp(options: AppOptions) {
  const publicUrl = options.publicUrl.replace(/\/+$/, '');
  const carts = options.carts ?? new MemoryCartStore();
  const orders = options.orders ?? new MemoryOrderStore();

  const cartBody = async (key: string) => ({ cartKey: key, ...priceLines(await carts.get(key)) });

  /**
   * Pays for the cart with a test card, records the order on the account and empties the cart. Throws an `HttpError`
   * for a guest (401), an empty cart (409) or a declined card (402); the cart is kept when it throws.
   */
  async function placeOrder(account: string | undefined, key: string, { payment, placedVia = null }: PlaceOrderOptions = {}) {
    // Orders belong to an account, never to a guest's anonymous `sub`.
    if (!account || isAnonymousSubject(account)) {
      throw signInRequired(SCOPES.ordersWrite);
    }
    // Take the cart in one step, before paying: a concurrent checkout of the same cart finds it empty, and an item added
    // meanwhile goes into a new cart instead of being cleared with this one.
    const lines = await carts.take(key);
    const { items, totalCents } = priceLines(lines);
    if (items.length === 0) {
      await carts.restore(key, lines);
      throw new HttpError(409, 'empty_cart', 'The cart is empty.');
    }
    // A declined card puts the cart back as it was, so the customer can try again.
    const paid = simulatePayment(totalCents, payment);
    if (!paid.ok) {
      await carts.restore(key, lines);
      throw new HttpError(402, paid.code, paid.message);
    }
    try {
      return await orders.add({
        id: `ord_${randomUUID()}`,
        createdAt: new Date().toISOString(),
        items,
        totalCents,
        account,
        placedVia,
        payment: paid.payment,
        shipping: SAMPLE_ADDRESS,
      });
    } catch (error) {
      await carts.restore(key, lines);
      throw error;
    }
  }

  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Strict-Transport-Security': 'max-age=63072000'
    });
    next();
  });
  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/openapi.json', (_req, res) => {
    res.json(openApiDocument(publicUrl));
  });

  // Public: no token needed to browse.
  app.get('/products', (req, res) => {
    const asked = typeof req.query.category === 'string' ? req.query.category.toLowerCase() : undefined;
    const category = asked ? CATEGORIES.find((c) => c.toLowerCase() === asked) : undefined;
    if (asked && !category) {
      res.status(400).json({ error: 'invalid_request', error_description: `category is one of: ${CATEGORIES.join(', ')}.` });
      return;
    }
    res.json({ products: category ? PRODUCTS.filter((p) => p.category === category) : PRODUCTS, categories: CATEGORIES });
  });

  app.get('/products/:id', (req, res) => {
    const product = findProduct(req.params.id);
    if (!product) {
      res.status(404).json({ error: 'not_found', error_description: 'No product with that id' });
      return;
    }
    res.json({ product });
  });

  // The cart takes a guest's anonymous token as well as an account's token.
  app.get('/cart', authenticate, async (_req, res) => {
    res.json(await cartBody(cartKey(res)));
  });

  app.post('/cart/items', authenticate, async (req, res) => {
    const { productId, quantity } = (req.body ?? {}) as { productId?: unknown; quantity?: unknown };
    if (typeof productId !== 'string' || !findProduct(productId)) {
      res.status(400).json({ error: 'invalid_request', error_description: 'Unknown productId.' });
      return;
    }
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
      res
        .status(400)
        .json({ error: 'invalid_request', error_description: `quantity must be a whole number from 0 to ${MAX_QUANTITY}.` });
      return;
    }
    // Setting a quantity (not adding to it) makes a retried request safe.
    const key = cartKey(res);
    if (quantity === 0) {
      await carts.removeItem(key, productId);
    } else {
      await carts.setItem(key, productId, quantity);
    }
    res.json(await cartBody(key));
  });

  app.delete('/cart/items/:productId', authenticate, async (req, res) => {
    const key = cartKey(res);
    await carts.removeItem(key, String(req.params.productId));
    res.json(await cartBody(key));
  });

  // A person signed in: move the cart of their anonymous session into the account cart.
  // Idempotent: the guest cart is deleted as it is merged, so calling again with the same token moves nothing.
  app.post('/cart/merge', authenticate, async (req, res) => {
    // A guest has no account to merge into.
    if (!accountOf(res.locals.claims)) {
      throw signInRequired(SCOPES.ordersRead);
    }
    const { guestToken } = (req.body ?? {}) as { guestToken?: unknown };
    if (typeof guestToken !== 'string' || guestToken.length === 0) {
      res.status(400).json({ error: 'invalid_request', error_description: 'guestToken is required.' });
      return;
    }
    // The guest token is a second credential in the body, so check it the same way as a Bearer token: signature,
    // issuer, audience and expiry. A failure is the request's fault (400), not the caller's own token (401).
    let guest: VerifiedAccessTokenClaims;
    try {
      guest = await apiClient.verifyAccessToken({ accessToken: guestToken });
    } catch {
      res.status(400).json({ error: 'invalid_request', error_description: 'guestToken is not a valid access token for this API.' });
      return;
    }
    // Only a person's own anonymous token: never an account's token (that would merge another account's cart), and
    // never a token with an `act` claim, which was issued to someone acting for the user and keeps its own cart.
    if (!isGuestToken(guest) || guest.act !== undefined || typeof guest.sub !== 'string') {
      res.status(400).json({ error: 'invalid_request', error_description: "guestToken is not a person's anonymous session token." });
      return;
    }
    const key = cartKey(res);
    const merged = await carts.merge(`user:${guest.sub}`, key);
    res.json({ merged, ...(await cartBody(key)) });
  });

  app.post('/orders', authenticate, async (req, res) => {
    const { claims } = res.locals;
    const payment = (req.body as { payment?: PaymentInput } | undefined)?.payment;
    res.status(201).json(await placeOrder(claims.sub, cartKey(res), { payment }));
  });

  app.get('/orders', authenticate, async (_req, res) => {
    const account = accountOf(res.locals.claims);
    if (!account) {
      throw signInRequired(SCOPES.ordersRead);
    }
    res.json({ orders: await orders.listByAccount(account) });
  });

  // Debug: what the API verified. The token itself is never echoed back.
  app.get('/whoami', authenticate, (_req, res) => {
    const claims = res.locals.claims as VerifiedAccessTokenClaims | undefined;
    res.json({
      sub: claims?.sub ?? null,
      scope: claims?.scope ?? null,
      account: accountOf(claims),
      cartKey: cartKey(res),
    });
  });

  // Express 5 sends a rejected async route here.
  app.use(((error, _req, res, next) => {
    if (error instanceof HttpError) {
      res.status(error.status).set(error.headers).json({ error: error.code, error_description: error.message });
      return;
    }
    // An SDK error becomes its status, `WWW-Authenticate` challenges and JSON body.
    const failure = toHttpErrorResponse(error);
    if (failure) {
      res.status(failure.status).set(failure.headers);
      if (failure.body) {
        res.json(failure.body);
      } else {
        res.end();
      }
      return;
    }
    if (res.headersSent) {
      next(error);
      return;
    }
    // Body parser errors (bad JSON, too large) carry their own 4xx status.
    const status: unknown = error?.status;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      res.status(status).json({ error: 'invalid_request', error_description: 'The request body could not be read as JSON.' });
      return;
    }
    // Anything else is ours: a setup mistake (InvalidConfigurationError), a store failure or a bug.
    console.error(`carts-api: unhandled ${error?.name ?? 'error'}: ${error?.message ?? ''}`);
    res.status(500).json({ error: 'server_error' });
  }) satisfies ErrorRequestHandler);

  return app;
}
