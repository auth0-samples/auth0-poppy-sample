import { afterEach, describe, expect, test } from 'vitest';
import { WEB_CLIENT_ID, setup, wwwAuthenticate, type TestContext } from './helpers.js';

let ctx: TestContext;
let opened: TestContext[] = [];

async function start(): Promise<TestContext> {
  ctx = await setup();
  opened.push(ctx);
  return ctx;
}

afterEach(async () => {
  await Promise.all(opened.map((context) => context.close()));
  opened = [];
});

const json = (body: unknown, headers: Record<string, string> = {}): RequestInit => ({
  method: 'POST',
  headers: { 'content-type': 'application/json', ...headers },
  body: JSON.stringify(body),
});

const bearer = async (claims: Record<string, unknown>) => ({ authorization: `Bearer ${await ctx.issueToken(claims)}` });

// The token Auth0 issues for the storefront's anonymous session: `sub` anon@…, `sub_profile` with the anonymous mark.
const guestClaims = (id: string) => ({
  sub: `anon@${id}`,
  sub_profile: 'urn:auth0:anonymous_user',
  azp: WEB_CLIENT_ID,
  scope: 'cart:write',
});

describe('public routes', () => {
  test('GET /health', async () => {
    await start();
    const response = await ctx.request('/health');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  test('GET /products is public', async () => {
    await start();
    const response = await ctx.request('/products');
    expect(response.status).toBe(200);
    const { products } = (await response.json()) as { products: { id: string; priceCents: number }[] };
    expect(products.length).toBeGreaterThanOrEqual(6);
    expect(products[0]).toMatchObject({ id: expect.any(String), name: expect.any(String), priceCents: expect.any(Number) });
  });

  test('GET /products?category filters, and an unknown category is a 400', async () => {
    await start();
    const beans = (await (await ctx.request('/products?category=beans')).json()) as { products: { category: string }[] };
    expect(beans.products.length).toBeGreaterThan(0);
    expect(beans.products.every((p) => p.category === 'Beans')).toBe(true);
    expect((await ctx.request('/products?category=nope')).status).toBe(400);
  });

  test('GET /openapi.json describes the API at the public origin', async () => {
    await start();
    const doc = (await (await ctx.request('/openapi.json')).json()) as { servers: { url: string }[]; paths: Record<string, unknown> };
    expect(doc.servers).toEqual([{ url: 'https://carts-api.example.com' }]);
    expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/products', '/cart', '/cart/items', '/orders']));
  });
});

describe('a signed-in person', () => {
  test('gets a user: cart, places an order and lists it', async () => {
    await start();
    const auth = await bearer({ sub: 'auth0|person-1', azp: WEB_CLIENT_ID });

    const add = await ctx.request('/cart/items', json({ productId: 'scale-tare', quantity: 1 }, auth));
    expect(await add.json()).toMatchObject({ cartKey: 'user:auth0|person-1', totalCents: 14900 });

    const order = await ctx.request('/orders', { method: 'POST', headers: auth });
    expect(order.status).toBe(201);
    expect(await order.json()).toMatchObject({
      account: 'auth0|person-1',
      placedVia: null,
      totalCents: 14900,
      payment: { status: 'paid', last4: '4242' },
    });

    const list = (await (await ctx.request('/orders', { headers: auth })).json()) as { orders: unknown[] };
    expect(list.orders).toHaveLength(1);
    expect(await (await ctx.request('/cart', { headers: auth })).json()).toMatchObject({ items: [] });
  });

  test('a declined test card gives 402, keeps the cart and places no order', async () => {
    await start();
    const auth = await bearer({ sub: 'auth0|person-2', azp: WEB_CLIENT_ID });
    await ctx.request('/cart/items', json({ productId: 'kettle-vessel', quantity: 1 }, auth));

    const order = await ctx.request('/orders', json({ payment: { card: '4000 0000 0000 0002' } }, auth));
    expect(order.status).toBe(402);
    expect(await order.json()).toMatchObject({ error: 'card_declined' });

    expect(((await (await ctx.request('/cart', { headers: auth })).json()) as { items: unknown[] }).items).toHaveLength(1);
    expect(((await (await ctx.request('/orders', { headers: auth })).json()) as { orders: unknown[] }).orders).toHaveLength(0);
  });

  test('an empty cart gives 409', async () => {
    await start();
    const order = await ctx.request('/orders', { method: 'POST', headers: await bearer({ sub: 'auth0|person-3' }) });
    expect(order.status).toBe(409);
    expect(await order.json()).toMatchObject({ error: 'empty_cart' });
  });

  test('quantity 0 and DELETE remove a line; a bad product or quantity is a 400', async () => {
    await start();
    const auth = await bearer({ sub: 'auth0|person-4' });
    await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 2 }, auth));
    await ctx.request('/cart/items', json({ productId: 'scale-tare', quantity: 1 }, auth));
    await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 0 }, auth));
    const removed = await ctx.request('/cart/items/scale-tare', { method: 'DELETE', headers: auth });
    expect(await removed.json()).toMatchObject({ items: [] });

    expect((await ctx.request('/cart/items', json({ productId: 'nope', quantity: 1 }, auth))).status).toBe(400);
    expect((await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 1.5 }, auth))).status).toBe(400);
  });
});

