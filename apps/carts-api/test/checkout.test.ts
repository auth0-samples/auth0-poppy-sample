// Checkout takes the cart in one step.
import { afterEach, describe, expect, test } from 'vitest';
import { setup, type TestContext } from './helpers.js';
import { MemoryCartStore } from '../src/storage/memory.js';

let opened: TestContext[] = [];
const start = async () => {
  const ctx = await setup();
  opened.push(ctx);
  return ctx;
};
afterEach(async () => {
  await Promise.all(opened.map((ctx) => ctx.close()));
  opened = [];
});

const add = (ctx: TestContext, auth: Record<string, string>) =>
  ctx.request('/cart/items', {
    method: 'POST',
    headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ productId: 'scale-tare', quantity: 1 }),
  });

describe('POST /orders', () => {
  test('two concurrent checkouts of one cart place one order', async () => {
    const ctx = await start();
    const auth = { authorization: `Bearer ${await ctx.issueToken({ sub: 'auth0|race' })}` };
    expect((await add(ctx, auth)).status).toBe(200);
    const results = await Promise.all([1, 2].map(() => ctx.request('/orders', { method: 'POST', headers: auth })));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const { orders } = (await (await ctx.request('/orders', { headers: auth })).json()) as { orders: unknown[] };
    expect(orders).toHaveLength(1);
  });

  test('a declined card puts the cart back', async () => {
    const ctx = await start();
    const auth = { authorization: `Bearer ${await ctx.issueToken({ sub: 'auth0|declined' })}` };
    await add(ctx, auth);
    const declined = await ctx.request('/orders', {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ payment: { card: '4000 0000 0000 0002' } }),
    });
    expect(declined.status).toBe(402);
    expect(await (await ctx.request('/cart', { headers: auth })).json()).toMatchObject({ items: [{ productId: 'scale-tare', quantity: 1 }] });
  });

  test('take empties the cart in one step, and restore puts lines back', async () => {
    const carts = new MemoryCartStore();
    await carts.setItem('k', 'a', 2);
    const [taken, second] = await Promise.all([carts.take('k'), carts.take('k')]);
    expect(taken).toEqual([{ productId: 'a', quantity: 2 }]);
    expect(second).toEqual([]);
    await carts.restore('k', taken);
    expect(await carts.get('k')).toEqual([{ productId: 'a', quantity: 2 }]);
  });
});
