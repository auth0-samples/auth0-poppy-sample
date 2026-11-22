// Upstash Redis storage, shared by every server and function instance.
// A cart is a hash (productId -> quantity), and orders are a list per account.

import { Redis } from '@upstash/redis';
import { MAX_QUANTITY, type CartLine, type CartStore, type Order, type OrderStore } from './types.js';

// The `fernway:` prefix predates the store's current name. It stays, so existing carts and orders keep their keys.
const cartKey = (key: string) => `fernway:cart:${key}`;
const ordersKey = (account: string) => `fernway:orders:${account}`;

/** A cart nobody touches for 30 days is deleted. */
export const CART_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Reads the Upstash credentials Vercel adds, under either naming scheme. `null` when none are set. */
export function redisFromEnv(): Redis | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}

function toLines(hash: Record<string, unknown> | null): CartLine[] {
  return Object.entries(hash ?? {}).map(([productId, quantity]) => ({ productId, quantity: Number(quantity) }));
}

// Runs inside Redis, so a merge is one atomic step: no other request can see or move the lines halfway.
const MERGE_SCRIPT = `
if KEYS[1] == KEYS[2] then return 0 end
local from = redis.call('HGETALL', KEYS[1])
local moved = #from / 2
for i = 1, #from, 2 do
  local current = tonumber(redis.call('HGET', KEYS[2], from[i]) or '0')
  redis.call('HSET', KEYS[2], from[i], math.min(tonumber(ARGV[1]), current + tonumber(from[i + 1])))
end
redis.call('DEL', KEYS[1])
if moved > 0 then redis.call('EXPIRE', KEYS[2], ARGV[2]) end
return moved
`;

// Sets one line and renews the cart's expiry.
const SET_ITEM_SCRIPT = `
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('EXPIRE', KEYS[1], ARGV[3])
return 1
`;

// Reads and deletes the cart in one step: a checkout owns the lines it took.
const TAKE_SCRIPT = `
local lines = redis.call('HGETALL', KEYS[1])
redis.call('DEL', KEYS[1])
return lines
`;

// Adds lines back (ARGV[3..] as productId, quantity pairs), capped at ARGV[1], and renews the expiry (ARGV[2]).
const RESTORE_SCRIPT = `
for i = 3, #ARGV, 2 do
  local current = tonumber(redis.call('HGET', KEYS[1], ARGV[i]) or '0')
  redis.call('HSET', KEYS[1], ARGV[i], math.min(tonumber(ARGV[1]), current + tonumber(ARGV[i + 1])))
end
redis.call('EXPIRE', KEYS[1], ARGV[2])
return 1
`;

export class RedisCartStore implements CartStore {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<CartLine[]> {
    return toLines(await this.redis.hgetall(cartKey(key)));
  }

  async setItem(key: string, productId: string, quantity: number): Promise<CartLine[]> {
    await this.redis.eval(SET_ITEM_SCRIPT, [cartKey(key)], [productId, String(quantity), String(CART_TTL_SECONDS)]);
    return this.get(key);
  }

  async removeItem(key: string, productId: string): Promise<CartLine[]> {
    await this.redis.hdel(cartKey(key), productId);
    return this.get(key);
  }

  async clear(key: string): Promise<void> {
    await this.redis.del(cartKey(key));
  }

  async take(key: string): Promise<CartLine[]> {
    const flat = (await this.redis.eval(TAKE_SCRIPT, [cartKey(key)], [])) as unknown[];
    const lines: CartLine[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      lines.push({ productId: String(flat[i]), quantity: Number(flat[i + 1]) });
    }
    return lines;
  }

  async restore(key: string, lines: CartLine[]): Promise<void> {
    if (lines.length === 0) {
      return;
    }
    const pairs = lines.flatMap((line) => [line.productId, String(line.quantity)]);
    await this.redis.eval(RESTORE_SCRIPT, [cartKey(key)], [String(MAX_QUANTITY), String(CART_TTL_SECONDS), ...pairs]);
  }

  async merge(fromKey: string, toKey: string): Promise<number> {
    const moved = await this.redis.eval(MERGE_SCRIPT, [cartKey(fromKey), cartKey(toKey)], [String(MAX_QUANTITY), String(CART_TTL_SECONDS)]);
    return Number(moved);
  }
}

export class RedisOrderStore implements OrderStore {
  constructor(private readonly redis: Redis) {}

  async add(order: Order): Promise<Order> {
    await this.redis.rpush(ordersKey(order.account), JSON.stringify(order));
    return order;
  }

  async listByAccount(account: string): Promise<Order[]> {
    // The client parses stored JSON back into objects.
    return this.redis.lrange<Order>(ordersKey(account), 0, -1);
  }
}