describe('tokens', () => {
  test('no token gives 401 with a Bearer challenge', async () => {
    await start();
    const response = await ctx.request('/cart');
    expect(response.status).toBe(401);
    expect(wwwAuthenticate(response)).toMatch(/^Bearer /);
  });

  test('a token signed by another key gives 401 invalid_token', async () => {
    await start();
    const { SignJWT, generateKeyPair } = await import('jose');
    const { privateKey } = await generateKeyPair('RS256');
    const forged = await new SignJWT({ sub: 'auth0|forged' })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setIssuer('https://carts-test.example.com/')
      .setAudience('http://localhost:4000')
      .setExpirationTime('5m')
      .sign(privateKey);
    const response = await ctx.request('/cart', { headers: { authorization: `Bearer ${forged}` } });
    expect(response.status).toBe(401);
    expect(wwwAuthenticate(response)).toContain('invalid_token');
  });

  test('GET /whoami reports what the API verified', async () => {
    await start();
    const who = await (await ctx.request('/whoami', { headers: await bearer({ sub: 'auth0|person-5', scope: 'openid orders:read' }) })).json();
    expect(who).toEqual({ sub: 'auth0|person-5', scope: 'openid orders:read', account: 'auth0|person-5', cartKey: 'user:auth0|person-5' });
  });
});

describe("a person's anonymous session (guest cart)", () => {
  test('a guest token gets its own cart, with no account', async () => {
    await start();
    const auth = await bearer(guestClaims('g-1'));

    const add = await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 1 }, auth));
    expect(add.status).toBe(200);
    expect(await add.json()).toMatchObject({ cartKey: 'user:anon@g-1', items: [{ productId: 'beans-konga', quantity: 1 }] });

    const who = await (await ctx.request('/whoami', { headers: auth })).json();
    expect(who).toMatchObject({ sub: 'anon@g-1', account: null });
  });

  test("a guest can't place or list orders, even without sub_profile", async () => {
    await start();
    for (const auth of [
      await bearer({ ...guestClaims('g-2'), scope: 'cart:write orders:write' }),
      await bearer({ sub: 'anon@g-3', azp: WEB_CLIENT_ID }),
    ]) {
      await ctx.request('/cart/items', json({ productId: 'scale-tare', quantity: 1 }, auth));

      const order = await ctx.request('/orders', { method: 'POST', headers: auth });
      expect(order.status).toBe(401);
      expect(wwwAuthenticate(order)).toContain('scope="orders:write"');

      const list = await ctx.request('/orders', { headers: auth });
      expect(list.status).toBe(401);
      expect(wwwAuthenticate(list)).toContain('scope="orders:read"');
    }
  });

  test('POST /cart/merge moves the guest items into the account cart, once', async () => {
    await start();
    const guestToken = await ctx.issueToken(guestClaims('g-4'));
    const guest = { authorization: `Bearer ${guestToken}` };
    await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 1 }, guest));
    await ctx.request('/cart/items', json({ productId: 'kettle-vessel', quantity: 2 }, guest));

    const person = await bearer({ sub: 'auth0|person-4', azp: WEB_CLIENT_ID });
    await ctx.request('/cart/items', json({ productId: 'beans-konga', quantity: 1 }, person));

    const merged = await ctx.request('/cart/merge', json({ guestToken }, person));
    expect(merged.status).toBe(200);
    const body = (await merged.json()) as { merged: number; cartKey: string; items: { productId: string; quantity: number }[] };
    expect(body.merged).toBe(2);
    expect(body.cartKey).toBe('user:auth0|person-4');
    expect(body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ productId: 'beans-konga', quantity: 2 }),
        expect.objectContaining({ productId: 'kettle-vessel', quantity: 2 }),
      ])
    );
    expect(body.items).toHaveLength(2);

    // The guest cart is gone, and a second merge with the same token changes nothing.
    expect(await (await ctx.request('/cart', { headers: guest })).json()).toMatchObject({ items: [] });
    const again = await ctx.request('/cart/merge', json({ guestToken }, person));
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ merged: 0, items: body.items });

    // The account can order the merged cart.
    expect((await ctx.request('/orders', { method: 'POST', headers: person })).status).toBe(201);
  });

  test('POST /cart/merge needs an account caller', async () => {
    await start();
    const guestToken = await ctx.issueToken(guestClaims('g-5'));
    const response = await ctx.request('/cart/merge', json({ guestToken }, { authorization: `Bearer ${guestToken}` }));
    expect(response.status).toBe(401);
  });

  test("POST /cart/merge refuses a guestToken that isn't a person's anonymous token", async () => {
    await start();
    const person = await bearer({ sub: 'auth0|person-6', azp: WEB_CLIENT_ID });

    // Another account's token: merging it would move that account's cart.
    const other = await ctx.issueToken({ sub: 'auth0|person-7', azp: WEB_CLIENT_ID });
    await ctx.request('/cart/items', json({ productId: 'tamper-walnut', quantity: 1 }, { authorization: `Bearer ${other}` }));
    const notGuest = await ctx.request('/cart/merge', json({ guestToken: other }, person));
    expect(notGuest.status).toBe(400);
    expect(await notGuest.json()).toMatchObject({ error: 'invalid_request' });
    expect(await (await ctx.request('/cart', { headers: { authorization: `Bearer ${other}` } })).json()).toMatchObject({
      items: [{ productId: 'tamper-walnut', quantity: 1 }],
    });

    // A guest token issued to someone acting for the user (an `act` claim) keeps its own cart.
    const acting = await ctx.issueToken({ ...guestClaims('g-6'), act: { sub: 'https://agent.example/agent.json' } });
    expect((await ctx.request('/cart/merge', json({ guestToken: acting }, person))).status).toBe(400);

    // Not a token at all, or missing.
    expect((await ctx.request('/cart/merge', json({ guestToken: 'not-a-jwt' }, person))).status).toBe(400);
    expect((await ctx.request('/cart/merge', json({}, person))).status).toBe(400);
  });
});
