// In-memory storage for one process. Everything here is lost on restart and is not shared between servers.
// Production needs a shared store (a database) for carts and orders.

import { MAX_QUANTITY, type CartLine, type CartStore, type Order, type OrderStore } from './types.js';

export class MemoryCartStore implements CartStore {
  readonly #carts = new Map<string, CartLine[]>();

  async get(cartKey: string): Promise<CartLine[]> {
    return [...(this.#carts.get(cartKey) ?? [])];
  }

  async setItem(cartKey: string, productId: string, quantity: number): Promise<CartLine[]> {
    const lines = (this.#carts.get(cartKey) ?? []).filter((line) => line.productId !== productId);
    lines.push({ productId, quantity });
    this.#carts.set(cartKey, lines);
    return [...lines];
  }

  async removeItem(cartKey: string, productId: string): Promise<CartLine[]> {
    const lines = (this.#carts.get(cartKey) ?? []).filter((line) => line.productId !== productId);
    this.#carts.set(cartKey, lines);
    return [...lines];
  }

  async clear(cartKey: string): Promise<void> {
    this.#carts.delete(cartKey);
  }

  // No `await` between the read and the delete, so two checkouts in this process cannot both take the lines.
  async take(cartKey: string): Promise<CartLine[]> {
    const lines = this.#carts.get(cartKey) ?? [];
    this.#carts.delete(cartKey);
    return [...lines];
  }

  async restore(cartKey: string, lines: CartLine[]): Promise<void> {
    const to = new Map((this.#carts.get(cartKey) ?? []).map((line) => [line.productId, line.quantity]));
    for (const line of lines) {
      to.set(line.productId, Math.min(MAX_QUANTITY, (to.get(line.productId) ?? 0) + line.quantity));
    }
    this.#carts.set(cartKey, [...to].map(([productId, quantity]) => ({ productId, quantity })));
  }

  // No `await` inside, so two merges in this process cannot interleave and move the same lines twice.
  async merge(fromKey: string, toKey: string): Promise<number> {
    const from = this.#carts.get(fromKey) ?? [];
    if (fromKey === toKey || from.length === 0) {
      return 0;
    }
    const to = new Map((this.#carts.get(toKey) ?? []).map((line) => [line.productId, line.quantity]));
    for (const line of from) {
      to.set(line.productId, Math.min(MAX_QUANTITY, (to.get(line.productId) ?? 0) + line.quantity));
    }
    this.#carts.set(toKey, [...to].map(([productId, quantity]) => ({ productId, quantity })));
    this.#carts.delete(fromKey);
    return from.length;
  }
}

export class MemoryOrderStore implements OrderStore {
  readonly #orders = new Map<string, Order[]>();

  async add(order: Order): Promise<Order> {
    this.#orders.set(order.account, [...(this.#orders.get(order.account) ?? []), order]);
    return order;
  }

  async listByAccount(account: string): Promise<Order[]> {
    return [...(this.#orders.get(account) ?? [])];
  }
}
