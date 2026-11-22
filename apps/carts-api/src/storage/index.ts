import { MemoryCartStore, MemoryOrderStore } from './memory.js';
import { RedisCartStore, RedisOrderStore, redisFromEnv } from './redis.js';
import type { CartStore, OrderStore } from './types.js';

export type { CartLine, CartStore, Order, OrderStore, PricedCartLine } from './types.js';
export { MAX_QUANTITY } from './types.js';

export interface Stores {
  carts: CartStore;
  orders: OrderStore;
}

// The one place to change when moving to a database: return your own implementations here.
// Upstash Redis when its credentials are set (shared across instances); otherwise in-memory, for one process only.
export function createStores(): Stores {
  const redis = redisFromEnv();
  if (redis) {
    return { carts: new RedisCartStore(redis), orders: new RedisOrderStore(redis) };
  }
  return { carts: new MemoryCartStore(), orders: new MemoryOrderStore() };
}
